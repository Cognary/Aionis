---
layout: doc
title: Aionis
description: Execution memory for agents that continue work instead of rediscovering it.
sidebar: false
aside: false
---

<div class="landing-hero">
  <div class="landing-hero-copy">
    <span class="status-pill stable">Lite Public Beta + Server Core</span>
    <p class="hero-kicker">Agents keep rediscovering the same work.</p>
    <h1>Aionis gives agents execution memory.</h1>
    <p class="mint-subtitle">
      The next session resumes the work instead of rereading the repo, rebuilding the mental model, and re-explaining the same reasoning.
    </p>
    <p class="hero-support">
      Aionis is execution continuity for agents: durable memory, exact handoff recovery, replayable workflows, and inspectable evidence.
    </p>
    <div class="landing-cta-row">
      <a class="landing-cta primary" href="/guide/lite-public-beta">Try Lite in 5 minutes</a>
      <a class="landing-cta" href="/guide/choose-lite-or-server">Choose Lite or Server</a>
      <a class="landing-cta" href="/guide/codex-local-profile">Use with Codex</a>
    </div>
    <div class="landing-proof-strip">
      <span>Execution continuity</span>
      <span>Exact handoff recovery</span>
      <span>Replayable workflows</span>
      <span>Auditable evidence</span>
    </div>
  </div>
  <div class="landing-proof-panel">
    <div class="proof-card featured">
      <p class="proof-label">Real continuation test</p>
      <h2><code>pallets/click</code></h2>
      <p class="proof-summary">
        Aionis resumed a real repository task from stored execution memory instead of starting from zero.
      </p>
      <div class="proof-metrics">
        <div>
          <span class="metric-value">77%</span>
          <span class="metric-label">lower output tokens</span>
        </div>
        <div>
          <span class="metric-value">33%</span>
          <span class="metric-label">lower total tokens</span>
        </div>
      </div>
      <a class="proof-link" href="/guide/evidence">See the public evidence</a>
    </div>
    <div class="proof-card compact">
      <p class="proof-label">What changes</p>
      <ul class="proof-list">
        <li>Less rediscovery across sessions</li>
        <li>Less repeated prompt rebuilding</li>
        <li>More exact recovery of prior work</li>
        <li>More reusable execution paths</li>
      </ul>
    </div>
  </div>
</div>

<div class="home-section-lead">
  <span>Start here</span>
</div>
<ul class="mint-quick-nav">
  <li><a href="/guide/lite-public-beta">Try Lite in 5 minutes</a></li>
  <li><a href="/guide/choose-lite-or-server">Choose Lite or Server</a></li>
  <li><a href="/guide/evidence">See the evidence</a></li>
  <li><a href="/guide/codex-local-profile">Use it with Codex</a></li>
  <li><a href="/guide/overview">Understand why it works</a></li>
  <li><a href="/api/">Integrate the APIs</a></li>
</ul>

<div class="home-section-lead">
  <span>Why teams switch</span>
</div>
<div class="landing-value-grid">
  <div class="landing-value-card">
    <h3>Continue</h3>
    <p>New sessions resume work from stored execution state instead of rebuilding context from scratch.</p>
  </div>
  <div class="landing-value-card">
    <h3>Recover</h3>
    <p>Exact handoffs, evidence, and prior decisions can be brought back when continuity matters.</p>
  </div>
  <div class="landing-value-card">
    <h3>Replay</h3>
    <p>Successful runs can become reusable playbooks instead of one-off prompt history.</p>
  </div>
</div>

<div class="home-section-lead">
  <span>How it works</span>
</div>
<AnimatedFlow />

<div class="home-section-lead">
  <span>Evidence, not promises</span>
</div>
<div class="landing-evidence-grid">
  <a class="landing-evidence-card" href="/guide/evidence">
    <span class="evidence-tag">Continuity</span>
    <h3>Cross-session work continues instead of resetting</h3>
    <p>Public A/B runs already show the difference between restarting from prompt history and resuming from execution memory.</p>
  </a>
  <a class="landing-evidence-card" href="/guide/evidence">
    <span class="evidence-tag">Cost</span>
    <h3>Real token reduction on a larger open-source repo</h3>
    <p><code>pallets/click</code> showed 77% lower output tokens and 33% lower total tokens in continuation-sensitive work.</p>
  </a>
  <a class="landing-evidence-card" href="/guide/lite-public-beta">
    <span class="evidence-tag">Product</span>
    <h3>Lite is real, local, and usable now</h3>
    <p>Lite is not a concept demo. It is the fastest path to trying Aionis locally with a repeatable beta workflow.</p>
  </a>
</div>

## Pick your path

<div class="landing-path-grid">
  <a class="landing-path-card lite" href="/guide/lite-public-beta">
    <span class="path-pill">Fastest path</span>
    <h3>Start with Lite</h3>
    <p>Run Aionis locally with SQLite, validate continuity, replay, and handoff recovery, and get to first value quickly.</p>
    <strong>Best for local evaluation, single-user workflows, and Codex + MCP.</strong>
  </a>
  <a class="landing-path-card server" href="/guide/choose-lite-or-server">
    <span class="path-pill">Production path</span>
    <h3>Move to Server</h3>
    <p>Adopt the self-hosted production path when you need stronger deployment discipline, operations, and team-facing runtime behavior.</p>
    <strong>Best for self-hosted production and operational rollout.</strong>
  </a>
</div>

<div class="home-cards compact">
  <a class="home-card" href="/guide/overview">
    <div class="card-body">
      <h3>Overview</h3>
      <p>Understand what Aionis is, why it exists, and why it is more than token optimization.</p>
    </div>
  </a>
  <a class="home-card" href="/guide/quickstart">
    <div class="card-body">
      <h3>Quickstart</h3>
      <p>Get to a working write and recall flow fast, then keep the identifiers required for later replay.</p>
    </div>
  </a>
  <a class="home-card" href="/guide/codex-local-profile">
    <div class="card-body">
      <h3>Use it with Codex</h3>
      <p>Run Codex with Aionis Lite and keep continuity across local coding sessions.</p>
    </div>
  </a>
  <a class="home-card" href="/api/">
    <div class="card-body">
      <h3>API Reference</h3>
      <p>Use memory, policy, replay, and endpoint contracts when wiring production integrations.</p>
    </div>
  </a>
</div>

## What you can accomplish in the first hour

1. Start Lite locally and confirm `/health`.
2. Write one memory and recall it later.
3. Use Codex or MCP with a real Aionis-backed flow.
4. Keep the identifiers needed for replay and exact handoff recovery.
5. Decide whether to stay local with Lite or move to Server.

## Recommended first success path

1. Read [Choose Lite or Server](/guide/choose-lite-or-server).
2. Start with [Lite Public Beta](/guide/lite-public-beta) or [Quickstart](/guide/quickstart).
3. Use [Codex + Aionis](/guide/codex-local-profile) if your first use case is coding agents.
4. Use [API Guide](/guide/api-guide) and [API Reference](/api/) during integration.
5. Move to [Operations and Gates](/guide/operations-and-gates) when you need the Server production path.

## If you only read three pages

1. [Lite Public Beta](/guide/lite-public-beta) for the fastest way to try it.
2. [Choose Lite or Server](/guide/choose-lite-or-server) for the right product path.
3. [Overview](/guide/overview) for the product model.
