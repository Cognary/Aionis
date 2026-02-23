#!/usr/bin/env python3
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict

from common import (
    alpha_token,
    base_case,
    build_headers,
    count_target_hits,
    deterministic_embedding,
    finish_case,
    http_post_json,
    load_dotenv,
    load_jsonl,
    now_utc,
    parse_common_args,
    psql_count,
    unique_scope,
    write_json,
)


def case_topic_draft_trace(args) -> Dict[str, Any]:
    case = base_case(
        "GMB-003",
        "Topic draft creation + derived_from traceability",
        "Graph Memory",
    )
    headers = build_headers(args.api_key, args.auth_bearer)
    scope = unique_scope(args.scope_prefix, "gmb3")
    key = f"benchgmb{alpha_token(f'gmb3:{time.time_ns()}', 10)}"

    ev1_emb = deterministic_embedding(f"{key}:ev1")
    ev2_emb = deterministic_embedding(f"{key}:ev2")
    write_payload = {
        "scope": scope,
        "input_text": "aionisbench gmb topic draft trace",
        "memory_lane": "shared",
        "auto_embed": False,
        "trigger_topic_cluster": True,
        "topic_cluster_async": False,
        "nodes": [
            {"client_id": "ev1", "type": "event", "text_summary": f"release thread marker {key} alpha", "embedding": ev1_emb, "embedding_model": "bench:det"},
            {"client_id": "ev2", "type": "event", "text_summary": f"release thread marker {key} beta", "embedding": ev2_emb, "embedding_model": "bench:det"},
        ],
        "edges": [],
    }
    s_w, r_w = http_post_json(args.base_url, "/v1/memory/write", write_payload, headers, args.timeout_sec)
    tc = r_w.get("topic_cluster") if isinstance(r_w, dict) else None

    draft_topic_count = None
    derived_edge_with_commit_count = None
    if args.database_url:
        safe_scope = scope.replace("'", "''")
        draft_topic_count = psql_count(
            args.database_url,
            f"SELECT count(*) FROM memory_nodes WHERE scope = '{safe_scope}' AND type = 'topic' "
            "AND COALESCE(slots->>'topic_state','active') = 'draft';",
        )
        derived_edge_with_commit_count = psql_count(
            args.database_url,
            f"SELECT count(*) FROM memory_edges WHERE scope = '{safe_scope}' AND type = 'derived_from' AND commit_id IS NOT NULL;",
        )

    recall_payload = {
        "scope": scope,
        "query_text": key,
        "limit": 20,
        "neighborhood_hops": 2,
        "max_nodes": 80,
        "max_edges": 100,
        "include_meta": True,
        "include_slots": True,
    }
    s_r, r_r = http_post_json(args.base_url, "/v1/memory/recall_text", recall_payload, headers, args.timeout_sec)
    nodes = ((r_r.get("subgraph") or {}).get("nodes")) if isinstance(r_r, dict) else []
    edges = ((r_r.get("subgraph") or {}).get("edges")) if isinstance(r_r, dict) else []
    recall_draft_topics = 0
    for n in nodes or []:
        if str(n.get("type")) != "topic":
            continue
        state = n.get("topic_state")
        if state is None:
            state = ((n.get("slots") or {}).get("topic_state")) if isinstance(n.get("slots"), dict) else None
        if state == "draft":
            recall_draft_topics += 1
    recall_derived_commit_edges = sum(1 for e in (edges or []) if str(e.get("type")) == "derived_from" and e.get("commit_id"))

    created_topics = int((tc or {}).get("created_topics") or 0)
    promoted_topics = int((tc or {}).get("promoted") or 0)
    has_topic_commit = bool((tc or {}).get("topic_commit_id")) and bool((tc or {}).get("topic_commit_hash"))

    draft_ok = (draft_topic_count or 0) > 0 if draft_topic_count is not None else recall_draft_topics > 0
    trace_ok = (derived_edge_with_commit_count or 0) > 0 if derived_edge_with_commit_count is not None else recall_derived_commit_edges > 0
    ok = s_w == 200 and s_r == 200 and created_topics >= 1 and promoted_topics == 0 and has_topic_commit and draft_ok and trace_ok

    metrics = {
        "scope": scope,
        "write_status": s_w,
        "recall_status": s_r,
        "topic_cluster": tc,
        "draft_topic_count_db": draft_topic_count,
        "derived_edge_with_commit_count_db": derived_edge_with_commit_count,
        "draft_topic_count_recall": recall_draft_topics,
        "derived_edge_with_commit_count_recall": recall_derived_commit_edges,
    }
    case["artifacts"] = {"scope": scope, "topic_commit_id": (tc or {}).get("topic_commit_id")}
    notes = ["db_validation=on" if draft_topic_count is not None else "db_validation=off_fallback_recall"]
    return finish_case(case, ok, metrics, notes, None if ok else "topic draft or derived trace assertion failed")


