# Aionis

**Production-first memory infrastructure for AI agents.**

Aionis gives your agents durable memory with real APIs, operational guardrails, and fast integration paths.

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

Operator docs:

- [Operator Runbook](docs/OPERATOR_RUNBOOK.md)
- [E2E Regression](docs/E2E_REGRESSION.md)
- [Performance Baseline](docs/PERFORMANCE_BASELINE.md)

## Documentation Hub

- [Docs Index](docs/README.md)

## Technical Reference (Previous README)

The previous long-form technical README is preserved here:

- [README_TECHNICAL.md](README_TECHNICAL.md)
