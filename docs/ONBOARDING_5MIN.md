# 5-Minute Developer Onboarding

Last updated: `2026-02-17`

This guide is for external developers who want to use Aionis quickly.

## Option A: Use Hosted Aionis (Fastest)

If you host Aionis for users, only share:

1. `BASE_URL` (your API URL)
2. `API_KEY` (if auth enabled)

TypeScript:

```bash
npm i @aionis/sdk@0.1.0
```

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: process.env.BASE_URL!,
  api_key: process.env.API_KEY,
});

await client.write({
  input_text: "onboarding write",
  auto_embed: false,
  nodes: [{ client_id: "onboard_evt_1", type: "event", text_summary: "hello aionis" }],
  edges: [],
});

const out = await client.recallText({ query_text: "hello aionis", limit: 5 });
console.log(out.data.context?.text ?? "");
```

Python:

```bash
pip install aionis-sdk==0.1.0
```

```python
import os
from aionis_sdk import AionisClient

client = AionisClient(
    base_url=os.environ["BASE_URL"],
    api_key=os.getenv("API_KEY"),
)

client.write({
    "input_text": "onboarding write",
    "auto_embed": False,
    "nodes": [{"client_id": "onboard_evt_1", "type": "event", "text_summary": "hello aionis"}],
    "edges": [],
})

out = client.recall_text({"query_text": "hello aionis", "limit": 5})
print((out.get("data") or {}).get("context", {}).get("text", ""))
```

## Option B: Self-Host in 5 Minutes (Docker Compose)

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
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

Smoke write + recall:

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{"input_text":"quickstart","nodes":[{"client_id":"evt_1","type":"event","text_summary":"hello"}]}' | jq

curl -sS http://localhost:3001/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"query_text":"hello","limit":5}' | jq '{seeds:(.seeds|length), context:(.context.text|length)}'
```

Stop:

```bash
make stack-down
```

## Production Baseline (Minimum)

Before external production usage, set:

1. `APP_ENV=prod`
2. `MEMORY_AUTH_MODE=api_key` (or `jwt`)
3. `RATE_LIMIT_BYPASS_LOOPBACK=false`
4. real embedding provider (`minimax` or `openai`)

Recommended runbooks:

1. [Operator Runbook](./OPERATOR_RUNBOOK.md)
2. [Docker Release Runbook](./DOCKER_RELEASE.md)
3. [E2E Regression Checklist](./E2E_REGRESSION.md)
