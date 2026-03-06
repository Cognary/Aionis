# Authentication

This page defines how clients authenticate to Aionis APIs in production.

## Supported modes

1. API key via `X-Api-Key`.
2. Bearer token via `Authorization: Bearer <token>`.
3. Admin token via `X-Admin-Token` for admin/control endpoints.

## Recommended production posture

1. Use API keys or JWT in data-plane traffic.
2. Keep admin token isolated from app/runtime credentials.
3. Rotate credentials and scope them per environment.
4. Keep one auth strategy per environment to reduce debugging ambiguity.

## Example requests


#### cURL

```bash
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","query_text":"auth check","limit":1}'
```

#### TypeScript

```ts
await client.recallText({
  tenant_id: 'default',
  scope: 'default',
  query_text: 'auth check',
  limit: 1
})
```

#### Python

```python
client.recall_text({
    'tenant_id': 'default',
    'scope': 'default',
    'query_text': 'auth check',
    'limit': 1,
})
```


## Common issues

1. `401/403`: invalid header name or invalid credential value.
2. Mixed auth modes across environments.
3. Using admin token for normal data-plane calls.
4. Forgetting to update automation, worker, or replay jobs after credential rotation.

## Error example and fix

Example error:

```json
{
  "error": "unauthorized",
  "message": "missing or invalid credentials"
}
```

Fix:
1. Verify the header name matches your auth mode (`X-Api-Key` vs `Authorization`).
2. Verify token/key belongs to target tenant and environment.
3. Retry with the same payload after correcting credentials.
