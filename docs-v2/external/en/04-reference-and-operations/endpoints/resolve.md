---
title: "POST /v1/memory/resolve"
description: "Reference for resolving Aionis URIs into typed object payloads, including node, edge, commit, and decision objects."
---

# POST /v1/memory/resolve

## What It Does

Resolves one Aionis URI into a typed object payload.

The same endpoint can resolve:

1. node URIs
2. edge URIs
3. commit URIs
4. decision URIs

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `uri`
4. `include_meta`
5. `include_slots` or `include_slots_preview`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/resolve-event.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the scope expected by the URI lookup. |
| `uri` | yes | Canonical Aionis URI to resolve. |
| `include_meta` | no | Includes metadata such as timestamps, lane, and commit linkage. |
| `include_slots` | no | Returns the full `slots` object for node payloads. |
| `include_slots_preview` | no | Returns a truncated preview of `slots` instead of the full object. |
| `slots_preview_keys` | no | Caps how many slot keys are previewed. |

## Response Fields That Matter First

1. `type`
2. `node`, `edge`, `commit`, or `decision`
3. `resolve_summary.payload_kind`
4. `resolve_summary.related_uris`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "tenant_id": "default",
  "scope": "docs_v2_verified",
  "type": "event",
  "node": {
    "id": "ebdf76de-3fd6-5264-812e-680b9fcf9b5d",
    "uri": "aionis://default/docs_v2_verified/event/ebdf76de-3fd6-5264-812e-680b9fcf9b5d",
    "title": "rollout follow-up preference",
    "memory_lane": "shared",
    "embedding_status": "ready",
    "commit_uri": "aionis://default/docs_v2_verified/commit/d3bb90b9-d561-59d0-b4a1-4f080cd7951c"
  },
  "resolve_summary": {
    "summary_version": "resolve_summary_v1",
    "resolved_type": "event",
    "payload_kind": "node",
    "related_uri_count": 2
  }
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `type` | Object type resolved from the URI. | Tells you which payload branch to read next. |
| `node`, `edge`, `commit`, `decision` | Type-specific resolved payload. | Exactly one of these is the main object. |
| `resolve_summary` | Compact rollup of payload kind and related URIs. | Start here before reading the full object. |
| `resolve_summary.payload_kind` | High-level payload category. | Useful for generic clients. |
| `resolve_summary.related_uris` | Related URIs such as commit or linked objects. | Useful for drill-down flows. |

## Important Contract Note

`resolve` is the URI-first object lookup surface.

Use it after `find`, handoff recovery, or any persisted URI you keep in your own audit trail.

## Common Errors

1. `invalid_aionis_uri`
   Trigger: the URI is malformed, unsupported, or does not contain a UUID id.
2. `conflicting_filters`
   Trigger: `tenant_id` or `scope` in the request conflicts with the URI itself.
3. `node_not_found_in_scope_or_visibility`
   Trigger: a node URI exists nowhere visible in the current scope/visibility boundary.
4. `edge_not_found_in_scope`, `commit_not_found_in_scope`, or `decision_not_found_in_scope`
   Trigger: the requested object type is valid, but the referenced object does not exist in this scope.
