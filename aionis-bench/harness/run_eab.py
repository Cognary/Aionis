#!/usr/bin/env python3
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Dict, List

from common import (
    alpha_token,
    base_case,
    build_headers,
    count_target_hits,
    deterministic_embedding,
    finish_case,
    http_post_json,
    load_dotenv,
    now_utc,
    parse_common_args,
    stable_hash,
    unique_scope,
    write_json,
    run_worker_once,
)


def case_embedding_backfill(args) -> Dict[str, Any]:
    case = base_case(
        "EAB-001",
        "Embedding deferred write -> backfill improves recall",
        "Evolution & Audit",
    )
    scope = unique_scope(args.scope_prefix, "eab1")
    key = f"bencheab{alpha_token(f'eab1:{time.time_ns()}', 10)}"
    headers = build_headers(args.api_key, args.auth_bearer)

    write1 = {
        "scope": scope,
        "input_text": "aionisbench eab embedding deferred write",
        "memory_lane": "shared",
        "auto_embed": False,
        "nodes": [
            {
                "client_id": "evt_eab1",
                "type": "event",
                "text_summary": f"deferred embedding marker {key}",
            }
        ],
    }
    s_w1, r_w1 = http_post_json(args.base_url, "/v1/memory/write", write1, headers, args.timeout_sec)

    recall_payload = {
        "scope": scope,
        "query_text": key,
        "limit": 20,
        "neighborhood_hops": 2,
        "max_nodes": 60,
        "max_edges": 80,
    }
    s_r0, r_r0 = http_post_json(args.base_url, "/v1/memory/recall_text", recall_payload, headers, args.timeout_sec)
    before_hits = count_target_hits(r_r0, key) if s_r0 == 200 else 0

    write2 = {
        "scope": scope,
        "input_text": "aionisbench eab embedding backfill update",
        "memory_lane": "shared",
        "auto_embed": True,
        "force_reembed": True,
        "nodes": [
            {
                "client_id": "evt_eab1",
                "type": "event",
                "text_summary": f"deferred embedding marker {key}",
            }
        ],
    }
    s_w2, r_w2 = http_post_json(args.base_url, "/v1/memory/write", write2, headers, args.timeout_sec)

    worker_ok, worker_msg = run_worker_once(args.worker_once_cmd)

    after_hits = 0
    s_r1 = 0
    r_r1: Dict[str, Any] = {}
    for _ in range(30):
        s_r1, r_r1 = http_post_json(args.base_url, "/v1/memory/recall_text", recall_payload, headers, args.timeout_sec)
        if s_r1 == 200:
            after_hits = count_target_hits(r_r1, key)
            if after_hits > 0:
                break
        time.sleep(0.4)

    ok = s_w1 == 200 and s_w2 == 200 and s_r0 == 200 and s_r1 == 200 and before_hits == 0 and after_hits > 0
    metrics = {
        "scope": scope,
        "write_1_status": s_w1,
        "write_2_status": s_w2,
        "recall_before_status": s_r0,
        "recall_after_status": s_r1,
        "target_hits_before_backfill": before_hits,
        "target_hits_after_backfill": after_hits,
        "worker_once_ok": worker_ok,
    }
    notes = [f"worker_once={worker_ok}", f"worker_output_tail={worker_msg[-400:]}"]
    artifacts = {
        "scope": scope,
        "commit_1": r_w1.get("commit_id"),
        "commit_2": r_w2.get("commit_id"),
    }
    case["artifacts"] = artifacts
    return finish_case(case, ok, metrics, notes, None if ok else "backfill improvement assertion failed")


