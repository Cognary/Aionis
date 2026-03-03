---
title: "Rule Conflict Report"
---

# Rule Conflict Report

Rule Conflict Report produces deterministic artifacts for rollout review when multiple rules compete.

## What It Reports

1. conflict winner/loser outcomes
2. stable conflict fingerprint hash
3. delta vs previous baseline (`new`, `resolved`, `winner_changes`)

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

## Output

1. `summary.fingerprint_sha256`
2. `summary.delta.new_conflicts`
3. `summary.delta.resolved_conflicts`
4. `summary.delta.winner_changes`
5. detailed change lists for review

Default artifact location:

`artifacts/rule_conflicts/<run_id>/summary.json`

## Related

1. [Rule Promotion Governance](/public/en/reference/03-rule-promotion-governance)
2. [Execution Loop Gate](/public/en/control/03-execution-loop-gate)
