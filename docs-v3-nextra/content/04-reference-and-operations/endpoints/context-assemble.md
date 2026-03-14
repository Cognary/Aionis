---
title: "POST /v1/memory/context/assemble"
description: "Reference for assembling bounded execution context in Aionis, including layered output, compact summaries, and common failure modes."
---

# POST /v1/memory/context/assemble

## What It Does

Builds bounded execution context rather than planner-only context.

Use it when you want a ready-to-consume assembled context surface with layered output, rules, tools, and citations under explicit budgets.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `query_text`
4. `context`
5. `include_rules`
6. `tool_candidates`
7. `return_layered_context`
8. `context_layers`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/context-assemble.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope used for assembly. |
| `query_text` | yes | Query that drives retrieval and assembly. |
| `context` | yes | Runtime context shared with rules and tool routing. |
| `include_rules` | no | Includes rule-aware context assembly in the response. |
| `tool_candidates[]` | no | Candidate tools available to the assembly flow. |
| `return_layered_context` | no | Requests layered output in addition to compact summaries. |
| `context_layers` | no | Fine-tunes layer enablement and budgets. |

## Response Fields That Matter First

1. `assembly_summary.selected_tool`
2. `assembly_summary.decision_id`
3. `assembly_summary.include_rules`
4. `assembly_summary.context_est_tokens`
5. `layered_context`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "assembly_summary": {
    "summary_version": "assembly_summary_v1",
    "selected_tool": "bash",
    "decision_id": "351397e1-aa08-4e7e-8fe8-94ef4474d26f",
    "rules_considered": 0,
    "rules_matched": 0,
    "include_rules": true,
    "context_est_tokens": 35,
    "layered_output": true,
    "selected_memory_layers": ["L0"]
  }
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `assembly_summary` | Compact execution-context rollup. | Start here before parsing the larger payload. |
| `assembly_summary.selected_tool` | Tool selected during assembly. | Fast routing signal for execution. |
| `assembly_summary.decision_id` | Persisted decision id created by the assembly flow. | Useful for lifecycle lookup and feedback. |
| `assembly_summary.include_rules` | Whether rule-aware assembly was active. | Helps explain why the assembled payload looks the way it does. |
| `assembly_summary.context_est_tokens` | Estimated size of assembled context. | Useful for budget tuning. |
| `layered_context` | Layered execution-ready context payload. | Use this when your runtime consumes structured context. |

## Important Contract Note

This endpoint is better documented as an assembly surface with a compact summary, not as "recall with more JSON."

## Common Errors

1. `no_embedding_provider`
   Trigger: the deployment has no configured embedding provider for context assembly.
2. `upstream_embedding_rate_limited`, `upstream_embedding_unavailable`, or `upstream_embedding_bad_response`
   Trigger: the embedding provider is saturated, unavailable, or returned an unexpected response.
3. `recall_text_embed_queue_full` or `recall_text_embed_queue_timeout`
   Trigger: the local embed queue is saturated or timed out before query embedding completed.
4. `rate_limited_recall`, `rate_limited_recall_text_embed`, `tenant_rate_limited_recall`, or `tenant_rate_limited_recall_text_embed`
   Trigger: recall-side or embed-side rate limit/quota has been exceeded.
5. `recall_backpressure`
   Trigger: the server is currently too busy to admit more assembly work.
