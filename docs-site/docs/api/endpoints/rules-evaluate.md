# POST /v1/memory/rules/evaluate

> `POST /v1/memory/rules/evaluate`

Evaluates active (and optional shadow) rules against runtime context.

## Request schema

Required:

1. `context`

Common fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `context: object`
4. `include_shadow?: boolean` (default `true`)
5. `limit?: number` (default 50, max 200)

## Example request

```bash
curl -sS "$BASE_URL/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "context":{"intent":"escalation","agent":{"id":"agent-1"}},
    "include_shadow":true,
    "limit":50
  }' | jq
```

## Response schema

Key response fields:

1. `scope`
2. `tenant_id`
3. `considered`
4. `matched`
5. `applied` (policy patch result)
6. `agent_visibility_summary` (when available)

## Idempotency

1. Idempotent read-style evaluation for the same context and rule state.
2. Result changes only when rule definitions/state are updated.

## Rate limit

1. Uses recall-class limiter and recall tenant quota.
2. Treat `429` as transient; do not retry invalid payloads.

## Error codes

Common errors:

1. `invalid_request` (400)
2. `unauthorized` / `forbidden` (401/403)
3. `rate_limited_*` (429)

## Replay IDs to persist

1. `request_id`
2. `tenant_id`
3. `scope`
4. caller `run_id`
5. winning rule identifiers from `applied.sources[]`
