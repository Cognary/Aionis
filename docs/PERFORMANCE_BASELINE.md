# Performance Baseline (Scale Version, Phase D)

This document is the reproducible baseline kit for:

1. dataset size ramp (10^5 class)
2. API latency percentiles (write/recall p50/p95/p99)
3. worker throughput
4. planner/index sanity (`EXPLAIN ANALYZE`)

## 1) Preconditions

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
make db-migrate
```

Run API and worker in separate terminals:

```bash
npm run dev
npm run job:outbox-worker
```

## 2) Index Checklist (Must Exist)

Required minimum:

- `memory_nodes_embedding_hnsw_idx`
- `memory_nodes_embedding_ready_hot_warm_hnsw_idx`
- `memory_edges_scope_src_type_idx`
- `memory_edges_scope_dst_type_idx`

Quick check:

```bash
psql "$DATABASE_URL" -c "\d memory_nodes" | rg -n "hnsw|embedding"
psql "$DATABASE_URL" -c "\d memory_edges" | rg -n "scope_src_type|scope_dst_type"
```

## 3) Seed Synthetic Dataset

Preferred (tenant-aware, commit-tracked job):

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

Alternative SQL seed (legacy path):

```bash
psql "$DATABASE_URL" -v src_scope='default' -v scope='perf' -v n='50000' -f /Users/lucio/Desktop/Aionis/sql/seed_perf_dataset.sql
```

## 4) API Latency Benchmark

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode all \
  --warmup 20 \
  --recall-requests 300 \
  --recall-concurrency 12 \
  --write-requests 120 \
  --write-concurrency 4
```

Output fields:

- `cases[].latency_ms.p50/p95/p99`
- `cases[].rps`
- `cases[].failed`
- `cases[].by_status`

One-command matrix (seed + bench + explain + report):

```bash
npm run perf:phase-d-matrix
```

Current defaults (recommended):

- `SCOPE_STRATEGY=isolated` (each run uses unique scope)
- `RESET_MODE=auto` (isolated scopes avoid destructive reset)
- `RESET_IMPL=scope_purge` + `RESET_PURGE_MODE=partition` (reset path prefers partition truncate)
- `RESET_PURGE_FAIL_ON_DELETE=true` (fail fast if reset falls back to delete)
- `recall_slo` / `write_slo` disable heavy explain + worker benchmark by default for faster, cleaner SLO signals

When you must reset a fixed scope, use offline-window guard:

```bash
SCOPE_STRATEGY=fixed RESET_MODE=always PERF_OFFLINE_WINDOW=true \
RESET_IMPL=scope_purge RESET_PURGE_MODE=partition \
npm run perf:phase-d-matrix
```

Temporary compatibility mode (allows fallback delete):

```bash
SCOPE_STRATEGY=fixed RESET_MODE=always PERF_OFFLINE_WINDOW=true \
RESET_IMPL=scope_purge RESET_PURGE_MODE=auto RESET_PURGE_ALLOW_FALLBACK_DELETE=true \
RESET_PURGE_FAIL_ON_DELETE=false npm run perf:phase-d-matrix
```

SLO profile variants:

```bash
# 1) Recall SLO
PERF_PROFILE=recall_slo SCALES=100000 npm run perf:phase-d-matrix

# 2) Write SLO
PERF_PROFILE=write_slo SCALES=100000 npm run perf:phase-d-matrix

# 3) Worker SLO (auto build embed backlog before worker benchmark)
PERF_PROFILE=worker_slo SCALES=100000 npm run perf:phase-d-matrix
```

Artifacts default path:

- `/Users/lucio/Desktop/Aionis/artifacts/perf/<timestamp>/`
- includes `seed_*.json`, `benchmark_*.json`, `benchmark_adapt_*.json`, `explain_*.txt`, `worker_baseline.json`, `PERFORMANCE_REPORT_V1.md`

Profile behavior summary:

- `balanced` (default): mixed recall+write benchmark.
- `recall_slo`: benchmark mode `recall`, tuned concurrency + adaptive pacing (`429`-aware) for recall stability checks; skips explain/worker benchmark unless overridden.
- `write_slo`: benchmark mode `write`, conservative write concurrency + adaptive pacing to reduce `429` distortion; skips explain/worker benchmark unless overridden.
- `worker_slo`: lightweight recall benchmark + extra write pass with `embed_on_write=true` to create outbox backlog before worker throughput measurement.

## 5) Worker Throughput Benchmark

```bash
npm run job:perf-worker-benchmark -- --scope default --iterations 8
```

Output fields:

- `totals.throughput_processed_per_sec`
- `totals.processed`
- `outbox_before/outbox_after`
- `per_iteration[]`

## 6) Planner Baseline (EXPLAIN ANALYZE)

```bash
psql "$DATABASE_URL" -v scope='perf' -v lim='30' -f /Users/lucio/Desktop/Aionis/sql/explain_baseline.sql
```

Force-index sanity check:

```bash
psql "$DATABASE_URL" -v scope='perf' -v lim='30' -v force_index=1 -f /Users/lucio/Desktop/Aionis/sql/explain_baseline.sql
```

Expected:

- Stage-1 should use embedding index path when dataset is large enough.
- Stage-2 neighborhood query should stay within configured budgets.

## 7) Performance Report Template (Fill Per Run)

Template file:

- `/Users/lucio/Desktop/Aionis/docs/PERFORMANCE_REPORT_V1_TEMPLATE.md`

### Run Metadata

- Date:
- Branch/commit:
- Host spec:
- PostgreSQL version:
- Scope/tenant:
- Dataset size:

### API Latency

- Recall p50/p95/p99:
- Write p50/p95/p99:
- Recall RPS:
- Write RPS:
- Error rate:

### Worker Throughput

- Processed/sec:
- Claimed total:
- Failed marked:
- Outbox backlog delta:

### Planner Notes

- Stage-1 plan key lines:
- Stage-2 plan key lines:
- Total execution time:

### Conclusion

- Pass/Fail against SLO:
- Primary bottleneck:
- Next tuning action:

## 8) Suggested SLO Starter

- Recall p95 `< 300ms` (local 10^5 scope baseline target)
- Write p95 `< 500ms` (auto_embed=false benchmark profile)
- Worker throughput `> 50 jobs/s` on local dev hardware (batch/once mode dependent)

## Verification Stamp

- Last reviewed: `2026-02-16`
- Verification commands:
  - `npm run docs:check`
  - `npm run job:perf-seed -- --scope perf --events 50000 --topics 500 --reset`
  - `npm run job:perf-benchmark -- --scope perf --mode all`
  - `npm run job:perf-worker-benchmark -- --scope default --iterations 5`
  - `psql \"$DATABASE_URL\" -v scope='perf' -v lim='30' -f /Users/lucio/Desktop/Aionis/sql/explain_baseline.sql`
