# POST /v1/memory/resolve

> `POST /v1/memory/resolve`

Resolves canonical Aionis URIs (`node`, `edge`, `commit`, `decision`) into concrete objects.

## Request schema

Required:

1. `uri`

Common fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `uri: string`
4. `include_meta?: boolean`
5. `include_slots?: boolean`
6. `include_slots_preview?: boolean`

## Example request

```bash
curl -sS "$BASE_URL/v1/memory/resolve" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "uri":"aionis://default/support/decision/8fe92f61-9466-4f9e-96ef-04bc56b96b19",
    "include_meta":true
  }' | jq
```

## Response schema

Key response fields:

1. `scope`
2. `tenant_id`
3. `uri`
4. `resolved_type`
5. `resolved` (the resolved entity payload)

## Idempotency

1. Idempotent read endpoint for a stable URI.
2. Output changes only when underlying object changes.

## Rate limit

1. Uses recall-class limiter and recall tenant quota.
2. Use bounded retry for transient `429` only.

## Error codes

Common errors:

1. `invalid_request` (400)
2. `not_found` (404)
3. `unauthorized` / `forbidden` (401/403)
4. `rate_limited_*` (429)

## Replay IDs to persist

1. `request_id`
2. `uri`
3. `tenant_id`
4. `scope`
5. resolved `decision_id` or `commit_uri` when present
