# Aionis

[![Docs](https://img.shields.io/badge/docs-doc.aionisos.com-0f172a?logo=readthedocs&logoColor=white)](https://doc.aionisos.com)
[![Core Production Gate](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml)
[![Docs Pages](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml)
[![npm](https://img.shields.io/npm/v/%40aionis%2Fsdk?logo=npm)](https://www.npmjs.com/package/@aionis/sdk)
[![PyPI](https://img.shields.io/pypi/v/aionis-sdk?logo=pypi)](https://pypi.org/project/aionis-sdk/)
[![GHCR](https://img.shields.io/badge/ghcr-ghcr.io%2Fcognary%2Faionis-2496ed?logo=docker&logoColor=white)](https://ghcr.io/cognary/aionis)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

**Aionis is a Memory Kernel for AI systems.**

Aionis combines durable memory, policy-aware execution, and replayable operations in one production-ready runtime.

## Five Core Differentiators

1. **Verifiable write chain**: every mutation is anchored by `commit_id` and `commit_uri` for audit and replay.
2. **URI-first object model**: nodes, edges, commits, and decisions are consistently referenceable across API, SDK, and ops tools.
3. **Layered context orchestration**: context is assembled with explicit layers (`facts/episodes/rules/decisions/tools/citations`) and budget controls.
4. **Memory -> Policy -> Action -> Replay loop**: memory can directly influence runtime decisions via governed policy routes.
5. **Production-grade evidence and gates**: release readiness is validated by reproducible checks, runbooks, and benchmark artifacts.

## What You Can Build

1. Persistent AI assistants with long-lived user memory.
2. Policy-controlled copilots with traceable tool decisions.
3. Multi-tenant agent platforms with strict scope isolation.
4. MCP / OpenWork / LangGraph memory integrations.

## 3-Minute Quickstart

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
make stack-up
curl -fsS http://localhost:3001/health
```

Minimal write + recall:

```bash
export BASE_URL="http://localhost:3001"

curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"Customer prefers email follow-up"}'

curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"preferred follow-up channel","limit":5}'
```

## SDKs

1. TypeScript: [`@aionis/sdk`](https://www.npmjs.com/package/@aionis/sdk)
2. Python: [`aionis-sdk`](https://pypi.org/project/aionis-sdk/)

TypeScript:

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  baseUrl: "https://api.your-domain.com",
  tenantId: "default",
  scope: "default",
  apiKey: process.env.AIONIS_API_KEY,
});

await client.write({ input_text: "Customer prefers email follow-up" });
const out = await client.recallText({ query_text: "preferred follow-up channel", limit: 5 });
console.log(out.request_id);
```

Python:

```python
from aionis_sdk import AionisClient

client = AionisClient(
    base_url="https://api.your-domain.com",
    tenant_id="default",
    scope="default",
    api_key="<your-api-key>",
)

client.write(input_text="Customer prefers email follow-up")
out = client.recall_text(query_text="preferred follow-up channel", limit=5)
print(out.get("request_id"))
```

## Core API Surface

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`
4. `POST /v1/memory/context/assemble`
5. `POST /v1/memory/rules/evaluate`
6. `POST /v1/memory/tools/select`
7. `POST /v1/memory/tools/decision`
8. `POST /v1/memory/tools/feedback`
9. `POST /v1/memory/resolve`

## Evidence and Reliability

Reproduce weekly strict evidence pack:

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

Run production gate:

```bash
npm run -s gate:core:prod -- --base-url "http://localhost:3001" --scope default
```

## Documentation

1. Docs Home: [doc.aionisos.com](https://doc.aionisos.com)
2. Overview: [Overview](https://doc.aionisos.com/public/en/overview/01-overview)
3. Get Started: [5-Minute Onboarding](https://doc.aionisos.com/public/en/getting-started/02-onboarding-5min)
4. Architecture: [Architecture](https://doc.aionisos.com/public/en/architecture/01-architecture)
5. Context: [Context Orchestration](https://doc.aionisos.com/public/en/context-orchestration/00-context-orchestration)
6. Policy Loop: [Policy and Execution Loop](https://doc.aionisos.com/public/en/policy-execution/00-policy-execution-loop)
7. Operate: [Operate and Production](https://doc.aionisos.com/public/en/operate-production/00-operate-production)
8. API: [API Reference](https://doc.aionisos.com/public/en/api-reference/00-api-reference)

## Distribution

1. Docker: `ghcr.io/cognary/aionis:latest`
2. Standalone Docker: `ghcr.io/cognary/aionis:standalone-latest`
3. npm SDK: `@aionis/sdk`
4. PyPI SDK: `aionis-sdk`

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
