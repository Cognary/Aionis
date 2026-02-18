#!/usr/bin/env python3
"""
LoCoMo baseline runner for Aionis + MiniMax chat model.

Flow per sample:
1) Ingest LoCoMo conversation sessions into Aionis (isolated scope per sample).
2) Optionally run outbox worker to accelerate embedding readiness.
3) For each QA item in the sample, run recall + MiniMax answer generation.
4) Report LoCoMo-style category-aware scores and latency stats.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import string
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse


DEFAULT_DATASET_URL = "https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json"
DEFAULT_DATASET_PATH = "artifacts/locomo/data/locomo10.json"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def normalize_answer(text: str) -> str:
    text = text.lower().replace(",", "")
    text = re.sub(r"\b(a|an|the|and)\b", " ", text)
    text = "".join(ch for ch in text if ch not in string.punctuation)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def token_f1(pred: str, gold: str) -> float:
    p = normalize_answer(pred).split()
    g = normalize_answer(gold).split()
    if not p and not g:
        return 1.0
    if not p or not g:
        return 0.0
    common = Counter(p) & Counter(g)
    overlap = sum(common.values())
    if overlap == 0:
        return 0.0
    precision = overlap / len(p)
    recall = overlap / len(g)
    return (2 * precision * recall) / (precision + recall)


def multi_answer_f1(pred: str, gold: str) -> float:
    pred_parts = [x.strip() for x in str(pred).split(",") if x.strip()]
    gold_parts = [x.strip() for x in str(gold).split(",") if x.strip()]
    if not pred_parts:
        pred_parts = [str(pred).strip()]
    if not gold_parts:
        gold_parts = [str(gold).strip()]
    if not pred_parts and not gold_parts:
        return 1.0
    if not pred_parts or not gold_parts:
        return 0.0
    per_gold: List[float] = []
    for g in gold_parts:
        per_gold.append(max(token_f1(p, g) for p in pred_parts))
    return sum(per_gold) / len(per_gold)


def locomo_score(pred: str, gold: str, category: int) -> float:
    pred_s = str(pred or "")
    gold_s = str(gold or "")
    if category in (2, 3, 4):
        if category == 3 and ";" in gold_s:
            gold_s = gold_s.split(";")[0].strip()
        return token_f1(pred_s, gold_s)
    if category == 1:
        return multi_answer_f1(pred_s, gold_s)
    if category == 5:
        p = pred_s.lower()
        if "not mentioned" in p or "no information" in p or "i don't know" in p or "idk" in p:
            return 1.0
        return 0.0
    return token_f1(pred_s, gold_s)


def percentile(xs: List[float], q: float) -> float:
    if not xs:
        return 0.0
    if q <= 0:
        return min(xs)
    if q >= 100:
        return max(xs)
    arr = sorted(xs)
    pos = (len(arr) - 1) * (q / 100.0)
    lo = int(pos)
    hi = min(lo + 1, len(arr) - 1)
    if lo == hi:
        return arr[lo]
    frac = pos - lo
    return arr[lo] + (arr[hi] - arr[lo]) * frac


def http_json(
    url: str,
    payload: Dict[str, Any],
    headers: Dict[str, str],
    timeout: int,
) -> Tuple[Dict[str, Any], int]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("content-type", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.getcode()
            raw = resp.read().decode("utf-8")
            return json.loads(raw), status
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode("utf-8", errors="replace")
        try:
            obj = json.loads(raw)
        except Exception:
            obj = {"error": "http_error", "status": status, "raw": raw[:2000]}
        return obj, status


def ensure_dataset(local_path: Path, dataset_url: str) -> List[Dict[str, Any]]:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    if not local_path.exists():
        with urllib.request.urlopen(dataset_url, timeout=120) as resp:
            local_path.write_bytes(resp.read())
    obj = json.loads(local_path.read_text(encoding="utf-8"))
    if not isinstance(obj, list):
        raise RuntimeError("LoCoMo dataset must be a json list")
    return obj


def run_worker_once(command: str) -> Tuple[bool, str]:
    if not command:
        return True, "skipped"
    try:
        out = subprocess.run(
            command,
            shell=True,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        return True, out.stdout.strip()[:2000]
    except subprocess.CalledProcessError as e:
        msg = (e.stdout or "")[-2000:]
        return False, msg


def build_auth_headers(api_key: str, bearer: str) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if api_key:
        headers["X-Api-Key"] = api_key
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    return headers


def with_query(url: str, extra: Dict[str, str]) -> str:
    parsed = urlparse(url)
    q = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for k, v in extra.items():
        if v and k not in q:
            q[k] = v
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(q), parsed.fragment))


def extract_message_text(choice: Dict[str, Any]) -> str:
    message = choice.get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for c in content:
            if isinstance(c, str):
                parts.append(c)
            elif isinstance(c, dict):
                txt = c.get("text") or c.get("content") or ""
                if isinstance(txt, str) and txt:
                    parts.append(txt)
        joined = "\n".join(p for p in parts if p).strip()
        if joined:
            return joined
    reasoning = message.get("reasoning_content")
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning.strip()
    return ""


def build_answer_prompt(question: str, context_text: str, category: int, style: str) -> str:
    q = question
    if category == 2:
        q = q + " Use DATE of CONVERSATION to answer with an approximate date."
    if style == "extractive":
        return (
            "You answer conversation-memory questions strictly from the provided context.\n"
            "If the context does not contain the answer, output exactly: I don't know.\n"
            "Return one concise answer sentence only, with no explanation.\n\n"
            f"Memory Context:\n{context_text}\n\n"
            f"Question:\n{q}\n\n"
            "Final answer:"
        )
    return (
        "Answer the question using the provided conversation memory context.\n"
        "If context is insufficient, answer briefly with your best guess.\n\n"
        f"Memory Context:\n{context_text}\n\n"
        f"Question:\n{q}\n\n"
        "Answer:"
    )


def session_numbers(conv: Dict[str, Any]) -> List[int]:
    nums: List[int] = []
    for k, v in conv.items():
        m = re.fullmatch(r"session_(\d+)", k)
        if not m:
            continue
        if isinstance(v, list) and v:
            nums.append(int(m.group(1)))
    return sorted(nums)


def session_to_text(session_n: int, date_text: str, turns: List[Any], max_chars: int) -> str:
    lines: List[str] = []
    if date_text:
        lines.append(f"[session_date] {date_text}")
    for turn in turns:
        if not isinstance(turn, dict):
            continue
        dia_id = str(turn.get("dia_id", "")).strip()
        speaker = str(turn.get("speaker", "speaker")).strip()
        text = str(turn.get("text", "")).strip()
        if not text:
            continue
        if dia_id:
            lines.append(f"[{dia_id}] {speaker}: {text}")
        else:
            lines.append(f"{speaker}: {text}")
    out = "\n".join(lines)
    if len(out) <= max_chars:
        return out
    return out[: max_chars - 15] + "\n...[truncated]"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run LoCoMo benchmark on Aionis + MiniMax")
    parser.add_argument("--base-url", default="", help="Aionis API base URL (default from PORT/.env)")
    parser.add_argument("--dataset", default=DEFAULT_DATASET_PATH, help="Local LoCoMo json path")
    parser.add_argument("--dataset-url", default=DEFAULT_DATASET_URL, help="Download URL if --dataset missing")
    parser.add_argument("--sample-limit", type=int, default=0, help="Number of conversations to run (0=all)")
    parser.add_argument("--sample-offset", type=int, default=0, help="Conversation offset")
    parser.add_argument("--qa-limit", type=int, default=0, help="Questions per conversation (0=all)")
    parser.add_argument("--qa-offset", type=int, default=0, help="Question offset inside each conversation")
    parser.add_argument("--scope-prefix", default="locomo", help="Scope prefix used for per-sample isolation")
    parser.add_argument("--session-max-chars", type=int, default=8000, help="Max chars per ingested session summary")
    parser.add_argument("--recall-limit", type=int, default=20, help="recall_text limit")
    parser.add_argument("--recall-hops", type=int, default=2, help="recall_text neighborhood_hops (1-2)")
    parser.add_argument("--recall-max-nodes", type=int, default=60, help="recall_text max_nodes")
    parser.add_argument("--recall-max-edges", type=int, default=100, help="recall_text max_edges")
    parser.add_argument("--recall-ranked-limit", type=int, default=140, help="recall_text ranked_limit")
    parser.add_argument("--recall-min-edge-weight", type=float, default=0.2, help="recall_text min_edge_weight")
    parser.add_argument("--recall-min-edge-confidence", type=float, default=0.2, help="recall_text min_edge_confidence")
    parser.add_argument("--recall-return-debug", action="store_true", help="Enable recall_text return_debug=true")
    parser.add_argument("--context-max-chars", type=int, default=12000, help="Max chars passed from recall context into LLM prompt")
    parser.add_argument("--http-timeout", type=int, default=60, help="HTTP timeout in seconds")
    parser.add_argument(
        "--worker-once-cmd",
        default="node dist/jobs/outbox-worker.js --once",
        help="Command to run outbox worker once after each sample write (empty to disable)",
    )
    parser.add_argument("--worker-runs-per-trigger", type=int, default=1, help="How many times to run worker command for each trigger")
    parser.add_argument("--recall-retry-on-empty", type=int, default=2, help="If seeds are empty, retry recall this many times")
    parser.add_argument("--recall-retry-sleep-ms", type=int, default=250, help="Sleep between empty-seed recall retries")

    parser.add_argument("--minimax-base-url", default=os.getenv("MINIMAX_CHAT_BASE_URL", "https://api.minimax.io/v1"))
    parser.add_argument(
        "--minimax-endpoint",
        default=os.getenv("MINIMAX_CHAT_ENDPOINT", ""),
        help="Override full chat endpoint URL (e.g. https://api.minimax.chat/v1/text/chatcompletion_v2)",
    )
    parser.add_argument("--minimax-model", default=os.getenv("MINIMAX_CHAT_MODEL", "MiniMax-M2.1"))
    parser.add_argument("--minimax-max-tokens", type=int, default=int(os.getenv("MINIMAX_CHAT_MAX_TOKENS", "128")))
    parser.add_argument("--minimax-temperature", type=float, default=float(os.getenv("MINIMAX_CHAT_TEMPERATURE", "0")))
    parser.add_argument("--prompt-style", choices=["default", "extractive"], default="extractive")
    parser.add_argument("--out-dir", default="", help="Output directory (default artifacts/locomo/runs/<run_id>)")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")

    port = os.getenv("PORT", "3001")
    base_url = args.base_url.strip() or os.getenv("AIONIS_BASE_URL", f"http://localhost:{port}")

    api_key = os.getenv("AIONIS_API_KEY", os.getenv("API_KEY", os.getenv("PERF_API_KEY", ""))).strip()
    if not api_key:
        keys_json = os.getenv("MEMORY_API_KEYS_JSON", "").strip()
        if keys_json:
            try:
                parsed_keys = json.loads(keys_json)
                if isinstance(parsed_keys, dict) and parsed_keys:
                    api_key = str(next(iter(parsed_keys.keys())))
            except Exception:
                pass
    auth_bearer = os.getenv("AIONIS_AUTH_BEARER", os.getenv("AUTH_BEARER", os.getenv("PERF_AUTH_BEARER", ""))).strip()
    aionis_headers = build_auth_headers(api_key, auth_bearer)

    minimax_key = os.getenv("MINIMAX_CHAT_API_KEY", os.getenv("MINIMAX_API_KEY", "")).strip()
    minimax_group_id = os.getenv("MINIMAX_GROUP_ID", "").strip()
    if not minimax_key:
        print("missing MINIMAX_CHAT_API_KEY/MINIMAX_API_KEY", file=sys.stderr)
        return 1
    minimax_headers = {"Authorization": f"Bearer {minimax_key}"}
    minimax_endpoint = args.minimax_endpoint.strip() or f"{args.minimax_base_url.rstrip('/')}/chat/completions"
    if "chatcompletion_v2" in minimax_endpoint and minimax_group_id:
        minimax_endpoint = with_query(minimax_endpoint, {"GroupId": minimax_group_id})

    dataset_path = (root / args.dataset).resolve()
    data = ensure_dataset(dataset_path, args.dataset_url)
    if args.sample_offset < 0:
        raise RuntimeError("--sample-offset must be >= 0")
    selected = data[args.sample_offset :]
    if args.sample_limit > 0:
        selected = selected[: args.sample_limit]
    if not selected:
        print("no samples selected", file=sys.stderr)
        return 1

    run_id = now_utc()
    out_dir = Path(args.out_dir).resolve() if args.out_dir else (root / f"artifacts/locomo/runs/{run_id}")
    out_dir.mkdir(parents=True, exist_ok=True)

    predictions_path = out_dir / "predictions.jsonl"
    details_path = out_dir / "details.json"
    summary_path = out_dir / "summary.json"

    totals = {
        "ok": 0,
        "failed": 0,
        "score_sum": 0.0,
        "write_ms": [],
        "worker_ms": [],
        "recall_ms": [],
        "llm_ms": [],
    }
    details: List[Dict[str, Any]] = []

    print(
        f"run_id={run_id} samples={len(selected)} base_url={base_url} model={args.minimax_model} "
        f"sample_offset={args.sample_offset} qa_offset={args.qa_offset} qa_limit={args.qa_limit or 'all'}"
    )
    with predictions_path.open("w", encoding="utf-8") as pred_f:
        for s_idx, sample in enumerate(selected, start=1):
            sample_id = str(sample.get("sample_id", f"s{s_idx}"))
            scope = f"{args.scope_prefix}_{s_idx}_{re.sub(r'[^a-zA-Z0-9_]+', '_', sample_id)}"
            row_result: Dict[str, Any] = {
                "sample_id": sample_id,
                "scope": scope,
                "sample_ok": False,
            }

            try:
                conv = sample.get("conversation") or {}
                if not isinstance(conv, dict):
                    raise RuntimeError("conversation missing or invalid")

                sess_nums = session_numbers(conv)
                nodes: List[Dict[str, Any]] = []
                for n in sess_nums:
                    turns = conv.get(f"session_{n}") or []
                    date_text = str(conv.get(f"session_{n}_date_time", "")).strip()
                    text = session_to_text(n, date_text, turns, args.session_max_chars)
                    if not text:
                        continue
                    nodes.append(
                        {
                            "client_id": f"{sample_id}_sess_{n}",
                            "type": "event",
                            "title": f"LoCoMo session {n}",
                            "text_summary": text,
                        }
                    )
                if not nodes:
                    raise RuntimeError("no valid sessions to ingest")

                t0 = time.perf_counter()
                write_payload = {
                    "scope": scope,
                    "input_text": f"LoCoMo ingest {sample_id}",
                    "auto_embed": True,
                    "memory_lane": "shared",
                    "trigger_topic_cluster": False,
                    "nodes": nodes,
                }
                write_resp, write_status = http_json(
                    f"{base_url}/v1/memory/write",
                    write_payload,
                    aionis_headers,
                    args.http_timeout,
                )
                write_ms = (time.perf_counter() - t0) * 1000
                totals["write_ms"].append(write_ms)
                if write_status != 200:
                    raise RuntimeError(f"write failed status={write_status} body={json.dumps(write_resp)[:500]}")

                worker_ms = 0.0
                if args.worker_once_cmd:
                    for _ in range(max(1, args.worker_runs_per_trigger)):
                        t_worker = time.perf_counter()
                        ok, worker_log = run_worker_once(args.worker_once_cmd)
                        worker_ms += (time.perf_counter() - t_worker) * 1000
                        if not ok:
                            raise RuntimeError(f"worker command failed: {worker_log}")
                totals["worker_ms"].append(worker_ms)

                qas = sample.get("qa") or []
                if not isinstance(qas, list):
                    raise RuntimeError("qa missing or invalid")
                qas_sel = qas[args.qa_offset :]
                if args.qa_limit > 0:
                    qas_sel = qas_sel[: args.qa_limit]
                if not qas_sel:
                    raise RuntimeError("no qa selected for sample")

                sample_scores: List[float] = []
                sample_failed = 0
                sample_rows: List[Dict[str, Any]] = []

                for q_idx, qa in enumerate(qas_sel, start=1):
                    question = str((qa or {}).get("question", "")).strip()
                    answer = str((qa or {}).get("answer", "")).strip()
                    category = int((qa or {}).get("category", 0) or 0)
                    qid = f"{sample_id}:q{args.qa_offset + q_idx}"
                    item_result: Dict[str, Any] = {
                        "question_id": qid,
                        "question": question,
                        "answer": answer,
                        "category": category,
                        "evidence": (qa or {}).get("evidence", []),
                    }
                    if not question:
                        sample_failed += 1
                        totals["failed"] += 1
                        item_result.update({"ok": False, "error": "empty question"})
                        sample_rows.append(item_result)
                        continue

                    try:
                        recall_payload = {
                            "scope": scope,
                            "query_text": question,
                            "limit": args.recall_limit,
                            "neighborhood_hops": args.recall_hops,
                            "max_nodes": args.recall_max_nodes,
                            "max_edges": args.recall_max_edges,
                            "ranked_limit": args.recall_ranked_limit,
                            "min_edge_weight": args.recall_min_edge_weight,
                            "min_edge_confidence": args.recall_min_edge_confidence,
                            "return_debug": bool(args.recall_return_debug),
                        }

                        def recall_once() -> Tuple[Dict[str, Any], int, float]:
                            t1 = time.perf_counter()
                            r_resp, r_status = http_json(
                                f"{base_url}/v1/memory/recall_text",
                                recall_payload,
                                aionis_headers,
                                args.http_timeout,
                            )
                            return r_resp, r_status, (time.perf_counter() - t1) * 1000

                        recall_attempts = 1
                        recall_resp, recall_status, recall_ms = recall_once()
                        recall_ms_total = recall_ms
                        if recall_status != 200:
                            raise RuntimeError(f"recall_text failed status={recall_status} body={json.dumps(recall_resp)[:500]}")
                        seeds = recall_resp.get("seeds") or []
                        while len(seeds) == 0 and recall_attempts <= max(0, args.recall_retry_on_empty):
                            if args.worker_once_cmd:
                                for _ in range(max(1, args.worker_runs_per_trigger)):
                                    t_worker = time.perf_counter()
                                    ok, worker_log = run_worker_once(args.worker_once_cmd)
                                    worker_ms += (time.perf_counter() - t_worker) * 1000
                                    if not ok:
                                        raise RuntimeError(f"worker command failed on retry: {worker_log}")
                            if args.recall_retry_sleep_ms > 0:
                                time.sleep(args.recall_retry_sleep_ms / 1000.0)
                            recall_resp, recall_status, recall_ms_retry = recall_once()
                            recall_ms_total += recall_ms_retry
                            recall_attempts += 1
                            if recall_status != 200:
                                raise RuntimeError(
                                    f"recall_text retry failed status={recall_status} body={json.dumps(recall_resp)[:500]}"
                                )
                            seeds = recall_resp.get("seeds") or []
                        totals["recall_ms"].append(recall_ms_total)

                        context_text = str(((recall_resp.get("context") or {}).get("text")) or "")
                        if args.context_max_chars > 0 and len(context_text) > args.context_max_chars:
                            context_text = context_text[: args.context_max_chars]

                        prompt = build_answer_prompt(question, context_text, category, args.prompt_style)

                        t2 = time.perf_counter()
                        chat_payload = {
                            "model": args.minimax_model,
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": args.minimax_temperature,
                            "max_tokens": args.minimax_max_tokens,
                        }
                        llm_resp, llm_status = http_json(
                            minimax_endpoint,
                            chat_payload,
                            minimax_headers,
                            args.http_timeout,
                        )
                        llm_ms = (time.perf_counter() - t2) * 1000
                        totals["llm_ms"].append(llm_ms)
                        if llm_status != 200:
                            raise RuntimeError(f"minimax chat failed status={llm_status} body={json.dumps(llm_resp)[:500]}")

                        choice0 = (llm_resp.get("choices") or [{}])[0]
                        hypothesis = extract_message_text(choice0)
                        if not hypothesis:
                            hypothesis = "I don't know."

                        score = locomo_score(hypothesis, answer, category)
                        sample_scores.append(score)
                        totals["score_sum"] += score
                        totals["ok"] += 1

                        pred_line = {
                            "question_id": qid,
                            "sample_id": sample_id,
                            "category": category,
                            "question": question,
                            "gold": answer,
                            "prediction": hypothesis,
                            "score": score,
                        }
                        pred_f.write(json.dumps(pred_line, ensure_ascii=False) + "\n")
                        pred_f.flush()

                        item_result.update(
                            {
                                "ok": True,
                                "hypothesis": hypothesis,
                                "score": score,
                                "latency_ms": {
                                    "recall": round(recall_ms_total, 2),
                                    "llm": round(llm_ms, 2),
                                },
                                "seeds": len(seeds),
                                "recall_attempts": recall_attempts,
                            }
                        )
                        if q_idx % 20 == 0 or q_idx == len(qas_sel):
                            print(
                                f"[sample {s_idx}/{len(selected)} {sample_id}] "
                                f"qa {q_idx}/{len(qas_sel)} score={score:.3f} "
                                f"seeds={len(seeds)} recall_ms={recall_ms_total:.1f} llm_ms={llm_ms:.1f}"
                            )
                    except Exception as qe:
                        sample_failed += 1
                        totals["failed"] += 1
                        item_result.update({"ok": False, "error": str(qe)})
                    sample_rows.append(item_result)

                totals["worker_ms"][-1] = worker_ms
                sample_avg = (sum(sample_scores) / len(sample_scores)) if sample_scores else 0.0
                row_result.update(
                    {
                        "sample_ok": sample_failed == 0,
                        "nodes_ingested": len(nodes),
                        "qas_total": len(qas_sel),
                        "qas_ok": len(sample_scores),
                        "qas_failed": sample_failed,
                        "score_avg": sample_avg,
                        "latency_ms": {
                            "write": round(write_ms, 2),
                            "worker": round(worker_ms, 2),
                        },
                        "qa_results": sample_rows,
                    }
                )
                print(
                    f"[sample {s_idx}/{len(selected)}] done sample_id={sample_id} "
                    f"qas_ok={len(sample_scores)}/{len(qas_sel)} score_avg={sample_avg:.4f} "
                    f"write_ms={write_ms:.1f}"
                )
            except Exception as e:
                totals["failed"] += 1
                row_result.update({"sample_ok": False, "error": str(e)})
                print(f"[sample {s_idx}/{len(selected)}] fail sample_id={sample_id} error={e}", file=sys.stderr)

            details.append(row_result)

    def avg(xs: List[float]) -> float:
        return (sum(xs) / len(xs)) if xs else 0.0

    per_cat: Dict[str, Dict[str, float]] = {}
    for sample_row in details:
        for qa_row in sample_row.get("qa_results", []) or []:
            if not qa_row.get("ok"):
                continue
            c = str(qa_row.get("category", "0"))
            bucket = per_cat.get(c)
            if not bucket:
                bucket = {"count": 0.0, "score_sum": 0.0}
                per_cat[c] = bucket
            bucket["count"] += 1.0
            bucket["score_sum"] += float(qa_row.get("score", 0.0))

    metrics_by_category: Dict[str, Any] = {}
    for c, b in sorted(per_cat.items(), key=lambda kv: int(kv[0])):
        n = max(1.0, b["count"])
        metrics_by_category[c] = {
            "count": int(b["count"]),
            "score_avg": b["score_sum"] / n,
        }

    n_ok = max(1, totals["ok"])
    summary = {
        "ok": True,
        "run_id": run_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_path": str(dataset_path),
        "dataset_url": args.dataset_url,
        "samples_requested": len(selected),
        "rows_ok": totals["ok"],
        "rows_failed": totals["failed"],
        "metrics": {
            "locomo_score_avg": totals["score_sum"] / n_ok,
        },
        "latency_ms_avg": {
            "write": avg(totals["write_ms"]),
            "worker": avg(totals["worker_ms"]),
            "recall": avg(totals["recall_ms"]),
            "llm": avg(totals["llm_ms"]),
        },
        "latency_ms_p50": {
            "write": percentile(totals["write_ms"], 50),
            "worker": percentile(totals["worker_ms"], 50),
            "recall": percentile(totals["recall_ms"], 50),
            "llm": percentile(totals["llm_ms"], 50),
        },
        "latency_ms_p95": {
            "write": percentile(totals["write_ms"], 95),
            "worker": percentile(totals["worker_ms"], 95),
            "recall": percentile(totals["recall_ms"], 95),
            "llm": percentile(totals["llm_ms"], 95),
        },
        "metrics_by_category": metrics_by_category,
        "config": {
            "base_url": base_url,
            "scope_prefix": args.scope_prefix,
            "sample_limit": args.sample_limit,
            "sample_offset": args.sample_offset,
            "qa_limit": args.qa_limit,
            "qa_offset": args.qa_offset,
            "recall_limit": args.recall_limit,
            "recall_hops": args.recall_hops,
            "recall_max_nodes": args.recall_max_nodes,
            "recall_max_edges": args.recall_max_edges,
            "recall_ranked_limit": args.recall_ranked_limit,
            "recall_min_edge_weight": args.recall_min_edge_weight,
            "recall_min_edge_confidence": args.recall_min_edge_confidence,
            "recall_return_debug": bool(args.recall_return_debug),
            "minimax_base_url": args.minimax_base_url,
            "minimax_endpoint": minimax_endpoint,
            "minimax_model": args.minimax_model,
            "prompt_style": args.prompt_style,
            "worker_once_cmd": args.worker_once_cmd,
            "worker_runs_per_trigger": args.worker_runs_per_trigger,
            "recall_retry_on_empty": args.recall_retry_on_empty,
            "recall_retry_sleep_ms": args.recall_retry_sleep_ms,
        },
        "artifacts": {
            "predictions_jsonl": str(predictions_path),
            "details_json": str(details_path),
            "summary_json": str(summary_path),
        },
    }

    details_path.write_text(json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
