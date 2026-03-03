---
title: "Rule Promotion Governance"
---

# Rule Promotion Governance

Use this report before moving a rule to a stronger lifecycle state.

## Promotion Targets

1. `draft -> shadow`
2. `shadow -> active`

## What It Evaluates

1. Positive and negative outcome balance.
2. Coverage across distinct runs.
3. Confidence and risk indicators.
4. Stable transition fingerprint for release evidence.

## Run

```bash
npm run -s job:rule-promotion-governance -- \
  --scope default \
  --rule-node-id <rule_uuid> \
  --target-state active
```

Strict mode:

```bash
npm run -s job:rule-promotion-governance -- \
  --scope default \
  --rule-node-id <rule_uuid> \
  --target-state active \
  --strict
```

## Output You Should Record

1. Overall pass/fail status.
2. Failed checks and threshold details.
3. Suggested next-state payload.
4. Governance fingerprint hash.

## Promotion Rule

1. Promote only when strict checks pass.
2. If checks fail, keep current state and gather more signal.
3. Re-run after additional traffic evidence.

## Related

1. [Rule Lifecycle](/public/en/control/02-rule-lifecycle)
2. [Rule Conflict Report](/public/en/reference/04-rule-conflict-report)
3. [Policy Adaptation Gate](/public/en/control/04-policy-adaptation-gate)
