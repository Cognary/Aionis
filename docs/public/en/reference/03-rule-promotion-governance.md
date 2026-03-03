---
title: "Rule Promotion Governance"
---

# Rule Promotion Governance

Rule Promotion Governance validates promotion readiness before a state transition is applied.

## Target Transitions

1. `draft -> shadow`
2. `shadow -> active`

## Governance Signals

1. positive/negative outcome balance
2. distinct run coverage
3. risk score and confidence
4. deterministic transition hash for audit

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

## Output

1. Check list with pass/fail status
2. `summary.pass` and failed checks
3. structured next-step payload for state transition API
4. governance hash for traceability

## Related

1. [Rule Lifecycle](/public/en/control/02-rule-lifecycle)
2. [Rule Conflict Report](/public/en/reference/04-rule-conflict-report)
3. [Policy Adaptation Gate](/public/en/control/04-policy-adaptation-gate)
