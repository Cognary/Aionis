---
title: "E2E Regression Checklist"
---

# E2E Regression Checklist

Use this checklist to validate the full Aionis product loop before release.

## Preconditions

1. Target API is healthy.
2. Test tenant/scope is isolated.
3. Valid auth credentials are available.

Set variables:

```bash
export BASE_URL="https://api.your-domain.com"
export API_KEY="your_api_key"
```

## Regression Flow

1. **Write** memory:

```bash
curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","input_text":"regression sample"}' | jq
```

2. **Recall** context:

```bash
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","query_text":"regression sample","limit":5}' | jq
```

3. **Assemble** layered context:

```bash
curl -sS "$BASE_URL/v1/memory/context/assemble" \
  -H 'content-type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","query_text":"support case","char_budget_total":1200}' | jq
```

4. **Run policy path**:

```bash
curl -sS "$BASE_URL/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","run_id":"regression-run-1","context":{"intent":"support_triage"}}' | jq
```

5. **Core gate**:

```bash
npm run -s gate:core:prod -- --base-url "$BASE_URL" --scope default
```

## Pass Criteria

1. All required API calls return expected 2xx responses.
2. IDs/URIs returned by write/policy routes are present and resolvable.
3. No tenant/scope isolation regressions are observed.
4. Core gate passes blocking checks.

## Related

1. [Operator Runbook](/public/en/operations/02-operator-runbook)
2. [Production Core Gate](/public/en/operations/03-production-core-gate)
3. [API Contract](/public/en/api/01-api-contract)
