---
title: "Planner Context"
---

# Planner Context

Planner context is the structured input shape used by policy and tool-selection endpoints.

## Used By

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/planning/context`
4. `POST /v1/memory/context/assemble`

## Recommended Fields

1. `version`
2. `run.id`
3. `intent`
4. `agent.id` and optional `agent.team_id`
5. `tool.name` (when tool reasoning is involved)
6. `request` metadata (`endpoint`, `method`)
7. optional tags and content-type hints

## Design Guidelines

1. Keep keys stable across runtimes and SDKs.
2. Avoid high-entropy prompt blobs as rule predicates.
3. Use canonical identity fields for lane visibility checks.
4. Reuse the same context for rule evaluation and tool selection.

## Minimal Example

```json
{
  "version": 1,
  "run": { "id": "run_001" },
  "intent": "support_triage",
  "agent": { "id": "agent_a", "team_id": "team_default" },
  "tool": { "name": "ticket_router" }
}
```

## Related

1. [Control and Policy](/public/en/control/01-control-policy)
2. [API Contract](/public/en/api/01-api-contract)
3. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)
