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
  <div class="landing-proof-panel signal-stack">
    <div class="proof-card featured signal-card signal-card-metric">
      <div class="signal-card-topline">
        <span class="proof-label">Real continuation test</span>
        <span class="signal-pill">Open source</span>
      </div>
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
    <div class="signal-card-row">
      <div class="proof-card compact signal-card">
        <p class="proof-label">What resumes</p>
        <p class="signal-copy">
          Prior handoffs, replayable run state, decisions, and evidence come back without rereading the whole repo.
        </p>
      </div>
      <div class="proof-card compact signal-card">
        <p class="proof-label">What becomes reusable</p>
        <p class="signal-copy">
          Successful work can become playbooks, exact handoffs, and inspectable traces instead of throwaway prompt history.
        </p>
      </div>
    </div>
  </div>
</div>

<div class="home-section-lead">
  <span>Start here</span>
</div>
<div class="landing-path-grid landing-path-grid-3">
  <a class="landing-path-card lite" href="/guide/lite-public-beta">
    <span class="path-pill">Fastest path</span>
    <h3>Start with Lite</h3>
    <p>Run Aionis locally with SQLite, validate continuity, replay, and exact handoff recovery, and get to first value quickly.</p>
    <strong>Best for local evaluation, single-user workflows, and low-friction trials.</strong>
  </a>
  <a class="landing-path-card codex" href="/guide/codex-local-profile">
    <span class="path-pill">Best integration path</span>
    <h3>Use it with Codex</h3>
    <p>Connect Aionis to coding-agent workflows so new sessions can recover context instead of rebuilding it from scratch.</p>
    <strong>Best for local coding agents, MCP, and continuity-sensitive handoffs.</strong>
  </a>
  <a class="landing-path-card server" href="/guide/choose-lite-or-server">
    <span class="path-pill">Production path</span>
    <h3>Move to Server</h3>
    <p>Adopt the self-hosted production path when you need stronger deployment discipline, operator workflows, and team-facing runtime behavior.</p>
    <strong>Best for self-hosted production and operational rollout.</strong>
  </a>
</div>

<div class="home-section-lead">
  <span>What changes when agents stop restarting</span>
</div>
<div class="landing-bento-grid">
  <div class="landing-bento-card large">
    <div class="bento-icon"><IoPlay /></div>
    <h3>Continue work instead of reconstructing it</h3>
    <p>New sessions can resume from stored execution state, exact handoffs, and replay traces instead of rereading the repo and rebuilding the patch plan.</p>
  </div>
  <div class="landing-bento-card">
    <div class="bento-icon"><IoJournalPage /></div>
    <h3>Recover exact handoffs</h3>
    <p>Bring back the prior task summary, exact handoff text, risk notes, and acceptance checks when continuity matters.</p>
  </div>
  <div class="landing-bento-card">
    <div class="bento-icon"><IoCodeBrackets /></div>
    <h3>Turn successful work into replayable paths</h3>
    <p>Replay and playbooks turn one-off agent runs into reusable workflows instead of throwaway prompt history.</p>
  </div>
  <div class="landing-bento-card accent">
    <div class="bento-icon"><IoShieldCheck /></div>
    <h3>Keep runtime evidence inspectable</h3>
    <p>Decision IDs, commit URIs, replay runs, and handoff artifacts make the work auditable instead of opaque.</p>
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

<div class="home-section-lead">
  <span>Browse the docs</span>
</div>
<div class="doc-map-grid">
  <a class="doc-map-card" href="/guide/overview">
    <div class="doc-map-icon"><IoOpenBook /></div>
    <h3>Understand the model</h3>
    <p>Read the product model, the core concepts, and why Aionis is more than token optimization.</p>
  </a>
  <a class="doc-map-card" href="/guide/quickstart">
    <div class="doc-map-icon"><IoPlay /></div>
    <h3>Get to first value fast</h3>
    <p>Start Lite, write memory, recall it later, and validate exact handoff recovery and replay identifiers.</p>
  </a>
  <a class="doc-map-card" href="/guide/codex-local-profile">
    <div class="doc-map-icon"><IoCodeBrackets /></div>
    <h3>Integrate with coding agents</h3>
    <p>Use Codex, MCP, and SDK flows when your first use case is local coding agents and continuity-sensitive work.</p>
  </a>
  <a class="doc-map-card" href="/api/">
    <div class="doc-map-icon"><IoMultiplePages /></div>
    <h3>Wire the APIs</h3>
    <p>Move from guide-level understanding to memory, policy, replay, and endpoint contracts for real integrations.</p>
  </a>
</div>
