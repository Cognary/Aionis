# Aionis

[![Docs](https://img.shields.io/badge/docs-doc.aionisos.com-0f172a?logo=readthedocs&logoColor=white)](https://doc.aionisos.com)
[![Core Production Gate](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml)
[![Docs Pages](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml)
[![npm](https://img.shields.io/npm/v/%40aionis%2Fsdk?logo=npm)](https://www.npmjs.com/package/@aionis/sdk)
[![PyPI](https://img.shields.io/pypi/v/aionis-sdk?logo=pypi)](https://pypi.org/project/aionis-sdk/)
[![GHCR](https://img.shields.io/badge/ghcr-ghcr.io%2Fcognary%2Faionis-2496ed?logo=docker&logoColor=white)](https://ghcr.io/cognary/aionis)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

Aionis is a runtime for `execution memory`, `execution control`, and `execution continuity` for coding agents.

It helps coding agents:

1. `Execution Memory`: write, recall, context assembly, resolve, handoff store and recover
2. `Execution Control`: policy gating, tool selection, sandbox budgets, diagnostics, admin/control surfaces
3. `Execution Continuity`: replay, playbooks, structured handoff, repair and review flows, reviewer-ready completion

## Public Proof

Current public evidence supports these claims:

| Surface | Current public signal | Source |
| --- | --- | --- |
| Continuation on `pallets/click` | input tokens `30.03%` lower, output tokens `77%` lower, total tokens `33.24%` lower | [Aionis docs](https://doc.aionisos.com/public/en/benchmarks/13-aionis-evidence-overview) |
| Handoff | cross-runtime recovery improved from `33.33% -> 100%`; real repo handoff improved from `0% -> 100%` | [Aionis docs](https://doc.aionisos.com/public/en/benchmarks/13-aionis-evidence-overview) |
| Policy | real-repo policy A/B improved from `0% -> 100%`, with routing converging to `rg` and `pytest-focused` | [Aionis docs](https://doc.aionisos.com/public/en/benchmarks/13-aionis-evidence-overview) |
| Replay | strict replay on `pallets/click` ran with `0` model tokens on `replay1` and `replay2` | [Aionis docs](https://doc.aionisos.com/public/en/benchmarks/13-aionis-evidence-overview) |
| SDK coverage | on `2026-03-14`, a `65`-route audit found `no missing` public SDK surface in either TypeScript or Python | [SDK Guide](https://doc.aionisos.com/public/en/reference/05-sdk) |

## Real Coding-Agent Integration Evidence

The latest real adapter evidence lives in [Cognary/clawbot-aionis-adapter](https://github.com/Cognary/clawbot-aionis-adapter).

Latest public adapter evidence includes:

1. OpenClaw live-task A/B reduced average executed steps from `7.33 -> 3`
2. current semi-live token benchmark slices reduced average total tokens from `1893 -> 865.33`
3. realistic real-Lite workflow slices improved reviewer-ready rate from `0.6667 -> 1` and `0 -> 1`
4. execution continuity validation stayed positive across four real workflow shapes on the real Lite path

Use it when you want to see Aionis operating above the kernel level in a real coding-agent runtime.

## Install and Use

### Option 1: Try Lite locally

Fastest path for single-user local evaluation:

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
npm install
npm run -s env:bundle:local-safe
npm run build
npm run start:lite
```

Check health:

```bash
curl -fsS http://localhost:3001/health | jq
```

Minimal write + recall:

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"hello from lite","memory_lane":"shared","nodes":[{"type":"event","memory_lane":"shared","text_summary":"hello from lite"}]}' | jq

curl -sS http://localhost:3001/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"hello","limit":5}' | jq
```

### Option 2: Start Lite with the official CLI

Use the shared local bootstrap path from the published SDK package:

```bash
npx @aionis/sdk@0.2.20 dev
npx @aionis/sdk@0.2.20 health --base-url http://127.0.0.1:3321
```

Recommended for TypeScript, Python, Codex, MCP, and adapter workflows.

### Option 3: Install the TypeScript SDK

```bash
npm install @aionis/sdk@0.2.20
```

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: "http://127.0.0.1:3321",
});

const writeRes = await client.write({
  scope: "default",
  input_text: "Customer prefers email follow-up",
});

const recallRes = await client.recallText({
  scope: "default",
  query_text: "preferred follow-up channel",
});

console.log(writeRes.request_id, recallRes.request_id);
```

### Option 4: Install the Python SDK

```bash
pip install aionis-sdk==0.2.20
```

```python
from aionis_sdk import AionisClient

client = AionisClient(base_url="http://127.0.0.1:3321")

write_res = client.write({
    "scope": "default",
    "input_text": "Customer prefers email follow-up",
})

recall_res = client.recall_text({
    "scope": "default",
    "query_text": "preferred follow-up channel",
})

print(write_res.get("request_id"), recall_res.get("request_id"))
```

### Option 5: Run the self-hosted Server path

Use this for the self-hosted production baseline:

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
npm run -s env:bundle:local-safe
make stack-up
curl -fsS http://localhost:3001/health | jq
```

## Use Aionis with Coding Agents

Recommended entry points:

1. [Choose Lite vs Server](https://doc.aionisos.com/public/en/getting-started/07-choose-lite-vs-server)
2. [5-Minute Onboarding](https://doc.aionisos.com/public/en/getting-started/02-onboarding-5min)
3. [SDK Guide](https://doc.aionisos.com/public/en/reference/05-sdk)
4. [Python SDK + Aionis CLI](https://doc.aionisos.com/public/en/getting-started/08-python-sdk-with-cli)
5. [Integrations Overview](https://doc.aionisos.com/public/en/integrations/00-overview)
6. [clawbot-aionis-adapter](https://github.com/Cognary/clawbot-aionis-adapter)

## What Is In This Repository

This public repository includes:

1. Lite: local SQLite-backed runtime for single-user and beta workflows
2. Server: self-hosted open-core runtime for production-oriented deployment
3. public APIs for memory, context, policy, replay, sandbox, and automation
4. official TypeScript and Python SDKs
5. CLI, MCP, Playground, Ops app, docs site, and public benchmark evidence

Boundary:

1. hosted / managed control-plane direction is not fully represented in the public repo
2. some hosted operator workflows and managed surfaces remain outside the public open-core promise

## Start Here

1. [Docs](https://doc.aionisos.com)
2. [Get Started](https://doc.aionisos.com/public/en/getting-started/01-get-started)
3. [Choose Lite vs Server](https://doc.aionisos.com/public/en/getting-started/07-choose-lite-vs-server)
4. [API Reference](https://doc.aionisos.com/public/en/api-reference/00-api-reference)
5. [Aionis Evidence Overview](https://doc.aionisos.com/public/en/benchmarks/13-aionis-evidence-overview)
6. [Layer 1 Capability Matrix](https://doc.aionisos.com/public/en/benchmarks/14-layer1-capability-matrix)

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
