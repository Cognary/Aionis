---
title: "Rule Conflict Report"
---

# Rule Conflict Report

Last updated: `2026-02-24`

## Purpose

Generate a deterministic conflict artifact for rule rollout review:

1. winner/loser outcomes per conflict path
2. stable fingerprint for reproducibility
3. baseline delta (`new/resolved/winner_changes/loser_deltas`)

## Command

```bash
npm run -s job:rule-conflict-report -- \
  --scope default \
  --tenant-id default \
  --contexts-file examples/planner_context.json \
  --rules-limit 50
```

Compare with previous rollout:

```bash
npm run -s job:rule-conflict-report -- \
  --scope default \
  --contexts-file examples/planner_context.json \
  --baseline artifacts/rule_conflicts/prev_run/summary.json \
  --max-winner-changes 0 \
  --strict
```

## Output

1. `summary.fingerprint_sha256`
2. `summary.delta.new_conflicts`
3. `summary.delta.resolved_conflicts`
4. `summary.delta.winner_changes`
5. `details.delta.winner_changes[]`
6. `details.delta.loser_deltas[]`

By default output path:

`artifacts/rule_conflicts/<run_id>/summary.json`
