---
title: "Planner Context"
---

# Planner Context

Planner context is the normalized runtime input used by Aionis policy and tool-selection routes.

## Used By

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/planning/context`
4. `POST /v1/memory/context/assemble`

## Core Fields

| Field | Purpose |
| --- | --- |
| `version` | contract version for context shape |
| `run.id` | execution correlation key |
| `intent` | high-level user/job intent |
| `agent.id` | acting agent identifier |
| `agent.team_id` | optional team boundary |
| `tool.name` | current or candidate tool |
| `request.endpoint` | route-level request context |

## Design Rules

1. Keep field names stable across services and SDKs.
2. Prefer normalized identifiers over free-form prompt text.
3. Use the same context object for both rule evaluation and tool selection.
4. Include `run.id` in every policy decision flow.

## Minimal Example

```json
{
  "version": 1,
  "run": { "id": "run_001" },
  "intent": "support_triage",
  "agent": { "id": "agent_a", "team_id": "team_default" },
  "tool": { "name": "ticket_router" },
  "request": { "endpoint": "/chat/reply", "method": "POST" }
}
```

## Validation Checklist

1. Required fields are present and typed consistently.
2. The same payload works for `rules/evaluate` and `tools/select`.
3. `run.id` is persisted in application telemetry.

## Related

1. [Control and Policy](/public/en/control/01-control-policy)
2. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)
3. [API Contract](/public/en/api/01-api-contract)
