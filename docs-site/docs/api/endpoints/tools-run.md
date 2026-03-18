# POST /v1/memory/tools/run

> `POST /v1/memory/tools/run`

Reads the lifecycle of one tool-selection run and returns linked decisions and optional feedback summary.

## Request schema

Required:

1. `run_id`

Common fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `run_id: string`
4. `decision_limit?: number` (default `10`, max `200`)
5. `include_feedback?: boolean` (default `true`)
6. `feedback_limit?: number` (default `50`, max `200`)

## Example request

```bash
curl -sS "$BASE_URL/v1/memory/tools/run" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "run_id":"run_20260305_001",
    "include_feedback":true
  }' | jq
```

## Response schema

Key response fields:

1. `run_id`
2. `lifecycle.status`
3. `lifecycle.decision_count`
4. `decisions[]`
5. `feedback` (optional)
6. `lifecycle_summary`

## Idempotency

1. Idempotent read endpoint for a fixed run.
2. Output can grow if new decisions or feedback are still being appended to the same `run_id`.

## Rate limit

1. Uses recall-class limiter and recall tenant quota.
2. Bound retries for `429`; avoid retry loops on malformed or missing run IDs.

## Error codes

Common errors:

1. `invalid_request` (400)
2. `not_found` (404)
3. `unauthorized` / `forbidden` (401/403)
4. `rate_limited_*` (429)

## Replay IDs to persist

1. `request_id`
2. `run_id`
3. any returned `decision_id`
4. any returned `decision_uri`
5. `tenant_id` and `scope`

## Operational notes

1. Use one stable `run_id` across `tools/select`, `tools/decision`, `tools/run`, and `tools/feedback`.
2. This is the read surface to inspect current lifecycle state after a resumed execution attempt.
3. When `include_feedback=true`, treat the `feedback` block as a summary view; persist individual feedback identifiers separately if you need a full audit trail.
