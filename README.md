# Aionis

[![Docs](https://img.shields.io/badge/docs-doc.aionisos.com-0f172a?logo=readthedocs&logoColor=white)](https://doc.aionisos.com)
[![Core Production Gate](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml)
[![Docs Pages](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml)
[![npm](https://img.shields.io/npm/v/%40aionis%2Fsdk?logo=npm)](https://www.npmjs.com/package/@aionis/sdk)
[![PyPI](https://img.shields.io/pypi/v/aionis-sdk?logo=pypi)](https://pypi.org/project/aionis-sdk/)
[![GHCR](https://img.shields.io/badge/ghcr-ghcr.io%2Fcognary%2Faionis-2496ed?logo=docker&logoColor=white)](https://ghcr.io/cognary/aionis)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

## Replayable Execution Memory for Agents

Aionis is a memory kernel that records agent execution traces and compiles them into replayable workflows.

Instead of asking the model to reason through the same task repeatedly, Aionis allows agents to reuse successful executions.

---

## The Problem

Most memory systems store text:

- conversation history
- embeddings
- entity memory

But they do not remember how work gets done.

Agents still re-reason every task.

---

## The Aionis Approach

Aionis records execution history.

```text
Agent Run
↓
Execution Trace
↓
Compile Playbook
↓
Replay Execution
```

Once a workflow succeeds, it becomes reusable.

---

## Replay Model

Aionis implements a three-mode execution model:

| Mode | Description |
| --- | --- |
| `simulate` | audit-only validation |
| `strict` | deterministic execution |
| `guided` | execution with repair suggestions |

Replay focuses on actions, not LLM token streams.

---

## Governance First

Aionis follows an audit-first design:

```text
guided run
↓
repair suggestion
↓
human review
↓
shadow validation
↓
promotion
```

By default:

- repairs require review
- shadow validation runs first
- playbooks are not auto-promoted

---

## Automation Public Beta

Aionis now exposes a bounded automation layer above replay.

- sequential automation DAG execution
- repair approval and rejection controls
- explicit shadow validation before activation
- reverse-order compensation retry controls
- telemetry, alerting, and operator recovery surfaces

Automation remains a thin orchestrator, not a general-purpose workflow engine.

See the public Automation API docs for the current surface:

- English: `doc.aionisos.com/public/en/api-reference/01-automation-api-reference`
- 中文: `doc.aionisos.com/public/zh/api-reference/01-automation-api-reference`

---

## Benchmark

Real workflow benchmark (100 runs):

- Baseline success rate: `98%`
- Replay success rate: `98%`
- Replay stability: `98%`

Latency improvement:

- `9.21x` faster on `replay1`
- `19.29x` faster on `replay2`

---

## Comparison

| Capability | Memory Plugins | Aionis |
| --- | --- | --- |
| Conversation recall | ✓ | ✓ |
| Vector search | ✓ | ✓ |
| Execution trace | ✗ | ✓ |
| Workflow replay | ✗ | ✓ |
| Policy loop | ✗ | ✓ |
| Governed repair | ✗ | ✓ |

Most systems store information.

Aionis stores how work gets done.

---

## Architecture

```text
LLM
↓
Agent Planner
↓
Aionis Memory Kernel
↓
Tools / Environment
```

Aionis acts as the execution memory layer of the agent stack.

---

## In One Sentence

Aionis turns successful agent runs into governed, replayable workflows.

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
  -d '{
    "tenant_id":"default",
    "scope":"default",
    "input_text":"Customer prefers email follow-up",
    "memory_lane":"shared",
    "nodes":[{"type":"event","memory_lane":"shared","text_summary":"Customer prefers email follow-up"}]
  }'

curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"preferred follow-up channel","limit":5}'
```

## SDKs and Distribution

1. TypeScript SDK: [`@aionis/sdk`](https://www.npmjs.com/package/@aionis/sdk)
2. Python SDK: [`aionis-sdk`](https://pypi.org/project/aionis-sdk/)
3. Docker image: `ghcr.io/cognary/aionis:0.2.17`
4. Standalone image: `ghcr.io/cognary/aionis:standalone-v0.2.17`
5. Integration guides: [MCP / OpenWork / LangGraph / OpenClaw](https://doc.aionisos.com/public/en/integrations/00-overview)

TypeScript SDK example:

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: "https://api.your-domain.com",
  api_key: process.env.AIONIS_API_KEY,
});

await client.write({
  scope: "default",
  input_text: "Customer prefers email follow-up",
  memory_lane: "shared",
  nodes: [{ type: "event", memory_lane: "shared", text_summary: "Customer prefers email follow-up" }],
});
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

client.write({
    "scope": "default",
    "input_text": "Customer prefers email follow-up",
    "memory_lane": "shared",
    "nodes": [{"type": "event", "memory_lane": "shared", "text_summary": "Customer prefers email follow-up"}],
})
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
