---
title: "Rule Lifecycle (DRAFT -> SHADOW -> ACTIVE)"
---

# Rule Lifecycle (DRAFT -> SHADOW -> ACTIVE)

This repo stores rule state in `memory_rule_defs.state`.

## Recommended Promotion Policy (MVP)

- DRAFT -> SHADOW:
  - at least N=3 positive feedback events across distinct `run_id`s
  - and `negative_count` = 0
- SHADOW -> ACTIVE:
  - at least N=10 positives
  - and negatives/positives ratio < 0.1
- Any -> DISABLED:
  - explicit user disable
  - or a high-severity negative signal

The exact thresholds should be configurable (environment or DB table later).

## Offline Helper: Promotion Suggestions

This repo includes a read-only job that scans SHADOW rules and lists those that meet the configured thresholds:

```bash
npm run job:rule-promotion-suggest
```

It does **not** mutate rule state. To promote, call `POST /v1/memory/rules/state`.

## Feedback Capture

Write a `memory_rule_feedback` row when:

- a rule suggestion was used and the run succeeded (positive)
- a rule suggestion caused a failure/rollback (negative)
- ambiguous outcome (neutral)

For strict auditability, each feedback should be tied to a `memory_commit`.

## Execution Injection

Rules become "execution-relevant" when they are in `SHADOW` or `ACTIVE`.

- Use `POST /v1/memory/rules/evaluate` to match rules against a planner/tool-selector `context` object.
- Only `then_json` from matched rules should be injected into your execution system.
- `then_json` is intentionally constrained to a minimal, strict policy patch schema (see `docs/API_CONTRACT.md`) so it remains stable and safe to apply automatically.
- If a rule node is `memory_lane=private`, it must have an explicit owner (`owner_agent_id` or `owner_team_id`) before it can be promoted into `SHADOW`/`ACTIVE`.
