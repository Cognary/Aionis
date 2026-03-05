# POST /v1/memory/write

> `POST /v1/memory/write`

Writes memory nodes and edges into Aionis and returns a commit you can trace later.

## Request schema

Required:

1. `input_text` or `input_sha256`
2. `nodes[]` when `MEMORY_WRITE_REQUIRE_NODES=true`

Top-level fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `actor?: string`
4. `memory_lane?: "private" | "shared"`
5. `nodes?: WriteNode[]`
6. `edges?: WriteEdge[]`

`WriteNode` minimum shape:

```json
{
  "type": "event",
  "memory_lane": "shared",
  "text_summary": "Customer asked for invoice copy"
}
```

## Example request


#### cURL

```bash
curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "input_text":"User asked for invoice copy",
    "memory_lane":"shared",
    "nodes":[
      {
        "type":"event",
        "memory_lane":"shared",
        "text_summary":"User asked for invoice copy"
      }
    ]
  }' | jq
```


## Response schema

Key response fields:

1. `request_id`
2. `tenant_id`
3. `scope`
4. `data.commit_id`
5. `data.commit_uri`
6. `warnings[]` (optional, for example `write_no_nodes`)

## Idempotency

1. Not guaranteed idempotent by default.
2. Re-sending the same payload can create additional commits.
3. For retry safety, provide stable client identifiers in nodes/edges and keep your own request dedupe key.

## Rate limit

1. Uses write-class limiter and write tenant quota.
2. Treat `429` as retryable with exponential backoff and jitter.
3. Do not hot-loop retries on validation failures.

## Error codes

Common errors:

1. `invalid_request` (400)
2. `write_nodes_required` (400)
3. `unauthorized` / `forbidden` (401/403)
4. `rate_limited_*` (429)
5. `backend_capability_unsupported` (501)

## Replay IDs to persist

Persist these identifiers from request/response and your runtime context:

1. `request_id`
2. `commit_id`
3. `commit_uri`
4. `tenant_id`
5. `scope`
6. your external `run_id` (if available in caller logs)

## Operational notes

1. `input_text` alone does not create recallable nodes; use `nodes[]`.
2. Keep `commit_uri` in your incident timeline store for resolve/replay workflows.
