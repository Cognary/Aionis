# Aionis

**Aionis is a Verifiable / Operable Memory Kernel for agents.**

Aionis gives your agents durable memory with real APIs, operational guardrails, and fast integration paths.

## Open Core Boundary

This repository is the Open Core public repo, and hosted capabilities are separated by an explicit boundary:

1. Public: kernel, API/SDK contracts, derived async baseline, rules baseline, runbooks/specs
2. Private: hosted control-plane implementation, billing/metering internals, enterprise IAM/compliance internals, managed ops internals

Boundary spec:

- [Open Core Boundary](docs/OPEN_CORE_BOUNDARY.md)

## Narrative Canon (Fixed)

1. Main narrative: `Verifiable / Operable Memory Kernel`
2. Pillars: `Audit-first`, `Derived async`, `Memory -> Policy`
3. Release template: `Problem -> Architecture Principles -> Evidence -> Boundaries -> Next Step`

Narrative docs:

- [Narrative Canon](docs/NARRATIVE_CANON.md)
- [Packaging Plan](docs/PACKAGING_PLAN.md)
- [OpenViking Borrow Plan](docs/OPENVIKING_BORROW_PLAN.md)
- [Release Narrative Template](docs/RELEASE_NARRATIVE_TEMPLATE.md)
- [Technical Release Material](docs/RELEASE_MATERIAL_TECHNICAL.md)
- [Product Release Material](docs/RELEASE_MATERIAL_PRODUCT.md)
- [Business Release Material](docs/RELEASE_MATERIAL_BUSINESS.md)

## Packaging and Narrative Operations

Aionis public packaging follows one repeatable structure:

1. `Problem`
2. `Architecture Principles`
3. `Evidence`
4. `Boundaries`
5. `Next Step`

Execution source:

- [Packaging Plan](docs/PACKAGING_PLAN.md)

## Why Aionis

Most agent memory demos stop at a vector store. Aionis is built for real workloads:

1. Structured memory graph (`nodes + edges + commits`)
2. Retrieval that returns **LLM-ready context text** (`/v1/memory/recall_text`)
3. Async embedding backfill + outbox worker (write path stays available)
4. Rule engine for planner/tool behavior (`rules/evaluate`, `tools/select`, `tools/feedback`)
5. Production checks (health gate, consistency checks, regression scripts)

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

1. Core (GitHub release tag): `v0.2.0` (latest tagged release)
2. TypeScript SDK (npm): `0.2.0`
3. Python SDK (PyPI): `0.2.0`
4. Docker main image tag line: `v0.2.0`
5. Docker standalone image tag line: `standalone-v0.2.0`
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

- [OpenWork Integration](docs/OPENWORK_INTEGRATION.md)
- [LangGraph Integration](docs/LANGGRAPH_INTEGRATION.md)

## Production Readiness

Use these before public traffic:

1. set `AIONIS_MODE=service` (or `AIONIS_MODE=cloud`)
2. configure auth credentials (`MEMORY_API_KEYS_JSON` and/or JWT secret depending on mode)
3. real embedding provider (`minimax` or `openai`)
4. set recall policy (`MEMORY_RECALL_PROFILE=strict_edges`) and optionally layer by tenant/endpoint via `MEMORY_RECALL_PROFILE_POLICY_JSON`
5. enable adaptive queue-pressure downgrade if needed (`MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED=true`)
6. use split-service topology for production; standalone image is local/demo only (see `Standalone to HA Runbook`)

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

Hosted operations and managed control-plane automation are intentionally not part of this Open Core repository.

## Documentation Hub

- [Aionis Onepage](docs/AIONIS_ONEPAGE.md)
- [Docs Index](docs/README.md)

## Public Website (Next.js)

`apps/www` is the public-facing marketing website (Next.js), while `docs/` remains VitePress docs.

```bash
npm run -s www:dev
npm run -s www:build
npm run -s www:start
```

## Ops Console (Next.js, internal)

`apps/ops` is an internal control/monitoring console over existing `admin/control` APIs, including an explicit write-actions page at `/actions`.

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
```

Optional dangerous-write gate (default safe):

```bash
OPS_DANGEROUS_ACTIONS_ENABLED=false
```

## Technical Reference (Previous README)

The previous long-form technical README is preserved here:

- [README_TECHNICAL.md](README_TECHNICAL.md)