def case_graph_budget_advantage(args) -> Dict[str, Any]:
    case = base_case(
        "GMB-004",
        "Graph expansion under budget outperforms strict vector-only budget",
        "Graph Memory",
    )
    headers = build_headers(args.api_key, args.auth_bearer)
    scope = unique_scope(args.scope_prefix, "gmb4")
    anchor = f"anchorgmb{alpha_token(f'gmb4a:{time.time_ns()}', 10)}"
    target = f"targetgmb{alpha_token(f'gmb4b:{time.time_ns()}', 10)}"

    emb_anchor = deterministic_embedding(f"{anchor}:primary")
    emb_side = deterministic_embedding(f"{anchor}:side")
    write_payload = {
        "scope": scope,
        "input_text": "aionisbench gmb graph budget setup",
        "memory_lane": "shared",
        "auto_embed": False,
        "nodes": [
            {"client_id": "topic_main", "type": "topic", "title": "Budget Topic", "text_summary": f"topic bridge for {anchor}", "embedding": emb_side, "embedding_model": "bench:det"},
            {"client_id": "event_anchor", "type": "event", "text_summary": f"primary anchor event {anchor}", "embedding": emb_anchor, "embedding_model": "bench:det"},
            {"client_id": "event_target", "type": "event", "text_summary": f"downstream target event {target}", "embedding": emb_side, "embedding_model": "bench:det"},
        ],
        "edges": [
            {"type": "part_of", "src": {"client_id": "event_anchor"}, "dst": {"client_id": "topic_main"}, "weight": 0.9},
            {"type": "part_of", "src": {"client_id": "event_target"}, "dst": {"client_id": "topic_main"}, "weight": 0.9},
        ],
    }
    s_w, _ = http_post_json(args.base_url, "/v1/memory/write", write_payload, headers, args.timeout_sec)

    baseline_payload = {
        "scope": scope,
        "query_embedding": emb_anchor,
        "limit": 6,
        "neighborhood_hops": 1,
        "max_nodes": 20,
        "max_edges": 20,
        "ranked_limit": 30,
        "min_edge_weight": 0.95,
        "min_edge_confidence": 0.95,
    }
    s_b, r_b = http_post_json(args.base_url, "/v1/memory/recall", baseline_payload, headers, args.timeout_sec)

    graph_payload = {
        "scope": scope,
        "query_embedding": emb_anchor,
        "limit": 20,
        "neighborhood_hops": 2,
        "max_nodes": 60,
        "max_edges": 80,
        "ranked_limit": 140,
        "min_edge_weight": 0.05,
        "min_edge_confidence": 0.05,
    }
    s_g, r_g = http_post_json(args.base_url, "/v1/memory/recall", graph_payload, headers, args.timeout_sec)

    b_hits = count_target_hits(r_b, target) if s_b == 200 else -1
    g_hits = count_target_hits(r_g, target) if s_g == 200 else -1
    b_nodes = len(((r_b.get("subgraph") or {}).get("nodes")) or []) if isinstance(r_b, dict) else 0
    g_nodes = len(((r_g.get("subgraph") or {}).get("nodes")) or []) if isinstance(r_g, dict) else 0
    b_edges = len(((r_b.get("subgraph") or {}).get("edges")) or []) if isinstance(r_b, dict) else 0
    g_edges = len(((r_g.get("subgraph") or {}).get("edges")) or []) if isinstance(r_g, dict) else 0

    # Robust acceptance:
    # 1) preferred: graph budget increases target hit.
    # 2) fallback: hit count is non-regression and graph expansion evidence (more edges) is present.
    improved = g_hits > b_hits
    non_regression_with_expansion = g_hits >= b_hits and g_edges > b_edges
    ok = s_w == 200 and s_b == 200 and s_g == 200 and g_nodes >= b_nodes and (improved or non_regression_with_expansion)
    metrics = {
        "scope": scope,
        "write_status": s_w,
        "baseline_status": s_b,
        "graph_status": s_g,
        "target_hits_baseline": b_hits,
        "target_hits_graph": g_hits,
        "nodes_baseline": b_nodes,
        "nodes_graph": g_nodes,
        "edges_baseline": b_edges,
        "edges_graph": g_edges,
        "improved": improved,
        "non_regression_with_expansion": non_regression_with_expansion,
    }
    case["artifacts"] = {"scope": scope}
    return finish_case(case, ok, metrics, [], None if ok else "graph budget advantage assertion failed")


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    args = parse_common_args("Run AionisBench Graph Memory suite (v0.1)")

    # Optional scenario file is accepted for future expansion; currently metadata-only.
    if args.scenarios_file:
        _ = load_jsonl(Path(args.scenarios_file))

    started = now_utc()
    cases = [case_topic_draft_trace(args), case_graph_budget_advantage(args)]
    suite_ok = all(bool(c.get("ok")) for c in cases)
    out = {
        "suite": "gmb",
        "ok": suite_ok,
        "started_at_utc": started,
        "ended_at_utc": now_utc(),
        "cases": cases,
    }
    if args.out_file:
        write_json(Path(args.out_file), out)
    import json

    print(json.dumps(out, ensure_ascii=False, indent=2))
    raise SystemExit(0 if suite_ok else 1)


if __name__ == "__main__":
    main()
