---
title: "API Reference"
---

# API Reference

This page provides a functional map of Aionis APIs for integrators.

## Base Path

`/v1/memory/*`

## Authentication Headers

1. `X-Api-Key` (API key mode)
2. `Authorization: Bearer <token>` (JWT mode)
3. `X-Admin-Token` (admin/control surfaces where required)
4. `X-Tenant-Id` (optional tenant header fallback)

## Core Memory Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /write` | persist memory and commit lineage |
| `POST /recall` | structured recall response |
| `POST /recall_text` | compact LLM-ready text recall |
| `POST /context/assemble` | layered context composition |
| `POST /find` | exact object lookup |
| `POST /resolve` | URI-based object resolution |

## Policy Loop Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /rules/evaluate` | rule matching for runtime context |
| `POST /tools/select` | policy-aware tool routing |
| `POST /tools/decision` | persist decision provenance |
| `POST /tools/feedback` | write outcome feedback |

## Session and Event Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /sessions` | create/update session memory anchor |
| `POST /events` | append session events |
| `POST /sessions/events/list` | list session event history |

## Common Request Fields

1. `tenant_id`
2. `scope`
3. `run_id` (policy flows)
4. `context` (policy/planner flows)

## Common Response Fields

1. `request_id`
2. `tenant_id`
3. `scope`
4. `commit_id` / `commit_uri`
5. `decision_id` / `decision_uri` (where applicable)

## Error Shape

```json
{
  "error": "string_code",
  "message": "human_readable_message",
  "details": {}
}
```

## Quick Integration Path

1. `write` one memory record.
2. `recall_text` for retrieval validation.
3. `context/assemble` for layered planner context.
4. `rules/evaluate` + `tools/select` for governed routing.
5. `resolve` for replay/inspection using URI references.

## Related

1. [API Contract](/public/en/api/01-api-contract)
2. [SDK Guide](/public/en/reference/05-sdk)
3. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
