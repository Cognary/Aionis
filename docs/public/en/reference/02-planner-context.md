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
5. `POST /v1/memory/tools/run` (via `run_id` lifecycle lookup)

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
5. Keep `run.id` stable from `tools/select` to `tools/feedback` and `tools/run`.
6. If you use `static_context_blocks`, keep `intent`, `agent`, `tool`, and request metadata normalized so static block selection can match on stable signals instead of free-form prompt text.
7. If you use `context_optimization_profile`, keep `intent`, `tool`, and request metadata stable so Aionis can apply deterministic forgetting and static-injection presets instead of falling back to broader context assembly.
8. If you evaluate workload-aware recall policy, use `recall_class_aware=true|false` on `planning/context` or `context/assemble` to compare selector behavior against the static default without changing server-wide config.

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
