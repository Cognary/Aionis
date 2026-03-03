---
title: "Embedding Setup"
---

# Embedding Setup

This page is the single source for enabling and validating Aionis embedding capability.

## Provider Modes

`EMBEDDING_PROVIDER` supports:

1. `fake`: deterministic local vectors (dev/smoke, not semantic quality)
2. `openai`: real OpenAI embeddings
3. `minimax`: real MiniMax embeddings
4. `none`: disable server-side embeddings (client must provide vectors)

## Quick Start

1. Edit `.env`
2. Set `EMBEDDING_PROVIDER` and required credentials
3. Restart Aionis API
4. Verify via `recall_text`

## Config: Fake (Default for Local Dev)

```bash
EMBEDDING_PROVIDER=fake
EMBEDDING_DIM=1536
```

Use this when validating API flow only.

## Config: OpenAI Embeddings

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBED_BATCH_SIZE=32
EMBEDDING_DIM=1536
```

Notes:

1. Do not add `/embeddings` to any URL; OpenAI endpoint is built in by Aionis provider adapter.
2. `OPENAI_API_KEY` is required when `EMBEDDING_PROVIDER=openai`.

## Config: MiniMax Embeddings

```bash
EMBEDDING_PROVIDER=minimax
MINIMAX_API_KEY=your_minimax_api_key
MINIMAX_GROUP_ID=your_group_id
MINIMAX_EMBED_MODEL=embo-01
MINIMAX_EMBED_TYPE=db
MINIMAX_EMBED_ENDPOINT=https://api.minimax.chat/v1/embeddings
EMBEDDING_DIM=1536
```

Notes:

1. `MINIMAX_API_KEY` and `MINIMAX_GROUP_ID` are required when `EMBEDDING_PROVIDER=minimax`.
2. For database recall, keep `MINIMAX_EMBED_TYPE=db` unless you intentionally split db/query vectors.

## Config: None (Server Embedding Off)

```bash
EMBEDDING_PROVIDER=none
```

Behavior:

1. `recall_text` / planning-context routes return `no_embedding_provider`
2. `/write` still works, but server will not generate vectors

## Restart

After editing `.env`, restart API:

```bash
cd /Users/lucio/Desktop/Aionis
PORT=3001 npm run dev
```

## Verify (Required)

### 1) Health

```bash
curl -sS http://127.0.0.1:3001/health | jq '.ok'
```

Expected: `true`

### 2) recall_text provider check

```bash
curl -sS -X POST http://127.0.0.1:3001/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"embedding check","limit":3}' \
  | jq '.query.embedding_provider'
```

Expected examples:

1. `"fake:deterministic"`
2. `"openai:text-embedding-3-small"`
3. `"minimax:embo-01"`

## Troubleshooting

1. `no_embedding_provider`: set `EMBEDDING_PROVIDER` to `fake|openai|minimax` and restart.
2. `invalid_api_key` / auth errors: credential is missing/invalid for selected provider.
3. `upstream_embedding_rate_limited`: reduce burst/QPS, enable cache/batching, or retry with backoff.
4. Route works but quality is poor: you are likely on `fake`; switch to `openai` or `minimax`.

## Security Notes

1. Never commit real API keys to git.
2. Rotate keys immediately if exposed in terminal logs, screenshots, or backup env files.
3. Use separate keys for local/dev/prod.
