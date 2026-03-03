---
title: "Consolidation Replay Runbook"
---

# Consolidation Replay Runbook

Last updated: `2026-03-03`

Use this runbook when consolidation or replay behavior regresses in production.

## Scope

This runbook covers:

1. Consolidation candidate/apply cycles.
2. Redirect integrity after consolidation.
3. Replay determinism verification.

## Immediate Response

1. Pause new consolidation mutations.
2. Capture current health and replay evidence.
3. Assess impact scope (tenants, workflows, latency/error).

## Recovery Procedure

1. Validate last known-good baseline in staging.
2. Repair redirect completeness and consistency.
3. Re-run determinism checks.
4. Resume consolidation in bounded batches.
5. Re-run production core gate before full resume.

## Required Evidence

1. Before/after health snapshots.
2. Before/after replay determinism summary.
3. Applied recovery actions.
4. Final gate result.

## Exit Criteria

1. Consistency checks are clean.
2. Replay determinism is within baseline.
3. Core gate passes blocking checks.
4. Incident owner signs off resume.

## Related

1. [Abstraction Policy Runbook](/public/en/operations/09-abstraction-policy-runbook)
2. [Production Core Gate](/public/en/operations/03-production-core-gate)
