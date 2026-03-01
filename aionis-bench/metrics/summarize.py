#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, obj: Any) -> None:
    write_text(path, json.dumps(obj, ensure_ascii=False, indent=2))


def to_markdown(run_id: str, details: Dict[str, Any], summary: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append(f"# AionisBench v0.1 Report")
    lines.append("")
    lines.append(f"- run_id: `{run_id}`")
    lines.append(f"- generated_at_utc: `{summary.get('generated_at_utc')}`")
    lines.append(f"- base_url: `{details.get('base_url')}`")
    lines.append(f"- ok: `{summary.get('ok')}`")
    lines.append("")
    lines.append("## Overview")
    lines.append("")
    lines.append(f"- total_cases: `{summary.get('total_cases')}`")
    lines.append(f"- passed_cases: `{summary.get('passed_cases')}`")
    lines.append(f"- failed_cases: `{summary.get('failed_cases')}`")
    lines.append(f"- pass_rate: `{summary.get('pass_rate')}`")
    lines.append("")
    lines.append("## By Pillar")
    lines.append("")
    for pillar, data in (summary.get("by_pillar") or {}).items():
        lines.append(f"- {pillar}: `{data.get('passed', 0)}/{data.get('total', 0)}`")
    lines.append("")
    lines.append("## Case Results")
    lines.append("")
    lines.append("| case_id | pillar | ok | name |")
    lines.append("|---|---|---:|---|")
    for c in details.get("cases", []):
        lines.append(
            f"| `{c.get('case_id')}` | {c.get('pillar')} | {'yes' if c.get('ok') else 'no'} | {c.get('name')} |"
        )
    xmb_ab = None
    for c in details.get("cases", []):
        if str(c.get("case_id") or "") == "XMB-006":
            xmb_ab = c
            break
    if isinstance(xmb_ab, dict):
        m = xmb_ab.get("metrics") or {}
        baseline = m.get("baseline") or {}
        policy = m.get("policy_loop") or {}
        delta = m.get("delta") or {}
        lines.append("")
        lines.append("## Policy Loop A/B (XMB-006)")
        lines.append("")
        lines.append("| metric | retrieval-only baseline | Aionis policy loop | delta |")
        lines.append("|---|---:|---:|---:|")
        lines.append(
            f"| success_rate | {baseline.get('success_rate', 'n/a')} | {policy.get('success_rate', 'n/a')} | {delta.get('success_rate_gain', 'n/a')} |"
        )
        lines.append(
            f"| selection_switches | {baseline.get('selection_switches', 'n/a')} | {policy.get('selection_switches', 'n/a')} | {delta.get('selection_switch_reduction', 'n/a')} |"
        )
        lines.append(
            f"| curl_second_success_rate | {baseline.get('curl_second_success_rate', 'n/a')} | {policy.get('curl_second_success_rate', 'n/a')} | {delta.get('curl_second_success_gain', 'n/a')} |"
        )
        lines.append(
            f"| feedback_link_coverage | n/a | {policy.get('feedback_link_coverage', 'n/a')} | n/a |"
        )
        lines.append(
            f"| source_rule_coverage | n/a | {policy.get('source_rule_coverage', 'n/a')} | n/a |"
        )
    failed = summary.get("failed_case_ids") or []
    if failed:
        lines.append("")
        lines.append("## Failed Cases")
        lines.append("")
        for cid in failed:
            lines.append(f"- `{cid}`")
    lines.append("")
    lines.append("## Reproduce")
    lines.append("")
    lines.append("```bash")
    lines.append("cd /path/to/Aionis")
    lines.append("npm run -s bench:aionis:v01")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize AionisBench v0.1 details")
    parser.add_argument("--details-json", required=True)
    parser.add_argument("--out-summary-json", required=True)
    parser.add_argument("--out-report-md", required=True)
    args = parser.parse_args()

    details = load_json(Path(args.details_json))
    cases = details.get("cases", [])
    total = len(cases)
    passed = sum(1 for c in cases if c.get("ok"))
    failed = total - passed
    by_pillar: Dict[str, Dict[str, int]] = {}
    for c in cases:
        p = str(c.get("pillar") or "unknown")
        if p not in by_pillar:
            by_pillar[p] = {"total": 0, "passed": 0}
        by_pillar[p]["total"] += 1
        if c.get("ok"):
            by_pillar[p]["passed"] += 1

    summary = {
        "ok": failed == 0,
        "run_id": details.get("run_id"),
        "generated_at_utc": now_utc(),
        "total_cases": total,
        "passed_cases": passed,
        "failed_cases": failed,
        "pass_rate": round((passed / total), 4) if total > 0 else 0,
        "failed_case_ids": [c.get("case_id") for c in cases if not c.get("ok")],
        "by_pillar": by_pillar,
        "artifacts": details.get("artifacts"),
    }
    xmb_ab = next((c for c in cases if str(c.get("case_id") or "") == "XMB-006"), None)
    if isinstance(xmb_ab, dict):
        m = xmb_ab.get("metrics") or {}
        summary["xmb_ab"] = {
            "baseline_success_rate": (m.get("baseline") or {}).get("success_rate"),
            "policy_success_rate": (m.get("policy_loop") or {}).get("success_rate"),
            "success_rate_gain": (m.get("delta") or {}).get("success_rate_gain"),
            "feedback_link_coverage": (m.get("policy_loop") or {}).get("feedback_link_coverage"),
            "source_rule_coverage": (m.get("policy_loop") or {}).get("source_rule_coverage"),
        }

    report = to_markdown(str(details.get("run_id")), details, summary)
    write_json(Path(args.out_summary_json), summary)
    write_text(Path(args.out_report_md), report)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
