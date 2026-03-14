---
layout: home
title: Aionis Docs
titleTemplate: false
description: Execution memory for agents that continue work instead of rediscovering it.

hero:
  name: "Aionis"
  text: "Execution memory for agents that continue work instead of rediscovering it."
  tagline: "Keep useful work alive across sessions, handoffs, replays, and review loops."
  actions:
    - theme: brand
      text: Understand The Problem
      link: /01-why-aionis/
    - theme: alt
      text: Get First Success
      link: /03-how-to-use-aionis/quickstart
    - theme: alt
      text: Inspect Verified API
      link: /04-reference-and-operations/verification-status

features:
  - title: Do not lose work
    details: Persist execution facts so the next session does not start by rereading the repo and rebuilding the task.
  - title: Multi-agent without chaos
    details: Move work between planner, executor, reviewer, and another runtime without relying on lossy summaries.
  - title: Human and agent in one loop
    details: Keep decision IDs, replay paths, and feedback surfaces inspectable when review matters.
  - title: Get better under guardrails
    details: Adapt through policy, replay, and feedback surfaces without pretending uncontrolled autonomy is the goal.
---

<div class="draft-strip">
  <div class="draft-chip">Memory under budget</div>
  <div class="draft-chip">Exact handoff recovery</div>
  <div class="draft-chip">Replayable execution</div>
  <div class="draft-chip">Inspectable policy loop</div>
</div>

<div class="proof-grid">
  <div class="proof-card">
    <span class="proof-kicker">Public proof</span>
    <h3>Lower repeated token spend on real continuation work</h3>
    <p>`30.03%` lower input tokens, `77%` lower output tokens, and `33.24%` lower total tokens are already disclosed in current public evidence.</p>
  </div>
  <div class="proof-card">
    <span class="proof-kicker">Boundary quality</span>
    <h3>Cross-runtime handoff recovered from `33.33%` to `100%`</h3>
    <p>The important point is not prettier prompts. The important point is preserving the execution contract when work crosses a runtime boundary.</p>
  </div>
  <div class="proof-card">
    <span class="proof-kicker">Replay</span>
    <h3>Strict replay can become a zero-model-token path</h3>
    <p>In the documented `pallets/click` disclosure, replay after compile ran at `0` model tokens in the disclosed strict mode.</p>
  </div>
</div>

<div class="doc-path-grid">
  <div class="doc-path-card">
    <span class="path-kicker">Layer 1</span>
    <h3>Why Aionis</h3>
    <p>Read the external case first: why boundary failure is common, why continuity matters, and why this is not one more memory plugin.</p>
    <a class="path-link" href="/01-why-aionis/">Go to Why Aionis</a>
  </div>
  <div class="doc-path-card">
    <span class="path-kicker">Layer 2</span>
    <h3>What Aionis Is</h3>
    <p>Understand the product through four capability lines: memory and context, handoff, replay, and policy.</p>
    <a class="path-link" href="/02-what-is-aionis/">Go to What Aionis Is</a>
  </div>
  <div class="doc-path-card">
    <span class="path-kicker">Layer 3</span>
    <h3>How To Use Aionis</h3>
    <p>Go from zero to first success with quickstart, the complete flow, and integration paths for Codex, MCP, and LangGraph.</p>
    <a class="path-link" href="/03-how-to-use-aionis/">Go to How To Use Aionis</a>
  </div>
</div>

<div class="conversion-grid">
  <div class="conversion-card">
    <span class="path-kicker">Start Now</span>
    <h3>For developers who are tired of rediscovery</h3>
    <p>If each new session starts by rereading the codebase, Aionis is already worth trying. The fastest proof is a short `write -> recall_text -> handoff` loop.</p>
    <a class="path-link" href="/03-how-to-use-aionis/quickstart">Start with Quickstart</a>
  </div>
  <div class="conversion-card">
    <span class="path-kicker">Start With Proof</span>
    <h3>For technical buyers who need evidence before architecture</h3>
    <p>If you need proof first, go straight to the public benchmark evidence and the verified endpoint surfaces. That is the shortest path from curiosity to conviction.</p>
    <a class="path-link" href="/04-reference-and-operations/verification-status">See Verification Status</a>
  </div>
</div>

## What Aionis Changes

Without Aionis, useful work often collapses into:

1. lost context
2. lossy summaries
3. duplicated reasoning
4. expensive retries

