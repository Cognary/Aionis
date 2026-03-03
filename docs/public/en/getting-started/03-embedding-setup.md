---
title: "Embedding Setup"
---

# Embedding Setup

This page explains how to enable embedding-based recall in Aionis for development and production.

## Provider Modes

`EMBEDDING_PROVIDER` supports:

1. `fake`: deterministic vectors for local smoke tests (not semantic quality)
2. `openai`: OpenAI embeddings
3. `minimax`: MiniMax embeddings
4. `none`: disable server-side embeddings (client must provide vectors)

## Quick Setup Flow

1. Set provider and credentials in environment variables.
2. Restart Aionis.
3. Run one `recall_text` check and confirm `query.embedding_provider`.

## Configuration Examples

### Fake (Local Dev)

```bash
EMBEDDING_PROVIDER=fake
EMBEDDING_DIM=1536
```

### OpenAI

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBED_BATCH_SIZE=32
EMBEDDING_DIM=1536
```

Notes:

1. `OPENAI_API_KEY` is required.
2. Do not append `/embeddings` to your base URL; Aionis handles provider endpoint routing.

### MiniMax

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

1. `MINIMAX_API_KEY` and `MINIMAX_GROUP_ID` are required.
2. Keep `MINIMAX_EMBED_TYPE=db` unless you intentionally use split query/db vectors.

### None (Server Embedding Off)

```bash
EMBEDDING_PROVIDER=none
```

When set to `none`, write endpoints still work, but embedding-dependent recall routes return `no_embedding_provider`.

## Restart Aionis

Choose one path:

1. Process mode: restart your API process manager (`systemd`, `pm2`, or equivalent).
2. Docker Compose: `docker compose up -d --force-recreate`.
3. Single container: recreate container with updated `--env-file`.

## Verify Embeddings (Required)

Set base URL and auth first:

```bash
export BASE_URL="https://api.your-domain.com"
export API_KEY="your_api_key"
```

Health:

```bash
curl -sS "$BASE_URL/health" | jq '.ok'
```

Provider check:

```bash
curl -sS -X POST "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","query_text":"embedding check","limit":3}' \
  | jq '.query.embedding_provider'
```

Expected examples:

1. `"fake:deterministic"`
2. `"openai:text-embedding-3-small"`
3. `"minimax:embo-01"`

## Troubleshooting

1. `no_embedding_provider`: provider is `none` or not set; configure `fake|openai|minimax` and restart.
2. `invalid_api_key` or upstream auth error: verify provider credential and account scope.
3. `upstream_embedding_rate_limited`: add retry/backoff and reduce burst concurrency.
4. Low-quality results: you are likely using `fake`; use `openai` or `minimax` for semantic retrieval.

## Security Baseline

1. Never commit API keys.
2. Use separate keys for dev/staging/prod.
3. Rotate keys immediately after exposure.
