---
title: "POST /v1/memory/planning/context"
description: "Reference for building planner-facing context in Aionis, including compact planning summaries and budget-aware layered context."
---

# POST /v1/memory/planning/context

## What It Does

Builds planner-facing context and can also return compact planning metadata such as selected tool and estimated context size.

This is where Aionis starts to feel different from a retrieval-only memory layer.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `query_text`
4. `context`
5. `tool_candidates`
6. `return_layered_context`
7. `context_optimization_profile`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/planning-context.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope used for planning. |
| `query_text` | yes | Planner query that drives retrieval and context assembly. |
| `context` | yes | Runtime planner context shared with rules and tool routing. |
| `tool_candidates[]` | no | Candidate tools available to the planner. |
| `return_layered_context` | no | Requests layered output instead of only compact text context. |
| `context_optimization_profile` | no | Selects endpoint-level context optimization behavior. |

## Response Fields That Matter First

1. `planning_summary.selected_tool`
2. `planning_summary.decision_id`
3. `planning_summary.context_est_tokens`
4. `planning_summary.selected_memory_layers`
5. `layered_context`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "planning_summary": {
    "summary_version": "planning_summary_v1",
    "selected_tool": "bash",
    "decision_id": "c39551e7-bc44-4e4b-828f-543ae74d4c9f",
    "rules_considered": 0,
    "rules_matched": 0,
    "context_est_tokens": 35,
    "layered_output": true,
    "selected_memory_layers": ["L0"]
  }
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `planning_summary` | Compact planner rollup. | Start here before reading the full context tree. |
| `planning_summary.selected_tool` | Tool selected during planning. | Fastest routing signal. |
| `planning_summary.decision_id` | Persisted decision id from planning. | Useful for later lifecycle lookup. |
| `planning_summary.context_est_tokens` | Estimated size of planner context. | Useful for budget tuning. |
| `planning_summary.selected_memory_layers` | Memory layers that survived selection. | Useful when debugging compression behavior. |
| `layered_context` | Layered planner context payload. | Use this when your runtime consumes structured context. |

## Important Contract Note

This endpoint already gives you a summary-first planner surface. Do not force users to parse the whole context tree on day one.

## Common Errors

1. `no_embedding_provider`
   Trigger: the deployment has no configured embedding provider for planning context assembly.
2. `upstream_embedding_rate_limited`, `upstream_embedding_unavailable`, or `upstream_embedding_bad_response`
   Trigger: the embedding provider is saturated, unavailable, or returned an unexpected response.
3. `recall_text_embed_queue_full` or `recall_text_embed_queue_timeout`
   Trigger: the local embed queue is saturated or timed out before query embedding completed.
4. `rate_limited_recall`, `rate_limited_recall_text_embed`, `tenant_rate_limited_recall`, or `tenant_rate_limited_recall_text_embed`
   Trigger: recall-side or embed-side rate limit/quota has been exceeded.
5. `recall_backpressure`
   Trigger: the server is currently too busy to admit more planner-context work.
