# Memory APIs

Memory APIs persist execution history and reconstruct useful context for future runs.

## Endpoints

> `POST /v1/memory/write`
> `POST /v1/memory/recall`
> `POST /v1/memory/recall_text`
> `POST /v1/memory/context/assemble`
> `POST /v1/memory/find`
> `POST /v1/memory/resolve`

## Write contract rules

1. Include recallable `nodes` in write payload.
2. `input_text` does not create nodes automatically.
3. Empty-node writes may return `warnings[].code=write_no_nodes`.

## When to use each endpoint

1. `write` when an agent step produced information worth keeping.
2. `recall` or `recall_text` when you need relevant prior context before the next step.
3. `context/assemble` when you want the server to combine retrieval into prompt-ready context.
4. `find` when you already know structured fields to query.
5. `resolve` when you have a URI or commit identifier and need the underlying object.

## Minimal write + recall

```bash
curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"hello","memory_lane":"shared","nodes":[{"type":"event","memory_lane":"shared","text_summary":"hello"}]}' | jq

curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"hello","limit":5}' | jq
```

## Example response (write, trimmed)

```json
{
  "status": "ok",
  "request_id": "req_xxx",
  "tenant_id": "default",
  "scope": "default",
  "data": {
    "commit_id": "commit_xxx",
    "commit_uri": "memory://commit/commit_xxx"
  }
}
```

## Example response (recall_text, trimmed)

```json
{
  "status": "ok",
  "request_id": "req_yyy",
  "tenant_id": "default",
  "scope": "default",
  "data": {
    "context": "Customer prefers email follow-up ...",
    "candidates": []
  }
}
```

## Response fields to keep

1. `request_id`
2. `tenant_id`
3. `scope`
4. `commit_id`
5. `commit_uri`

## Common mistakes

1. Writing only `input_text` and expecting retrieval to work.
2. Mixing `memory_lane` values without a retrieval strategy.
3. Omitting `tenant_id` or `scope` and then debugging the wrong dataset.
4. Not storing `commit_uri`, which later blocks replay and audit work.

## Error example and fix

Example error:

```json
{
  "error": "invalid_request",
  "message": "write_nodes_required"
}
```

Fix:
1. Add at least one recallable node in `nodes[]`.
2. Keep `tenant_id` and `scope` explicit in every request.
3. Re-run write, then verify with `recall_text`.
