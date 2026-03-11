---
title: "Aionis Cost Delta Benchmark Plan"
---

# Aionis Cost Delta Benchmark Plan

Date: `2026-03-11`
Status: `in_progress`

## Goal

Produce real benchmark artifacts that can support public-facing claims about Aionis cost reduction.

The benchmark plan should prefer:

1. real API runs against the current runtime
2. reproducible artifact directories under `artifacts/perf/`
3. deltas that map directly to runtime features already shipped

## Wave Plan

### Wave A: Context Optimization Delta

Status: `run now`

Purpose:

1. measure baseline vs optimized `context/assemble`
2. capture estimated token reduction
3. capture forgetting/static-injection activation
4. capture latency delta

Required prerequisites:

1. API running
2. Postgres migrated
3. benchmark scope seeded with synthetic graph data
4. source scope has at least one READY embedding

Primary artifact outputs:

1. `seed_<scale>.json`
2. `benchmark_<scale>.json`
3. `PERFORMANCE_REPORT_V1.md`

### Wave B: Replay Optimization Delta

Status: `blocked on playbook corpus selection`

Purpose:

1. measure deterministic replay eligibility
2. measure dispatch decision mix
3. measure primary-model calls avoided
4. measure replay step `result_summary` coverage

Required prerequisites:

1. at least one representative promoted playbook
2. stable matcher and policy constraint payload for sampling

### Wave C: Summary-First Execution Delta

Status: `blocked on sandbox-enabled environment`

Purpose:

1. measure `result_summary` coverage for `sandbox/execute|get|logs|artifact`
2. measure endpoint latency distribution
3. demonstrate summary-first execution on non-replay paths

Required prerequisites:

1. sandbox enabled
2. allowlisted benchmark command

## Initial Run Shape

Use a medium-cost first run to validate the pipeline before scaling up.

Recommended first parameters:

1. scale: `10000` events
2. topics: `100`
3. recall mode only
4. `recall_requests=120`
5. `recall_concurrency=6`
6. `optimization_samples=24`
7. `optimization_profile=aggressive`
8. `optimization_token_budget=600`
9. `optimization_char_budget=1800`

## Acceptance Criteria

Wave A is successful if:

1. artifact directory is produced under `artifacts/perf/`
2. benchmark JSON includes `optimization.summary.*`
3. markdown report renders `Context Optimization Signals`
4. output is clean enough to cite p95 token delta and latency delta externally

## Notes

1. Do not block Wave A on replay or sandbox prerequisites.
2. Prefer a smaller successful artifact now over a broad but flaky matrix.
3. After Wave A validates the pipeline, add Wave B and Wave C artifacts into the same evidence set.