With Aionis, that work can survive as:

1. memory that can be recalled under budget
2. handoff that can be recovered exactly
3. replay that can reuse successful execution paths
4. policy that makes routing and adaptation inspectable

## Why New Readers Keep Going

The case should be simple enough to evaluate in under a minute:

1. agents fail at boundaries more often than teams admit
2. Aionis is built around those boundaries, not around one more chat wrapper
3. the repository already exposes memory, handoff, replay, and policy as real runtime surfaces
4. public benchmarks already show continuity, handoff, and replay evidence

## Public Proof

Current public evidence already supports the core value proposition:

1. `30.03%` lower input tokens, `77%` lower output tokens, and `33.24%` lower total tokens on real continuation work
2. cross-runtime handoff recovery improved from `33.33%` to `100%`
3. strict replay on `pallets/click` ran with `0` model tokens on `replay1` and `replay2`

## Why Trust This Site

This site is intentionally split by evidence level:

1. `live-verified` pages are backed by real requests run against Lite
2. `code-backed` pages are grounded in the current repository surface
3. public benchmark links are used when the claim depends on already disclosed evidence

That split is visible on purpose. It helps external readers judge adoption risk without guessing.

## Start In One Session

If you want to test whether Aionis is real instead of just well-positioned:

1. [Run Quickstart](./03-how-to-use-aionis/quickstart.md)
2. [See the Complete Flow](./03-how-to-use-aionis/complete-flow.md)
3. [Inspect the Endpoint Reference](./04-reference-and-operations/endpoints/index.md)

That path is short on purpose:

1. first prove a write and recall loop
2. then see handoff, policy, and replay in one flow
3. then inspect the actual API contract

## Who Should Try Aionis This Week

If you are building or operating agent systems, the best fit usually looks like one of these:

1. you already have a useful agent, but every new session rebuilds local understanding
2. you already have multiple agents, but handoff quality collapses under pressure
3. you already have human review, but it is disconnected from tool choice, replay, and repair

If none of those are true yet, Aionis may still be interesting, but it will feel less urgent.

## Choose Your Reading Path

If you are deciding whether Aionis matters:

1. [Why Aionis](./01-why-aionis/index.md)

If you want the product model before implementation details:

1. [What Aionis Is](./02-what-is-aionis/index.md)

If you want first success quickly:

1. [Quickstart](./03-how-to-use-aionis/quickstart.md)
2. [Complete Flow](./03-how-to-use-aionis/complete-flow.md)

If you need the deep surfaces:

1. [Reference And Operations](./04-reference-and-operations/index.md)
2. [Verification Status](./04-reference-and-operations/verification-status.md)

## Why This Is Not Just A Memory Plugin

A retrieval-only memory layer can help an agent remember text.

Aionis is trying to preserve execution continuity:

1. planner-facing context can be assembled under budget, not only recalled as raw text
2. handoff can be stored and recovered as a structured artifact
3. tool choice can create persisted decisions with `decision_id` and `decision_uri`
4. successful runs can be compiled into replayable playbooks

That difference matters because the real failure is usually not "the model forgot a sentence."

It is "the system lost the execution contract."

## Smart Objections First

### "Can I try this without changing my stack?"

Yes. The shortest path is Lite plus HTTP or SDK. The point is to test continuity first, not to rebuild your runtime around Aionis on day one.

### "Do I need a multi-agent setup before this is useful?"

No. Single-agent continuation is already enough to make the product value visible. Multi-agent chaos just makes the pain easier to see.

### "Is this too early to integrate?"

The right answer is narrower: some surfaces are already `live-verified`, and some are still `code-backed`. That is why this site exposes both the verification status and the exact endpoint reference.

## Proof Paths

If a reader wants evidence before architecture, send them here:

1. [Why Aionis](./01-why-aionis/index.md)
2. [Agent Handoff and Replay](https://doc.aionisos.com/public/en/benchmarks/07-agent-handoff-and-replay)
3. [Complete Flow](./03-how-to-use-aionis/complete-flow.md)

If a reader wants proof that the API is already shaped like a product surface, send them here:

1. [API Contract](./04-reference-and-operations/api-contract.md)
2. [Common Errors](./04-reference-and-operations/common-errors.md)
3. [Endpoint Reference](./04-reference-and-operations/endpoints/index.md)
