---
layout: home
title: "Aionis Docs"

hero:
  name: "Aionis"
  text: "Memory Infrastructure for Production Agents"
  tagline: "Verifiable writes, operable pipelines, and policy-aware recall for executable agent memory."
  actions:
    - theme: brand
      text: 5-Minute Onboarding
      link: /public/en/getting-started/02-onboarding-5min
    - theme: alt
      text: API Reference
      link: /public/en/api-reference/00-api-reference
    - theme: alt
      text: Benchmark Snapshot
      link: /public/en/benchmarks/02-benchmark-snapshot-public
    - theme: alt
      text: GitHub
      link: https://github.com/Cognary/Aionis

features:
  - title: "Verifiable Writes"
    details: "Commit-backed lineage with URI-resolvable objects for audit and replay."
  - title: "Policy-Aware Execution"
    details: "Memory can influence tool selection and decision flows via governed policy routes."
  - title: "Layered Context"
    details: "Budgeted context orchestration across facts, episodes, rules, decisions, tools, and citations."
  - title: "Derived-Async Reliability"
    details: "Write durability is decoupled from derived embedding/topic/compression pipelines."
  - title: "Operable by Default"
    details: "Production gates, runbooks, diagnostics, and reproducible evidence workflows."
---

## Positioning

Aionis is a **memory kernel** for production agent systems. It emphasizes:

1. **Verifiable writes**
2. **Operable pipelines**
3. **Policy-aware recall**

This upgrades memory from retrieval augmentation to executable behavior:

`Memory -> Policy -> Action -> Replay`

## 1) Problem It Solves

Most AI memory stacks stop at retrieval:

1. Context is appended, but behavior control is weak.
2. Audit and replay surfaces are often missing.
3. Write-path reliability can be coupled to embedding-provider health.
4. Operations workflows for long-running systems are incomplete.

Aionis targets a long-running memory system core: traceable, replayable, governable, and operable.

## 2) Five Core Pillars

### A. Memory -> Policy -> Action

Aionis goes beyond recall with policy-loop endpoints:

1. `POST /v1/memory/tools/select`
2. `POST /v1/memory/tools/feedback`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`

Related:

1. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
2. [Control and Policy](/public/en/control/01-control-policy)

### B. Verifiable and Replayable

Aionis links nodes, edges, commits, and decisions into replay-friendly lineage.

1. Write lineage: `commit_id` / `commit_uri`
2. Execution lineage: `request_id` / `run_id` / `decision_id`

Related:

1. [Verifiable Memory Graph](/public/en/core-concepts/01-verifiable-memory-graph)
2. [URI Object Coverage](/public/en/reference/07-uri-expansion-plan)

### C. Derived-Async Write Reliability

Write success is durable even when derived pipelines (embedding/topic/compression) run asynchronously.

Related:

1. [Derived Artifacts](/public/en/core-concepts/02-derived-artifacts)
2. [Architecture](/public/en/architecture/01-architecture)

### D. Governed Adaptation

Feedback-driven adaptation is explicitly governed by lifecycle and gate checks, not black-box drift.

Related:

1. [Rule Lifecycle](/public/en/control/02-rule-lifecycle)
2. [Policy Adaptation Gate](/public/en/control/04-policy-adaptation-gate)

### E. Operable by Default

Production operation is built in via runbooks, gates, and diagnostics.

Related:

1. [Operate and Production](/public/en/operate-production/00-operate-production)
2. [Production Core Gate](/public/en/operations/03-production-core-gate)

## 3) Data Model and Architecture Snapshot

### 3.1 Verifiable Memory Graph (SoR)

Core system-of-record uses graph objects and commit lineage over Postgres + pgvector.

### 3.2 Layering and Derived Artifacts

1. Raw/evidence references
2. Normalized graph substrate
3. Derived artifacts with recomputable evolution

### 3.3 Recall Pipeline

1. Stage 1: fast candidate retrieval
2. Stage 2: bounded graph expansion and context assembly

### 3.4 Long-Running Jobs

1. Topic clustering
2. Compression/consolidation routines
3. Salience and consistency maintenance

Related:

1. [Architecture](/public/en/architecture/01-architecture)
2. [Architecture Deep Dive (Supplement)](/public/en/concepts/02-architecture)

## 4) Hard API Contract and Security Boundary

Aionis documents hard contracts for payload stability, bounded responses, and multi-tenant isolation.

1. Stable DTOs and typed errors
2. Bounded response channels
3. Isolation key: `(tenant_id, scope)`
4. Auth modes: API key / JWT / api_key_or_jwt

Related:

1. [API Contract](/public/en/api/01-api-contract)
2. [API Reference](/public/en/api-reference/00-api-reference)

## 5) Rules, Planner Context, and Tool Injection

Aionis recommends a stable planner-context shape for deterministic rule matching and portable tool routing.

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`

Related:

1. [Planner Context](/public/en/reference/02-planner-context)
2. [Rule Promotion Governance](/public/en/reference/03-rule-promotion-governance)

## 6) Quickstart and Distribution

1. Onboarding: [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
2. npm SDK: [`@aionis/sdk`](https://www.npmjs.com/package/@aionis/sdk)
3. PyPI SDK: [`aionis-sdk`](https://pypi.org/project/aionis-sdk/)
4. Docker: `ghcr.io/cognary/aionis`
5. Integrations: [MCP](/public/en/integrations/01-mcp) / [OpenWork](/public/en/integrations/02-openwork) / [LangGraph](/public/en/integrations/03-langgraph)

## 7) Ops and Release Gates

Aionis emphasizes production delivery workflows:

1. [Operator Runbook](/public/en/operations/02-operator-runbook)
2. [Production Core Gate](/public/en/operations/03-production-core-gate)
3. [Production Go-Live Gate](/public/en/operations/04-prod-go-live-gate)
4. [E2E Regression Checklist](/public/en/operations/05-e2e-regression)

## 8) Public Benchmark Snapshot

Current public snapshot (as documented on `2026-03-01`):

| Metric | Value |
| --- | --- |
| Scale | `100k events` |
| Recall p95 | `51.42 ms` |
| Write p95 | `182.5 ms` |
| Failure rate | `0%` |
| SLO | `pass` |

Policy-loop snapshot (`XMB-006`):

1. Success rate `0.50 -> 1.00`
2. Selection switches `19 -> 0`
3. Feedback/source-rule coverage `1.00 / 1.00`

Reproduce:

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

Related:

1. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
2. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)

## 9) What You Can Ship

1. Auditable and production-safe agent memory systems
2. Retrieval + policy-driven behavior control
3. Multi-tenant memory platforms with replayable operations
4. Reliability-oriented systems where write path remains stable under derived async pressure

## 10) Recommended Reading Path

1. [Get Started](/public/en/getting-started/01-get-started)
2. [Build Memory Workflows](/public/en/guides/01-build-memory)
3. [Control and Policy](/public/en/control/01-control-policy)
4. [Operate](/public/en/operations/00-operate)
5. [Integrations](/public/en/integrations/00-overview)
6. [Reference](/public/en/reference/01-reference)
7. [Benchmarks](/public/en/benchmarks/01-benchmarks)
