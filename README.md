# Aionis

**Aionis is a Verifiable / Operable Memory Kernel for agents.**

Aionis gives your agents durable memory with real APIs, operational guardrails, and fast integration paths.

## Key Features

1. Durable memory graph (`nodes + edges + commits`) with auditable commit lineage
2. LLM-ready retrieval API (`/v1/memory/recall_text`)
3. Async embedding pipeline (write path remains available under embedding pressure)
4. Feedback-driven policy loop (`rules/evaluate`, `tools/select`, `tools/feedback`)
5. Multi-tenant scope isolation (`tenant_id + scope`)
6. TypeScript/Python SDKs + Docker runtime
7. Production guardrails (preflight, consistency checks, regression/perf gates)

## Why Aionis

Most agent memory offerings stop at retrieval. Aionis is built for production workloads:

1. `Verifiable`: source-of-record write path + commit chain for audit/replay
2. `Operable`: explicit production preflight/gate workflow instead of best-effort scripts
3. `Memory -> Policy`: memory affects planner/tool behavior with traceable feedback loops

## Adaptive Policy Loop (What "Self-Learning" Means In Aionis)

Aionis does not claim unconstrained autonomous learning. It implements bounded, auditable adaptation:

1. Execution feedback is captured with `run_id` and `decision_id` linkage (`/v1/memory/tools/feedback`)
2. Active rules influence runtime tool decisions (`/v1/memory/tools/select`) with explainable source-rule traces
3. Rule lifecycle is controlled (`draft` / `shadow` / `active`), so policy changes are reviewable and governable
4. Weekly evidence gates verify signal quality, replayability, and governance posture before release

Primary references:

- [Differentiation Evidence](docs/DIFFERENTIATION_EVIDENCE.md)
- [Execution Loop Gate](docs/EXECUTION_LOOP_GATE.md)
- [Governance Weekly Report](docs/GOVERNANCE_WEEKLY_REPORT.md)
- [Policy Adaptation Gate](docs/POLICY_ADAPTATION_GATE.md)
- [Rule Lifecycle](docs/RULE_LIFECYCLE.md)

## Policy-Loop Benchmark Snapshot (XMB-006, 2026-03-01)

From weekly strict evidence pack (`artifacts/evidence/weekly/2026-W09_local_verify_04`):

| Metric | Retrieval-only baseline | Policy loop | Delta |
| --- | --- | --- | --- |
| Success rate | 0.50 | 1.00 | +0.50 |
| Selection switches | 19 | 0 | -19 |
| Feedback link coverage | n/a | 1.00 | +1.00 |
| Source rule coverage | n/a | 1.00 | +1.00 |

Reproduce in one command:

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

## Benchmark Snapshot (2026-03-01)

Latest production sign-off run (100k scale):

| Scale | Recall p95 | Recall p99 | Write p95 | Write p99 | Recall fail% | Write fail% | SLO |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100000 events | 51.42 ms | 61.16 ms | 182.5 ms | 240.2 ms | 0% | 0% | pass |

SLO baseline:

1. Recall p95 < `300ms`
2. Write p95 < `500ms`
3. Error rate <= `0%`

Reproduce:

```bash
npm run -s preflight:prod
PERF_PROFILE=perf_gate SCALES=100000 npm run perf:phase-d-matrix
```

Related docs:

- [Benchmark Snapshot (Public)](docs/BENCHMARK_SNAPSHOT_PUBLIC.md)
- [Performance Baseline](docs/PERFORMANCE_BASELINE.md)
- [Production Core Gate](docs/PRODUCTION_CORE_GATE.md)

## What You Can Ship

1. Personal AI assistant with persistent memory
2. Agent copilots with policy-aware tool selection
3. Team workflows with tenant/agent/team scoped memory
4. Memory-backed MCP / OpenWork / LangGraph integrations

## Token Compression (Evidence Layer)

Compression is included as an efficiency layer, not as the primary category claim.

Required KPI set:

1. `compression_ratio`
2. `items_retain_ratio`
3. `citations_retain_ratio`

References:

- [Adaptive Compression Plan](docs/ADAPTIVE_COMPRESSION_PLAN.md)
- [Performance Baseline](docs/PERFORMANCE_BASELINE.md)
- [Production Core Gate](docs/PRODUCTION_CORE_GATE.md)

## 3-Minute Demo

```bash
git clone https://github.com/Cognary/Aionis
cd Aionis
make quickstart
```

This brings up DB + API + worker and runs a deterministic value demo in an isolated scope.

Optional:

```bash
make value-dashboard
```

Legacy JSON snapshot (script output):

```bash
make value-dashboard-json
```

## Fast Start Paths

### A) Hosted API (fastest for builders)

1. Get `BASE_URL`
2. Get auth credential (`X-Api-Key` or JWT)
3. Install SDK and call `write -> recall_text`

Onboarding guide:

- [5-Minute Developer Onboarding](docs/ONBOARDING_5MIN.md)

### B) Self-host in minutes

```bash
cp .env.example .env
make stack-up
curl -fsS http://localhost:3001/health
```

### C) Standalone (single container, local-first)

`standalone` runs Postgres + migrations + API + worker in one container.
It is ideal for local agent use, demos, and CI smoke; do not treat it as production HA.

```bash
npm run -s docker:build:standalone
npm run -s docker:run:standalone
```

Optional local-lite mode (lower resource usage + tighter recall budgets):

```bash
cp .env.example .env
npm run -s env:throughput:lite
docker run --rm -it \
  -p 3001:3001 \
  --env-file .env \
  -v aionis-standalone-data:/var/lib/postgresql/data \
  aionis-standalone:local
```

