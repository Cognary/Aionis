---
title: "Production Core Gate"
---

# Production Core Gate

This gate is the minimum quality bar before production traffic changes.

## What This Gate Must Prove

1. **Integrity**: tenant/scope isolation and consistency checks pass.
2. **Availability**: health checks pass and service is stable.
3. **Performance**: recall/write latency and error-rate stay within your SLO baseline.
4. **Policy reliability**: rule and tool-decision traces are replayable.
5. **Operational evidence**: release artifacts are captured and reviewable.

## Standard Execution

Run from repo root against the target environment:

```bash
npm run -s gate:core:prod -- \
  --base-url "https://api.your-domain.com" \
  --scope default
```

If your release process uses stricter thresholds, pass them as explicit CLI flags in your environment profile.

## Pass/Fail Interpretation

1. **Pass**: no blocking checks failed.
2. **Pass with warnings**: non-blocking checks drifted; release can proceed only if risk owner approves.
3. **Fail**: at least one blocking check failed; release must stop.

## Required Evidence Per Run

Store and attach these to your release record:

1. Gate summary JSON.
2. Health and consistency outputs.
3. Performance output (latency/error snapshot).
4. Decision/replay sample evidence for one real workflow.

## If the Gate Fails

1. Stop rollout immediately.
2. Fix the failing dimension (integrity, performance, or policy reliability).
3. Re-run the gate from the same target environment.
4. Release only after a clean pass.

## Recommended Cadence

1. Run in staging before every production release.
2. Run in production after every high-impact config or policy change.
3. Run at least once daily for active production clusters.

## Related

1. [Production Go-Live Gate](/public/en/operations/04-prod-go-live-gate)
2. [Operator Runbook](/public/en/operations/02-operator-runbook)
3. [Operate and Production](/public/en/operate-production/00-operate-production)
