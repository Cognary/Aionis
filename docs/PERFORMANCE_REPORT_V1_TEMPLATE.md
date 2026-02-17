# Performance Report v1 (Template)

Use this template for publishable benchmark snapshots.
For local auto-generation, prefer:

```bash
npm run job:perf-report -- --dir /Users/lucio/Desktop/Aionis/artifacts/perf/<run_id> --output /Users/lucio/Desktop/Aionis/artifacts/perf/<run_id>/PERFORMANCE_REPORT_V1.md
```

## 1. Run Metadata

- Date:
- Commit:
- Environment:
  - CPU:
  - RAM:
  - Disk:
  - Node.js:
  - PostgreSQL:
- Auth mode:
- Scope/Tenant:
- Scale set:

## 2. Dataset Build

| Scale(events) | Topics | Seed elapsed(ms) | Nodes in scope | Edges in scope |
| --- | --- | --- | --- | --- |
| 100000 | 1000 |  |  |  |
| 300000 | 3000 |  |  |  |
| 1000000 | 10000 |  |  |  |

## 3. API Latency

| Scale(events) | Recall p50 | Recall p95 | Recall p99 | Write p50 | Write p95 | Write p99 | Recall error% | Write error% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100000 |  |  |  |  |  |  |  |  |
| 300000 |  |  |  |  |  |  |  |  |
| 1000000 |  |  |  |  |  |  |  |  |

## 4. Worker Throughput

- Iterations:
- Claimed total:
- Processed total:
- Processed/sec:
- Failed marked:
- Backlog delta:

## 5. Query Planner Snapshot

- Stage-1 seed query plan (index path):
- Stage-2 neighborhood plan:
- Execution time ranges by scale:

## 6. SLO Evaluation

Target defaults:

- Recall p95 `< 300ms`
- Write p95 `< 500ms`
- Error rate `= 0%`

Result:

- Overall: PASS / FAIL
- Failed scales:
- Bottleneck notes:

## 7. Actions

1. Immediate tuning:
2. Next experiment:
3. Release recommendation:

