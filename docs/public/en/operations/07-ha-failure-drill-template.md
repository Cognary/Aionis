---
title: "HA Failure Drill Template"
---

# HA Failure Drill Template

Last updated: `2026-03-03`

Use this template to run recurring resiliency drills for HA deployments.

Reference sample:

1. [HA Failure Drill Sample](/public/en/operations/08-ha-failure-drill-sample)

## Drill Header

1. Drill ID
2. Date (UTC)
3. Environment
4. Owner
5. Participants
6. Release/Tag

## Scenario A: Database Restore

Goal: validate backup/PITR recovery and RTO/RPO targets.

Record:

1. Restore start/end timestamps.
2. Restored target timestamp.
3. Validation commands (`/health`, write, recall).
4. Measured RTO/RPO.

Pass criteria:

1. Restore finished within RTO target.
2. Data loss stayed within RPO target.
3. Critical APIs passed smoke checks.

## Scenario B: API Rollback

Goal: validate fast rollback to last known-good release.

Record:

1. Canary start timestamp.
2. Rollback trigger timestamp.
3. Recovery completion timestamp.
4. Latency/error recovery window.

Pass criteria:

1. Rollback completed within rollback SLO.
2. Service returned to baseline health/performance.
3. No schema compatibility incident occurred.

## Scenario C: Worker Recovery

Goal: validate backlog drain and replay after worker interruption.

Record:

1. Worker pause duration.
2. Peak backlog level.
3. Drain completion time.
4. Post-recovery health and consistency checks.

Pass criteria:

1. Backlog returned to expected steady-state.
2. No persistent failed replay tasks.
3. Post-recovery checks are passing.

## Incident Notes

1. What failed
2. Blast radius
3. Mitigation applied
4. Follow-up owner and due date

## Final Sign-off

1. Result: `pass` / `partial` / `fail`
2. Approver
3. Date (UTC)
