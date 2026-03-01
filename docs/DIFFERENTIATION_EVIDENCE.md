---
title: "Differentiation Evidence"
---

# Differentiation Evidence

This runbook turns two claims into executable evidence:

1. Aionis policy loop outperforms retrieval-only behavior on success/stability/controllability.
2. Governance, replay, and audit are visible operational capabilities (not docs-only).

## Evidence Axes

1. Success: task/tool outcome correctness under repeated runs.
2. Stability: selection consistency under candidate-order perturbation.
3. Controllability: decision traceability, source-rule attribution, and feedback linkage coverage.

## Benchmark: Retrieval-Only vs Policy Loop

Run the XMB benchmark suite (includes `XMB-006` A/B case):

```bash
npm run -s bench:aionis:v01 -- --suites xmb
```

Artifacts:

1. `artifacts/aionisbench/runs/<run_id>/details.json`
2. `artifacts/aionisbench/runs/<run_id>/summary.json`
3. `artifacts/aionisbench/runs/<run_id>/report.md`

`XMB-006` output contains:

1. `baseline.success_rate` (retrieval-only first-candidate heuristic)
2. `policy_loop.success_rate`
3. `delta.success_rate_gain`
4. `baseline.selection_switches` vs `policy_loop.selection_switches`
5. `policy_loop.feedback_link_coverage`
6. `policy_loop.source_rule_coverage`

Interpretation guideline:

1. `delta.success_rate_gain > 0` indicates policy-loop advantage.
2. `selection_switch_reduction > 0` indicates higher selection stability.
3. High feedback/source coverage indicates stronger controllability and governance observability.

## Case Demo (Narrative-Friendly)

Use the killer demo for a concise before/after story:

```bash
bash examples/killer_demo.sh
```

Focus fields:

1. `before/after selection.selected`
2. `selection.denied`
3. Recall value delta (`target_hit_delta`)

## Governance, Replay, Audit Visibility

Ops UI page map:

1. `/` dashboard: runtime + telemetry + incident rollup
2. `/audit`: write-risk audit stream
3. `/actions`: guarded admin write actions
4. `/governance`: execution-loop signals + decision replay inspector

## One-Click Weekly Pack

Run one command to collect benchmark + execution loop + governance weekly evidence:

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168
```

Main outputs:

1. `artifacts/evidence/weekly/<report_week>_<run_id>/EVIDENCE_SUMMARY.json`
2. `artifacts/evidence/weekly/<report_week>_<run_id>/EVIDENCE_WEEKLY.md`
3. `artifacts/evidence/weekly/<report_week>_<run_id>/governance_weekly/summary.json`
4. `artifacts/evidence/weekly/<report_week>_<run_id>/bench_xmb/summary.json`

Optional strict mode:

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

Recommended production checks:

```bash
npm run -s job:execution-loop-gate -- --scope default --strict-warnings
npm run -s job:governance-weekly-report -- --scope default --strict-warnings
```

These outputs should be attached to release reviews together with benchmark artifacts.

For manual executive write-up format, use:

1. [Weekly Evidence Template](./EVIDENCE_WEEKLY_TEMPLATE.md)
