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

## Output Fields

1. `latency_ms.p50/p95/p99`
2. `rps`
3. `failed`
4. `by_status`

## Starter SLO Guidance

1. Recall p95: team-defined threshold
2. Write p95: team-defined threshold
3. Error rate: below release gate threshold

## Artifacts

`artifacts/perf/<run_id>/`

## Related

1. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
2. [AionisBench v0.1](/public/en/benchmarks/06-aionis-bench-v01)
