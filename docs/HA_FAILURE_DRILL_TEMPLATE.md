---
title: "HA Failure Drill Template"
---

# HA Failure Drill Template

Last updated: `2026-02-28`

Use this template to run and record high-value production resiliency drills for Aionis HA deployments.

Reference filled example:

1. [HA Failure Drill Sample](./HA_FAILURE_DRILL_SAMPLE.md)

## Drill Metadata

1. Drill id:
2. Date (UTC):
3. Environment:
4. Scope/tenant sample:
5. Owner:
6. Observers:
7. Release/tag:

## Preconditions

1. Deployment topology is split service (`API` replicas + separate `worker` + external Postgres).
2. Monitoring dashboards and alert channels are active.
3. Rollback artifact for previous known-good release is ready.
4. Backups/PITR policies are configured and tested at least once.

## Scenario A: Database Restore Drill (PITR/Backup)

Goal:
Verify DB restore capability and RTO/RPO assumptions.

Steps:

1. Choose restore target timestamp and capture current state snapshot metadata.
2. Execute restore to isolated verification environment.
3. Run migration/version checks on restored DB.
4. Run API health and core read/write smoke against restored target.
5. Validate critical records for selected scope/tenant sample.

Pass criteria:

1. Restore completed within target RTO.
2. Data loss is within target RPO window.
3. API smoke passes (`/health`, write, recall_text).

Evidence:

1. Restore job logs/IDs.
2. Validation command outputs and timestamps.
3. RTO/RPO measured values.

## Scenario B: API Rollback Drill

Goal:
Validate safe rollback to previous release when current API build regresses.

Steps:

1. Deploy current candidate to canary or controlled slice.
2. Trigger rollback to previous known-good API release.
3. Confirm API readiness and error-rate recovery.
4. Verify no schema incompatibility between rollback release and DB state.

Pass criteria:

1. Rollback completed within rollback SLO.
2. API error rate and latency return to baseline envelope.
3. No failed migrations or startup contract violations.

Evidence:

1. Deployment/rollback timestamps.
2. Before/after latency and error rate metrics.
3. API readiness/liveness probe logs.

## Scenario C: Worker Recovery + Replay Drill

Goal:
Validate outbox/backfill recovery path after worker interruption.

Steps:

1. Pause/stop worker service while API continues writes.
2. Generate controlled write traffic and verify backlog growth.
3. Restart worker service.
4. Verify backlog drains and derived jobs recover.
5. Run consistency/health checks after drain.

Pass criteria:

1. Backlog drains to expected steady-state range.
2. No persistent failed outbox events.
3. Post-recovery health gates pass.

Evidence:

1. Backlog metrics over time.
2. Worker restart logs and replay duration.
3. Post-recovery gate outputs.

## Suggested Validation Commands

1. `npm run -s gate:memory-store-p2:release`
2. `npm run -s preflight:prod`
3. `npm run -s gate:core:prod -- --base-url <url> --scope default`
4. `npm run -s job:health-gate -- --strict-warnings --consistency-check-set scope`
5. `npm run -s job:consistency-check:cross-tenant -- --strict-warnings`

## Incident Notes

1. What failed:
2. Blast radius:
3. Mitigation applied:
4. Follow-up actions:
5. Owner + due date:

## Final Sign-off

1. Drill result: `pass` / `partial` / `fail`
2. Signed by:
3. Date (UTC):
