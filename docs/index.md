---
layout: home
title: "Aionis Docs"

hero:
  name: "Aionis"
  text: "Memory Kernel for Production Agents"
  tagline: "Verifiable writes, policy-aware execution, and operable memory pipelines that move beyond retrieval-only memory."
  actions:
    - theme: brand
      text: Start in 5 Minutes
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
  - title: "Verifiable by Design"
    details: "Every write and decision path is replay-friendly with URI-addressable memory surfaces."
  - title: "Memory -> Policy -> Action"
    details: "Rules and feedback can influence execution behavior, not just augment prompt context."
  - title: "Operable in Production"
    details: "Runbooks, gates, diagnostics, and benchmark evidence are built into the operating model."
---

<div class="aionis-kpi-grid">
  <article>
    <span>Scale Snapshot</span>
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
    <span>Policy-loop Lift</span>
    <strong>0.50 -> 1.00</strong>
  </article>
</div>

## Why Teams Choose Aionis

<div class="aionis-signal-grid">
  <article class="aionis-signal-card">
    <h3>From Retrieval to Executable Memory</h3>
    <p>Aionis supports full-loop memory behavior: context assembly, rule evaluation, tool decision, execution feedback, and replay.</p>
  </article>
  <article class="aionis-signal-card">
    <h3>Reliability Under Real Workload</h3>
    <p>Derived processing stays async so critical writes do not fail just because embedding or enrichment providers fluctuate.</p>
  </article>
  <article class="aionis-signal-card">
    <h3>Governable for Enterprise Teams</h3>
    <p>Production gates, tenant isolation, and ops-facing runbooks make long-running memory systems manageable and auditable.</p>
  </article>
</div>

## Build and Launch Paths

<div class="aionis-home-grid">
  <a class="aionis-home-card" href="/public/en/getting-started/02-onboarding-5min">
    <h3>Start Fast</h3>
    <p>Bring up Aionis quickly with Docker and run your first write/recall flow.</p>
    <span>5-minute onboarding</span>
  </a>
  <a class="aionis-home-card" href="/public/en/guides/01-build-memory">
    <h3>Build Memory Workflows</h3>
    <p>Design session memory, context layers, and retrieval behavior for multi-turn agent systems.</p>
    <span>Build guide</span>
  </a>
  <a class="aionis-home-card" href="/public/en/operate-production/00-operate-production">
    <h3>Operate in Production</h3>
    <p>Use gates, health checks, and runbooks to keep memory services stable after launch.</p>
    <span>Production docs</span>
  </a>
</div>

## Explore by Capability

<div class="aionis-home-grid">
  <a class="aionis-home-card" href="/public/en/context-orchestration/00-context-orchestration">
    <h3>Context Orchestration</h3>
    <p>Assemble layered context across facts, episodes, rules, decisions, tools, and citations.</p>
    <span>Layer model and budgets</span>
  </a>
  <a class="aionis-home-card" href="/public/en/policy-execution/00-policy-execution-loop">
    <h3>Policy Execution Loop</h3>
    <p>Connect memory to governed behavior through evaluation, selection, run lifecycle, and feedback.</p>
    <span>Control behavior</span>
  </a>
  <a class="aionis-home-card" href="/public/en/reference/08-sandbox-api">
    <h3>Sandbox API (Experimental)</h3>
    <p>Run isolated execution paths with bounded budget and lifecycle-aware telemetry surfaces.</p>
    <span>Reference</span>
  </a>
  <a class="aionis-home-card" href="/public/en/benchmarks/02-benchmark-snapshot-public">
    <h3>Benchmark Snapshot</h3>
    <p>Review measurement scope, environment settings, metric definitions, and reproducibility paths.</p>
    <span>Evidence page</span>
  </a>
  <a class="aionis-home-card" href="/public/en/integrations/00-overview">
    <h3>Integrations</h3>
    <p>Connect Aionis with MCP, OpenWork, and LangGraph using production-aligned integration contracts.</p>
    <span>Ecosystem</span>
  </a>
  <a class="aionis-home-card" href="/public/en/api-reference/00-api-reference">
    <h3>API & SDK</h3>
    <p>Use typed API contracts and SDKs to integrate memory write, recall, policy, and ops workflows.</p>
    <span>Reference + SDK</span>
  </a>
</div>

## Recommended Reading Sequence

1. [Get Started](/public/en/getting-started/01-get-started)
2. [Core Concepts](/public/en/core-concepts/00-core-concepts)
3. [Architecture](/public/en/architecture/01-architecture)
4. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)
5. [Policy & Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
6. [Operate & Production](/public/en/operate-production/00-operate-production)
7. [Benchmarks](/public/en/benchmarks/01-benchmarks)
