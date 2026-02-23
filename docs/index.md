---
layout: home
title: "Aionis Docs"

hero:
  name: "Aionis"
  text: "Verifiable / Operable Memory Kernel"
  tagline: "Audit-first memory infrastructure for production agents. Source-of-record writes, async derived pipelines, and policy-driven recall."
  actions:
    - theme: brand
      text: Start in 5 Minutes
      link: /ONBOARDING_5MIN
    - theme: alt
      text: API Contract
      link: /API_CONTRACT
    - theme: alt
      text: Operator Runbook
      link: /OPERATOR_RUNBOOK

features:
  - title: Audit-first
    details: Every write is traceable by commit chain and source metadata, so memory behavior is replayable and reviewable.
  - title: Derived Async
    details: Embedding, clustering, and rollups are asynchronous derivatives. Core writes stay non-blocking under model failures.
  - title: Memory -> Policy
    details: Rules and feedback convert memory into executable behavior for planners, tool selectors, and governance gates.
---

## Platform Snapshot

- Open Core focus: single-tenant memory kernel with production-grade operability primitives.
- Release artifacts:
  - npm: [@aionis/sdk](https://www.npmjs.com/package/@aionis/sdk)
  - PyPI: [aionis-sdk](https://pypi.org/project/aionis-sdk/)
  - Docker: [ghcr.io/cognary/aionis](https://github.com/orgs/cognary/packages/container/package/aionis)
- Current release baseline:
  - Core: `v0.1.2` (latest tagged release)
  - TypeScript SDK: `0.1.5`
  - Python SDK: `0.1.5`
  - Docker main: `v0.1.9`
  - Standalone Docker line: `standalone-v0.1.9`
- Hosted/internal execution docs live in private repo:
  - [cognary/aionis-hosted](https://github.com/Cognary/aionis-hosted)

## Evidence Playground

<CompressionEstimator />

<RecallProfileExplorer />

## Canonical Narrative

1. Main narrative: `Verifiable / Operable Memory Kernel`.
2. Pillars: `Audit-first`, `Derived async`, `Memory -> Policy`.
3. Release storyline template: `Problem -> Architecture Principles -> Evidence -> Boundaries -> Next Step`.

Primary references:

- [Narrative Canon](./NARRATIVE_CANON.md)
- [Packaging Plan](./PACKAGING_PLAN.md)
- [Release Narrative Template](./RELEASE_NARRATIVE_TEMPLATE.md)
- [Technical Release Material](./RELEASE_MATERIAL_TECHNICAL.md)
- [Product Release Material](./RELEASE_MATERIAL_PRODUCT.md)
- [Business Release Material](./RELEASE_MATERIAL_BUSINESS.md)

## Evidence Gates

1. [Production Core Gate](./PRODUCTION_CORE_GATE.md)
2. [Performance Baseline](./PERFORMANCE_BASELINE.md)
3. [Recall Tail Latency Plan](./RECALL_TAIL_LATENCY_PLAN.md)
4. [Adaptive Compression Plan](./ADAPTIVE_COMPRESSION_PLAN.md)
5. [Operator Runbook](./OPERATOR_RUNBOOK.md)

## Role-Oriented Paths

- Application Engineer:
  - [5-Minute Onboarding](./ONBOARDING_5MIN.md)
  - [SDK Guide](./SDK.md)
  - [SDK Compatibility Matrix](./SDK_COMPATIBILITY_MATRIX.md)
- Platform / API Owner:
  - [API Contract](./API_CONTRACT.md)
  - [Planner Context](./PLANNER_CONTEXT.md)
  - [Rule Lifecycle](./RULE_LIFECYCLE.md)
- SRE / Operations:
  - [Operator Runbook](./OPERATOR_RUNBOOK.md)
  - [E2E Regression Checklist](./E2E_REGRESSION.md)
  - [Performance Baseline](./PERFORMANCE_BASELINE.md)
- Release Manager:
  - [SDK Release](./SDK_RELEASE.md)
  - [Docker Release](./DOCKER_RELEASE.md)

Full public catalog: [Docs Index](./README.md)
