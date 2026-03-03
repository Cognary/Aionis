---
title: "Context Orchestration"
---

# Context Orchestration

`POST /v1/memory/context/assemble` builds deterministic, layered, planner-ready context.

## Layer Model

1. `facts`
2. `episodes`
3. `rules`
4. `decisions`
5. `tools`
6. `citations`

## Control Surface

1. `context_layers.enabled`
2. `context_layers.char_budget_total`
3. `context_layers.char_budget_by_layer`
4. `context_layers.max_items_by_layer`
5. `context_layers.include_merge_trace`

## Presets

1. Compact: minimal token footprint.
2. Balanced: default production profile.
3. Policy-first: emphasize rules/decisions/tools in final context.

## Why It Matters

1. Predictable context size for latency and cost control.
2. Clear policy-layer visibility for governed execution.
3. Replay-friendly output using explicit layer traces.

## Example Request

```json
{
  "tenant_id": "default",
  "scope": "default",
  "query_text": "Assemble context before tool selection",
  "return_layered_context": true,
  "context_layers": {
    "enabled": ["facts", "episodes", "rules", "tools", "citations"],
    "char_budget_total": 1800,
    "max_items_by_layer": {
      "facts": 8,
      "episodes": 4,
      "rules": 6,
      "tools": 4,
      "citations": 8
    },
    "include_merge_trace": true
  }
}
```

## Related

1. [Context Orchestration Overview](/public/en/context-orchestration/00-context-orchestration)
2. [Planner Context](/public/en/reference/02-planner-context)
3. [Playground](/public/en/guides/02-playground)
4. [API Contract](/public/en/api/01-api-contract)
