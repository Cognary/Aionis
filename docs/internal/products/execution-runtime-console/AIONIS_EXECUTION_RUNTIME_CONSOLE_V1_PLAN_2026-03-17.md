---
title: "Aionis Execution Runtime Console V1 Plan"
---

# Aionis Execution Runtime Console V1 Plan

Date: `2026-03-17`  
Status: `proposed executable product plan`

Related:

1. [Runtime Architecture](../../architecture/AIONIS_RUNTIME_ARCHITECTURE_2026-03-17.md)
2. [Four Pillars Code Map](../../architecture/AIONIS_FOUR_PILLARS_CODE_MAP_2026-03-17.md)
3. [Self-Learning Mechanism](../../architecture/AIONIS_SELF_LEARNING_MECHANISM_2026-03-17.md)
4. [Ideal Customer Profile](../../strategy/AIONIS_IDEAL_CUSTOMER_PROFILE_2026-03-17.md)
5. [Execution Eval Plan](../../plans/AIONIS_EXECUTION_EVAL_PLAN_2026-03-17.md)
6. [Stage Closeout and GTM Plan](../../strategy/AIONIS_STAGE_CLOSEOUT_AND_GTM_PLAN_2026-03-16.md)

## Executive Summary

The first product built on top of Aionis should not be a generic workflow runtime platform.

That would be too broad, too early, and too likely to collapse back into generic orchestration positioning.

The correct first product is:

**Aionis Execution Runtime Console for Coding Agents**

The core job of this product is:

1. make agent execution visible
2. make successful and failed runs reproducible
3. make execution quality evaluable and gateable

This means the product should lead with:

1. run visualization
2. replay and recovery inspection
3. execution evaluation and regression gating

This product should not initially lead with:

1. generic DAG building
2. low-code workflow authoring
3. universal agent orchestration
4. tool-routing intelligence as the main story

## Product Definition

The product definition for v1 is:

**A console for inspecting, replaying, and evaluating coding-agent runs backed by the Aionis runtime.**

In practical terms, users should be able to:

1. see what happened during a run
2. understand where a run diverged, degraded, or recovered
3. replay or inspect a prior execution path
4. compare baseline vs treatment behavior
5. decide whether the run is good enough to pass

The product is not “the runtime itself”.

It is the product surface sitting on top of the runtime.

## Why This Is The Right First Product

This direction matches what is already true in Aionis.

Current strongest assets:

1. `Execution Memory`
2. `Execution Continuity`
3. `Execution Control`
4. `Execution Evaluation`

These already naturally produce:

1. execution artifacts
2. replayable traces
3. handoff/recover lineage
4. decision and feedback surfaces
5. execution eval summaries

That means Aionis already has enough substrate to support a console product without inventing a fake category.

This also avoids the current weak area:

1. Aionis should not be sold first as a skill-selection product
2. Aionis should not be sold first as a generic workflow engine

The first product should amplify the parts that have already been validated.

## Product Thesis

The thesis is:

**Coding-agent teams do not just need better prompts or more tools. They need a runtime view of execution: what happened, why it failed, how it recovered, and whether the result is good enough to ship.**

So the console should answer four questions:

1. what happened during the run
2. what state and context were carried forward
3. what changed between baseline and treatment
4. did the run pass the execution gate

If the product answers those four questions well, it is already useful.

## Product Scope: V1

V1 should contain exactly three product surfaces.

### 1. Run Visualization

Users should be able to inspect:

1. run timeline
2. handoff/recover/replay events
3. decision and feedback checkpoints
4. execution state summary
5. control events and stop/block reasons

Minimum v1 outcome:

1. a user can open one run and understand its lifecycle without reading raw logs first

### 2. Replay and Recovery Inspection

Users should be able to inspect:

1. whether replay candidate selection happened
2. whether deterministic or fallback replay was used
3. where recover/handoff occurred
4. which state artifacts were reused
5. which step boundaries caused degradation or reset

Minimum v1 outcome:

1. a user can explain why a run restarted, recovered, or diverged

### 3. Execution Evaluation

Users should be able to inspect:

1. completion result
2. reviewer-readiness result
3. continuity result
4. recovery result
5. control quality result
6. pass/fail gate summary

Minimum v1 outcome:

1. a user can answer whether a run is acceptable for release or nightly continuation

## What V1 Explicitly Does Not Include

V1 should not include:

1. a general workflow builder
2. low-code automation authoring
3. a universal multi-agent studio
4. broad host-agnostic orchestration UI
5. skill marketplace or skill routing as the primary feature
6. generalized “AI memory dashboard” positioning

If a feature proposal does not directly strengthen:

1. visualization
2. replay/recovery inspection
3. execution evaluation

it should not be in V1.

## Target Users

The primary V1 user is:

**an engineer or platform owner responsible for real coding-agent workflows**

Typical users:

1. AI engineer
2. platform engineer
3. developer tools lead
4. internal agent runtime owner
5. engineering manager who owns release or regression quality

They are not looking for a chat UI.

They are looking for:

1. execution observability
2. runtime debugging
3. replayable evidence
4. release confidence

## Host Strategy

The host strategy should be explicitly split into:

1. current wedge host
2. target host class

### Current wedge host

Current wedge:

1. OpenClaw

Role:

1. proving wedge
2. benchmark and evaluation host
3. first adapter-backed runtime path

OpenClaw is important because it validates the runtime.

It is not the long-term product-level host claim.

### Target host class

