# Aionis

[![Docs](https://img.shields.io/badge/docs-doc.aionisos.com-0f172a?logo=readthedocs&logoColor=white)](https://doc.aionisos.com)
[![Core Production Gate](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml)
[![Docs Pages](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml)
[![npm](https://img.shields.io/npm/v/%40aionis%2Fsdk?logo=npm)](https://www.npmjs.com/package/@aionis/sdk)
[![PyPI](https://img.shields.io/pypi/v/aionis-sdk?logo=pypi)](https://pypi.org/project/aionis-sdk/)
[![GHCR](https://img.shields.io/badge/ghcr-ghcr.io%2Fcognary%2Faionis-2496ed?logo=docker&logoColor=white)](https://ghcr.io/cognary/aionis)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

**Aionis is Memory Infrastructure for Production Agents.**

Aionis is a memory kernel focused on **verifiable writes**, **operable pipelines**, and **policy-aware recall**, turning memory from retrieval-only context into an executable loop:

`Memory -> Policy -> Action -> Replay`

## What Problem Aionis Solves

Most memory stacks stop at retrieval. In production, teams still face:

1. Memory that can be fetched but cannot be audited or replayed reliably.
2. Write paths coupled to embedding availability.
3. No controlled policy loop that changes runtime behavior.
4. Weak operations surface for long-running systems.

Aionis is built to solve these as a long-running system core.

## Six Core Differentiators

1. **Verifiable Write Chain**
   Every mutation is anchored by `commit_id` and `commit_uri` for audit and replay.

2. **URI-First Object Model**
   Nodes, edges, commits, and decisions are referenceable with stable URIs across API, SDK, and ops tools.

3. **Layered Context Orchestration**
   Context is assembled with explicit layers (`facts/episodes/rules/decisions/tools/citations`) and budget controls.

4. **Policy Loop + Replay Execution**
   Memory influences runtime decisions via `rules/evaluate`, `tools/select`, `tools/decision`, `tools/run`, and `tools/feedback`; replay execution is supported through `replay/run/*` and `replay/playbooks/*` for record, run, repair, and replayable automation.

5. **Production-Grade Evidence and Gates**
   Release readiness is validated with reproducible checks, runbooks, and benchmark artifacts.

6. **Sandbox Interface (Experimental)**
   A controlled execution API surface (`sandbox/sessions`, `sandbox/execute`, `sandbox/runs/*`) can be linked to policy-loop provenance.

Sandbox now includes:

1. remote executor hardening (`http_remote`) with host allowlist, DNS/IP egress controls, and optional mTLS
2. project-level budget overrides (`sandbox-project-budgets`) on top of tenant budgets
3. artifact bundle contract (`sandbox_run_artifact_v2`) with manifest/hash/object-store pointers

## Architecture Snapshot

Aionis uses a verifiable memory graph as the system-of-record, with write durability separated from derived async processing.

1. SoR model: graph objects + commit lineage.
2. Derived async: embeddings/topics/compression run asynchronously and do not block core writes.
3. Recall path: candidate retrieval -> bounded context assembly.
4. Policy path: evaluate -> select -> decision -> feedback.

## Security and Hard Contracts

1. Tenant isolation is explicit via `tenant_id + scope`.
2. Memory auth supports API key and bearer token modes.
3. Admin surfaces are separated and require admin token.
4. Sandbox remote execution supports explicit egress controls and optional mTLS for production isolation.
5. Public API contracts are documented and stable across SDKs.

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

## SDKs and Distribution

1. TypeScript SDK: [`@aionis/sdk`](https://www.npmjs.com/package/@aionis/sdk)
2. Python SDK: [`aionis-sdk`](https://pypi.org/project/aionis-sdk/)
3. Docker image: `ghcr.io/cognary/aionis:latest`
4. Standalone image: `ghcr.io/cognary/aionis:standalone-latest`
5. Integration guides: [MCP / OpenWork / LangGraph / OpenClaw](https://doc.aionisos.com/public/en/integrations/00-overview)

TypeScript SDK example:

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: "https://api.your-domain.com",
  api_key: process.env.AIONIS_API_KEY,
});

await client.write({ input_text: "Customer prefers email follow-up", scope: "default" });
const out = await client.recallText({ query_text: "preferred follow-up channel", limit: 5, scope: "default" });
console.log(out.request_id);
```

Python SDK example:

```python
from aionis_sdk import AionisClient

client = AionisClient(
    base_url="https://api.your-domain.com",
    api_key="<your-api-key>",
)

client.write({"scope": "default", "input_text": "Customer prefers email follow-up"})
out = client.recall_text({"scope": "default", "query_text": "preferred follow-up channel", "limit": 5})
print(out.get("request_id"))
```

## Trust Signals You Can Reproduce

Run weekly strict evidence:

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

Run production core gate:

```bash
npm run -s gate:core:prod -- --base-url "http://localhost:3001" --scope default
```

Replay-learning regression coverage:

```bash
# validate replay_learning_projection fatal vs retryable classification
npm run -s e2e:replay-learning-fault-smoke

# validate replay-learning episode archival by TTL and rule stabilization
npm run -s e2e:replay-learning-retention-smoke
```

Public benchmark snapshot and reproduction commands:

1. [Benchmark Snapshot (Public)](https://doc.aionisos.com/public/en/benchmarks/02-benchmark-snapshot-public)
2. [Differentiation Evidence](https://doc.aionisos.com/public/en/benchmarks/03-differentiation-evidence)
3. [Performance Baseline](https://doc.aionisos.com/public/en/benchmarks/05-performance-baseline)

## Recommended Reading Path

1. [Get Started](https://doc.aionisos.com/public/en/getting-started/01-get-started)
2. [Build Memory Workflows](https://doc.aionisos.com/public/en/guides/01-build-memory)
3. [Control and Policy](https://doc.aionisos.com/public/en/control/01-control-policy)
4. [Operate and Production](https://doc.aionisos.com/public/en/operate-production/00-operate-production)
5. [Integrations](https://doc.aionisos.com/public/en/integrations/00-overview)
6. [Reference](https://doc.aionisos.com/public/en/reference/01-reference)
7. [Benchmarks](https://doc.aionisos.com/public/en/benchmarks/01-benchmarks)

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
