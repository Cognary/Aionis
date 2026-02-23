---
title: "Planner Context (Recommended Shape)"
---

# Planner Context (Recommended Shape)

This document defines a **recommended, stable JSON shape** for the execution system (planner/tool selector) to send into:

- `POST /v1/memory/rules/evaluate`
- `POST /v1/memory/planning/context`

The endpoint currently accepts any JSON (`context: any`) for flexibility, but **standardizing early** prevents drift across SDKs/UIs/agents.

## Goals

- Keep rule matching deterministic and portable.
- Make rule conditions easy to write and review.
- Avoid leaking arbitrary caller internals into memory/rule systems.

## Recommended Context Shape

Top-level keys (recommended):

- `version: number` (start at `1`)
- `run: { id: string, mode?: string }`
- `request?: { endpoint?: string, method?: string }`
- `intent?: string` (e.g. `"json"`, `"tool"`, `"chat"`)
- `provider?: string` (e.g. `"openai"`, `"minimax"`)
- `model?: string` (e.g. `"minimax:embo-01"`)
- `agent?: { id?: string, team_id?: string, role?: string }`
- `tool?: { name?: string }` (e.g. `"psql"`, `"curl"`)
- `user?: { id?: string }`
- `scope?: string`
- `tags?: string[]`
- `input?: { content_type?: string, pii_redaction_enabled?: boolean }`
- `output?: { desired_format?: "json"|"text"|"markdown" }`

For multi-agent rollout:
- use `agent.id` / `agent.team_id` as the canonical source for rule scope matching
- pass the same ids to recall as `consumer_agent_id` / `consumer_team_id` for lane visibility

Example file:

- `examples/planner_context.json`

## Request Wrapper (Hard Contract)

`/v1/memory/rules/evaluate` expects the execution context under a `context` field:

```bash
curl -sS "localhost:${PORT:-3001}/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  --data-binary "$(jq -c '{scope: (.scope // null), context: ., include_shadow: true, limit: 50} | if .scope == null then del(.scope) else . end' examples/planner_context.json)"
```

Or run the example script:

```bash
bash examples/rules_evaluate.sh | jq '.applied'
```

## One-Call Planner Injection (Recall + Rules)

If your planner already calls `POST /v1/memory/recall_text`, you can avoid a second network call by sending the same
normalized context in `rules_context`. The response will include a `rules.applied.policy` patch.

```bash
bash examples/recall_text_with_rules.sh "memory graph" | jq '.rules.applied.policy'
```

## One-Call Planner Surface (Recall + Rules + Optional Tools)

If you want one endpoint for planner context assembly, call `POST /v1/memory/planning/context`.
It performs:

1. semantic recall from `query_text`
2. rule evaluation against the same `context`
3. optional tool selection when `tool_candidates` is provided

```bash
bash examples/planning_context.sh "memory graph" psql curl bash \
  | jq '{selected_tool:(.tools.selection.selected // null), rules_matched:.rules.matched, recall_nodes:(.recall.subgraph.nodes|length)}'
```

## Tool Selector (Rules + Candidates)

Use the same normalized context and pass a candidate tool list. The response includes `selection.selected` and `rules.applied.policy`.
For provenance, pass `run_id` and persist returned `decision.decision_id`.

```bash
bash examples/tools_select.sh psql curl bash | jq '{selected:.selection.selected, ordered:.selection.ordered, policy:.rules.applied.policy.tool}'
```

If you want a more permissive mode (useful in early rollout), set `strict=false`. If the allowlist is too strict and filters out
all tools, the selector will fall back to deny-only and explain via `selection.fallback`.

## Agent Visibility Telemetry (Recommended)

Both endpoints return lane visibility diagnostics:

- `/v1/memory/rules/evaluate` -> `.agent_visibility_summary`
- `/v1/memory/tools/select` -> `.rules.agent_visibility_summary`

Consume `lane.reason` as an enum for observability buckets:

- `missing_agent_context`
- `enforced_agent_only`
- `enforced_team_only`
- `enforced_agent_team`

Recommended metrics/log fields:

- `lane.applied` (boolean)
- `lane.reason` (enum)
- `rule_scope.filtered_by_lane` (count)
- `lane.legacy_unowned_private_detected` (count)

Minimal alerting guidance:

- non-prod: warn when `lane.reason=missing_agent_context` unexpectedly spikes
- prod: alert if `lane.legacy_unowned_private_detected > 0` (indicates legacy data regression)

## Tool Feedback Loop

After a run, send an explicit outcome to update rule verification stats. This is the mechanism that makes rule ordering improve over time.
When available, pass `decision_id` from `/v1/memory/tools/select` for exact linkage.

```bash
OUTCOME=positive RUN_ID=run_0001 bash examples/tools_feedback.sh psql curl bash | jq
```

To attribute feedback to SHADOW rules as well (for promotion workflows), set `INCLUDE_SHADOW=true`:

```bash
OUTCOME=positive RUN_ID=run_0002 INCLUDE_SHADOW=true bash examples/tools_feedback.sh psql curl bash | jq
```

## Rule Authoring Tips

Use small, explicit keys in `if_json` and prefer dot-path access for nested keys:

- `"intent": "json"`
- `"provider": "minimax"`
- `"tool.name": "psql"`
- `"output.desired_format": { "$in": ["json", "markdown"] }`

Avoid matching on high-entropy data (full prompts, large payloads). Put those into logs/traces, not rule predicates.
