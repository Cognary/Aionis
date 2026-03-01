---
layout: home
title: "Aionis Docs"

hero:
  name: "Aionis"
  text: "Memory Infrastructure For Production Agents"
  tagline: "Verifiable writes, operable pipelines, and policy-aware recall. Build agent memory that is auditable, fast to integrate, and safe to run."
  actions:
    - theme: brand
      text: Start in 5 Minutes
      link: /ONBOARDING_5MIN
    - theme: alt
      text: Why Choose Aionis
      link: /index#why-teams-choose-aionis
    - theme: alt
      text: Benchmark Snapshot
      link: /index#benchmark-snapshot
    - theme: alt
      text: API Contract
      link: /API_CONTRACT

features:
  - title: Verifiable Memory Graph
    details: Durable `nodes + edges + commits` model with auditable lineage and replay-safe write history.
  - title: Operable By Default
    details: Preflight checks, consistency jobs, production gates, and runbooks built into the delivery flow.
  - title: Memory -> Policy
    details: Rules, tool selection, and feedback turn memory into executable behavior, not only retrieval text.
  - title: API + SDK Ready
    details: Stable API contract with TypeScript and Python SDKs for fast product integration.
  - title: Multi-tenant Scope Isolation
    details: Tenant and scope boundaries supported in API and operational diagnostics surfaces.
  - title: Ops Console
    details: Built-in internal dashboard, audit stream, and guarded control actions for operations teams.
---

## Why Teams Choose Aionis

1. Most memory products stop at retrieval. Aionis also gives you auditability and operational controls.
2. Write-path reliability is protected with derived-async architecture, so memory writes do not depend on embedding availability.
3. You get production evidence gates, not only feature endpoints.

## Product Entry Points

<div class="aionis-home-grid">
  <a class="aionis-home-card" href="/ONBOARDING_5MIN">
    <h3>Quickstart</h3>
    <p>Bring up DB + API + worker and run your first memory write/recall flow in minutes.</p>
    <span>Open 5-minute guide</span>
  </a>
  <a class="aionis-home-card" href="/API_CONTRACT">
    <h3>API Contract</h3>
    <p>Full endpoint and payload definitions for write, recall, policy, and admin control APIs.</p>
    <span>View API reference</span>
  </a>
  <a class="aionis-home-card" href="/SDK">
    <h3>SDKs</h3>
    <p>TypeScript and Python SDKs with capability negotiation and typed error handling.</p>
    <span>Read SDK guide</span>
  </a>
  <a class="aionis-home-card" href="/OPS_CONSOLE">
    <h3>Ops Console</h3>
    <p>Dashboard, audit stream, and guarded admin write actions for runtime operations.</p>
    <span>Explore ops docs</span>
  </a>
  <a class="aionis-home-card" href="/PRODUCTION_CORE_GATE">
    <h3>Production Gate</h3>
    <p>Blocking release gate covering integrity, contract, performance, and operability checks.</p>
    <span>Review go-live criteria</span>
  </a>
  <a class="aionis-home-card" href="/README">
    <h3>Full Docs Catalog</h3>
    <p>Browse all runbooks, plans, integration guides, and release materials.</p>
    <span>Open docs index</span>
  </a>
</div>

## Benchmark Snapshot

<div class="aionis-benchmark-grid">
  <article>
    <span>Scale</span>
    <strong>100k events</strong>
  </article>
  <article>
    <span>Recall p95</span>
    <strong>51.42 ms</strong>
  </article>
  <article>
    <span>Write p95</span>
    <strong>182.5 ms</strong>
  </article>
  <article>
    <span>Failure Rate</span>
    <strong>0%</strong>
  </article>
  <article>
    <span>SLO Result</span>
    <strong>pass</strong>
  </article>
</div>

Data source and methodology:

1. [Performance Baseline](./PERFORMANCE_BASELINE.md)
2. [Production Core Gate](./PRODUCTION_CORE_GATE.md)

## Integration + Distribution

1. npm SDK: [@aionis/sdk](https://www.npmjs.com/package/@aionis/sdk)
2. PyPI SDK: [aionis-sdk](https://pypi.org/project/aionis-sdk/)
3. Docker image: [ghcr.io/cognary/aionis](https://github.com/orgs/cognary/packages/container/package/aionis)
4. OpenWork integration: [OPENWORK_INTEGRATION](./OPENWORK_INTEGRATION.md)
5. LangGraph integration: [LANGGRAPH_INTEGRATION](./LANGGRAPH_INTEGRATION.md)

## Interactive Evidence Playground

<CompressionEstimator />

<RecallProfileExplorer />
