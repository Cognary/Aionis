---
title: "Abstraction Policy Runbook"
---

# Abstraction Policy Runbook

Last updated: `2026-03-03`

Use this runbook to operate topic/compression abstraction safely in production.

## Objective

Keep abstraction quality stable while preserving replayability and predictable latency.

## Operating Profiles

1. `conservative`: higher precision, lower churn.
2. `balanced`: default production profile.
3. `aggressive`: higher coverage, requires tighter monitoring.

## Change Procedure

1. Select profile in your environment config.
2. Deploy config change to staging first.
3. Run quality checks and core gate.
4. Promote to production only after stable results.

## Quality Signals to Monitor

1. Topic cohesion and orphan rates.
2. Compression retention and summary quality.
3. Decision replay consistency after abstraction updates.
4. Recall quality drift on representative workflows.

## Rollback Procedure

1. Revert profile to last known-good setting.
2. Restart affected services.
3. Re-run quality checks and production core gate.
4. Keep aggressive updates paused until drift is resolved.

## Release Evidence

For each profile change, record:

1. Profile before/after.
2. Quality check summary.
3. Core gate result.
4. Approval owner and timestamp.

## Related

1. [Consolidation Replay Runbook](/public/en/operations/10-consolidation-replay-runbook)
2. [Production Core Gate](/public/en/operations/03-production-core-gate)