Longer-term target hosts are:

1. Cursor-class coding-agent products
2. internal coding-agent platforms
3. code-review / patch / remediation agent runtimes

So the correct message is:

**OpenClaw is the current proving wedge; Cursor-class and internal coding-agent hosts are the target host class.**

## Integration Model

The console should not be framed as “a plugin”.

The correct integration architecture is:

```text
Coding Agent Host
  -> adapter / SDK instrumentation
  -> Aionis Runtime
  -> Execution Runtime Console
```

This means:

1. the host sends runtime events and execution artifacts into Aionis
2. Aionis stores state, continuity, control, and eval outputs
3. the console reads from Aionis and presents the execution picture

So the console is a product surface on top of Aionis, not the primary integration point itself.

## Core Data Surfaces For V1

V1 should read from existing Aionis surfaces instead of inventing a new parallel storage model.

Primary runtime surfaces:

1. execution decisions
2. tool lifecycle and feedback surfaces
3. handoff/recover artifacts
4. replay playbook and replay run data
5. execution eval summaries

Primary artifact types:

1. `summary.json`
2. `cases.jsonl`
3. `execution_eval_summary.json`
4. run-level timeline and decision records stored in Aionis

This is important:

V1 should stay artifact-first and runtime-read-first.

It should not depend on a brand new data model before it becomes useful.

## Proposed V1 Screens

V1 should ship with three top-level screens.

### 1. Runs

Purpose:

1. browse recent runs
2. filter by scenario, host, status, or date
3. open a single run

Needs:

1. run id
2. host/runtime source
3. pass/fail
4. completion/reviewer-ready badge
5. continuity and recovery indicators

### 2. Run Detail

Purpose:

1. inspect one run deeply
2. view timeline, state, replay, control, and evaluation

Needs:

1. execution timeline
2. handoff/recover/replay panels
3. decision/feedback panel
4. final eval panel
5. raw artifact links

### 3. Compare

Purpose:

1. compare baseline vs treatment
2. compare two runs or two scenarios

Needs:

1. completion delta
2. reviewer-ready delta
3. continuity delta
4. recovery delta
5. token/wall-clock side-by-side

## V1 User Stories

V1 should satisfy these user stories:

1. As an AI engineer, I can open a failed run and see where it diverged.
2. As a platform engineer, I can tell whether continuity and recovery actually helped.
3. As an engineering lead, I can compare baseline and treatment without reading raw benchmark output.
4. As a release owner, I can decide whether a nightly run should pass or fail.
5. As a runtime owner, I can replay or inspect the exact execution path behind an eval result.

## System Architecture For V1

The simplest correct architecture is:

1. existing Aionis runtime remains the source of truth
2. existing eval generation remains the source of truth for execution outcome
3. console uses a read-oriented backend surface
4. no new orchestration engine is introduced in V1

Recommended internal split:

1. runtime layer
   - existing Aionis APIs and stores
2. console backend layer
   - run list / run detail / compare / eval read APIs
3. console frontend layer
   - execution UI

That keeps V1 product work narrow and executable.

## V1 API Needs

V1 should add or normalize only a small read surface.

Recommended read APIs:

1. list runs
2. get run detail
3. get run timeline
4. get run eval summary
5. compare two runs

These can initially be:

1. direct artifact readers
2. thin backend aggregators over existing runtime data

They do not need to be a large new API family on day one.

## Success Criteria For V1

V1 is successful if:

1. a user can explain what happened in a run from the console alone
2. a user can compare baseline vs treatment without raw artifact reading
3. a user can see pass/fail execution eval in one place
4. the console is clearly useful for nightly and regression workflows
5. the product reinforces Aionis as an execution runtime, not a memory toy

## Failure Criteria For V1

V1 has failed if:

1. it turns into a generic workflow orchestration UI
2. it depends on unproven skill-selection stories
3. it cannot explain real runs better than raw JSON and logs
4. it tries to support every host before one host path is strong
5. it expands scope faster than it produces user-visible clarity

## Build Sequence

The correct build order is:

### Phase 0: Product contract

Define:

1. canonical product sentence
2. V1 non-goals
3. target host language
4. user stories

### Phase 1: Read model

Build:

1. run list contract
2. run detail contract
3. compare contract
4. eval summary contract

### Phase 2: Console shell

Build:

1. runs page
2. run detail page
3. compare page

### Phase 3: Real workflow proof

Ship:

1. strongest real workflow slice shown in the console
2. nightly result visible in the console
3. execution eval visible in the console

### Phase 4: Design-partner hardening

Add:

1. filters
2. better traces
3. export/share
4. role-appropriate summaries

## Recommended Naming

Primary name:

**Aionis Execution Runtime Console**

Recommended subtitle:

**Visualize, replay, and evaluate coding-agent runs**

Alternative acceptable name:

**Aionis Execution Console for Coding Agents**

Names to avoid:

1. Workflow Runtime Platform
2. Agent Orchestration Studio
3. AI Memory Dashboard

## One-Sentence Product Definition

The cleanest one-sentence product definition is:

**Aionis Execution Runtime Console is the visual, replayable, and evaluable surface for coding-agent runs backed by the Aionis runtime.**

## Immediate Next Step

The next executable step after this plan is:

**define the V1 read model and screen contract before writing UI code**

That means:

1. run list schema
2. run detail schema
3. compare schema
4. execution eval panel schema

If those are not defined first, the UI will drift into generic dashboard design.
