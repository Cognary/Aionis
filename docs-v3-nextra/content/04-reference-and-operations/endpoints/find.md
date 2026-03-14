---
title: "POST /v1/memory/find"
description: "Reference for deterministically locating persisted Aionis memory objects by URI, id, client id, type, and other explicit filters."
---

# POST /v1/memory/find

## What It Does

Finds persisted memory objects with deterministic filters such as `uri`, `id`, `client_id`, `type`, `title_contains`, `text_contains`, and `slots_contains`.

Use it when you want to browse or recover known memory objects without semantic recall.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. one or more filters such as `uri`, `type`, `client_id`, or `text_contains`
4. `include_slots` or `include_slots_preview`
5. `limit`
6. `offset`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/find.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope to browse. |
| `uri` | no | Filters by one exact Aionis URI. |
| `type` | no | Filters by node type such as `event` or `rule`. |
| `client_id` | no | Filters by caller-supplied client id. |
| `text_contains` | no | Performs deterministic text matching on summaries. |
| `include_slots` | no | Returns full `slots` payloads. |
| `include_slots_preview` | no | Returns a truncated preview of `slots` instead of the full object. |
| `limit` | no | Caps page size. |
| `offset` | no | Offsets into the deterministic result set. |

## Response Fields That Matter First

1. `nodes[].uri`
2. `nodes[].type`
3. `nodes[].slots_preview`
4. `find_summary`
5. `page`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "tenant_id": "default",
  "scope": "docs_v2_verified",
  "mode": "find",
  "nodes": [
    {
      "uri": "aionis://default/docs_v2_verified/event/ebdf76de-3fd6-5264-812e-680b9fcf9b5d",
      "type": "event",
      "title": "rollout follow-up preference",
      "slots_preview": {
        "channel": "email",
        "owner": "docs-v2"
      }
    }
  ],
  "find_summary": {
    "summary_version": "find_summary_v1",
    "returned_nodes": 4,
    "has_more": false,
    "slots_mode": "preview",
    "filters_applied": ["text_contains"]
  },
  "page": {
    "limit": 10,
    "offset": 0,
    "returned": 4,
    "has_more": false
  }
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `mode` | Indicates this is the deterministic find surface. | Useful when logging mixed memory surfaces. |
| `filters` | Echo of normalized filters applied by the endpoint. | Helpful for debugging why results are sparse. |
| `nodes[]` | Matching node list. | This is the main browse payload. |
| `nodes[].uri` | Canonical URI for each matching node. | Use this with `resolve` and audit trails. |
| `find_summary` | Compact rollup of result counts and filters. | Start here for UI or operator summaries. |
| `page` | Pagination information. | Use this for deterministic paging in UIs and CLIs. |

## Important Contract Note

`find` is a deterministic browse surface, not an embedding recall surface.

If you already know the object URI, skip `find` and go straight to `resolve`.

## Common Errors

1. `invalid_aionis_uri_type_for_endpoint`
   Trigger: `find` received a URI with a non-node object type such as `commit` or `decision`.
2. `invalid_aionis_uri`
   Trigger: the URI is malformed, unsupported, or does not contain a UUID id.
3. `conflicting_filters`
   Trigger: explicit filters in the request conflict with the provided URI.
4. `invalid_tenant_id` or `invalid_scope`
   Trigger: request tenancy fields are empty or invalid.
5. `rate_limited_recall`, `tenant_rate_limited_recall`, or `recall_backpressure`
   Trigger: recall-side rate limit, quota, or inflight capacity is exhausted.
