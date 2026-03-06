# Troubleshooting

Use this page when the system is reachable but behavior is wrong, incomplete, or unstable.

## Triage order

1. Confirm the request reached the correct environment and auth mode.
2. Confirm writes include recallable nodes and explicit isolation fields.
3. Confirm policy-loop calls share the same `run_id` and required context.
4. Confirm you can reconstruct the execution path with replay identifiers.
5. Only then investigate latency, load, or provider-level instability.

## Authentication failures

Symptoms:

1. `401` or `403` on memory endpoints.

1-minute check:

```bash
export BASE_URL="${BASE_URL:-http://localhost:3001}"
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: ${API_KEY:-invalid_key}" \
  -d '{"tenant_id":"default","scope":"default","query_text":"auth check","limit":1}' | jq
```

## Write succeeds but recall is empty

Symptoms:

1. `write` is successful but `recall_text` returns no useful context.

1-minute check:

```bash
export BASE_URL="${BASE_URL:-http://localhost:3001}"
curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"recall check","memory_lane":"shared","nodes":[{"type":"event","memory_lane":"shared","text_summary":"recall check"}]}' | jq '{request_id,warnings,data}'
```

## Embedding issues

1-minute check:

```bash
export BASE_URL="${BASE_URL:-http://localhost:3001}"
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"embedding check","limit":1}' | jq '{error,query}'
```

## Policy loop not affecting behavior

1-minute check:

```bash
export BASE_URL="${BASE_URL:-http://localhost:3001}"
curl -sS "$BASE_URL/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","run_id":"troubleshoot-run-1","context":{"intent":"support_triage"}}' | jq '{request_id,matched}'
```

## Replay path cannot be reconstructed

1-minute check:

```bash
export BASE_URL="${BASE_URL:-http://localhost:3001}"
export COMMIT_URI="your_commit_uri"
curl -sS "$BASE_URL/v1/memory/resolve" \
  -H 'content-type: application/json' \
  -d "{\"tenant_id\":\"default\",\"scope\":\"default\",\"uri\":\"$COMMIT_URI\"}" | jq
```

## High latency or instability

1-minute check:

```bash
npm run -s gate:core:prod -- --base-url "${BASE_URL:-http://localhost:3001}" --scope default
```

## Before opening an incident

Collect this minimum evidence:

1. Failing `request_id`
2. `tenant_id` and `scope`
3. `run_id` and `decision_id` if the failure involved policy or tool execution
4. `commit_uri` if memory write behavior is in question
5. The exact request payload shape, with secrets removed
