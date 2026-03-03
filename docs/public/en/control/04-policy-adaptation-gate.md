---
title: "Policy Adaptation Gate"
---

# Policy Adaptation Gate

Policy Adaptation Gate evaluates whether rule lifecycle changes are safe to apply.

## Scope

1. Promotion candidates (`draft -> shadow`)
2. Promotion candidates (`shadow -> active`)
3. Disable candidates (`active -> disabled`)
4. Canary and rollback recommendation payloads

This gate is read-only and does not mutate rule state.

## Run

```bash
npm run -s job:policy-adaptation-gate -- --scope default
```

Strict mode:

```bash
npm run -s job:policy-adaptation-gate -- --scope default --strict-warnings
```

## Output

1. Candidate lists by transition type
2. Confidence and risk indicators
3. Structured apply/rollback suggestions
4. Gate checks with pass/warn/fail status

## Recommended Usage

1. Run before rule lifecycle transitions.
2. Require strict pass for production promotion windows.
3. Keep report artifacts with release records.

## Related

1. [Rule Lifecycle](/public/en/control/02-rule-lifecycle)
2. [Rule Promotion Governance](/public/en/reference/03-rule-promotion-governance)
3. [Execution Loop Gate](/public/en/control/03-execution-loop-gate)
