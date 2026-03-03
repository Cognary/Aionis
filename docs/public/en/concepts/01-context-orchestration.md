---
title: "Context Orchestration Deep Dive"
---

# Context Orchestration Deep Dive

This is the deep-dive companion to the primary page:

1. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)

## When to Use This Page

Use this page when you are tuning layer composition and budget strategy for production traffic.

## Deep-Dive Focus Areas

1. Layer interaction under fixed `char_budget_total`.
2. Per-layer max item strategy (`max_items_by_layer`).
3. Merge and drop behavior analysis (`include_merge_trace`).
4. Preset selection (`compact`, `balanced`, `policy-first`) by latency/cost profile.

## Advanced Tuning Sequence

1. Start with `balanced` and collect baseline latency + answer quality.
2. Reduce low-value layers first when latency/token cost is high.
3. Increase `rules` and `decisions` share for policy-heavy flows.
4. Keep `citations` enabled for replay and operator inspection paths.

## Example (Policy-Heavy Route)

```json
{
  "tenant_id": "default",
  "scope": "default",
  "query_text": "resolve escalation policy for enterprise support",
  "return_layered_context": true,
  "context_layers": {
    "enabled": ["facts", "rules", "decisions", "tools", "citations"],
    "char_budget_total": 1400,
    "max_items_by_layer": {
      "facts": 6,
      "rules": 8,
      "decisions": 6,
      "tools": 4,
      "citations": 8
    },
    "include_merge_trace": true
  }
}
```

## Related

1. [Planner Context](/public/en/reference/02-planner-context)
2. [Build Memory Workflows](/public/en/guides/01-build-memory)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
