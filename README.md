# Aionis

[![Docs](https://img.shields.io/badge/docs-doc.aionisos.com-0f172a?logo=readthedocs&logoColor=white)](https://doc.aionisos.com)
[![Core Production Gate](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/core-production-gate.yml)
[![Docs Pages](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/Cognary/Aionis/actions/workflows/docs-pages.yml)
[![npm](https://img.shields.io/npm/v/%40aionis%2Fsdk?logo=npm)](https://www.npmjs.com/package/@aionis/sdk)
[![PyPI](https://img.shields.io/pypi/v/aionis-sdk?logo=pypi)](https://pypi.org/project/aionis-sdk/)
[![GHCR](https://img.shields.io/badge/ghcr-ghcr.io%2Fcognary%2Faionis-2496ed?logo=docker&logoColor=white)](https://ghcr.io/cognary/aionis)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

## Stop Making Agents Rediscover the Same Work

Aionis is execution memory for coding agents.

New session.  
Read the repo again.  
Rebuild the mental model.  
Explain the reasoning again.  

Thousands of tokens burned just to get back to the last useful state.

**Aionis lets the next session continue the work instead of rediscovering it.**

**Real continuation test on `pallets/click` (open source):**

1. input tokens down **30.03%**
2. output tokens down **77%**
3. total tokens down **33.24%**

That is the product: less rediscovery, more continuation.

**New public handoff and replay evidence:**

1. cross-runtime handoff recovery: `33.33% -> 100%` success (`file_export` baseline vs `aionis_handoff`)
2. real-repo strict replay on `pallets/click`: `replay1` and `replay2` both ran at **0 model tokens**
3. guided replay repair smoke: model tokens are spent only when repair is invoked (`1063` total tokens in the documented DeepSeek smoke)
4. real-repo policy A/B on `pallets/click`: `0% -> 100%` success while tool routing converged from `grep` / `pytest-all` to `rg` / `pytest-focused`

[Start in 5 Minutes](./docs/public/en/getting-started/02-onboarding-5min.md) · [Choose Lite or Server](./docs/public/en/getting-started/07-choose-lite-vs-server.md) · [Docs](https://doc.aionisos.com) · [Lite Public Beta](./docs/public/en/getting-started/05-lite-public-beta-boundary.md)

---

## What Aionis Adds

Aionis is not a prompt cache and not a memory plugin with better branding.

It turns execution into reusable runtime assets:

1. execution memory
2. bounded context assembly
3. replayable playbooks
4. governed repair and review
5. operator-facing evidence and control surfaces

```text
Memory Write
↓
Context Assembly
↓
Replayable Execution
↓
Governed Repair / Review
```

---

## Why It Is More Than Token Savings

Token savings matter, but they are not the core idea.

The real value is that Aionis changes what survives between sessions:

1. **execution history becomes reusable state**, not lost chat context
2. **handoffs become recoverable artifacts**, not free-text notes buried in logs
3. **successful runs become replayable playbooks**, not one-off wins
4. **runtime decisions become auditable evidence**, not hidden chain-of-thought

That is why Aionis can reduce cost without being "just a cost optimizer".

It helps agents resume work, recover exact handoff, reuse execution, and keep a reviewable trail of how the result was produced.

---

## Product Paths

### Lite

Use Lite if you want:

1. local single-user runtime
2. SQLite-backed memory, replay, and context workflows
3. the fastest path to evaluate Aionis without Docker + Postgres

Lite is the fastest way to try Aionis today. It runs locally, uses SQLite, and is currently in controlled public beta.

### Server

Use Server if you want:

1. self-hosted production runtime
2. team and operational ownership
3. full open-core memory, replay, policy, and integration surfaces

### Cloud

Cloud is the managed direction for:

1. hosted control-plane
2. tenant governance
3. operator-facing managed workflows

Cloud is not part of the public open repository surface.

## Why It Reduces Agent Cost

Aionis does not magically compress the model. It removes repeated work around the model.

It reduces:

1. repeated reasoning on tasks that already have successful execution history
2. context inflation through explicit budgeted recall and layered context assembly
3. rework between sessions by restoring structured execution handoff

Recent larger-project A/B evidence in this repository showed:

1. about `30.03%` lower input tokens
2. about `77%` lower output tokens
3. about `33.24%` lower total tokens

for cross-session task continuation with Aionis-backed recovery.

That is a result of better continuity, not the whole product thesis.

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

## Proof, Not Only Positioning

The repository now contains reproducible product evidence for:

1. cross-session continuity
2. replay and playbook reuse
3. Lite runtime viability
4. token and context cost reduction

Recommended evidence pages:

1. [Benchmark Snapshot](https://doc.aionisos.com/public/en/benchmarks/02-benchmark-snapshot-public)
2. [Differentiation Evidence](https://doc.aionisos.com/public/en/benchmarks/03-differentiation-evidence)
3. [Performance Baseline](https://doc.aionisos.com/public/en/benchmarks/05-performance-baseline)
4. [Agent Handoff and Replay](https://doc.aionisos.com/public/en/benchmarks/07-agent-handoff-and-replay)
5. [Real GitHub Repo Policy A/B](https://doc.aionisos.com/public/en/benchmarks/11-real-repo-policy-ab)

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
| Runtime governance | ✗ | ✓ |

Most systems store information.

Aionis stores how work gets done, how it can be resumed, and how it can be reused.

---

## Architecture

```text
Agent / Planner
↓
Aionis Runtime Kernel
├─ Memory
├─ Context Assembly
├─ Replay / Reuse
├─ Governance
└─ Automation / Sandbox
↓
Tools / Environment
```

Aionis is a memory-centered runtime kernel inside the agent stack.

---

## In One Sentence

Aionis turns successful agent work into replayable, governable, evidence-backed runtime assets.

## Start Fast

Choose one path:

1. **Lite** for local beta evaluation
2. **Server** for self-hosted runtime setup

Product path guide:

1. [Choose Lite vs Server](https://doc.aionisos.com/public/en/getting-started/07-choose-lite-vs-server)
2. [5-Minute Onboarding](https://doc.aionisos.com/public/en/getting-started/02-onboarding-5min)

## Server Quickstart

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

## Lite Quickstart

For a single-user local runtime without Docker or external Postgres:

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
npm install
npm run build
npm run start:lite
```

Before treating Lite as anything beyond a local beta path:

- English: `doc.aionisos.com/public/en/getting-started/05-lite-public-beta-boundary`
- 中文: `doc.aionisos.com/public/zh/getting-started/05-lite-public-beta-boundary`

In another shell:

```bash
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend,lite_write_store,lite_recall_store}'
```

Expected Lite health shape:

- `aionis_edition = "lite"`
- `memory_store_backend = "lite_sqlite"`
- `lite_write_store` and `lite_recall_store` present

Current Lite intentionally keeps some outer surfaces server-only:

- `/v1/admin/control/*`
- `/v1/automations/*`

Those routes return stable `501 server_only_in_lite`.

Operator notes and troubleshooting:

- [Lite Operator Notes](https://doc.aionisos.com/public/en/getting-started/04-lite-operator-notes)
- [Lite Public Beta Boundary](https://doc.aionisos.com/public/en/getting-started/05-lite-public-beta-boundary)
- [Lite Troubleshooting and Feedback](https://doc.aionisos.com/public/en/getting-started/06-lite-troubleshooting-and-feedback)

If you try Lite beta, please:

1. run `npm run -s lite:dogfood`
2. if anything feels wrong, open a `Lite Beta Feedback` issue:
   [github.com/Cognary/Aionis/issues/new?template=lite-beta-feedback.yml](https://github.com/Cognary/Aionis/issues/new?template=lite-beta-feedback.yml)
3. if it works, successful-run feedback is still useful

## Integrations and Distribution

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

1. [Choose Lite vs Server](https://doc.aionisos.com/public/en/getting-started/07-choose-lite-vs-server)
2. [Get Started](https://doc.aionisos.com/public/en/getting-started/01-get-started)
3. [Build Memory Workflows](https://doc.aionisos.com/public/en/guides/01-build-memory)
4. [Integrations](https://doc.aionisos.com/public/en/integrations/00-overview)
5. [Operate and Production](https://doc.aionisos.com/public/en/operate-production/00-operate-production)
6. [Reference](https://doc.aionisos.com/public/en/reference/01-reference)
7. [Benchmarks](https://doc.aionisos.com/public/en/benchmarks/01-benchmarks)

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
