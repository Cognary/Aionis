# Endpoint Schemas

Contract-level request/response references for high-traffic Aionis endpoints.

## How to use this section

1. Start with the API group pages if you are still deciding which surface to use.
2. Use the endpoint schema pages when you need exact payload shape or example responses.
3. Keep [API Guide](/guide/api-guide) open if you need auth, isolation, or retry guidance.

## Suggested reading order

1. [Memory APIs](/api/memory)
2. [Policy APIs](/api/policy)
3. [Replay APIs](/api/replay)
4. Then use the specific endpoint pages below as contracts

## Memory

1. [POST /v1/memory/write](write)
2. [POST /v1/memory/recall_text](recall-text)
3. [POST /v1/memory/context/assemble](context-assemble)
4. [POST /v1/memory/resolve](resolve)

## Policy Loop

1. [POST /v1/memory/rules/evaluate](rules-evaluate)
2. [POST /v1/memory/tools/select](tools-select)
3. [POST /v1/memory/tools/decision](tools-decision)
4. [POST /v1/memory/tools/run](tools-run)

## Replay

1. [POST /v1/memory/replay/runs/get](replay-runs-get)
