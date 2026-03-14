---
title: "Common Errors"
description: "Understand the shared Aionis failure model across request validation, lookup misses, backpressure, and edition boundaries."
---

# Common Errors

This page defines the error contract shape that external Aionis integrations should expect first.

It focuses on the errors already grounded in current route behavior, shared guards, and endpoint implementations.

## Error Envelope

Most Aionis API failures land in one of three response shapes.

### Zod validation failures

Request-shape failures return `400` with an `invalid_request` error and an `issues` array.

```json
{
  "error": "invalid_request",
  "issues": [
    {
      "path": "run_id",
      "message": "Required"
    }
  ]
}
```

### Typed application failures

Typed route and domain failures return:

1. `error`
2. `message`
3. optional `details`

```json
{
  "error": "rule_not_found_in_scope",
  "message": "rule_node_id was not found in this scope",
  "details": {
    "rule_node_id": "...",
    "scope": "docs_v2_verified",
    "tenant_id": "default"
  }
}
```

### Unhandled failures

Unexpected failures fall back to:

```json
{
  "error": "internal_error",
  "message": "internal error"
}
```

## Cross-Endpoint Error Families

### `400` request and contract failures

These are the most common client-side failures across the verified endpoint tree:

1. `invalid_request`
   Trigger: schema validation failed before endpoint logic ran.
2. `invalid_tenant_id`
   Trigger: `tenant_id` is empty or does not match the accepted pattern.
3. `invalid_scope`
   Trigger: `scope` is empty or uses a reserved prefix.
4. `invalid_aionis_uri`
   Trigger: URI is malformed, uses an unsupported object type, or the id is not a UUID.
5. `conflicting_filters`
   Trigger: request filters conflict with the provided URI.

### `404` scope and object lookup failures

These mean the request was structurally valid, but the requested object or run was not found in the current `(tenant_id, scope)` boundary.

Examples already present in current implementations:

1. `rule_not_found_in_scope`
2. `decision_not_found_in_scope`
3. `run_not_found_in_scope`
4. `node_not_found_in_scope_or_visibility`
5. `replay_playbook_not_found`
6. `replay_playbook_version_not_found`

### `409` state conflicts

These are state-machine failures rather than malformed requests.

Examples:

1. `replay_repair_not_pending_review`
2. `sandbox_session_expired`

### `429` rate limit and quota failures

Current request guards already emit typed `429` errors and set `retry-after` headers.

Examples:

1. `rate_limited_write`
2. `rate_limited_recall`
3. `rate_limited_recall_text_embed`
4. `tenant_rate_limited_write`
5. `tenant_rate_limited_recall`
6. `tenant_rate_limited_recall_text_embed`
7. `write_backpressure`
8. `recall_backpressure`

For external clients, the safe default is:

1. read the `retry-after` header if present
2. retry idempotent reads with backoff
3. avoid blind retries on write paths unless your client already deduplicates

### `501` edition and capability boundaries

These are deliberate product boundaries, not malformed requests.

Examples:

1. `server_only_in_lite`
2. `replay_read_not_supported_in_embedded`

## Endpoint Families To Expect

### Memory write and state-management surfaces

These commonly fail with:

1. `cross_scope_node_not_allowed`
2. `cross_scope_edge_not_allowed`
3. `duplicate_client_id_in_batch`
4. `duplicate_node_id_in_batch`
5. `invalid_private_rule_owner`
6. `invalid_rule_if_json`
7. `invalid_rule_exceptions_json`
8. `invalid_rule_then_json`
9. `invalid_rule_scope_target`

### URI-driven lookup surfaces

`find` and `resolve` commonly fail with:

1. `invalid_aionis_uri`
2. `invalid_aionis_uri_type_for_endpoint`
3. `conflicting_filters`
4. `node_not_found_in_scope_or_visibility`
5. `edge_not_found_in_scope`
6. `commit_not_found_in_scope`
7. `decision_not_found_in_scope`

### Policy loop audit surfaces

`tools/decision`, `tools/run`, and `tools/feedback` commonly fail with:

1. `invalid_decision_uri_type`
2. `decision_uri_scope_mismatch`
3. `decision_uri_id_mismatch`
4. `decision_not_found_in_scope`
5. `decision_selected_tool_mismatch`
6. `decision_candidates_mismatch`
7. `decision_run_id_mismatch`
8. `run_not_found_in_scope`

### Replay governed execution surfaces

`replay/playbooks/run` and `replay/playbooks/dispatch` commonly fail with:

1. `replay_playbook_not_found`
2. `replay_playbook_version_not_found`
3. `replay_strict_async_not_supported`
4. `replay_executor_not_enabled`
5. `replay_sandbox_executor_not_enabled`
6. `replay_local_exec_consent_required`
7. `replay_allowed_commands_empty`
8. `replay_guided_repair_strategy_not_allowed`

## Practical Reading Rule

When documenting or integrating an endpoint:

1. treat `400` as request-shape or contract misuse
2. treat `404` as scope/object lookup failure
3. treat `409` as state conflict
4. treat `429` as retry-with-backoff
5. treat `501` as an edition or capability boundary, not a transient failure

## Grounding

1. `src/util/http.ts`
2. `src/host/http-host.ts`
3. `src/app/request-guards.ts`
4. `src/host/lite-edition.ts`
5. `src/memory/tenant.ts`
6. `src/memory/uri.ts`
