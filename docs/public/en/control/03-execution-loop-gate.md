---
title: "Execution Loop Gate"
---

# Execution Loop Gate

Execution Loop Gate verifies whether policy-loop data quality is sufficient for production decisions.

## What It Checks

1. Feedback signal volume and run coverage
2. Decision linkage coverage
3. Active-rule freshness
4. Negative-outcome ratio stability
5. Tenant-level governance drift indicators

## Run

```bash
npm run -s job:execution-loop-gate -- --scope default
```

Strict mode:

```bash
npm run -s job:execution-loop-gate -- --scope default --strict-warnings
```

## Result Interpretation

1. `pass`: policy loop is healthy under configured thresholds.
2. `warning`: signal quality or drift requires review.
3. `fail`: blocking conditions should be fixed before rollout.

## Recommended Operator Action

1. Investigate low decision-link coverage first.
2. Investigate spikes in negative ratios next.
3. Re-run gate after mitigations before release approval.

## Related

1. [Policy Adaptation Gate](/public/en/control/04-policy-adaptation-gate)
2. [Governance Weekly Report](/public/en/benchmarks/04-governance-weekly-report)
3. [Production Core Gate](/public/en/operations/03-production-core-gate)
