---
title: "Rule Conflict Report"
---

# Rule Conflict Report

Use this report to review competing rule outcomes before rollout.

## What It Reports

1. Winner/loser outcomes for conflicting rules.
2. Deterministic fingerprint of conflict state.
3. Delta versus prior baseline (`new`, `resolved`, `winner_changes`).

## Run

```bash
npm run -s job:rule-conflict-report -- \
  --scope default \
  --tenant-id default \
  --contexts-file examples/planner_context.json
```

With baseline comparison:

```bash
npm run -s job:rule-conflict-report -- \
  --scope default \
  --contexts-file examples/planner_context.json \
  --baseline artifacts/rule_conflicts/prev_run/summary.json \
  --strict
```

## Output You Should Record

1. `summary.fingerprint_sha256`
2. `summary.delta.new_conflicts`
3. `summary.delta.resolved_conflicts`
4. `summary.delta.winner_changes`

Default artifact path:

`artifacts/rule_conflicts/<run_id>/summary.json`

## Rollout Guidance

1. Treat large `winner_changes` spikes as release risk.
2. Compare with last known-good baseline before promotion.
3. Pair review with Rule Promotion Governance output.

## Related

1. [Rule Promotion Governance](/public/en/reference/03-rule-promotion-governance)
2. [Execution Loop Gate](/public/en/control/03-execution-loop-gate)
