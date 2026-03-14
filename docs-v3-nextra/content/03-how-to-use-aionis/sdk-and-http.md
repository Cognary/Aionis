---
title: "SDK And HTTP"
description: "Choose between the TypeScript SDK, Python SDK, and raw HTTP when integrating Aionis into a real application."
---

# SDK And HTTP

The fastest way to integrate Aionis into an application is:

1. use the TypeScript SDK when it covers your path
2. use Python SDK where its surface is enough
3. fall back to raw HTTP for routes not yet wrapped in the published SDKs

That is the practical rule.

## What The Published SDK Surface Clearly Covers Today

The TypeScript package currently covers:

1. memory write and recall
2. planning context and context assemble
3. find and resolve
4. rules and tools policy loop
5. replay core and governed run flows
6. health and capability contract
7. automation and admin/control routes

The Python SDK also covers a broad runtime surface, including replay and policy flows.

## Important Boundary

Do not assume every public HTTP route already has a first-class helper in the TypeScript package.

For example, when a route is not clearly exposed as an SDK method, document it as HTTP-first instead of inventing a helper.

That keeps the docs honest and still usable.

## TypeScript Quick Example

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: "http://localhost:3001",
  api_key: process.env.API_KEY,
});

const write = await client.write({
  scope: "default",
  input_text: "Customer prefers email follow-up",
  nodes: [{ type: "event", text_summary: "Customer prefers email follow-up" }],
  edges: [],
});

const recall = await client.recallText({
  scope: "default",
  query_text: "preferred follow-up channel",
});

console.log(write.data.commit_id, recall.request_id);
```

## Python Quick Example

```python
from aionis_sdk import AionisClient

client = AionisClient(base_url="http://localhost:3001")

write_res = client.write({
    "scope": "default",
    "input_text": "Customer prefers email follow-up",
    "nodes": [{"type": "event", "text_summary": "Customer prefers email follow-up"}],
    "edges": [],
})

recall_res = client.recall_text({
    "scope": "default",
    "query_text": "preferred follow-up channel",
})

print(write_res["data"]["commit_id"], recall_res["request_id"])
```

## When HTTP Is The Right Choice

Use raw HTTP when:

1. you are testing a route before SDK adoption
2. your path is missing a helper in the published package
3. you want parity with the raw API contract first

## Recommendation

For external users, the best onboarding sequence is:

1. prove value with curl or the SDK
2. move to planning/context or replay
3. only then optimize integration style
