# POST /v1/memory/replay/runs/get

> `POST /v1/memory/replay/runs/get`

Reads a replay run timeline and returns run-level and step-level execution evidence.

## Request schema

Required:

1. `run_id` (UUID)

Common fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `run_id: string (UUID)`
4. `include_steps?: boolean` (default `true`)
5. `include_artifacts?: boolean` (default `true`)

## Example request

```bash
curl -sS "$BASE_URL/v1/memory/replay/runs/get" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "run_id":"3d1868e2-e6d3-4f69-952e-61f53ef2ef30",
    "include_steps":true,
    "include_artifacts":true
  }' | jq
```

## Response schema

Key response fields:

1. `run`
2. `timeline[]`
3. `steps[]` (optional)
4. `artifacts[]` (optional)
5. provenance identifiers (`run_id`, `decision_id`, `commit_uri` when present)

## Idempotency

1. Idempotent read endpoint for a fixed replay run.
2. Output is stable unless run data is still being appended.

## Rate limit

1. Uses recall-class limiter and recall tenant quota.
2. Bound retries for `429`; avoid retry loops on malformed run IDs.

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
4. any returned `commit_uri`
5. `tenant_id` and `scope`

## Operational notes

1. Use this endpoint for incident debugging and post-incident replay evidence.
2. Combine `request_id`, `run_id`, `decision_id`, `commit_uri` to reconstruct the full path.
