---
title: "POST /v1/memory/recall_text"
description: "Reference for recalling Aionis memory by text query and returning bounded execution context for the next step."
---

# POST /v1/memory/recall_text

## What It Does

Recalls memory by text query and returns a bounded context surface.

This is the fastest endpoint for proving that a prior write can be turned back into useful execution context.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `query_text`
4. `limit`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/recall-text.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope to search. |
| `query_text` | yes | Text query that will be embedded and used for recall. |
| `limit` | no | Caps the first-stage ranked recall set. |
| `consumer_agent_id` | no | Narrows visibility for private/shared memory in agent-specific contexts. |
| `consumer_team_id` | no | Narrows visibility for team-scoped access. |
| `context_token_budget` | no | Caps the assembled context by token budget when enabled. |
| `context_char_budget` | no | Caps the assembled context by character budget when enabled. |

## Response Fields That Matter First

1. `context.text`
2. `context.items`
3. `context.citations`
4. `context.selection_policy`
5. `context.selection_stats`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "context": {
    "text": "# Supporting Events / Evidence\n- Customer prefers email follow-up and wants a safe rollout plan. (node:7eeb0a04-2cc5-5c31-8708-1106dd442770)"
  },
  "ranked_count": 1,
  "node_count": 0
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `context.text` | Human-readable assembled context block. | This is the fastest way to prove recall is useful. |
| `context.items` | Structured recalled items. | Use this when your client wants more than plain text context. |
| `context.citations` | Source references for assembled context. | Important for auditability and UI citation rendering. |
| `context.selection_policy` | Selection policy used to assemble context. | Useful when tuning recall behavior. |
| `context.selection_stats` | Compact recall statistics. | Useful for debugging over- or under-recall. |
| `ranked_count` | Count of ranked candidates before final assembly. | Helps explain why context is sparse or dense. |
| `node_count` | Number of nodes returned in the node payload. | Good sanity check for UI or downstream consumers. |

## Important Contract Note

`recall_text` is best understood as returning context, not a raw node dump.

## Common Errors

1. `no_embedding_provider`
   Trigger: the deployment has no configured embedding provider for text-query recall.
2. `upstream_embedding_rate_limited`, `upstream_embedding_unavailable`, or `upstream_embedding_bad_response`
   Trigger: the embedding provider is saturated, unavailable, or returned an unexpected response.
3. `recall_text_embed_queue_full` or `recall_text_embed_queue_timeout`
   Trigger: the local embed queue is saturated or timed out before execution.
4. `rate_limited_recall`, `rate_limited_recall_text_embed`, `tenant_rate_limited_recall`, or `tenant_rate_limited_recall_text_embed`
   Trigger: recall-side or embed-side rate limit/quota has been exceeded.
5. `recall_backpressure`
   Trigger: the server is currently too busy to admit more recall work.
