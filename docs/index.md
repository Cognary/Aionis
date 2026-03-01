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
  - title: Feedback-Driven Adaptation
    details: 'A bounded "self-learning" loop: execution feedback updates governable rule behavior with audit traces.'
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

## Adaptive Policy Loop (Self-Learning, But Governed)

In Aionis, "self-learning" means feedback-driven policy adaptation under guardrails:

1. Decision path: `/v1/memory/tools/select` chooses tools based on active rules and context.
2. Feedback path: `/v1/memory/tools/feedback` links outcomes back to `run_id` and `decision_id`.
3. Governance path: execution-loop + weekly governance gates verify coverage, drift, and replayability before release.

Reference docs:

1. [Differentiation Evidence](./DIFFERENTIATION_EVIDENCE.md)
2. [Execution Loop Gate](./EXECUTION_LOOP_GATE.md)
3. [Governance Weekly Report](./GOVERNANCE_WEEKLY_REPORT.md)
4. [Policy Adaptation Gate](./POLICY_ADAPTATION_GATE.md)

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
  <a class="aionis-home-card" href="/DIFFERENTIATION_EVIDENCE">
    <h3>Differentiation Evidence</h3>
    <p>Run reproducible A/B proof for policy-loop value and collect governance/replay/audit evidence.</p>
    <span>Open evidence runbook</span>
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

Policy-loop benchmark snapshot (`XMB-006`, `2026-03-01`):

1. baseline success rate: `0.50`
2. policy-loop success rate: `1.00`
3. success gain: `+0.50`
4. selection switches: `19 -> 0`
5. feedback/source-rule coverage: `1.00 / 1.00`

Reproduce:

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

## Integration + Distribution

1. npm SDK: [@aionis/sdk](https://www.npmjs.com/package/@aionis/sdk)
2. PyPI SDK: [aionis-sdk](https://pypi.org/project/aionis-sdk/)
3. Docker image: [ghcr.io/cognary/aionis](https://github.com/orgs/cognary/packages/container/package/aionis)
4. MCP integration: [MCP_INTEGRATION](./MCP_INTEGRATION.md)
5. OpenWork integration: [OPENWORK_INTEGRATION](./OPENWORK_INTEGRATION.md)
6. LangGraph integration: [LANGGRAPH_INTEGRATION](./LANGGRAPH_INTEGRATION.md)

## Interactive Evidence Playground

<CompressionEstimator />

<RecallProfileExplorer />
