# API Guide

Use this page as the integration contract source.

## What this page covers

1. Authentication and request conventions.
2. Isolation and identity boundaries.
3. The identifiers every client must persist.
4. Retry and error-handling behavior for production callers.

## Authentication

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`
3. `X-Admin-Token: <token>` for admin and control endpoints

## Base URL and headers

Use one consistent base URL per environment, for example:

1. Local: `http://localhost:3001`
2. Hosted: `https://api.your-domain.com`

Send:

1. `content-type: application/json`
2. one supported auth header
3. explicit `tenant_id` and `scope` in the JSON body

## Isolation model

1. Isolation boundary is `(tenant_id, scope)`.
2. Always send both fields explicitly.
3. Private-lane visibility requires owner identity match.

## Endpoint groups

1. Memory:
   `POST /v1/memory/write`,
   `POST /v1/memory/recall`,
   `POST /v1/memory/recall_text`,
   `POST /v1/memory/context/assemble`,
   `POST /v1/memory/find`,
   `POST /v1/memory/resolve`
2. Sessions and events:
   `POST /v1/memory/sessions`,
   `POST /v1/memory/events`,
   `GET /v1/memory/sessions/:session_id/events`
3. Policy:
   `POST /v1/memory/rules/evaluate`,
   `POST /v1/memory/tools/select`,
   `POST /v1/memory/tools/decision`,
   `POST /v1/memory/tools/run`,
   `POST /v1/memory/tools/feedback`
4. Replay:
   `POST /v1/memory/replay/*`
5. Sandbox (experimental):
   `POST /v1/memory/sandbox/*`

Detailed groups are listed in [API Reference](/api/).

## Identifiers to persist

1. `request_id`
2. `tenant_id`
3. `scope`
4. `run_id`
5. `decision_id` and `decision_uri`
6. `commit_id` and `commit_uri`

These are the minimum fields required to trace and replay a workflow later.

## Error model

```json
{
  "error": "string_code",
  "message": "human_readable_message",
  "details": {}
}
```

Common classes:

1. `invalid_request` (400)
2. `unauthorized` / `forbidden` (401/403)
3. `not_found` (404)
4. `rate_limited_*` (429)
5. `backend_capability_unsupported` (501)

## Retry behavior

1. Retry `429` and transient `5xx` with exponential backoff and jitter.
2. Do not hot-loop on `400`, `401`, `403`, or other validation and auth failures.
3. Treat write and decision endpoints as non-idempotent unless your client provides its own dedupe strategy.

## Production integration checklist

1. Verify `write -> recall_text -> resolve` on the target environment.
2. Validate both success and failure auth cases.
3. Capture provenance IDs in logs and telemetry.
4. Implement retry and backoff for `429` and transient `5xx`.
