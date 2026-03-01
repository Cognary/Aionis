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


def _scenario_by_case(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        case_id = str(row.get("case_id") or "").strip()
        if case_id:
            out[case_id] = row
    return out


def _int_cfg(row: Dict[str, Any], key: str, default: int, min_v: int, max_v: int) -> int:
    raw = row.get(key)
    if raw is None:
        return default
    try:
        n = int(raw)
    except Exception:
        return default
    return max(min_v, min(max_v, n))


def _normalize_candidates(raw: Any) -> List[str]:
    if not isinstance(raw, list):
        return ["bash", "curl"]
    out: List[str] = []
    seen: set[str] = set()
    for item in raw:
        name = str(item or "").strip()
        if not name:
            continue
        if name in seen:
            continue
        seen.add(name)
        out.append(name)
    if len(out) < 2:
        return ["bash", "curl"]
    if "curl" not in out:
        out.append("curl")
    if "bash" not in out:
        out.append("bash")
    return out


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


def case_rule_changes_tool_selection(args, cfg: Dict[str, Any] | None = None) -> Dict[str, Any]:
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


def case_policy_loop_vs_retrieval_only(args, cfg: Dict[str, Any] | None = None) -> Dict[str, Any]:
    case = base_case(
        "XMB-006",
        "A/B: policy loop vs retrieval-only heuristic on success/stability/controllability",
        "Execution Memory",
    )
    headers = build_headers(args.api_key, args.auth_bearer)
    scope = unique_scope(args.scope_prefix, "xmb6")
    config = cfg or {}
    episodes = _int_cfg(config, "episodes", 20, 6, 200)
    candidates_base = _normalize_candidates(config.get("candidates"))
    expected_tool = "curl"
    recall_query = str(config.get("query_text") or "fetch HTTP response body and avoid shell scripts")

    setup_write_payload = {
        "scope": scope,
        "input_text": "aionisbench xmb policy-loop ab setup",
        "memory_lane": "shared",
        "auto_embed": False,
        "nodes": [
            {
                "client_id": "rule_policy_loop_ab",
                "type": "rule",
                "text_summary": "For http_fetch intent, prefer curl and deny bash.",
                "slots": {
                    "if": {"intent": "http_fetch"},
                    "then": {"tool": {"prefer": ["curl"], "deny": ["bash"]}},
                    "rule_meta": {"priority": 45, "weight": 2.0},
                },
            }
        ],
    }
    s_w, r_w = http_post_json(args.base_url, "/v1/memory/write", setup_write_payload, headers, args.timeout_sec)
    setup_nodes = r_w.get("nodes") if isinstance(r_w, dict) else []
    rule_id = ""
    for n in setup_nodes or []:
        if str(n.get("client_id") or "") == "rule_policy_loop_ab":
            rule_id = str(n.get("id") or "")
            break

    s_a, _ = http_post_json(
        args.base_url,
        "/v1/memory/rules/state",
        {"scope": scope, "rule_node_id": rule_id, "state": "active", "input_text": "activate policy loop A/B rule"},
        headers,
        args.timeout_sec,
    )

    baseline_success = 0
    policy_success = 0
    baseline_select: List[str] = []
    policy_select: List[str] = []
    baseline_curl_second_success = 0
    baseline_curl_second_total = 0
    policy_curl_second_success = 0
    policy_curl_second_total = 0

    policy_source_rule_hits = 0
    policy_explain_hits = 0
    policy_feedback_link_hits = 0
    policy_feedback_status_ok = 0
    policy_decision_with_id = 0
    policy_decision_readback_ok = 0
    policy_decision_lookup_attempts = 0
    policy_decision_lookup_unsupported = 0

    recall_statuses: List[int] = []
    select_statuses: List[int] = []
    feedback_statuses: List[int] = []
    decision_statuses: List[int] = []

    for i in range(episodes):
        if i % 2 == 0:
            candidates = list(candidates_base)
        else:
            candidates = list(candidates_base)
            if len(candidates) >= 2:
                candidates[0], candidates[1] = candidates[1], candidates[0]

        run_id = f"xmb6_{alpha_token(f'{scope}:{i}:{time.time_ns()}', 10)}"

        s_recall, _ = http_post_json(
            args.base_url,
            "/v1/memory/recall_text",
            {
                "scope": scope,
                "query_text": recall_query,
                "limit": 5,
                "consumer_agent_id": "bench_agent",
                "consumer_team_id": "bench_team",
            },
            headers,
            args.timeout_sec,
        )
        recall_statuses.append(s_recall)

        baseline_choice = candidates[0] if candidates else ""
        baseline_select.append(baseline_choice)
        if baseline_choice == expected_tool:
            baseline_success += 1
        if candidates and expected_tool in candidates and candidates.index(expected_tool) > 0:
            baseline_curl_second_total += 1
            if baseline_choice == expected_tool:
                baseline_curl_second_success += 1

        s_sel, r_sel = http_post_json(
            args.base_url,
            "/v1/memory/tools/select",
            {
                "scope": scope,
                "run_id": run_id,
                "context": {"intent": "http_fetch", "run": {"id": run_id}, "agent": {"id": "bench_agent", "team_id": "bench_team"}},
                "candidates": candidates,
                "include_shadow": False,
                "rules_limit": 50,
                "strict": True,
            },
            headers,
            args.timeout_sec,
        )
        select_statuses.append(s_sel)

        selection = (r_sel.get("selection") or {}) if isinstance(r_sel, dict) else {}
        selected = str(selection.get("selected") or "")
        policy_select.append(selected)
        if selected == expected_tool:
            policy_success += 1
        if candidates and expected_tool in candidates and candidates.index(expected_tool) > 0:
            policy_curl_second_total += 1
            if selected == expected_tool:
                policy_curl_second_success += 1

        rules = (r_sel.get("rules") or {}) if isinstance(r_sel, dict) else {}
        applied = (rules.get("applied") or {}) if isinstance(rules, dict) else {}
        source_rule_ids = []
        decision_obj = (r_sel.get("decision") or {}) if isinstance(r_sel, dict) else {}
        if isinstance(decision_obj, dict):
            source_rule_ids = decision_obj.get("source_rule_ids") or []
            if isinstance(source_rule_ids, list) and rule_id and rule_id in [str(x) for x in source_rule_ids]:
                policy_source_rule_hits += 1
            decision_id = str(decision_obj.get("decision_id") or "")
            if decision_id:
                policy_decision_with_id += 1
                policy_decision_lookup_attempts += 1
                s_dec, r_dec = http_post_json(
                    args.base_url,
                    "/v1/memory/tools/decision",
                    {"scope": scope, "decision_id": decision_id},
                    headers,
                    args.timeout_sec,
                )
                decision_statuses.append(s_dec)
                if s_dec == 404:
                    err = str(r_dec.get("error") or "").strip() if isinstance(r_dec, dict) else ""
                    msg = str(r_dec.get("message") or "").strip() if isinstance(r_dec, dict) else ""
                    if err == "Not Found" and msg.startswith("Route POST:/v1/memory/tools/decision not found"):
                        policy_decision_lookup_unsupported += 1
                if s_dec == 200 and isinstance(r_dec, dict):
                    dec = r_dec.get("decision") or {}
                    if isinstance(dec, dict) and str(dec.get("selected_tool") or "") == selected:
                        policy_decision_readback_ok += 1

                s_fb, r_fb = http_post_json(
                    args.base_url,
                    "/v1/memory/tools/feedback",
                    {
                        "scope": scope,
                        "context": {"intent": "http_fetch", "run": {"id": run_id}},
                        "candidates": candidates,
                        "selected_tool": selected,
                        "outcome": "positive" if selected == expected_tool else "negative",
                        "run_id": run_id,
                        "decision_id": decision_id,
                        "input_text": f"xmb6 feedback selected={selected} outcome={'positive' if selected == expected_tool else 'negative'}",
                    },
                    headers,
                    args.timeout_sec,
                )
                feedback_statuses.append(s_fb)
                if s_fb == 200:
                    policy_feedback_status_ok += 1
                    if str((r_fb or {}).get("decision_link_mode") or "") == "provided":
                        policy_feedback_link_hits += 1

        tool_explain = applied.get("tool_explain")
        if isinstance(tool_explain, dict):
            policy_explain_hits += 1

    def rate(hit: int, total: int) -> float:
        if total <= 0:
            return 0.0
        return round(hit / total, 4)

    def switches(seq: List[str]) -> int:
        n = 0
        for i in range(1, len(seq)):
            if seq[i] != seq[i - 1]:
                n += 1
        return n

    baseline_success_rate = rate(baseline_success, episodes)
    policy_success_rate = rate(policy_success, episodes)
    baseline_switches = switches(baseline_select)
    policy_switches = switches(policy_select)
    baseline_unique = len(set(baseline_select))
    policy_unique = len(set(policy_select))

    decision_lookup_supported = policy_decision_lookup_attempts > 0 and policy_decision_lookup_unsupported < policy_decision_lookup_attempts

    policy_feedback_link_rate = rate(policy_feedback_link_hits, policy_decision_with_id)
    policy_source_rule_rate = rate(policy_source_rule_hits, episodes)
    policy_explain_rate = rate(policy_explain_hits, episodes)
    policy_decision_readback_rate = rate(policy_decision_readback_ok, policy_decision_lookup_attempts)
    baseline_curl_second_rate = rate(baseline_curl_second_success, baseline_curl_second_total)
    policy_curl_second_rate = rate(policy_curl_second_success, policy_curl_second_total)

    ok = (
        s_w == 200
        and s_a == 200
        and policy_success_rate >= 0.9
        and (policy_success_rate - baseline_success_rate) >= 0.2
        and policy_feedback_link_rate >= 0.9
        and policy_source_rule_rate >= 0.9
        and (
            (not decision_lookup_supported)
            or policy_decision_readback_rate >= 0.9
        )
    )

    notes: List[str] = []
    if not decision_lookup_supported:
        notes.append("tools/decision readback endpoint not available in target runtime; readback metrics treated as informational.")

    metrics = {
        "scope": scope,
        "episodes": episodes,
        "expected_tool": expected_tool,
        "setup_write_status": s_w,
        "activate_status": s_a,
        "baseline": {
            "method": "retrieval_only_first_candidate",
            "success_rate": baseline_success_rate,
            "success_count": baseline_success,
            "selection_switches": baseline_switches,
            "unique_selected_tools": baseline_unique,
            "curl_second_success_rate": baseline_curl_second_rate,
            "decision_trace_rate": 0.0,
        },
        "policy_loop": {
            "method": "rules_tools_select_feedback",
            "success_rate": policy_success_rate,
            "success_count": policy_success,
            "selection_switches": policy_switches,
            "unique_selected_tools": policy_unique,
            "curl_second_success_rate": policy_curl_second_rate,
            "source_rule_coverage": policy_source_rule_rate,
            "explain_coverage": policy_explain_rate,
            "feedback_link_coverage": policy_feedback_link_rate,
            "feedback_status_ok_coverage": rate(policy_feedback_status_ok, policy_decision_with_id),
            "decision_with_id_coverage": rate(policy_decision_with_id, episodes),
            "decision_readback_supported": decision_lookup_supported,
            "decision_readback_coverage": policy_decision_readback_rate,
        },
        "delta": {
            "success_rate_gain": round(policy_success_rate - baseline_success_rate, 4),
            "selection_switch_reduction": baseline_switches - policy_switches,
            "curl_second_success_gain": round(policy_curl_second_rate - baseline_curl_second_rate, 4),
        },
        "http_status": {
            "recall_text": sorted(list(set(recall_statuses))),
            "tools_select": sorted(list(set(select_statuses))),
            "tools_feedback": sorted(list(set(feedback_statuses))),
            "tools_decision": sorted(list(set(decision_statuses))),
        },
    }

    case["artifacts"] = {
        "scope": scope,
        "rule_node_id": rule_id,
    }
    return finish_case(case, ok, metrics, notes, None if ok else "policy loop A/B thresholds not met")


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    args = parse_common_args("Run AionisBench Execution Memory suite (v0.1)")
    scenario_rows: List[Dict[str, Any]] = []
    if args.scenarios_file:
        scenario_rows = load_jsonl(Path(args.scenarios_file))
    scenario_map = _scenario_by_case(scenario_rows)

    started = now_utc()
    cases = [
        case_rule_changes_tool_selection(args, scenario_map.get("XMB-005")),
        case_policy_loop_vs_retrieval_only(args, scenario_map.get("XMB-006")),
    ]
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
