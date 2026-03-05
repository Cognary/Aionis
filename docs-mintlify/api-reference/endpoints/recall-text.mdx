# POST /v1/memory/recall_text

> `POST /v1/memory/recall_text`

Performs semantic recall from plain text query and returns a compact context payload.

## Request schema

Required:

1. `query_text`

Common fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `query_text: string`
4. `limit?: number` (default 30, max 200)
5. `neighborhood_hops?: 1 | 2` (default 2)
6. `include_meta?: boolean`
7. `include_slots?: boolean`
8. `context_token_budget?: number`
9. `context_char_budget?: number`

## Example request

```bash
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "query_text":"invoice copy request",
    "limit":5,
    "include_meta":true
  }' | jq
```

## Response schema

Key response fields:

1. `request_id`
2. `tenant_id`
3. `scope`
4. `data.context` (assembled context text)
5. `data.candidates[]` (retrieved candidates)
6. `trajectory` and `observability` (diagnostics)

## Idempotency

1. Functionally idempotent for the same query and data snapshot.
2. Result ranking can change when memory graph or embeddings change between calls.

## Rate limit

1. Uses recall-class limiter and recall tenant quota.
2. Also subject to embedding quota for recall-text requests.
3. On `429`, use bounded retry with backoff.

## Error codes

Common errors:

1. `invalid_request` (400)
2. `no_embedding_provider` (400)
3. `unauthorized` / `forbidden` (401/403)
4. `rate_limited_*` (429)

## Replay IDs to persist

1. `request_id`
2. `tenant_id`
3. `scope`
4. caller-side `run_id` (if this request feeds a policy/action flow)
5. related `commit_uri` values from resolved candidates when investigated later

## Operational notes

1. Use with `context_token_budget` or `context_char_budget` in production callers.
2. Log query hash, not raw query text, when handling sensitive inputs.
