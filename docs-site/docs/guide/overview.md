---
title: Overview
description: Understand what Aionis is, why it exists, and when to use it in production AI systems.
---

<div class="doc-hero doc-hero-overview">
  <span class="status-pill stable">Product Overview</span>
  <h1>Overview</h1>
  <p class="doc-hero-subtitle">
    Aionis is execution memory and replay infrastructure for production AI agents.
    It records what agents actually did, preserves the IDs behind those decisions,
    and makes the workflow replayable later.
  </p>
  <div class="doc-hero-strip">
    <span>Memory graph</span>
    <span>Decision provenance</span>
    <span>Replay evidence</span>
  </div>
  <div class="doc-hero-panel">
    <div class="doc-hero-grid">
      <div class="doc-hero-chip active">memory.write</div>
      <div class="doc-hero-chip">context.assemble</div>
      <div class="doc-hero-chip accent">policy.select</div>
      <div class="doc-hero-chip">decision.persist</div>
    </div>
    <div class="doc-hero-meta">
      <span>request_id</span>
      <span>run_id</span>
      <span>decision_id</span>
      <span>commit_uri</span>
    </div>
  </div>
</div>

## What Aionis is

Aionis sits between your agent runtime and your operational controls. It stores execution memory as durable graph data, helps assemble context for later requests, applies policy before actions run, and preserves the identifiers required to replay the same workflow later.

## What makes it different

Aionis is not just a retrieval layer. It combines memory, policy, provenance, and replay in one operational model. That matters when teams need to answer questions like:

1. What did the agent actually do?
2. Why was this tool selected?
3. Which memory write influenced this decision?
4. Can we replay the same path after a fix or before a release?

## Why Aionis exists

Most memory systems stop at retrieval. Production systems need more than retrieval quality:

1. Traceability across requests, runs, decisions, and commits.
2. Policy control before tools and actions are executed.
3. Replay workflows for incidents, regressions, and release evidence.
4. Operational discipline for rollout and auditability.

## Key capabilities

1. Verifiable writes with `commit_id` and `commit_uri`.
2. Context assembly with explicit layers and budgets.
3. Policy-loop endpoints for evaluation, selection, decision, run, and feedback.
4. Decision provenance using `request_id`, `run_id`, `decision_id`, and `commit_uri`.
5. Replay and operational gates for production validation.

## Architecture overview

At a high level, Aionis exposes four developer-facing surfaces:

1. Memory APIs for write, recall, resolve, and context assembly.
2. Policy APIs for rule evaluation, tool selection, and feedback.
3. Replay APIs for reconstructing and rerunning historical execution.
4. Operational gates and evidence workflows for safe promotion.

The typical sequence is:

1. Your app writes execution memory.
2. Your runtime recalls or assembles context.
3. Policy is applied before action execution.
4. Decision and commit identifiers are persisted.
5. The same identifiers are reused later for debugging and replay.

## When to use Aionis

Use Aionis when you need one or more of these:

1. Agents that must remember prior actions across runs.
2. Tool selection or execution that must follow explicit rules.
3. Incident debugging that depends on reconstructing a run path.
4. Release workflows that require replay evidence before promotion.

## When not to use Aionis

You likely do not need Aionis if your system is:

1. A single-session prototype with no audit or debugging requirements.
2. A stateless demo where prompt history is enough.
3. A workflow where no one needs to trace why a tool was chosen.

## The minimum mental model

Think of Aionis as four connected layers:

1. Memory records what happened.
2. Context assembly prepares what the next step should see.
3. Policy constrains what actions are allowed or preferred.
4. Replay proves what happened and lets you verify it later.

## Recommended reading order

1. [Quickstart](quickstart)
2. [Core Concepts](core-concepts)
3. [Memory and Policy Loop](memory-policy-loop)
4. [API Guide](api-guide)
5. [Operations and Gates](operations-and-gates)

## Role-based reading paths

1. [Role-based Paths](role-based-paths)
2. [Tutorial: Integrate One Agent End-to-End](tutorials/agent-integration)
3. [Tutorial: Incident Replay for a Production Failure](tutorials/incident-replay)
4. [Tutorial: Release Gate with Replay Evidence](tutorials/release-gate)
5. [Tutorial: Policy Tuning with Closed-loop Feedback](tutorials/policy-tuning)
