---
title: "POST /v1/memory/write"
description: "Reference for creating durable Aionis memory commits, including the request fields, response fields, and common write failures."
---

# POST /v1/memory/write

## What It Does

Creates a durable commit and writes one or more memory nodes.

For external users, the key point is simple:

`input_text` alone is not the memory object. The recallable artifact comes from `nodes`.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `input_text`
4. `nodes`
5. `memory_lane`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/memory-write.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. Defaults to the server default tenant when omitted. |
| `scope` | no | Selects the working memory scope inside the tenant. |
| `input_text` | yes | Provides the write lineage text used for commit creation and downstream derivation. |
| `memory_lane` | no | Declares whether the write is `private` or `shared`. |
| `nodes[]` | no | Carries the actual memory objects that become recallable later. |
| `nodes[].type` | yes | Declares the node type such as `event`, `rule`, or `topic`. |
| `nodes[].text_summary` | no | Supplies the compact text most external integrations will later recall or inspect. |
| `nodes[].slots` | no | Stores structured metadata used by richer runtime flows. |

## Response Fields That Matter First

1. `commit_id`
2. `commit_uri`
3. `nodes`
4. `warnings`

## Verified Response Shape

On `2026-03-13`, Lite validation returned:

```json
{
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "commit_id": "ae565e28-df4d-5bc7-bfc3-119a88d3453b",
  "commit_uri": "aionis://default/docs_v2_verified/commit/ae565e28-df4d-5bc7-bfc3-119a88d3453b",
  "nodes": [
    {
      "id": "7eeb0a04-2cc5-5c31-8708-1106dd442770",
      "uri": "aionis://default/docs_v2_verified/event/7eeb0a04-2cc5-5c31-8708-1106dd442770",
      "type": "event"
    }
  ]
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `commit_id` | Durable commit identifier for this write. | Persist this if you need audit lineage. |
| `commit_uri` | URI form of the commit. | Useful when your integration prefers URI-addressable objects. |
| `commit_hash` | Stable hash of the commit contents. | Helpful for dedupe, audit, and debugging. |
| `nodes[]` | Persisted node ids and URIs created by the write. | This is the recallable memory artifact. |
| `edges[]` | Persisted edges created by the write. | Relevant when your integration writes graph structure explicitly. |
| `embedding_backfill` | Whether embedding work was queued or completed inline. | Useful for understanding recall readiness. |
| `warnings[]` | Non-fatal write warnings. | Read these before assuming the write was perfectly clean. |

## Important Contract Note

Do not document this endpoint as returning `request_id` in the JSON body as the main success signal.

For integration purposes, the durable lineage fields are `commit_id` and `commit_uri`.

## Common Errors

1. `invalid_tenant_id` or `invalid_scope`
   Trigger: request tenancy fields are empty or invalid.
2. `cross_scope_node_not_allowed` or `cross_scope_edge_not_allowed`
   Trigger: a write batch tries to override object scope outside the request scope.
3. `duplicate_client_id_in_batch` or `duplicate_node_id_in_batch`
   Trigger: the same logical object appears twice in one write batch.
4. `invalid_private_rule_owner`
   Trigger: a private rule node is written without an owner.
5. `rate_limited_write`, `tenant_rate_limited_write`, or `write_backpressure`
   Trigger: write-side rate limit, quota, or inflight capacity is exhausted.
