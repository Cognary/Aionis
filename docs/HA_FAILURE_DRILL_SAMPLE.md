---
title: "HA Failure Drill Sample"
---

# HA Failure Drill Sample

Last updated: `2026-02-28`

This is a filled example based on the [HA Failure Drill Template](./HA_FAILURE_DRILL_TEMPLATE.md).
Use it as a reference for expected level of detail; replace all values with your real drill evidence.

## Drill Metadata

1. Drill id: `ha_drill_20260228_staging_01`
2. Date (UTC): `2026-02-28`
3. Environment: `staging-ha`
4. Scope/tenant sample: `tenant=default`, `scope=default`
5. Owner: `platform-oncall`
6. Observers: `backend-lead`, `sre-lead`
7. Release/tag: `core=v0.2.2`, `docker=v0.2.2`

## Preconditions

1. API replicas: `2`
2. Worker replicas: `1`
3. External Postgres: enabled (managed)
4. Alerting channel: `#ops-alerts`
5. Rollback tag prepared: `v0.1.8`

## Scenario A: Database Restore Drill (PITR/Backup)

Goal:
Verify DB restore capability and RTO/RPO assumptions.

Execution summary:

1. Restore target timestamp: `2026-02-28T10:10:00Z`
2. Restore completed at: `2026-02-28T10:28:40Z`
3. API smoke started at: `2026-02-28T10:30:00Z`
4. Smoke endpoints passed: `/health`, `/v1/memory/write`, `/v1/memory/recall_text`

Measured:

1. RTO: `18m40s`
2. RPO: `<= 4m`

Result: `pass`

## Scenario B: API Rollback Drill

Goal:
Validate safe rollback to previous release when current API build regresses.

Execution summary:

1. Candidate deployed to canary slice at `2026-02-28T11:00:00Z`
2. Rollback started at `2026-02-28T11:07:00Z`
3. Previous tag restored at `2026-02-28T11:12:00Z`
4. Readiness fully green at `2026-02-28T11:14:00Z`

Measured:

1. Rollback duration: `7m`
2. Error-rate recovery: returned to baseline in `< 3m` after rollback completion
3. No migration/startup contract failures observed

Result: `pass`

## Scenario C: Worker Recovery + Replay Drill

Goal:
Validate outbox/backfill recovery path after worker interruption.

Execution summary:

1. Worker paused for `15m` under controlled write traffic.
2. Backlog peaked at `~1.8x` normal baseline.
3. Worker resumed and backlog drained in `11m`.
4. Post-recovery gates passed:
   - `npm run -s job:health-gate -- --strict-warnings --consistency-check-set scope`
   - `npm run -s job:consistency-check:cross-tenant -- --strict-warnings`

Result: `pass`

## Validation Command Evidence

1. `npm run -s gate:memory-store-p2:release` -> `pass`
2. `npm run -s preflight:prod` -> `pass`
3. `npm run -s gate:core:prod -- --base-url <staging-url> --scope default` -> `pass`

Evidence bundle path:

1. `artifacts/memory_store_p2_release/20260228_220743/summary.json`
2. `artifacts/core_gate/<run_id>/summary.json`
3. deployment rollback event logs (`staging release dashboard`)

## Incident Notes

1. What failed: none during drill windows.
2. Blast radius: staging-only.
3. Mitigation applied: not required.
4. Follow-up actions:
   - tighten rollback readiness alert thresholds to reduce detection latency.
   - automate backlog peak capture in worker replay drill script.
5. Owner + due date:
   - `platform-oncall`, `2026-03-07`

## Final Sign-off

1. Drill result: `pass`
2. Signed by: `platform-oncall`, `backend-lead`
3. Date (UTC): `2026-02-28`
