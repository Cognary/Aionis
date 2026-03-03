---
title: "API Reference"
---

# API Reference

This page is the practical API map for integrating Aionis into product workflows.

## Base Path

All memory-kernel routes are under:

`/v1/memory/*`

## Authentication

Use one of these for memory routes:

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`

Use `X-Admin-Token` only for admin/control surfaces that explicitly require it.

## Endpoint Groups

### Memory Write and Recall

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`

### Context Orchestration

1. `POST /v1/memory/context/assemble`
2. `POST /v1/memory/planning/context`

### Policy and Execution Loop

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`

### Sessions and Events

1. `POST /v1/memory/sessions`
2. `POST /v1/memory/events`
3. `POST /v1/memory/sessions/events/list`

### Sandbox (Experimental)

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/cancel`

### Graph and Replay Utilities

1. `POST /v1/memory/find`
2. `POST /v1/memory/resolve`

## Common Request Fields

1. `tenant_id`
2. `scope`
3. `run_id` (policy flows)
4. `context` (policy/planning inputs)

## Common Response Fields

1. `request_id`
2. `tenant_id`
3. `scope`
4. `commit_id` / `commit_uri` (write flows)
5. `decision_id` / `decision_uri` (tool-decision flows)

## Error Shape

```json
{
  "error": "string_code",
  "message": "human_readable_message",
  "details": {}
}
```

## Minimal Integration Sequence

1. `write` one memory item.
2. `recall_text` to verify retrieval quality.
3. `context/assemble` for layered context.
4. `rules/evaluate` and `tools/select` for governed routing.
5. `tools/decision` or `tools/run` for decision/run replay checks.
6. `resolve` using `commit_uri` or `decision_uri` for replay.

## Contract and SDK

1. [API Contract](/public/en/api/01-api-contract)
2. [SDK Guide](/public/en/reference/05-sdk)
3. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
4. [Sandbox API (Experimental)](/public/en/reference/08-sandbox-api)
