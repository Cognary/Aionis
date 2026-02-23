#!/usr/bin/env python3
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, List

from common import (
    alpha_token,
    base_case,
    build_headers,
    finish_case,
    http_post_json,
    load_dotenv,
    load_jsonl,
    now_utc,
    parse_common_args,
    unique_scope,
    write_json,
)


def _rule_node(client_id: str, summary: str, run_id: str, prefer: List[str], deny: List[str], priority: int, weight: float) -> Dict[str, Any]:
    return {
        "client_id": client_id,
        "type": "rule",
        "text_summary": summary,
        "slots": {
            "if": {"run.id": run_id},
            "then": {"tool": {"prefer": prefer, "deny": deny}},
            "rule_meta": {"priority": priority, "weight": weight},
        },
    }


def case_rule_changes_tool_selection(args) -> Dict[str, Any]:
    case = base_case(
        "XMB-005",
        "ACTIVE rule changes tool choice; SHADOW conflict remains non-enforcing",
        "Execution Memory",
    )
    headers = build_headers(args.api_key, args.auth_bearer)
    scope = unique_scope(args.scope_prefix, "xmb5")
    run_id = f"runxmb{alpha_token(f'xmb:{time.time_ns()}', 12)}"

    write_payload = {
        "scope": scope,
        "input_text": "aionisbench xmb rules setup",
        "memory_lane": "shared",
        "auto_embed": False,
        "nodes": [
            _rule_node(
                "rule_active",
                "ACTIVE: prefer curl and deny bash when run.id matches",
                run_id,
                prefer=["curl"],
                deny=["bash"],
                priority=40,
                weight=2.0,
            ),
            _rule_node(
                "rule_shadow_conflict",
                "SHADOW: conflicting preference for bash",
                run_id,
                prefer=["bash"],
                deny=["curl"],
                priority=80,
                weight=2.0,
            ),
        ],
    }
    s_w, r_w = http_post_json(args.base_url, "/v1/memory/write", write_payload, headers, args.timeout_sec)
    nodes = r_w.get("nodes") if isinstance(r_w, dict) else []
    node_by_client: Dict[str, str] = {}
    for n in nodes or []:
        cid = str(n.get("client_id") or "")
        nid = str(n.get("id") or "")
        if cid and nid:
            node_by_client[cid] = nid

    active_id = node_by_client.get("rule_active", "")
    shadow_id = node_by_client.get("rule_shadow_conflict", "")

    s_a, _ = http_post_json(
        args.base_url,
        "/v1/memory/rules/state",
        {"scope": scope, "rule_node_id": active_id, "state": "active", "input_text": "activate benchmark active rule"},
        headers,
        args.timeout_sec,
    )
    s_s, _ = http_post_json(
        args.base_url,
        "/v1/memory/rules/state",
        {"scope": scope, "rule_node_id": shadow_id, "state": "shadow", "input_text": "set benchmark conflicting rule to shadow"},
        headers,
        args.timeout_sec,
    )

    select_payload = {
        "scope": scope,
        "run_id": run_id,
        "context": {"run": {"id": run_id}, "agent": {"id": "bench_agent", "team_id": "bench_team"}},
        "candidates": ["bash", "curl"],
        "include_shadow": True,
        "rules_limit": 50,
        "strict": True,
    }
    s_sel, r_sel = http_post_json(args.base_url, "/v1/memory/tools/select", select_payload, headers, args.timeout_sec)

    selection = (r_sel.get("selection") or {}) if isinstance(r_sel, dict) else {}
    rules = (r_sel.get("rules") or {}) if isinstance(r_sel, dict) else {}
    selected = str(selection.get("selected") or "")
    denied = selection.get("denied") or []
    denied_names = sorted(str(x.get("name") or "") for x in denied if isinstance(x, dict))
    applied = (rules.get("applied") or {}) if isinstance(rules, dict) else {}
    tool_explain = applied.get("tool_explain")
    tool_conflicts_summary = rules.get("tool_conflicts_summary")
    shadow_selection = rules.get("shadow_selection")

    explain_ok = isinstance(tool_explain, dict) and isinstance(tool_conflicts_summary, list)
    shadow_ok = True
    shadow_selected = None
    if isinstance(shadow_selection, dict):
        shadow_selected = shadow_selection.get("selected")
        # Shadow channel may choose bash under conflicting shadow policy, but must not override enforced selection.
        shadow_ok = selected == "curl"

    ok = (
        s_w == 200
        and s_a == 200
        and s_s == 200
        and s_sel == 200
        and selected == "curl"
        and "bash" in denied_names
        and explain_ok
        and shadow_ok
    )

    metrics = {
        "scope": scope,
        "write_status": s_w,
        "active_state_status": s_a,
        "shadow_state_status": s_s,
        "select_status": s_sel,
        "selected_tool": selected,
        "denied_tools": denied_names,
        "shadow_selected_tool": shadow_selected,
        "explain_fields_ok": explain_ok,
        "tool_conflicts_count": len(tool_conflicts_summary) if isinstance(tool_conflicts_summary, list) else 0,
    }
    case["artifacts"] = {"scope": scope, "decision_id": (r_sel.get("decision") or {}).get("decision_id") if isinstance(r_sel, dict) else None}
    return finish_case(case, ok, metrics, [], None if ok else "tool policy override assertion failed")


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    args = parse_common_args("Run AionisBench Execution Memory suite (v0.1)")
    if args.scenarios_file:
        _ = load_jsonl(Path(args.scenarios_file))

    started = now_utc()
    cases = [case_rule_changes_tool_selection(args)]
    suite_ok = all(bool(c.get("ok")) for c in cases)
    out = {
        "suite": "xmb",
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
