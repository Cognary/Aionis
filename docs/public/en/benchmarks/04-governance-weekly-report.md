---
title: "Governance Weekly Report"
---

# Governance Weekly Report

This report summarizes weekly governance and control signals for production usage.

## Purpose

1. Track decision and feedback linkage quality
2. Track recall identity and scope hygiene
3. Track cross-tenant drift signals
4. Produce release-friendly JSON and Markdown artifacts

## Command

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168
```

Strict mode for release workflows:

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168 --strict-warnings
```

## Output

1. `summary.json`
2. `WEEKLY_STATUS.md`

Default location:

`artifacts/governance/weekly/<report_week>_<run_id>/`

## Core Metrics

1. decision link coverage
2. recall identity coverage
3. lane owner coverage
4. cross-tenant active-rule drift
5. cross-tenant negative-ratio drift
6. sandbox failure classification (`scope_snapshot.sandbox.top_errors`)
7. sandbox timeout/failure/truncation rates

## Sandbox Governance Signals

When `memory_sandbox_run_telemetry` exists, weekly report includes:

1. `scope_snapshot.sandbox` (rates + p95 latency)
2. gate checks:
 - `scope_sandbox_failure_rate_max`
 - `scope_sandbox_timeout_rate_max`
 - `scope_sandbox_output_truncated_rate_max`
3. recommendation hints based on top error buckets

Optional threshold flags:

```bash
npm run -s job:governance-weekly-report -- \
  --scope default \
  --window-hours 168 \
  --min-sandbox-runs-for-gate 10 \
  --max-sandbox-failure-rate 0.2 \
  --max-sandbox-timeout-rate 0.1 \
  --max-sandbox-output-truncated-rate 0.2
```

## Related

1. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
2. [Operate and Production](/public/en/operate-production/00-operate-production)
