---
title: "Execution Loop Gate"
---

# Execution Loop Gate

Last updated: `2026-02-19`

## Purpose

Validate whether the execution feedback loop is healthy enough to support memory-driven policy evolution.

The gate focuses on:

1. Feedback signal volume
2. `run_id` audit linkage coverage
3. Active-rule freshness against recent feedback
4. Negative outcome ratio drift
5. Decision linkage coverage for `tools_feedback`

## Command

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:execution-loop-gate -- --scope default
```

Strict warning mode (returns exit code `2` when warning checks fail):

```bash
npm run -s job:execution-loop-gate -- --scope default --strict-warnings
```

## Key Options

1. `--window-hours <n>`: rolling window (default `24`)
2. `--min-feedback-events <n>`: minimum feedback rows in window (default `10`)
3. `--min-distinct-runs <n>`: minimum distinct `run_id` (default `3`)
4. `--min-run-id-coverage <ratio>`: minimum `run_id` coverage (default `0.8`)
5. `--max-negative-ratio <ratio>`: upper bound for negative outcomes (default `0.35`)
6. `--min-active-feedback-coverage <ratio>`: minimum active-rule feedback freshness ratio (default `0.6`)
7. `--max-stale-active-rules <n>`: max active rules without recent feedback (default `5`)
8. `--min-decision-link-coverage <ratio>`: minimum ratio of `tools_feedback` rows that resolve to persisted decisions (default `0.95`)

## Health Gate Integration

Use within health gate:

```bash
npm run -s job:health-gate -- \
  --run-execution-loop-gate \
  --strict-warnings \
  --execution-loop-arg --window-hours \
  --execution-loop-arg 24
```

Note:

1. When `--strict-warnings` is enabled in `health-gate`, the execution loop gate is also run in strict warning mode.
2. Without strict mode, this check is informative (non-blocking) unless execution fails at runtime.

## Output Shape

JSON contains:

1. `metrics.feedback` (`total`, `distinct_runs`, `run_id_coverage`, outcome counts)
2. `metrics.rules` (`active_total`, `active_with_recent_feedback`, `stale_active_rules`)
3. `metrics.decision` (`tools_feedback_total`, `linked_decision_id`, `decision_link_coverage`) when provenance schema is present
4. `checks[]` with thresholds and pass/fail
5. `summary.failed_warnings` / `summary.failed_errors`

## Operational Interpretation

1. Low feedback volume: integration may not be emitting enough outcomes.
2. Low `run_id` coverage: auditability gap between execution and feedback.
3. High stale active-rule count: active policy may drift without current evidence.
4. High negative ratio: current policy injection may be unstable for production traffic.
