---
title: "5-Minute Developer Onboarding"
---

# 5-Minute Developer Onboarding

Last updated: `2026-03-03`

Use this page to run your first Aionis memory loop in minutes.

## What You Need

1. A running Aionis endpoint.
2. One auth credential (API key or bearer token).
3. `curl` and `jq` installed locally.

## Option A: Hosted Aionis (Fastest)

Set your endpoint and credential:

```bash
export BASE_URL="https://api.your-domain.com"
export API_KEY="your_api_key"
```

Health check:

```bash
curl -fsS "$BASE_URL/health" | jq
```

Write one memory item:

```bash
curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{
    "tenant_id":"default",
    "scope":"default",
    "input_text":"Customer prefers email follow-up",
    "memory_lane":"shared",
    "nodes":[{"type":"event","memory_lane":"shared","text_summary":"Customer prefers email follow-up"}]
  }' | jq
```

Recall text context:

```bash
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{
    "tenant_id":"default",
    "scope":"default",
    "query_text":"preferred follow-up channel",
    "limit":5
  }' | jq
```

If your deployment uses JWT auth instead of API key, replace `X-Api-Key` with:

```bash
-H "authorization: Bearer $BEARER_TOKEN"
```

## Option B: Lite Alpha (Single User, No Docker)

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
npm install
npm run build
npm run start:lite
```

Health check:

```bash
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend,lite_write_store,lite_recall_store}'
```

Expected response shape:

1. `aionis_edition = "lite"`
2. `memory_store_backend = "lite_sqlite"`
3. `lite_write_store` and `lite_recall_store` are present

Run write + recall:

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"hello from lite onboarding","memory_lane":"shared","nodes":[{"type":"event","memory_lane":"shared","text_summary":"hello from lite onboarding"}]}' | jq

curl -sS http://localhost:3001/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"hello","limit":5}' | jq
```

Current Lite alpha intentionally rejects these outer surfaces:

1. `/v1/admin/control/*`
2. `/v1/automations/*`

Those route groups return stable `501 server_only_in_lite`.

If you are operating Lite locally, read:

1. [Lite Operator Notes](/public/en/getting-started/04-lite-operator-notes)
2. [Lite Public Beta Boundary](/public/en/getting-started/05-lite-public-beta-boundary)
3. [Lite Troubleshooting and Feedback](/public/en/getting-started/06-lite-troubleshooting-and-feedback)

## Option C: Self-Host (Docker)

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
```

Recommended local `.env` minimum:

1. `PORT=3001`
2. `MEMORY_AUTH_MODE=off` (local development only)
3. `EMBEDDING_PROVIDER=fake`

Start stack:

```bash
make stack-up
curl -fsS http://localhost:3001/health | jq
```

Run write + recall:

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"hello from local onboarding","memory_lane":"shared","nodes":[{"type":"event","memory_lane":"shared","text_summary":"hello from local onboarding"}]}' | jq

curl -sS http://localhost:3001/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"hello","limit":5}' | jq
```

Stop stack:

```bash
make stack-down
```

## Success Criteria

Your onboarding is complete when:

1. `/health` returns `ok`.
2. If using Lite, `/health.aionis_edition = "lite"` and `/health.memory_store_backend = "lite_sqlite"`.
3. `write` returns `request_id` and write metadata.
4. `recall_text` returns non-empty context or seeds.

## Common Errors

1. `401/403`: wrong or missing auth header.
2. `400 invalid_request`: required fields missing or invalid JSON shape.
3. Empty recall: newly written content may need brief indexing time.
4. `warnings[0].code=write_no_nodes`: write committed with `nodes=0`, so no recallable node was added.
5. Empty `find` after a private write: this may be memory-lane visibility, not a broken Lite store.
6. Pack route failure in Lite: check `ADMIN_TOKEN` at startup and `X-Admin-Token` on the request.

## Next Steps

1. Configure production embeddings: [Embedding Setup](/public/en/getting-started/03-embedding-setup)
2. Run the Lite operator checklist: [Lite Operator Notes](/public/en/getting-started/04-lite-operator-notes)
3. Review Lite public beta scope: [Lite Public Beta Boundary](/public/en/getting-started/05-lite-public-beta-boundary)
4. Use the public troubleshooting path when local behavior diverges: [Lite Troubleshooting and Feedback](/public/en/getting-started/06-lite-troubleshooting-and-feedback)
5. Build a full memory workflow: [Build Memory Workflows](/public/en/guides/01-build-memory)
6. Explore API contracts: [API Reference](/public/en/api-reference/00-api-reference)
