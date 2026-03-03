---
title: "E2E Regression Checklist"
---

# E2E Regression Checklist

Use this checklist to validate the external product loop end-to-end.

## Scope

1. Memory write and recall correctness
2. Policy-loop decision behavior
3. URI-first replayability
4. Basic production-readiness signals

## Prerequisites

1. API is running and healthy.
2. Environment has valid auth credentials.
3. Target tenant/scope is isolated test data.

## Regression Steps

1. Write a memory item

```bash
curl -sS http://localhost:${PORT:-3001}/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"regression write sample"}' | jq
```

2. Recall text context

```bash
curl -sS http://localhost:${PORT:-3001}/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"regression write sample"}' | jq
```

3. Assemble layered context

```bash
curl -sS http://localhost:${PORT:-3001}/v1/memory/context/assemble \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"customer support case"}' | jq
```

4. Evaluate rules and select a tool

```bash
curl -sS http://localhost:${PORT:-3001}/v1/memory/rules/evaluate \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","context":{"intent":"support_triage"}}' | jq
```

5. Record decision and feedback

```bash
curl -sS http://localhost:${PORT:-3001}/v1/memory/tools/decision \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","decision_kind":"tool_select"}' | jq
```

6. Resolve URI from previous outputs

```bash
curl -sS http://localhost:${PORT:-3001}/v1/memory/resolve \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","uri":"aionis://default/default/commit/<id>"}' | jq
```

7. Run production gate

```bash
npm run -s gate:core:prod -- --base-url "http://localhost:${PORT:-3001}" --scope default
```

## Pass Criteria

1. All API calls return expected 2xx responses.
2. Returned IDs/URIs are consistent and resolvable.
3. No tenant/scope leakage is observed.
4. Gate output is passing for blocking checks.

## Related

1. [Operator Runbook](/public/en/operations/02-operator-runbook)
2. [Production Core Gate](/public/en/operations/03-production-core-gate)
3. [API Contract](/public/en/api/01-api-contract)
