---
title: "Performance Baseline"
---

# Performance Baseline

This page defines the reproducible performance baseline workflow for Aionis.

## What Is Measured

1. Recall latency (`p50/p95/p99`)
2. Write latency (`p50/p95/p99`)
3. Error rates by endpoint category
4. Optional worker throughput metrics
5. Optional context-optimization cost signals (`context/assemble` baseline vs optimized)
6. Optional replay-optimization signals (`playbooks/candidate` + `playbooks/dispatch`)
7. Optional summary-first sandbox signals (`sandbox/execute` + `runs/get|logs|artifact`)
8. Optional ANN stage1 profile comparison signals (`recall_text` across recall profiles, including per-query breakdown)

## Preconditions

```bash
set -a; source .env; set +a
make db-migrate
```

Run API and worker:

```bash
npm run dev
npm run job:outbox-worker
```

## Seed Benchmark Dataset

```bash
npm run job:perf-seed -- \
  --scope perf \
  --tenant-id default \
  --src-scope default \
  --src-tenant-id default \
  --events 100000 \
  --topics 1000 \
  --reset
```

## Run Benchmark

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode all
```

Or one-command matrix:

```bash
npm run perf:production-matrix
```

Add context optimization evidence to the benchmark artifact:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --optimization-check true \
  --optimization-profile aggressive \
  --optimization-samples 12
```

Add replay optimization evidence to the benchmark artifact:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --replay-check true \
  --replay-playbook-id "<playbook_uuid>" \
  --replay-gate-matchers '{"tool":"kubectl"}' \
  --replay-gate-policy-constraints '{"risk_profile":"low"}' \
  --replay-samples 12
```

Add summary-first sandbox evidence to the benchmark artifact:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --sandbox-check true \
  --sandbox-argv-json '["echo","hello from sandbox benchmark"]' \
  --sandbox-samples 8
```

Add ANN-focused evidence to the benchmark artifact:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --ann-check true \
  --ann-profiles strict_edges,quality_first,lite \
  --ann-query-texts-json '["memory graph perf","prepare production deploy context"]' \
  --ann-samples 8
```

## Output Fields

1. `latency_ms.p50/p95/p99`
2. `rps`
3. `failed`
4. `by_status`
5. optional `optimization.summary.*` for estimated token reduction, forgotten items, static-block selection, and `context/assemble` p95 delta
6. optional `replay.*` for deterministic eligibility ratio, dispatch decision mix, primary-inference-skipped ratio, and `result_summary` coverage
7. optional `sandbox.*` for `result_summary` coverage across `execute/get/logs/artifact` and endpoint latency percentiles
8. optional `ann.*` for `stage1_candidates_ann_ms`, ANN seed counts, final seed counts, and recall latency by recall profile and by query

## Starter SLO Guidance

1. Recall p95: team-defined threshold
2. Write p95: team-defined threshold
3. Error rate: below release gate threshold

## Artifacts

`artifacts/perf/<run_id>/`

## Related

1. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
2. [AionisBench v0.1](/public/en/benchmarks/06-aionis-bench-v01)
