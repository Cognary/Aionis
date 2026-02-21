# Aionis

**Aionis is a Verifiable / Operable Memory Kernel for agents.**

Aionis gives your agents durable memory with real APIs, operational guardrails, and fast integration paths.

## Narrative Canon (Fixed)

1. Main narrative: `Verifiable / Operable Memory Kernel`
2. Pillars: `Audit-first`, `Derived async`, `Memory -> Policy`
3. Release template: `Problem -> Architecture Principles -> Evidence -> Boundaries -> Next Step`

Narrative docs:

- [Narrative Canon](docs/NARRATIVE_CANON.md)
- [Commercial Strategy](docs/COMMERCIAL_STRATEGY.md)
- [Release Narrative Template](docs/RELEASE_NARRATIVE_TEMPLATE.md)
- [Technical Release Material](docs/RELEASE_MATERIAL_TECHNICAL.md)
- [Product Release Material](docs/RELEASE_MATERIAL_PRODUCT.md)
- [Business Release Material](docs/RELEASE_MATERIAL_BUSINESS.md)

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

## 3-Minute Demo

```bash
cd /Users/lucio/Desktop/Aionis
make quickstart
```

This brings up DB + API + worker and runs a deterministic value demo in an isolated scope.

Optional:

```bash
make value-dashboard
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
cd /Users/lucio/Desktop/Aionis
cp .env.example .env
make stack-up
curl -fsS http://localhost:3001/health
```

### C) Standalone (single container, local-first)

`standalone` runs Postgres + migrations + API + worker in one container.
It is ideal for local agent use, demos, and CI smoke; do not treat it as production HA.

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s docker:build:standalone
npm run -s docker:run:standalone
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
3. `POST /v1/memory/recall_text`

Full contract:

- [API Contract](docs/API_CONTRACT.md)

## SDK & Runtime Distribution

1. TypeScript SDK: [`@aionis/sdk`](https://www.npmjs.com/package/@aionis/sdk)
2. Python SDK: [`aionis-sdk`](https://pypi.org/project/aionis-sdk/)
3. Docker image: `ghcr.io/cognary/aionis:latest`
4. Docker standalone image: `ghcr.io/cognary/aionis:standalone-latest`

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

1. `APP_ENV=prod`
2. `MEMORY_AUTH_MODE=api_key` (or `jwt`)
3. `RATE_LIMIT_BYPASS_LOOPBACK=false`
4. real embedding provider (`minimax` or `openai`)
5. set recall policy (`MEMORY_RECALL_PROFILE=strict_edges`) and optionally layer by tenant/endpoint via `MEMORY_RECALL_PROFILE_POLICY_JSON`
6. enable adaptive queue-pressure downgrade if needed (`MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED=true`)

Operator docs:

- [Operator Runbook](docs/OPERATOR_RUNBOOK.md)
- [Hostedization Execution Plan](docs/HOSTEDIZATION_PLAN.md)
- [Hosted Tenant Packaging Matrix](docs/HOSTED_TENANT_PACKAGING_MATRIX.md)
- [Hosted Release Evidence Bundle Template](docs/HOSTED_RELEASE_EVIDENCE_BUNDLE_TEMPLATE.md)
- [Hosted Control Plane API (MVP)](docs/HOSTED_CONTROL_PLANE_API.md)
- [Hosted Operator Checklist](docs/HOSTED_OPERATOR_CHECKLIST.md)
- [Hosted Automation Runbook](docs/HOSTED_AUTOMATION_RUNBOOK.md)
- [E2E Regression](docs/E2E_REGRESSION.md)
- [Performance Baseline](docs/PERFORMANCE_BASELINE.md)
- [LongMemEval Gate](docs/LONGMEMEVAL_GATE.md)

Hosted preflight:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s preflight:hosted -- --run-gates
```

## Documentation Hub

- [Docs Index](docs/README.md)

## Technical Reference (Previous README)

The previous long-form technical README is preserved here:

- [README_TECHNICAL.md](README_TECHNICAL.md)
