---
layout: doc
title: Aionis
description: Execution memory and replay infrastructure for production AI agents.
sidebar: false
aside: false
---

<div class="mint-header">
  <span class="status-pill stable">Production Docs</span>
  <p class="hero-kicker">Execution memory infrastructure for production AI agents</p>
  <h1>Aionis</h1>
  <p class="mint-subtitle">
    Aionis records what AI agents actually did and allows workflows to be replayed later.
  </p>
  <p class="hero-support">
    Use it when prompt traces and ad hoc logs are no longer enough to explain, debug,
    and reuse workflow behavior in production.
  </p>
  <div class="hero-highlights">
    <div class="hero-highlight">
      <span class="hero-highlight-label">Record</span>
      <span class="hero-highlight-text">Persist execution facts, decisions, and artifacts.</span>
    </div>
    <div class="hero-highlight">
      <span class="hero-highlight-label">Trace</span>
      <span class="hero-highlight-text">Link runs with request, decision, and commit identifiers.</span>
    </div>
    <div class="hero-highlight">
      <span class="hero-highlight-label">Replay</span>
      <span class="hero-highlight-text">Reconstruct workflows for incidents, regressions, and reuse.</span>
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
  <li><a href="/guide/overview">Understand the product</a></li>
  <li><a href="/guide/quickstart">Run the quickstart</a></li>
  <li><a href="/api/">Integrate the APIs</a></li>
  <li><a href="/operations/">Prepare for production</a></li>
</ul>

<div class="home-section-lead">
  <span>Core operating loop</span>
</div>
<AnimatedFlow />

## Why teams use Aionis

1. They need durable execution memory instead of fragile prompt history.
2. They need policy-aware tool selection with inspectable decisions.
3. They need replayable workflows for incidents, regressions, and release evidence.
4. They need stable identifiers such as `request_id`, `run_id`, `decision_id`, and `commit_uri`.

## Pick your path

<div class="home-cards">
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

1. Get a local or hosted environment responding to `/health`.
2. Write and recall a real memory event.
3. Run the policy flow with a stable `run_id`.
4. Keep the identifiers needed for replay and incident debugging.
5. Decide whether to continue through Guide, API, Tutorials, or Operations.

## Recommended first success path

1. Read [Overview](/guide/overview).
2. Run [Quickstart](/guide/quickstart).
3. Implement the flow in [Memory and Policy Loop](/guide/memory-policy-loop).
4. Use [API Guide](/guide/api-guide) and [API Reference](/api/) during integration.
5. Validate the rollout with [Operations and Gates](/guide/operations-and-gates).

## If you only read three pages

1. [Overview](/guide/overview) for the product model.
2. [Quickstart](/guide/quickstart) for the first working integration.
3. [Operations and Gates](/guide/operations-and-gates) for the production baseline.
