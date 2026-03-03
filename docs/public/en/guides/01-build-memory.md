---
title: "Build Memory Workflows"
---

# Build Memory Workflows

Use this guide to connect Aionis to an existing product workflow from first write to governed execution.

## End-to-End Flow

```mermaid
flowchart LR
  A["Write Memory"] --> B["Recall Context"]
  B --> C["Assemble Layered Context"]
  C --> D["Evaluate Rules and Select Tool"]
  D --> E["Record Decision and Feedback"]
```

## 1) Write Memory

Endpoint:

1. `POST /v1/memory/write`

Minimal payload:

```json
{
  "tenant_id": "default",
  "scope": "default",
  "input_text": "Customer prefers email follow-up"
}
```

Success signal: response includes `request_id` and write metadata.

## 2) Recall Useful Context

Endpoints:

1. `POST /v1/memory/recall_text` for compact prompt-ready context
2. `POST /v1/memory/recall` for structured candidates

Start with `recall_text` for the fastest integration loop.

## 3) Assemble Layered Context

Endpoint:

1. `POST /v1/memory/context/assemble`

Use this when you need explicit control over layers, budgets, and merge trace for debugging quality/cost tradeoffs.

## 4) Apply Policy Before Action

Endpoints:

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`

This stage lets policy influence execution, not only retrieval.

## 5) Persist Decision Outcomes

Endpoints:

1. `POST /v1/memory/tools/decision`
2. `POST /v1/memory/tools/feedback`

Persist these IDs for replay and optimization:

1. `request_id`
2. `run_id`
3. `decision_id`
4. `commit_uri`

## Quick Curl Sequence

```bash
export BASE_URL="https://api.your-domain.com"
export API_KEY="your_api_key"

curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","input_text":"Customer prefers email"}' | jq

curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","query_text":"preferred follow-up","limit":5}' | jq

curl -sS "$BASE_URL/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","run_id":"run-demo-1","context":{"user_intent":"follow-up"}}' | jq
```

## Production Checklist

1. Tenant/scope model is explicitly defined.
2. Write and recall are stable under real traffic shape.
3. Context budgets are tuned for latency and token cost.
4. Policy loop covers at least one critical decision path.
5. IDs are persisted for replay and incident diagnostics.

## Related

1. [Get Started](/public/en/getting-started/01-get-started)
2. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)
3. [Policy & Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
4. [API Reference](/public/en/api-reference/00-api-reference)
