---
title: "5-Minute Developer Onboarding"
---

# 5-Minute Developer Onboarding

Last updated: `2026-02-19`

This guide is for external developers who want to use Aionis quickly.

## Default Local Port Convention

Unless you have a reason to change it, this guide uses:

1. `PORT=3001`
2. Local base URL: `http://localhost:3001`
3. If `3001` is already in use, run with another port, e.g. `PORT=3011 make quickstart`

## Core Endpoints (Start Here)

1. `GET /health`: service liveness.
2. `POST /v1/memory/write`: write facts/nodes/edges.
3. `POST /v1/memory/recall_text`: get compact text context for LLM prompts.

## Data Model Quick Definitions

1. Node `type=event`: a fact/log you want to remember.
2. Node `type=entity`: a named object/person/system.
3. Node `type=topic`: a cluster/collection of related items.

`type` is an enum controlled by server contract; for the full set, see [API Contract](./API_CONTRACT.md).

## `/v1/memory/write` Minimum Contract

At API level, write requires:

1. `input_text` or `input_sha256` (at least one).

Optional:

1. `nodes[]`
2. `edges[]`
3. `auto_embed`

Absolute minimum request (valid contract):

```json
{"input_text":"hello write"}
```

Recommended onboarding write (actually useful for recall):

```json
{
  "input_text": "quickstart",
  "nodes": [{"client_id":"evt_1","type":"event","text_summary":"hello"}]
}
```

## Option A: Use Hosted Aionis (Fastest)

If you host Aionis for users, only share:

1. `BASE_URL` (your API URL)
2. `API_KEY` (if `MEMORY_AUTH_MODE=api_key`)

Hosted auth header formats:

1. API key mode: `X-Api-Key: <API_KEY>`
2. JWT mode: `Authorization: Bearer <JWT>`

Hosted curl example:

```bash
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d '{"query_text":"hello","limit":5}' | jq
```

TypeScript:

```bash
npm i @aionis/sdk@0.1.5
```

```ts
import { AionisApiError, AionisClient, AionisNetworkError } from "@aionis/sdk";

const client = new AionisClient({
  base_url: process.env.BASE_URL!,
  api_key: process.env.API_KEY,
});

try {
  await client.write({
    input_text: "onboarding write",
    auto_embed: true,
    nodes: [{ client_id: "onboard_evt_1", type: "event", text_summary: "hello aionis" }],
  });
  const out = await client.recallText({ query_text: "hello aionis", limit: 5 });
  console.log(out.data.context?.text ?? "");
} catch (err) {
  if (err instanceof AionisApiError) {
    console.error("api error", err.status, err.code, err.details, err.request_id);
  } else if (err instanceof AionisNetworkError) {
    console.error("network error", err.message, err.request_id);
  } else {
    console.error("unknown error", err);
  }
}
```

Python:

```bash
pip install aionis-sdk==0.1.5
```

```python
import os
from aionis_sdk import AionisApiError, AionisClient, AionisNetworkError

client = AionisClient(
    base_url=os.environ["BASE_URL"],
    api_key=os.getenv("API_KEY"),
)

try:
    client.write({
        "input_text": "onboarding write",
        "auto_embed": True,
        "nodes": [{"client_id": "onboard_evt_1", "type": "event", "text_summary": "hello aionis"}],
    })
    out = client.recall_text({"query_text": "hello aionis", "limit": 5})
    print((out.get("data") or {}).get("context", {}).get("text", ""))
except AionisApiError as err:
    print("api error", err.status, err.code, err.details, err.request_id)
except AionisNetworkError as err:
    print("network error", err, err.request_id)
```

## Option B: Self-Host in 5 Minutes (Docker Compose)

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
```

Dependency check:

```bash
docker --version
docker compose version
make --version
```

Recommended minimal local edits in `.env`:

1. `EMBEDDING_PROVIDER=fake`
2. `MEMORY_AUTH_MODE=off`
3. `PORT=3001`

Start full stack:

```bash
make stack-up
curl -fsS http://localhost:3001/health
```

If `make quickstart` or `make stack-up` reports `bind: address already in use` for `3001`, run:

```bash
PORT=3011 make quickstart
```

`fake` provider behavior (important):

1. It generates deterministic synthetic vectors (not real semantic embeddings).
2. `recall_text` still runs vector recall, but quality is for plumbing/smoke only.
3. Fresh writes may not be immediately recallable until async embedding backfill is done.

Smoke write + recall:

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{"input_text":"quickstart","auto_embed":true,"nodes":[{"client_id":"evt_1","type":"event","text_summary":"hello"}]}' | jq

for i in {1..20}; do
  out="$(curl -sS http://localhost:3001/v1/memory/recall_text \
    -H 'content-type: application/json' \
    -d '{"query_text":"hello","limit":5}')"
  seeds="$(echo "$out" | jq '.seeds|length')"
  if [ "$seeds" -gt 0 ]; then
    echo "$out" | jq '{seeds:(.seeds|length), context_preview:(.context.text|split("\n")[0])}'
    break
  fi
  sleep 1
done
```

Expected hello-world shape (example):

1. `seeds`: `>= 1`
2. `context.text`: starts with sections like `# Topics / Concepts` or `# Supporting Events / Evidence`

Stop:

```bash
make stack-down
```

### Embedded strict-failure smoke (local only)

If you are testing embedded backend strict-mode behavior, you can verify SDK/helper handling of
`shadow_dual_write_strict_failure` with this dev-only probe:

1. Start with embedded backend + strict shadow dual-write enabled:

```bash
MEMORY_STORE_BACKEND=embedded \
MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED=true \
MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED=true \
MEMORY_SHADOW_DUAL_WRITE_ENABLED=true \
MEMORY_SHADOW_DUAL_WRITE_STRICT=true \
make stack-up
```

2. Run one-command smoke (recommended):

```bash
npm run -s smoke:strict-shadow-failure
```

Expected response shape:

1. HTTP `500`
2. `error="shadow_dual_write_strict_failure"`
3. `details.capability="shadow_mirror_v2"`
4. `details.degraded_mode="mirror_failed"`

3. Restore table and stop stack:

```bash
make stack-down
```

## Production Baseline (Minimum)

Before external production usage, set:

1. `AIONIS_MODE=service` (or `AIONIS_MODE=cloud`)
2. configure auth credentials required by the mode:
   - `service`: `MEMORY_API_KEYS_JSON` with at least one key
   - `cloud`: `MEMORY_API_KEYS_JSON` and/or `MEMORY_JWT_HS256_SECRET`
3. real embedding provider (`minimax` or `openai`)

Hard safety rules:

1. `MEMORY_AUTH_MODE=off` is for local development only; do not expose it on public network.
2. Keep rate-limit bypass disabled in production (`RATE_LIMIT_BYPASS_LOOPBACK=false`).

Recommended runbooks:

1. [Operator Runbook](./OPERATOR_RUNBOOK.md)
2. [Docker Release Runbook](./DOCKER_RELEASE.md)
3. [E2E Regression Checklist](./E2E_REGRESSION.md)
