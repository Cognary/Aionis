# POST /v1/memory/tools/decision

> `POST /v1/memory/tools/decision`

Reads one persisted tool-selection decision and returns a compact lifecycle summary.

## Request schema

Required:

1. at least one of `decision_id`, `decision_uri`, or `run_id`

Common fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `decision_id?: string (UUID)`
4. `decision_uri?: string`
5. `run_id?: string`

## Example request

```bash
curl -sS "$BASE_URL/v1/memory/tools/decision" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "decision_id":"3d1868e2-e6d3-4f69-952e-61f53ef2ef30"
  }' | jq
```

## Response schema

Key response fields:

1. `decision.decision_id`
2. `decision.run_id`
3. `decision.selected_tool`
4. `decision.candidates[]`
5. `decision.decision_uri`
6. `lookup_mode`
7. `lifecycle_summary`

## Idempotency

1. Idempotent read endpoint for a fixed decision record.
2. Output is stable unless the underlying run is still being appended with later feedback.

## Rate limit

1. Uses recall-class limiter and recall tenant quota.
2. Retry only on `429` and transient `5xx`.

## Error codes

Common errors:

1. `invalid_request` (400)
2. `not_found` (404)
3. `unauthorized` / `forbidden` (401/403)
4. `rate_limited_*` (429)

## Replay IDs to persist

1. `request_id`
2. `decision.decision_id`
3. `decision.run_id`
4. `decision.decision_uri`
5. `tenant_id` and `scope`

## Operational notes

1. Use this endpoint after `tools/select` when you need an authoritative read of the persisted decision record.
2. `lookup_mode` tells you whether the server resolved by `decision_id`, `decision_uri`, or `run_id`.
3. Persist `decision_id` from `tools/select` first; prefer direct `decision_id` lookup over looser matching modes.
