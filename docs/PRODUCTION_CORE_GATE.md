---
title: "Production Core Gate"
---

# Production Core Gate

This is the blocking release gate for production go-live decisions.

## Policy

Blocking metrics:
1. Integrity: scope health gate (`strict_warnings`) + cross-tenant consistency (`strict_warnings`)
2. Operability: build/contract/docs/sdk release checks
3. Availability and SLO: recall/write perf benchmark thresholds

Auxiliary only (non-blocking):
1. LongMemEval
2. LoCoMo

## One-command execution

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s gate:core:prod -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --db-runner local \
  --scope default \
  --run-perf true \
  --recall-p95-max-ms 1200 \
  --write-p95-max-ms 800 \
  --error-rate-max 0.02
```

`--db-runner` notes:
- `local` (default): run DB-backed checks on local host using local `DATABASE_URL`.
- `auto`: currently aliases to `local` for compatibility.

The gate now compares API `/health.database_target_hash` and local `DATABASE_URL` target hash. If they differ, gate fails fast to prevent false green on the wrong database.

Artifacts:
- `artifacts/core_gate/<run_id>/summary.json`
- `artifacts/core_gate/<run_id>/06_health_gate_scope.json`
- `artifacts/core_gate/<run_id>/07_consistency_cross_tenant.json`
- `artifacts/core_gate/<run_id>/08_perf_benchmark.json`

## CI workflow

- `/Users/lucio/Desktop/Aionis/.github/workflows/core-production-gate.yml`

This workflow is the main branch gate.

## Verification Stamp

- Last reviewed: `2026-02-18`
