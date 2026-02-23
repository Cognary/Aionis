---
title: "Rule Promotion Governance"
---

# Rule Promotion Governance

Last updated: `2026-02-24`

## Purpose

Provide deterministic, auditable promotion checks before state transitions:

1. `draft -> shadow`
2. `shadow -> active`

This is a read-only gate. It does not mutate rule state.

## Command

```bash
npm run -s job:rule-promotion-governance -- \
  --scope default \
  --rule-node-id <rule_uuid> \
  --target-state shadow
```

For strict CI behavior:

```bash
npm run -s job:rule-promotion-governance -- \
  --scope default \
  --rule-node-id <rule_uuid> \
  --target-state active \
  --strict
```

## Default Thresholds

`draft -> shadow`

1. `positive_count >= 3`
2. `negative_count <= 0`
3. `recent_distinct_runs >= 3` (window `168h`)

`shadow -> active`

1. `positive_count >= 10`
2. `recent_negative_ratio <= 0.1` (window `168h`)
3. `recent_distinct_runs >= 3`
4. `score(positive-negative) >= 9`

## Output

The report includes:

1. `checks[]` with pass/fail per governance condition
2. `summary.pass` and failed check names
3. `next_step.apply.payload` ready for `/v1/memory/rules/state`
4. `governance_hash` for audit traceability
