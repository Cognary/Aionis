---
title: "Benchmark Snapshot (Public)"
---

# Benchmark Snapshot (Public)

Last updated: `2026-03-01`

This page is the public benchmark disclosure for Aionis.

## Scope Statement

The snapshot reports only reproducible, documented runs for:

1. API performance (`write` / `recall`)
2. Policy-loop effectiveness (`XMB-006` scenario)
3. Governance evidence outputs from the same run family

Non-claims:

1. Not a universal hardware/network benchmark
2. Not unconstrained autonomous model training
3. "Learning" means feedback-driven adaptation under policy controls

## Snapshot Values

### Performance (100k events profile)

| Metric | Value |
| --- | --- |
| Recall p95 | `51.42 ms` |
| Recall p99 | `61.16 ms` |
| Write p95 | `182.5 ms` |
| Write p99 | `240.2 ms` |
| Recall failure rate | `0%` |
| Write failure rate | `0%` |

### Policy Loop (`XMB-006`)

| Metric | Retrieval baseline | Policy loop | Delta |
| --- | --- | --- | --- |
| Success rate | `0.50` | `1.00` | `+0.50` |
| Selection switches | `19` | `0` | `-19` |
| Feedback link coverage | `n/a` | `1.00` | `+1.00` |
| Source rule coverage | `n/a` | `1.00` | `+1.00` |

## Environment Parameters

1. `PERF_PROFILE=perf_gate`
2. `SCALES=100000`
3. `tenant_id=default`
4. benchmark API base URL set to local test endpoint
5. evidence window: `168` hours

## Reproduce

### Performance

```bash
PERF_PROFILE=perf_gate SCALES=100000 npm run -s perf:production-matrix
```

### Evidence Pack

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

## Artifact Paths

1. `artifacts/perf/<run_id>/`
2. `artifacts/evidence/weekly/<report_week>_<run_id>/`
3. `artifacts/aionisbench/runs/<run_id>/`

## Related

1. [Performance Baseline](/public/en/benchmarks/05-performance-baseline)
2. [AionisBench v0.1](/public/en/benchmarks/06-aionis-bench-v01)
3. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