Quick smoke:

```bash
npm run -s e2e:standalone-lite-smoke
```

Or run directly:

```bash
docker run --rm -it \
  -p 3001:3001 \
  -v aionis-standalone-data:/var/lib/postgresql/data \
  aionis-standalone:local
```

Or use published standalone image:

```bash
docker run --rm -it \
  -p 3001:3001 \
  -v aionis-standalone-data:/var/lib/postgresql/data \
  ghcr.io/cognary/aionis:standalone-latest
```

## Core API

1. `GET /health`
2. `POST /v1/memory/write`
3. `POST /v1/memory/sessions`
4. `POST /v1/memory/events`
5. `GET /v1/memory/sessions/:session_id/events`
6. `POST /v1/memory/packs/export`
7. `POST /v1/memory/packs/import`
8. `POST /v1/memory/find`
9. `POST /v1/memory/recall_text`
10. `POST /v1/memory/tools/decision`

Note: `POST /v1/memory/packs/export` and `POST /v1/memory/packs/import` are operator/admin endpoints and require `X-Admin-Token`.

Full contract:

- [API Contract](docs/API_CONTRACT.md)

## SDK & Runtime Distribution

1. TypeScript SDK: [`@aionis/sdk`](https://www.npmjs.com/package/@aionis/sdk)
2. Python SDK: [`aionis-sdk`](https://pypi.org/project/aionis-sdk/)
3. Docker image: `ghcr.io/cognary/aionis:latest`
4. Docker standalone image: `ghcr.io/cognary/aionis:standalone-latest`

## Current Release Baseline

1. Core (GitHub release tag): `v0.2.1` (latest tagged release)
2. TypeScript SDK (npm): `0.2.1`
3. Python SDK (PyPI): `0.2.1`
4. Docker main image tag line: `v0.2.1`
5. Docker standalone image tag line: `standalone-v0.2.1`
6. Docs site: `https://doc.aionisos.com/`

Release docs:

- [SDK Guide](docs/SDK.md)
- [SDK Release Runbook](docs/SDK_RELEASE.md)
- [Docker Release Runbook](docs/DOCKER_RELEASE.md)

## Integrations

1. OpenWork desktop flow
2. LangGraph adapter flow
3. MCP server mode

Docs:

- [MCP Integration](docs/MCP_INTEGRATION.md)
- [OpenWork Integration](docs/OPENWORK_INTEGRATION.md)
- [LangGraph Integration](docs/LANGGRAPH_INTEGRATION.md)

## Production Readiness

Use these before public traffic:

1. set `AIONIS_MODE=service` (or `AIONIS_MODE=cloud`)
2. configure auth credentials (`MEMORY_API_KEYS_JSON` and/or JWT secret depending on mode)
   - in `api_key_or_jwt` mode, either a valid API key or a valid JWT is accepted
3. real embedding provider (`minimax` or `openai`)
4. set recall policy (`MEMORY_RECALL_PROFILE=strict_edges`) and optionally layer by tenant/endpoint via `MEMORY_RECALL_PROFILE_POLICY_JSON`
5. enable adaptive queue-pressure downgrade if needed (`MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED=true`)
6. set route-scoped CORS allowlists (`CORS_ALLOW_ORIGINS` for memory POST routes, `CORS_ADMIN_ALLOW_ORIGINS` for admin routes if needed)
7. use split-service topology for production; standalone image is local/demo only (see `Standalone to HA Runbook`)

Operator docs:

- [Operator Runbook](docs/OPERATOR_RUNBOOK.md)
- [Standalone to HA Runbook](docs/STANDALONE_TO_HA_RUNBOOK.md)
- [HA Failure Drill Template](docs/HA_FAILURE_DRILL_TEMPLATE.md)
- [HA Failure Drill Sample](docs/HA_FAILURE_DRILL_SAMPLE.md)
- [Prod Go-Live Gate](docs/PROD_GO_LIVE_GATE.md)
- [Production Core Gate](docs/PRODUCTION_CORE_GATE.md)
- [E2E Regression](docs/E2E_REGRESSION.md)
- [Performance Baseline](docs/PERFORMANCE_BASELINE.md)
- [LongMemEval Gate](docs/LONGMEMEVAL_GATE.md)

## Documentation Hub

- [Aionis Onepage](docs/AIONIS_ONEPAGE.md)
- [Docs Index](docs/README.md)

## Ops Console (Next.js, internal)

`apps/ops` is an internal control/monitoring console over existing `admin/control` APIs, including an explicit write-actions page at `/actions`.

Docs:

- [Ops Console](docs/OPS_CONSOLE.md)

```bash
npm run -s ops:dev
npm run -s ops:build
npm run -s ops:start
```

Required env:

```bash
AIONIS_BASE_URL=http://127.0.0.1:3001
AIONIS_ADMIN_TOKEN=your-admin-token
```

Optional Ops access gate (Basic Auth):

```bash
OPS_BASIC_AUTH_ENABLED=true
OPS_BASIC_AUTH_USER=ops
OPS_BASIC_AUTH_PASS=change-me
```

Optional Ops IP allowlist gate:

```bash
OPS_IP_ALLOWLIST=127.0.0.1,::1,10.0.0.0/8
# Required in production when OPS_IP_ALLOWLIST is set (fail-closed):
OPS_TRUSTED_PROXY_CIDRS=10.0.0.0/8,192.168.0.0/16
```

Optional dangerous-write gate (default safe):

```bash
OPS_DANGEROUS_ACTIONS_ENABLED=false
```

## Technical Reference (Previous README)

The previous long-form technical README is preserved here:

- [README_TECHNICAL.md](README_TECHNICAL.md)
