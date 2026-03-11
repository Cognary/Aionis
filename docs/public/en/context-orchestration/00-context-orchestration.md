---
title: "Context Orchestration"
---

# Context Orchestration

Context orchestration assembles deterministic, planner-ready context with explicit layer and budget controls.

## Layer Model

| Layer | Purpose |
| --- | --- |
| `facts` | stable factual snippets |
| `episodes` | recent or scenario-relevant events |
| `rules` | policy constraints and decision hints |
| `static` | selected bootstrap/config/instruction blocks |
| `decisions` | prior execution provenance |
| `tools` | tool-level routing context |
| `citations` | trace references for explainability |

## Control Surface

1. Enable or disable layers.
2. Set total budget (`char_budget_total`).
3. Set per-layer budgets (`char_budget_by_layer`).
4. Set per-layer item caps (`max_items_by_layer`).
5. Include merge/drop traces (`include_merge_trace`).
6. Use `static_context_blocks` + `static_injection` to select only the relevant static bootstrap/config blocks.
7. Use `context_layers.forgetting_policy` to keep cold or archived memory out of the injected prompt by default.

## Presets

| Preset | Best for | Tradeoff |
| --- | --- | --- |
| Compact | low-latency paths | lower context depth |
| Balanced | default production usage | balanced cost/quality |
| Policy-first | strict routing control | less narrative context |

## Example Request

```json
{
  "tenant_id": "default",
  "scope": "default",
  "query_text": "Assemble context before tool selection",
  "return_layered_context": true,
  "tool_candidates": ["kubectl", "bash"],
  "context_layers": {
    "enabled": ["facts", "episodes", "rules", "static", "tools", "citations"],
    "char_budget_total": 1800,
    "max_items_by_layer": {
      "facts": 8,
      "episodes": 4,
      "rules": 6,
      "static": 3,
      "tools": 4,
      "citations": 8
    },
    "include_merge_trace": true,
    "forgetting_policy": {
      "allowed_tiers": ["hot", "warm"],
      "exclude_archived": true
    }
  },
  "static_context_blocks": [
    {
      "id": "deploy_bootstrap",
      "title": "Deploy Bootstrap",
      "content": "Require approval before prod deploy and collect rollback refs.",
      "intents": ["deploy"],
      "tools": ["kubectl"],
      "priority": 70
    }
  ],
  "static_injection": {
    "max_blocks": 2,
    "min_score": 50
  }
}
```

## What to Monitor

1. Context size stability under load.
2. Layer drop rates when budgets are tight.
3. Policy-layer coverage in critical flows.
4. End-to-end latency by preset.
5. Static block selection hit rate and false-positive rate.

## Start Here

1. Start with `Balanced` in staging.
2. Measure latency and response quality.
3. Tune per-layer budgets for your workload.

## Next Steps

1. [Planner Context](/public/en/reference/02-planner-context)
2. [Build Memory Workflows](/public/en/guides/01-build-memory)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
