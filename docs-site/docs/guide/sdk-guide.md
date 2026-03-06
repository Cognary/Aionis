# SDK Guide

Aionis provides official SDKs for TypeScript and Python.

## What this page gives you

1. The fastest path to a working SDK integration.
2. The minimum error-handling and logging baseline for production.
3. A clear mapping from SDK calls to the underlying API flow.

## Packages

1. TypeScript: `@aionis/sdk`
2. Python: `aionis-sdk`

## Install

```bash
npm i @aionis/sdk
pip install aionis-sdk
```

## Typical SDK sequence

1. Initialize the client with `base_url` and one auth mode.
2. Write memory after a meaningful execution step.
3. Recall context before planning or tool selection.
4. Pass `run_id` and `decision_id` through policy-loop calls.
5. Persist `request_id` and `commit_uri` from responses.

## TypeScript example

```ts
import { AionisClient } from '@aionis/sdk'

const client = new AionisClient({
  base_url: 'http://localhost:3001',
  api_key: process.env.API_KEY,
  timeout_ms: 10000
})

const writeOut = await client.write({
  scope: 'default',
  input_text: 'sdk write',
  nodes: [{ type: 'event', text_summary: 'sdk write', memory_lane: 'shared' }]
})

const recallOut = await client.recallText({
  scope: 'default',
  query_text: 'sdk write',
  limit: 5
})

console.log(writeOut.request_id, recallOut.request_id)
```

## Python example

```python
from aionis_sdk import AionisClient

client = AionisClient(
    base_url='http://localhost:3001',
    api_key='your_api_key',
    timeout_s=10.0,
)

write_out = client.write({
    'scope': 'default',
    'input_text': 'python sdk write',
    'nodes': [{'type': 'event', 'text_summary': 'python sdk write', 'memory_lane': 'shared'}]
})

recall_out = client.recall_text({
    'scope': 'default',
    'query_text': 'python sdk write',
    'limit': 5,
})

print(write_out.get('request_id'), recall_out.get('request_id'))
```

## Method coverage (high level)

1. Memory and context APIs.
2. Policy-loop APIs.
3. Replay and sandbox APIs.
4. Admin/control APIs (admin auth required).

## SDK to API mapping

1. `client.write(...)` maps to `POST /v1/memory/write`
2. `client.recallText(...)` maps to `POST /v1/memory/recall_text`
3. `client.contextAssemble(...)` maps to `POST /v1/memory/context/assemble`
4. `client.rulesEvaluate(...)` maps to `POST /v1/memory/rules/evaluate`
5. `client.toolsSelect(...)` maps to `POST /v1/memory/tools/select`

## Production baseline

1. Reuse one client per service process instead of rebuilding the client for every request.
2. Set explicit request timeouts.
3. Retry network failures and `429` responses with backoff.
4. Keep `tenant_id` and `scope` explicit in every call.
5. Log `request_id`, `run_id`, `decision_id`, and `commit_uri` whenever present.

## Error handling baseline

1. Treat `AionisApiError` as contract-level response failure.
2. Treat `AionisNetworkError` as retryable transport failure.
3. Log `request_id` and server error code for each failed request.

## Validation commands

```bash
npm run -s sdk:smoke
npm run -s sdk:tools-feedback-smoke
npm run -s sdk:py:smoke
```

## When to use the SDK instead of raw HTTP

Use the SDK when you want request validation, shared retry policy, and less integration code. Use raw HTTP only when your platform cannot adopt the official client or you need direct contract testing.
