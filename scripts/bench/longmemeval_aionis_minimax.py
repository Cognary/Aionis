#!/usr/bin/env python3
"""
LongMemEval baseline runner for Aionis + MiniMax chat model.

Flow per question:
1) Ingest LongMemEval haystack sessions into Aionis (isolated scope).
2) Run outbox worker once to accelerate embedding readiness.
3) Recall context via /v1/memory/recall_text.
4) Ask MiniMax model with recalled context.
5) Report lightweight exact/F1 metrics and latency stats.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse


DEFAULT_DATASET_URL = "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json"
DEFAULT_DATASET_PATH = "artifacts/longmemeval/data/longmemeval_oracle.json"


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
    text = text.lower()
    text = re.sub(r"\b(a|an|the)\b", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def token_f1(pred: str, gold: str) -> float:
    p = normalize_answer(pred).split()
    g = normalize_answer(gold).split()
    if not p and not g:
        return 1.0
    if not p or not g:
        return 0.0
    common = {}
    for t in p:
        common[t] = common.get(t, 0) + 1
    overlap = 0
    for t in g:
        if common.get(t, 0) > 0:
            overlap += 1
            common[t] -= 1
    if overlap == 0:
        return 0.0
    precision = overlap / len(p)
    recall = overlap / len(g)
    return (2 * precision * recall) / (precision + recall)


def exact_match(pred: str, gold: str) -> bool:
    return normalize_answer(pred) == normalize_answer(gold)


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
    return json.loads(local_path.read_text(encoding="utf-8"))


def session_to_text(session: List[Dict[str, Any]], max_chars: int) -> str:
    lines: List[str] = []
    for turn in session:
        role = str(turn.get("role", "user")).strip().lower()
        content = str(turn.get("content", "")).strip()
        if not content:
            continue
        lines.append(f"{role}: {content}")
    out = "\n".join(lines)
    if len(out) <= max_chars:
        return out
    return out[: max_chars - 15] + "\n...[truncated]"


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


def build_answer_prompt(question: str, context_text: str, style: str) -> str:
    if style == "extractive":
        return (
            "You answer memory questions strictly from provided context.\n"
            "If the context does not contain the answer, output exactly: I don't know.\n"
            "Return one concise answer sentence only, with no explanation.\n\n"
            f"Memory Context:\n{context_text}\n\n"
            f"Question:\n{question}\n\n"
            "Final answer:"
        )
    return (
        "Answer the user question using the provided memory context.\n"
        "If the context is insufficient, answer as best as possible in one short sentence.\n\n"
        f"Memory Context:\n{context_text}\n\n"
        f"Question:\n{question}\n\n"
        "Answer:"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run LongMemEval baseline on Aionis + MiniMax")
    parser.add_argument("--base-url", default="", help="Aionis API base URL (default from PORT/.env)")
    parser.add_argument("--dataset", default=DEFAULT_DATASET_PATH, help="Local LongMemEval json path")
    parser.add_argument("--dataset-url", default=DEFAULT_DATASET_URL, help="Download URL if --dataset missing")
    parser.add_argument("--limit", type=int, default=20, help="Number of questions to run")
    parser.add_argument("--offset", type=int, default=0, help="Start offset in dataset")
    parser.add_argument("--scope-prefix", default="longmemeval", help="Scope prefix used for per-question isolation")
    parser.add_argument("--session-max-chars", type=int, default=3000, help="Max chars per ingested session summary")
    parser.add_argument("--recall-limit", type=int, default=20, help="recall_text limit")
    parser.add_argument("--recall-hops", type=int, default=2, help="recall_text neighborhood_hops (1-2)")
    parser.add_argument("--recall-max-nodes", type=int, default=50, help="recall_text max_nodes")
    parser.add_argument("--recall-max-edges", type=int, default=100, help="recall_text max_edges")
    parser.add_argument("--recall-ranked-limit", type=int, default=100, help="recall_text ranked_limit")
    parser.add_argument("--recall-min-edge-weight", type=float, default=0.0, help="recall_text min_edge_weight")
    parser.add_argument("--recall-min-edge-confidence", type=float, default=0.0, help="recall_text min_edge_confidence")
    parser.add_argument("--recall-return-debug", action="store_true", help="Enable recall_text return_debug=true")
    parser.add_argument("--context-max-chars", type=int, default=12000, help="Max chars passed from recall context into LLM prompt")
    parser.add_argument("--http-timeout", type=int, default=60, help="HTTP timeout in seconds")
    parser.add_argument(
        "--worker-once-cmd",
        default="node dist/jobs/outbox-worker.js --once",
        help="Command to run outbox worker once after each write (empty to disable)",
    )
    parser.add_argument("--worker-every", type=int, default=1, help="Run worker once every N questions")
    parser.add_argument("--worker-runs-per-trigger", type=int, default=1, help="How many times to run worker command for each trigger")
    parser.add_argument("--recall-retry-on-empty", type=int, default=0, help="If seeds are empty, retry recall this many times")
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

    parser.add_argument("--out-dir", default="", help="Output directory (default artifacts/longmemeval/runs/<run_id>)")
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
    end = min(len(data), args.offset + args.limit)
    rows = data[args.offset:end]
    if not rows:
        print("no rows selected", file=sys.stderr)
        return 1

    run_id = now_utc()
    out_dir = Path(args.out_dir).resolve() if args.out_dir else (root / f"artifacts/longmemeval/runs/{run_id}")
    out_dir.mkdir(parents=True, exist_ok=True)

    predictions_path = out_dir / "predictions.jsonl"
    details_path = out_dir / "details.json"
    summary_path = out_dir / "summary.json"

    totals = {
        "ok": 0,
        "failed": 0,
        "em_sum": 0.0,
        "f1_sum": 0.0,
        "write_ms": [],
        "worker_ms": [],
        "recall_ms": [],
        "llm_ms": [],
    }
    details: List[Dict[str, Any]] = []

    print(f"run_id={run_id} rows={len(rows)} base_url={base_url} model={args.minimax_model}")
    with predictions_path.open("w", encoding="utf-8") as pred_f:
        for idx, item in enumerate(rows, start=1):
            qid = str(item.get("question_id", f"q{idx}"))
            question = str(item.get("question", "")).strip()
            answer = str(item.get("answer", "")).strip()
            scope = f"{args.scope_prefix}_{idx}_{re.sub(r'[^a-zA-Z0-9_]+', '_', qid)[-24:]}"
            row_result: Dict[str, Any] = {
                "question_id": qid,
                "question_type": item.get("question_type"),
                "scope": scope,
                "answer": answer,
            }
            try:
                sessions = item.get("haystack_sessions", [])
                nodes: List[Dict[str, Any]] = []
                for s_i, session in enumerate(sessions):
                    if not isinstance(session, list):
                        continue
                    text = session_to_text(session, args.session_max_chars)
                    if not text:
                        continue
                    nodes.append(
                        {
                            "client_id": f"{qid}_sess_{s_i+1}",
                            "type": "event",
                            "title": f"LongMemEval session {s_i+1}",
                            "text_summary": text,
                        }
                    )
                if not nodes:
                    raise RuntimeError("no valid haystack sessions to ingest")

                t0 = time.perf_counter()
                write_payload = {
                    "scope": scope,
                    "input_text": f"LongMemEval ingest {qid}",
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
                if args.worker_once_cmd and ((idx - 1) % max(1, args.worker_every) == 0):
                    for _ in range(max(1, args.worker_runs_per_trigger)):
                        t_worker = time.perf_counter()
                        ok, worker_log = run_worker_once(args.worker_once_cmd)
                        worker_ms += (time.perf_counter() - t_worker) * 1000
                        if not ok:
                            raise RuntimeError(f"worker command failed: {worker_log}")
                totals["worker_ms"].append(worker_ms)

                def recall_once() -> Tuple[Dict[str, Any], int, float]:
                    t1 = time.perf_counter()
                    r_resp, r_status = http_json(
                        f"{base_url}/v1/memory/recall_text",
                        recall_payload,
                        aionis_headers,
                        args.http_timeout,
                    )
                    return r_resp, r_status, (time.perf_counter() - t1) * 1000

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
                        raise RuntimeError(f"recall_text retry failed status={recall_status} body={json.dumps(recall_resp)[:500]}")
                    seeds = recall_resp.get("seeds") or []
                totals["recall_ms"].append(recall_ms_total)
                totals["worker_ms"][-1] = worker_ms

                context_text = str(((recall_resp.get("context") or {}).get("text")) or "")
                if args.context_max_chars > 0 and len(context_text) > args.context_max_chars:
                    context_text = context_text[: args.context_max_chars]

                prompt = build_answer_prompt(question, context_text, args.prompt_style)

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

                em = 1.0 if exact_match(hypothesis, answer) else 0.0
                f1 = token_f1(hypothesis, answer)
                totals["em_sum"] += em
                totals["f1_sum"] += f1
                totals["ok"] += 1

                pred_line = {"question_id": qid, "hypothesis": hypothesis}
                pred_f.write(json.dumps(pred_line, ensure_ascii=False) + "\n")
                pred_f.flush()

                row_result.update(
                    {
                        "ok": True,
                        "hypothesis": hypothesis,
                        "metrics": {"exact_match": em, "token_f1": f1},
                        "latency_ms": {
                            "write": round(write_ms, 2),
                            "worker": round(worker_ms, 2),
                            "recall": round(recall_ms_total, 2),
                            "llm": round(llm_ms, 2),
                        },
                        "seeds": len(seeds),
                        "recall_attempts": recall_attempts,
                    }
                )
                print(
                    f"[{idx}/{len(rows)}] ok qid={qid} em={em:.0f} f1={f1:.3f} "
                    f"seeds={len(seeds)} attempts={recall_attempts} "
                    f"write_ms={write_ms:.1f} recall_ms={recall_ms_total:.1f} llm_ms={llm_ms:.1f}"
                )
            except Exception as e:
                totals["failed"] += 1
                row_result.update({"ok": False, "error": str(e)})
                print(f"[{idx}/{len(rows)}] fail qid={qid} error={e}", file=sys.stderr)
            details.append(row_result)

    def avg(xs: List[float]) -> float:
        return (sum(xs) / len(xs)) if xs else 0.0

    per_type: Dict[str, Dict[str, float]] = {}
    for row in details:
        if not row.get("ok"):
            continue
        qtype = str(row.get("question_type") or "unknown")
        bucket = per_type.get(qtype)
        if not bucket:
            bucket = {"count": 0.0, "em_sum": 0.0, "f1_sum": 0.0}
            per_type[qtype] = bucket
        m = row.get("metrics") or {}
        bucket["count"] += 1.0
        bucket["em_sum"] += float(m.get("exact_match", 0.0))
        bucket["f1_sum"] += float(m.get("token_f1", 0.0))
    metrics_by_type: Dict[str, Any] = {}
    for qtype, b in per_type.items():
        count = max(1.0, b["count"])
        metrics_by_type[qtype] = {
            "count": int(b["count"]),
            "exact_match_avg": b["em_sum"] / count,
            "token_f1_avg": b["f1_sum"] / count,
        }

    n = max(1, totals["ok"])
    summary = {
        "ok": True,
        "run_id": run_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_path": str(dataset_path),
        "dataset_url": args.dataset_url,
        "rows_requested": len(rows),
        "rows_ok": totals["ok"],
        "rows_failed": totals["failed"],
        "metrics": {
            "exact_match_avg": totals["em_sum"] / n,
            "token_f1_avg": totals["f1_sum"] / n,
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
        "metrics_by_type": metrics_by_type,
        "config": {
            "base_url": base_url,
            "scope_prefix": args.scope_prefix,
            "limit": args.limit,
            "offset": args.offset,
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
            "worker_every": args.worker_every,
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
