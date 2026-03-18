# POST /v1/memory/tools/select

> `POST /v1/memory/tools/select`

Applies policy to candidate tools and persists a provenance decision.

## Request schema

Required:

1. `context`
2. `candidates[]` (min 1)

Common fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `run_id?: string`
4. `context: object`
5. `execution_state_v1?: object` (resume continuity state)
6. `execution_result_summary?: object` (recovered execution summary)
7. `execution_artifacts?: object[]` (recovered execution side outputs)
8. `execution_evidence?: object[]` (recovered execution evidence)
9. `candidates: string[]`
10. `include_shadow?: boolean` (default `false`)
11. `rules_limit?: number` (default 50, max 200)
12. `strict?: boolean` (default `true`)

## Example request

```bash
curl -sS "$BASE_URL/v1/memory/tools/select" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "run_id":"run_20260305_001",
    "context":{"intent":"billing_support"},
    "candidates":["ticket_router","email_sender"],
    "strict":true
  }' | jq
```

## Response schema

Key response fields:

1. `selection.selected`
2. `selection.allowed[]`
3. `execution_kernel`
4. `rules.applied`
5. `decision.decision_id`
6. `decision.decision_uri`
7. `decision.run_id`
8. `selection_summary`

## Idempotency

1. Not idempotent by default.
2. Each successful call persists a decision record.
3. Avoid blind retries; if you retry, keep `run_id` stable and dedupe on your side.

## Rate limit

1. Uses recall-class limiter and recall tenant quota.
2. Back off on `429` and `5xx` only.

## Error codes

Common errors:

1. `invalid_request` (400)
2. `unauthorized` / `forbidden` (401/403)
3. `rate_limited_*` (429)

## Replay IDs to persist

1. `request_id`
2. `run_id`
3. `decision.decision_id`
4. `decision.decision_uri`
5. `rules.applied.sources[]` rule IDs

## Operational notes

1. Use one `run_id` per execution attempt and keep it across decision and feedback.
2. Persist `decision_id` before action execution to ensure replay continuity.
3. When resuming from recovered handoff continuity, pass `execution_state_v1` and optionally `context.control_profile_v1` so selection runs under the recovered execution posture.
4. If the recovered payload already carries `execution_artifacts` or `execution_evidence`, pass them through so policy selection can see the same continuity side outputs as context assembly.
