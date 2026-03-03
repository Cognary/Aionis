---
title: "Context Orchestration"
---

# Context Orchestration

Context orchestration is the Aionis mechanism for assembling deterministic, planner-ready context.

It separates context into typed layers and enforces explicit budgets.

## Layer Model

| Layer | Purpose |
| --- | --- |
| `facts` | stable factual memory snippets |
| `episodes` | recent or scenario-relevant events |
| `rules` | policy constraints and decision hints |
| `decisions` | prior execution decision provenance |
| `tools` | tool-level context for routing |
| `citations` | trace references for explainability |

## Control Surface

1. Enable/disable layers.
2. Set total budget (`char_budget_total`).
3. Set per-layer budgets (`char_budget_by_layer`).
4. Set per-layer item caps (`max_items_by_layer`).
5. Return merge/drop traces (`include_merge_trace`).

## Presets

| Preset | Best for | Tradeoff |
| --- | --- | --- |
| Compact | low-latency workloads | less depth |
| Balanced | default production usage | balanced cost/quality |
| Policy-first | strict tool/policy control | may reduce narrative context |

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

## What to Monitor

1. Context size stability under load.
2. Layer drop rates when budgets are tight.
3. Policy layer coverage (`rules` / `decisions`) in critical flows.
4. End-to-end latency impact by preset.

## Rollout Path

1. Start with `Balanced` in staging.
2. Measure latency and answer quality.
3. Tune per-layer budgets for your domain.
4. Promote tuned profile to production with gate validation.

## Related

1. [Context Orchestration Deep Dive](/public/en/concepts/01-context-orchestration)
2. [Planner Context](/public/en/reference/02-planner-context)
3. [Build Memory](/public/en/guides/01-build-memory)
4. [API Contract](/public/en/api/01-api-contract)
