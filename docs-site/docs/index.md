---
layout: doc
title: Aionis
description: Execution memory for agents that continue work instead of rediscovering it.
sidebar: false
aside: false
---

<div class="mint-header">
  <span class="status-pill stable">Lite Public Beta + Server Core</span>
  <p class="hero-kicker">Agents keep rediscovering the same work.</p>
  <h1>Aionis</h1>
  <p class="mint-subtitle">
    Aionis gives agents execution memory so the next session continues the work instead of starting from zero.
  </p>
  <p class="hero-support">
    In a real continuation test on <code>pallets/click</code>, Aionis reduced output tokens by <strong>77%</strong>
    and total tokens by <strong>33%</strong> by avoiding repeated rediscovery.
  </p>
  <div class="hero-highlights">
    <div class="hero-highlight">
      <span class="hero-highlight-label">Continue</span>
      <span class="hero-highlight-text">Resume work across sessions instead of rebuilding context.</span>
    </div>
    <div class="hero-highlight">
      <span class="hero-highlight-label">Recover</span>
      <span class="hero-highlight-text">Bring back exact handoffs, evidence, and replayable steps.</span>
    </div>
    <div class="hero-highlight">
      <span class="hero-highlight-label">Replay</span>
      <span class="hero-highlight-text">Reuse successful execution instead of rediscovering it every time.</span>
    </div>
  </div>
  <DragScroller>
    <div class="hero-flow" aria-hidden="true">
      <span>memory.write</span>
      <span>context.assemble</span>
      <span>policy.select</span>
      <span>decision.persist</span>
      <span>replay.run</span>
    </div>
  </DragScroller>
  <DragScroller>
    <div class="hero-meta">
      <span>request_id</span>
      <span>run_id</span>
      <span>decision_id</span>
      <span>commit_uri</span>
    </div>
  </DragScroller>
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
  <span>Core operating loop</span>
</div>
<AnimatedFlow />

## Why teams use Aionis

1. They are tired of agents re-reading the same repo and re-explaining the same reasoning.
2. They need durable execution memory instead of fragile prompt history.
3. They need replayable workflows for incidents, regressions, and reuse.
4. They need evidence and identifiers they can inspect later.

## Evidence at a glance

1. Real continuation test on `pallets/click`
2. Output tokens down **77%**
3. Total tokens down **33%**
4. Lite is already available as a public beta local path

Read [Evidence](/guide/evidence) for the public proof points behind those claims.

## Pick your path

<div class="home-cards">
  <a class="home-card" href="/guide/lite-public-beta">
    <div class="card-icon-panel">
      <IoFlash class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>Try Lite</h3>
      <p>Run Aionis locally with SQLite, validate the core workflow fast, and start with the lowest-friction path.</p>
    </div>
  </a>
  <a class="home-card" href="/guide/choose-lite-or-server">
    <div class="card-icon-panel">
      <IoGitCompare class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>Choose Lite or Server</h3>
      <p>Pick the right entrypoint for local evaluation, Codex workflows, or self-hosted production deployments.</p>
    </div>
  </a>
  <a class="home-card" href="/guide/overview">
    <div class="card-icon-panel">
      <IoJournalPage class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>Overview</h3>
      <p>Understand what Aionis is, why it exists, and when it should be part of your agent stack.</p>
    </div>
  </a>
  <a class="home-card" href="/guide/quickstart">
    <div class="card-icon-panel">
      <IoPlay class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>Quickstart</h3>
      <p>Get to a working write and recall flow fast, then keep the IDs required for later replay.</p>
    </div>
  </a>
  <a class="home-card" href="/guide/codex-local-profile">
    <div class="card-icon-panel">
      <IoTerminal class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>Use it with Codex</h3>
      <p>Run Codex with Aionis Lite or the tracked standalone profile and keep continuity across local coding sessions.</p>
    </div>
  </a>
  <a class="home-card" href="/guide/evidence">
    <div class="card-icon-panel">
      <IoStatsUpSquare class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>See the Evidence</h3>
      <p>Read the public proof points behind continuity, replay reuse, exact handoff recovery, and Lite public beta readiness.</p>
    </div>
  </a>
  <a class="home-card" href="/api/">
    <div class="card-icon-panel">
      <IoCodeBrackets class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>API Reference</h3>
      <p>Use the memory, policy, replay, and endpoint reference pages when wiring production contracts.</p>
    </div>
  </a>
  <a class="home-card" href="/guide/tutorials/">
    <div class="card-icon-panel">
      <IoOpenBook class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>Tutorials</h3>
      <p>Follow full, task-based walkthroughs for agent integration, replay, release gates, and policy tuning.</p>
    </div>
  </a>
  <a class="home-card" href="/operations/">
    <div class="card-icon-panel">
      <IoShieldCheck class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>Operations</h3>
      <p>Run go-live checks, monitoring, incident response, and repeatable runbooks for production traffic.</p>
    </div>
  </a>
  <a class="home-card" href="/reference/">
    <div class="card-icon-panel">
      <IoMultiplePages class="card-icon" width="22" height="22" stroke-width="1.7" />
    </div>
    <div class="card-body">
      <h3>Reference</h3>
      <p>Check configuration, security baseline, FAQ, changelog, and roadmap when standardizing your rollout.</p>
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
