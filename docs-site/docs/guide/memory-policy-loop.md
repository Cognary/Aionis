# Memory and Policy Loop

This page describes the default integration sequence for production use.

## What this page covers

1. The runtime order for memory, policy, and action execution.
2. The identifiers you must preserve for replay.
3. The guardrails required for a stable production integration.

## Lifecycle

1. Write memory (`POST /v1/memory/write`).
2. Recall memory (`POST /v1/memory/recall_text` or `POST /v1/memory/recall`).
3. Assemble context (`POST /v1/memory/context/assemble`).
4. Evaluate policy (`POST /v1/memory/rules/evaluate`).
5. Select and persist decision and run records (`tools/select`, `tools/decision`, `tools/run`).
6. Persist outcome feedback (`POST /v1/memory/tools/feedback`).

## What each step is for

1. **Write** stores durable execution facts that later runs can reuse.
2. **Recall** retrieves relevant memory for the current request.
3. **Assemble** shapes that recall into bounded runtime context.
4. **Evaluate** applies rules before any action is chosen.
5. **Select and run** records the actual decision and execution linkage.
6. **Feedback** closes the loop so future decisions can improve.

## Write guardrails

1. Recallable writes require `nodes`.
2. `input_text` alone does not create memory nodes.
3. Empty-node writes may return `warnings[].code=write_no_nodes`.

## Replay Execution

Use this chain to reconstruct execution:

1. `request_id`
2. `run_id`
3. `decision_id`
4. `commit_uri`

Workflow:

1. Start with failed request logs (`request_id`).
2. Resolve run and decision linkage (`run_id`, `decision_id`).
3. Resolve affected objects by `commit_uri`.
4. Replay the workflow and compare expected vs actual outcomes.

Use cases:

1. Incident debugging.
2. Regression verification before re-release.
3. Release evidence for production changes.

## Example sequence

```bash
export BASE_URL="https://api.your-domain.com"
export API_KEY="your_api_key"

curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{
    "tenant_id":"default",
    "scope":"default",
    "input_text":"Customer prefers email",
    "memory_lane":"shared",
    "nodes":[{"type":"event","memory_lane":"shared","text_summary":"Customer prefers email"}]
  }' | jq

curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","query_text":"preferred follow-up","limit":5}' | jq

curl -sS "$BASE_URL/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","run_id":"run-demo-1","context":{"intent":"follow-up"}}' | jq
```

## Production checklist

1. Keep one stable `run_id` across the full execution attempt.
2. Persist `request_id`, `decision_id`, and `commit_uri` in logs and telemetry.
3. Do not treat write and selection endpoints as blindly retryable.
4. Validate the replay path before shipping production changes.
