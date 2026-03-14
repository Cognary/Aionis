---
title: "What Aionis Is"
description: "Understand Aionis through four capability lines: memory and context, handoff, replay, and policy."
---

# What Aionis Is

Aionis is an execution memory layer for agent systems.

It sits between the agent runtime and the environment, so useful work can be:

1. remembered
2. handed off
3. replayed
4. governed

This is the product model. It is easier to understand through four lines of capability than through backend internals.

## 1. Memory And Context

Aionis stores durable execution memory and assembles bounded context for the next decision.

This covers:

1. write and recall
2. planning context
3. layered context assembly
4. budget-aware memory selection

This is where Aionis stops the next session from rereading everything.

## 2. Handoff

Aionis turns handoff from an informal note into a structured continuity artifact.

This covers:

1. exact handoff store and recover
2. prompt-safe and execution-ready views
3. cross-session and cross-runtime continuation

This is where Aionis helps multiple agents continue from the same execution facts.

## 3. Replay

Aionis turns successful execution into replayable playbooks.

This covers:

1. run capture
2. compile-from-run
3. strict replay
4. guided repair
5. playbook promotion

This is where reuse becomes a real execution path instead of a hope that retrieval will be enough.

## 4. Policy

Aionis makes action selection inspectable, enforceable, and reviewable.

This covers:

1. rules evaluate
2. tools select
3. decision provenance
4. feedback loop
5. governed promotion

This is where memory starts shaping behavior, not just prompts.

## Choose The Closest Pain First

If you are evaluating Aionis as a product, start with the line that matches your actual failure mode:

1. repeated rediscovery -> [Memory And Context](./memory-context)
2. lossy cross-session continuation -> [Handoff](./handoff)
3. expensive repeat execution -> [Replay](./replay)
4. uninspectable routing and adaptation -> [Policy](./policy)

Then follow it into implementation:

1. [Quickstart](../03-how-to-use-aionis/quickstart)
2. [Complete Flow](../03-how-to-use-aionis/complete-flow)

## Framework-Agnostic By Design

Aionis is not tied to a single orchestration framework.

You can integrate it through:

1. HTTP APIs
2. TypeScript and Python SDKs
3. MCP for coding-agent workflows
4. adapters and patterns for Codex and LangGraph

That matters because the failure mode Aionis solves is not framework-specific. Boundary failure happens everywhere.

## Why The Product Shape Matters

Many systems can store context. Fewer can preserve execution continuity across:

1. session boundaries
2. agent boundaries
3. runtime boundaries
4. review and governance boundaries

That is why Aionis is easier to understand as a product surface than as a backend subsystem. The value is not one endpoint. The value is that these boundaries stop breaking work.

## Product Editions

### Lite

Best for:

1. local single-user workflows
2. fastest evaluation path
3. Codex and MCP-based development loops

Lite keeps core memory, handoff, replay, and policy surfaces, but leaves admin/control and automations server-only.

### Server

Best for:

1. self-hosted production usage
2. team ownership
3. governance, admin/control, and automation surfaces

### Cloud

Cloud is the managed direction, not the public open-repo runtime surface.

It is best understood as:

1. managed operations
2. governance depth
3. hosted control-plane direction

Not as a fully public product that already ships from this repository.

## What A Reader Should Leave With

A reader should leave this layer with three concrete conclusions:

1. Aionis is broader than retrieval
2. the capability lines map to real operational pain
3. there is a short path from product understanding to first call

That is why every capability page points in two directions:

1. down to implementation
2. down again to deep reference

## Choose By Integration Risk

If your main concern is low-risk adoption:

1. start with [Memory And Context](./memory-context) if you want the smallest continuity upgrade
2. start with [Handoff](./handoff) if you need the fastest visible win across sessions or runtimes
3. start with [Policy](./policy) if operator trust is the blocker
4. start with [Replay](./replay) if cost and reuse are the blocker

That ordering matters because most teams should not try to absorb all four lines at once.

## What A Good Evaluation Looks Like

A good evaluation usually reaches three conclusions quickly:

1. the capability line matches a real pain in the current stack
2. the first call is easy enough to prove without a platform rewrite
3. the deeper reference is strong enough to support serious integration later

That is why this section hands the reader to both:

1. [How To Use Aionis](../03-how-to-use-aionis)
2. [Reference And Operations](../04-reference-and-operations)

## What To Read Next

1. [Memory And Context](./memory-context)
2. [Handoff](./handoff)
3. [Replay](./replay)
4. [Policy](./policy)
5. [Editions](./editions)
6. [Framework-Agnostic Positioning](./framework-agnostic)
7. [Reference And Operations](../04-reference-and-operations)
