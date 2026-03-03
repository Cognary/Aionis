---
title: "SDK Guide"
---

# SDK Guide

Aionis provides official SDKs for TypeScript and Python.

## Packages

1. TypeScript: `@aionis/sdk`
2. Python: `aionis-sdk`

## Install

### TypeScript

```bash
npm install @aionis/sdk
```

### Python

```bash
pip install aionis-sdk
```

## Client Configuration

Configure once per environment:

1. `base_url`
2. `tenant_id`
3. `scope`
4. auth (`api_key` or bearer token)

## Core Methods

1. `write`
2. `recall` / `recall_text`
3. `context_assemble`
4. `find`
5. `resolve`
6. policy loop methods (`rules_evaluate`, `tools_select`, `tools_decision`, `tools_feedback`)

## TypeScript Quick Example

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  baseUrl: "https://api.aionisos.com",
  tenantId: "default",
  scope: "default",
  apiKey: process.env.AIONIS_API_KEY,
});

const writeRes = await client.write({
  input_text: "Customer prefers email follow-up",
});

const recallRes = await client.recallText({
  query_text: "preferred follow-up channel",
});

console.log(writeRes.commit_uri, recallRes.request_id);
```

## Python Quick Example

```python
from aionis_sdk import AionisClient

client = AionisClient(
    base_url="https://api.aionisos.com",
    tenant_id="default",
    scope="default",
    api_key="<your-api-key>",
)

write_res = client.write(input_text="Customer prefers email follow-up")
recall_res = client.recall_text(query_text="preferred follow-up channel")

print(write_res.get("commit_uri"), recall_res.get("request_id"))
```

## Error Handling

Both SDKs expose typed API/network errors and preserve server error codes.

Recommended handling:

1. Retry on transient network errors and `429`.
2. Log `request_id` and server `error` code.
3. Surface actionable messages to operators.

## Compatibility

1. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
2. [API Contract](/public/en/api/01-api-contract)