def deterministic_signature(recall_obj: Dict[str, Any], key: str) -> Dict[str, Any]:
    nodes = ((recall_obj.get("subgraph") or {}).get("nodes")) or []
    edges = ((recall_obj.get("subgraph") or {}).get("edges")) or []
    node_texts: List[str] = []
    node_types: Dict[str, int] = {}
    edge_types: Dict[str, int] = {}
    for n in nodes:
        t = str(n.get("type") or "")
        node_types[t] = node_types.get(t, 0) + 1
        txt = str(n.get("text_summary") or "")
        if txt:
            node_texts.append(txt)
    for e in edges:
        t = str(e.get("type") or "")
        edge_types[t] = edge_types.get(t, 0) + 1
    node_texts.sort()
    return {
        "nodes_total": len(nodes),
        "edges_total": len(edges),
        "node_types": node_types,
        "edge_types": edge_types,
        "node_texts": node_texts,
        "target_hits": count_target_hits(recall_obj, key),
        "context_has_key": key in str((recall_obj.get("context") or {}).get("text") or ""),
    }


def case_replay_determinism(args) -> Dict[str, Any]:
    case = base_case(
        "EAB-006",
        "Replay determinism: stable summary hash across 3 runs",
        "Evolution & Audit",
    )
    headers = build_headers(args.api_key, args.auth_bearer)
    key = f"bencheabanchor{alpha_token(f'eab6:{args.seed}', 10)}"
    run_hashes: List[str] = []
    run_status: List[Dict[str, Any]] = []

    for idx in range(3):
        scope = unique_scope(args.scope_prefix, f"eab6r{idx + 1}")
        emb_anchor = deterministic_embedding(f"{key}:anchor")
        emb_side = deterministic_embedding(f"{key}:side")
        write_payload = {
            "scope": scope,
            "input_text": "aionisbench replay determinism write",
            "memory_lane": "shared",
            "auto_embed": False,
            "nodes": [
                {"client_id": "entity_1", "type": "entity", "title": "Determinism Entity", "text_summary": f"entity note {key}", "embedding": emb_side, "embedding_model": "bench:det"},
                {"client_id": "topic_1", "type": "topic", "title": "Determinism Topic", "text_summary": f"topic note {key}", "embedding": emb_side, "embedding_model": "bench:det"},
                {"client_id": "event_anchor", "type": "event", "text_summary": f"anchor event {key}", "embedding": emb_anchor, "embedding_model": "bench:det"},
            ],
            "edges": [
                {"type": "part_of", "src": {"client_id": "event_anchor"}, "dst": {"client_id": "topic_1"}, "weight": 0.9},
                {"type": "related_to", "src": {"client_id": "entity_1"}, "dst": {"client_id": "topic_1"}, "weight": 0.8},
            ],
        }
        s_w, _ = http_post_json(args.base_url, "/v1/memory/write", write_payload, headers, args.timeout_sec)
        recall_payload = {
            "scope": scope,
            "query_text": key,
            "limit": 20,
            "neighborhood_hops": 2,
            "max_nodes": 60,
            "max_edges": 80,
            "include_meta": True,
        }
        s_r, r_r = http_post_json(args.base_url, "/v1/memory/recall_text", recall_payload, headers, args.timeout_sec)
        sig = deterministic_signature(r_r if s_r == 200 else {}, key)
        h = stable_hash(sig)
        run_hashes.append(h)
        run_status.append({"scope": scope, "write_status": s_w, "recall_status": s_r, "hash": h})

    all_hash_same = len(set(run_hashes)) == 1
    all_ok_status = all((x["write_status"] == 200 and x["recall_status"] == 200) for x in run_status)
    ok = all_hash_same and all_ok_status

    metrics = {
        "hashes": run_hashes,
        "all_hash_same": all_hash_same,
        "all_status_ok": all_ok_status,
        "runs": run_status,
    }
    notes = [f"hash_unique={len(set(run_hashes))}"]
    return finish_case(case, ok, metrics, notes, None if ok else "determinism hash mismatch")


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    args = parse_common_args("Run AionisBench Evolution & Audit suite (v0.1)")
    started = now_utc()
    cases = [case_embedding_backfill(args), case_replay_determinism(args)]
    suite_ok = all(bool(c.get("ok")) for c in cases)
    out = {
        "suite": "eab",
        "ok": suite_ok,
        "started_at_utc": started,
        "ended_at_utc": now_utc(),
        "cases": cases,
    }
    if args.out_file:
        write_json(Path(args.out_file), out)
    print(json_dump(out))
    raise SystemExit(0 if suite_ok else 1)


def json_dump(obj: Any) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
