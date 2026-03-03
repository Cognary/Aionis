---
title: "HA Failure Drill Sample"
---

# HA Failure Drill Sample

Last updated: `2026-03-03`

This sample shows a concise, production-ready drill record format.

## Drill Header

1. Drill ID: `ha-drill-2026-03-03-staging-01`
2. Date (UTC): `2026-03-03`
3. Environment: `staging-ha`
4. Owner: `platform-oncall`
5. Participants: `backend-lead`, `sre-lead`
6. Release/Tag: `v0.2.4`

## Scenario A: Database Restore

1. Restore target timestamp: `2026-03-03T02:10:00Z`
2. Restore window: `02:12:00Z -> 02:29:20Z`
3. Smoke checks passed: `/health`, `write`, `recall_text`
4. RTO: `17m20s`
5. RPO: `<= 5m`
6. Result: `pass`

## Scenario B: API Rollback

1. Canary started: `03:00:00Z`
2. Rollback triggered: `03:08:00Z`
3. Rollback completed: `03:14:00Z`
4. Error rate returned to baseline in `<3m`
5. Result: `pass`

## Scenario C: Worker Recovery

1. Worker paused for `15m`
2. Backlog peak: `1.7x` baseline
3. Backlog drain complete in `12m`
4. Post-recovery health/consistency checks: `pass`
5. Result: `pass`

## Follow-ups

1. Improve rollback alert threshold to reduce trigger latency.
2. Automate backlog peak snapshot in drill evidence export.

## Final Sign-off

1. Drill result: `pass`
2. Approved by: `platform-oncall`
3. Date (UTC): `2026-03-03`
