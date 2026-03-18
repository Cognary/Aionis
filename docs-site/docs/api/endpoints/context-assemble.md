# POST /v1/memory/context/assemble

> `POST /v1/memory/context/assemble`

Builds layered execution context by combining recall, rules evaluation, and optional tool selection.

## Request schema

Required:

1. `query_text`

Common fields:

1. `tenant_id?: string`
2. `scope?: string`
3. `query_text: string`
4. `context?: object` (runtime execution context)
5. `execution_state_v1?: object` (resume continuity state)
6. `execution_packet_v1?: object` (resume-ready execution packet)
7. `include_rules?: boolean` (default `true`)
8. `tool_candidates?: string[]`
9. `return_layered_context?: boolean` (default `true`)
10. `context_layers?: object`

## Example request

```bash
curl -sS "$BASE_URL/v1/memory/context/assemble" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "query_text":"refund policy for enterprise",
    "context":{"intent":"billing_support"},
    "include_rules":true,
    "tool_candidates":["ticket_router","email_sender"],
    "return_layered_context":true
  }' | jq
```

## Response schema

Key response fields:

1. `tenant_id`
2. `scope`
3. `execution_kernel`
4. `query` (`text`, `embedding_provider`)
5. `recall` (includes `trajectory` and `observability`)
6. `rules` (optional)
7. `tools` (optional)
8. `assembly_summary`
9. `layered_context` (optional)

## Idempotency

1. Functionally idempotent for the same input and data snapshot.
2. Output can change when memory, rule state, or tool policies change.

## Rate limit

1. Uses recall-class limiter and recall tenant quota.
2. Uses embedding quota for text-to-embedding phase.
3. If `return_debug` + `include_embeddings` is used, debug embedding controls also apply.

## Error codes

Common errors:

1. `invalid_request` (400)
2. `no_embedding_provider` (400)
3. `unauthorized` / `forbidden` (401/403)
4. `rate_limited_*` (429)

## Replay IDs to persist

1. `request_id` (from response envelope)
2. `tenant_id`
3. `scope`
4. caller `run_id` for downstream policy/action chain
5. `decision_id` from subsequent tool selection
6. relevant `commit_uri` values from recall candidates

## Operational notes

1. Use this endpoint as planner input assembly before policy and tool execution.
2. Keep the same `run_id` across context assembly, tool selection, and action execution.
3. When resuming from `handoff/recover`, pass recovered `execution_state_v1` and `execution_packet_v1` to preserve continuity exactly.
