---
title: "API Contract"
---

# API Contract

This page defines the public API contract for integrating Aionis in production.

## Contract Principles

1. Stable DTOs: responses are explicit and typed.
2. Safe defaults: embeddings are not returned in normal recall payloads.
3. Bounded responses: context and debug channels are size-limited.
4. Replayability: request/run/decision/commit identifiers are first-class.

## Isolation and Identity

1. Isolation key is `(tenant_id, scope)`.
2. `tenant_id` can be set in request body or `X-Tenant-Id` header.
3. Authentication modes:
- API key (`X-Api-Key`)
- JWT bearer (`Authorization: Bearer <token>`)
- API key or JWT (either valid credential is accepted)
4. Private-lane visibility requires owner identity match.

## Endpoint Groups

### Memory

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`
4. `POST /v1/memory/context/assemble`
5. `POST /v1/memory/find`
6. `POST /v1/memory/resolve`

### Session/Event

1. `POST /v1/memory/sessions`
2. `POST /v1/memory/events`
3. `GET /v1/memory/sessions/:session_id/events`

### Sandbox (Experimental)

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/artifact`
6. `POST /v1/memory/sandbox/runs/cancel`

### Policy Loop

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`

## Core Response Fields

Common fields you should persist in clients and logs:

1. `request_id`
2. `tenant_id`
3. `scope`
4. `run_id` (policy/decision flows)
5. `decision_id` / `decision_uri` (when decision surfaces are involved)
6. `commit_id` / `commit_uri` (for write lineage)

## Write Contract Guardrails

1. `input_text` does not create memory nodes by itself.
2. Recallable writes must include `nodes` (for example, an `event` node).
3. `/v1/memory/write` may return:
   - `warnings: [{ code: "write_no_nodes", ... }]` when commit is created with `nodes=0`.
4. Optional strict mode:
   - `MEMORY_WRITE_REQUIRE_NODES=true` returns `400 write_nodes_required` for empty `nodes`.

## Error Model

Typed error payload shape:

```json
{
  "error": "string_code",
  "message": "human_readable_message",
  "details": {}
}
```

Typical classes:

1. `invalid_request` (400)
2. `unauthorized` / `forbidden` (401/403)
3. `not_found` (404)
4. `rate_limited_*` (429)
5. `backend_capability_unsupported` (501)

## Capability Fallback Contract

Some features are capability-gated by backend/runtime.

When unsupported, APIs return typed fallback details including:

1. `capability`
2. `failure_mode`
3. `degraded_mode`
4. `fallback_applied`

This allows clients to degrade behavior predictably instead of parsing ad-hoc errors.

## Rate Limits and Quotas

When tenant quotas are enabled:

1. Recall and write-like endpoints are rate-limited separately.
2. Debug embedding channel has independent limits.
3. Limit violations return `429` with `retry-after` header.

## Context Assembly Contract

`POST /v1/memory/context/assemble` is the recommended path for planner-ready context.

Key controls:

1. enabled layers
2. total/per-layer budgets
3. per-layer item limits
4. merge trace visibility

## Minimal Integration Checklist

1. Run `write -> recall_text -> resolve` with your tenant/scope.
2. Validate auth mode and key/token wiring.
3. Verify private-lane visibility using owner-matched and non-owner requests.
4. Capture `request_id`, `decision_id`, `run_id`, and `commit_uri` in logs.
5. Add retry handling for `429` and transient `5xx`.

## Related

1. [API Reference](/public/en/api-reference/00-api-reference)
2. [SDK Guide](/public/en/reference/05-sdk)
3. [Planner Context](/public/en/reference/02-planner-context)
4. [Operate and Production](/public/en/operate-production/00-operate-production)
