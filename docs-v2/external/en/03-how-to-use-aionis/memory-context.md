---
title: "Memory And Context Guide"
description: "Use Aionis memory and context APIs to write durable execution facts and assemble bounded context for the next step."
---

# Memory And Context

This is the first Aionis capability most teams should integrate.

If you cannot reliably write memory and recover bounded context later, the rest of the product story will feel abstract.

## What Is Live In Code Today

The core memory and context path is already implemented around these routes:

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`
4. `POST /v1/memory/planning/context`
5. `POST /v1/memory/context/assemble`

The actual runtime also supports:

1. write-time distillation
2. topic clustering
3. layered context assembly
4. memory-layer preference tightening
5. token and char budget controls for `context.text`

## Best First Integration

Do not start with the most configurable path.

Start with:

1. `write`
2. `recall_text`
3. `planning/context` only after the first two are stable

That sequence gets you to visible value quickly:

1. a prior fact becomes durable
2. a later request gets useful context back
3. then planning can become policy-aware and budget-aware

## Minimal Write Shape

At minimum, `write` needs:

1. `input_text` or `input_sha256`
2. at least one node if you want recallable memory

The practical minimal request is:

```json
{
  "tenant_id": "default",
  "scope": "default",
  "input_text": "Customer prefers email follow-up",
  "memory_lane": "shared",
  "nodes": [
    {
      "type": "event",
      "memory_lane": "shared",
      "text_summary": "Customer prefers email follow-up"
    }
  ]
}
```

Important behavior from the real write path:

1. `input_text` alone does not guarantee recallable memory
2. the server can warn when a write commits with `0` nodes
3. Lite can force topic clustering to async
4. Lite may complete embedding backfill inline and report that as a warning, not as a failure

## When To Use `recall` vs `recall_text`

Use `recall_text` when:

1. you want prompt-ready context quickly
2. you are validating basic usefulness
3. you do not need to inspect every returned object

Use `recall` when:

1. you need the structured graph response
2. you are debugging what was retrieved
3. you want deeper recall observability

## Planning And Assembly

`planning/context` is the higher-value step for agent runtimes.

Use it when you want one request to combine:

1. recall
2. rules evaluation
3. tool selection context
4. layered context output

`context/assemble` is better when you care more about context construction than planner workflow.

## Layered Context Is Real, Not Just Narrative

The current request model already supports:

1. `return_layered_context`
2. `context_layers`
3. `static_context_blocks`
4. `static_injection`
5. `context_optimization_profile`
6. `memory_layer_preference.allowed_layers`

That means Aionis is not only storing memory. It is already serving memory selectively and under budget.

## What Matters First

The first useful outcome is simple:

1. the next step sees the right context

The retrieval knobs matter later, once the continuity value is already clear.

## What To Read Next

1. [Handoff](./handoff.md)
2. [Policy](./policy.md)
3. [Replay](./replay.md)
