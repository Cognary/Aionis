---
title: "Aionis Project Status"
---

# Aionis Project Status

Date: `2026-03-15`  
Status: `phase 1 product + kernel line established`

Related:

1. [Phase 1 Progress](AIONIS_EXECUTION_CONTINUITY_PHASE1_PROGRESS_2026-03-15.md)
2. [Execution Continuity Kernel ADR](../architecture/AIONIS_EXECUTION_CONTINUITY_KERNEL_ADR_2026-03-15.md)
3. `clawbot-aionis-adapter/docs/2026-03-14-openclaw-aionis-benchmark-summary.md`
4. `clawbot-aionis-adapter/docs/2026-03-15-openclaw-real-workflow-scenario-benchmark.md`
5. [Phase 2 Plan](../plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md)
6. [Stage Closeout and GTM Plan](../strategy/AIONIS_STAGE_CLOSEOUT_AND_GTM_PLAN_2026-03-16.md)
7. [Tool Evolution Plan](../plans/AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md)
8. [Tool Evolution Runtime Rollout Decision](../strategy/AIONIS_TOOL_EVOLUTION_RUNTIME_ROLLOUT_DECISION_2026-03-17.md)
9. [Execution Eval Plan](../plans/AIONIS_EXECUTION_EVAL_PLAN_2026-03-17.md)
10. [Runtime Architecture](../architecture/AIONIS_RUNTIME_ARCHITECTURE_2026-03-17.md)
11. [Four Pillars Code Map](../architecture/AIONIS_FOUR_PILLARS_CODE_MAP_2026-03-17.md)
12. [Self-Learning Mechanism](../architecture/AIONIS_SELF_LEARNING_MECHANISM_2026-03-17.md)
13. [Ideal Customer Profile](../strategy/AIONIS_IDEAL_CUSTOMER_PROFILE_2026-03-17.md)
14. [Execution Runtime Console V1 Plan](../products/execution-runtime-console/AIONIS_EXECUTION_RUNTIME_CONSOLE_V1_PLAN_2026-03-17.md)
15. [Runtime CLI Product Plan](../products/runtime-cli/AIONIS_RUNTIME_CLI_PRODUCT_PLAN_2026-03-17.md)
16. [Runtime CLI Command Contract](../products/runtime-cli/AIONIS_RUNTIME_CLI_COMMAND_CONTRACT_2026-03-17.md)

## Executive Summary

Aionis has now moved past concept validation.

At this checkpoint, the project should be read as:

1. a real product line exists on the OpenClaw path
2. the execution-continuity kernel is no longer ADR-only
3. real runtime evidence is positive on multiple workflow slices
4. continuous nightly validation is now wired into the strongest real workflow path

The most accurate high-level description today is:

**Aionis is becoming a stateful execution-continuity layer for coding agents, with the current strongest product proof on the OpenClaw adapter path.**

## What Is Already Completed

### 1. Product surface

The product-facing layer is already in place:

1. `@aionis/openclaw-adapter` is published and installable
2. OpenClaw can load the adapter on the real plugin path
3. Aionis Lite can back the adapter on the actual runtime path
4. docs, evidence, benchmark summaries, and website surface exist
5. local nightly scheduling and nightly review outputs now exist

### 2. Kernel surface

The first execution-continuity kernel layer is now real code:

1. `ExecutionState v1`
2. `ExecutionPacket v1`
3. `ControlProfile v1`

These are no longer design-only abstractions.

### 3. Continuity route path

The continuity path is now implemented through current routes:

1. `handoff/store`
2. `handoff/recover`
3. `planning_context`
4. `context/assemble`

The current implementation remains additive and does not require a route-family rewrite.

## What Is Already Verified

### 1. Real workflow completion

On the real `OpenClaw + adapter + Lite + Gemini` path, reviewer-ready workflow completion is already positive on multiple realistic slices.

Strongest current slices:

1. dashboard auth drift
2. pairing / approval recovery
3. service token drift repair

Current reading:

1. the completion story is real
2. the runtime path is real
3. the value is continuity and reviewer-ready completion, not generic memory

### 2. Packet continuity

`execution_packet_v1` is not only wired; it has already beaten the older legacy continuity path on three core repeated real-workflow A/B slices.

That means the kernel work is already creating measurable product change, not only internal cleanliness.

### 3. ControlProfile runtime adoption

`ControlProfile` is no longer contract-only.

It now affects two concrete runtime surfaces:

1. adapter-side threshold selection
2. Aionis-side `tools/select` candidate filtering

This matters because it moves `ControlProfile` from type-level continuity data into execution behavior.

### 4. Nightly validation

The strongest real workflow slice now has:

1. a controlled nightly runner
2. launchd scheduling
3. fixed-format nightly summary output
4. fixed-format nightly review output

This is the first point where Aionis has a repeatable operational regression loop, not only one-off benchmark runs.

### 5. Execution Eval foundation

Aionis now has enough kernel and evidence structure to justify a narrow internal `Execution Eval` layer.

Why now:

1. the current strongest value is execution continuity and control, not generic tool routing
2. state, packet, profile, replay, handoff, and benchmark artifacts already exist
3. the team needs a stable regression truth source stronger than ad hoc benchmark reading

Current rule:

1. keep `Execution Eval` internal first
2. use it to score completion, reviewer-readiness, continuity, recovery, and control quality
3. do not turn it into a generic agent-eval platform

## What Is In Progress

### 1. Strongest-slice refresh after ControlProfile adoption

The strongest real workflow slices have already been refreshed with `ControlProfile` active.

Current shape:

1. dashboard auth drift remains a completion and efficiency win
2. pairing / approval recovery remains a completion win
3. service token drift repair remains a completion win

This is strong enough to support the story that `ControlProfile` adoption did not break the strongest real workflow line.

### 2. Broader runtime-surface adoption

The next kernel-value question is no longer “does `ControlProfile` work at all?”

It is:

**which additional runtime surfaces are worth adopting next, and do they create real workflow gains rather than just architectural neatness?**

### 3. Phase 2 Step 1 scaffold

Phase 2 is no longer design-only.

The first internal scaffold has now landed:

1. `src/execution/state-store.ts`
2. `src/execution/transitions.ts`
3. `scripts/ci/execution-continuity-phase2-state.test.mjs`

Current reading:

1. `ExecutionState` now has an internal persistence scaffold independent of handoff slots
2. state transitions are now an explicit internal contract instead of remaining purely implied by projection
3. the first route overlays are now present on:
   - `handoff/store`
   - `handoff/recover`
   - `planning_context`
   - `context/assemble`
   - `memory/write`
4. public route semantics remain unchanged while state durability starts moving beyond slot-only persistence
5. state-first packet assembly is now explicitly observable on the context path
6. explicit transition emission is now live on both `handoff/store` and `memory/write`, instead of remaining implied by projection
7. the first real regression from handoff-transition rollout has been fixed: repeated handoffs for the same anchor now rebase transition expectations onto the stored revision instead of failing on revision mismatch
8. `tools/select` can now read `execution_state_v1` directly, derive a control profile from `current_stage` when needed, and report profile origin metadata in its response

### 4. Tool evolution narrow rollout

Tool evolution is now past metadata-only setup, but it is still intentionally narrow.

Current state:

1. Phase A landed:
   - registry metadata
   - family labeling
   - response visibility in `tools/select`
2. the first Phase B slice is now active:
   - family-aware ordering inside a known capability family
   - explicit policy preference still wins
   - unrelated candidate families keep their relative order

The system still should not yet:

1. change replay behavior
2. expand host-side candidate sets automatically
3. promote new tools on efficiency gains alone

Current runtime reading:

1. kernel-side Tool Evolution continues
2. adapter-side runtime rollout is paused
3. the current OpenClaw hook contract cannot yet execute a true selected-tool reroute
4. host reroute capability is now the next gating prerequisite for further runtime promotion

## What Is Not Finished

### 1. ExecutionState as universal source of truth

`ExecutionState` is present, but it is not yet the universal system of record for coding-task continuity.

The current kernel still relies heavily on handoff-path projection and route-level bridging.

### 2. Broader host/runtime coverage

The strongest proof is still concentrated on the OpenClaw path.

That is the correct product wedge, but it means the broader platform story is still earlier than the OpenClaw story.

### 3. Efficiency consistency across all realistic slices

Completion is already the strongest current signal.

Efficiency is still mixed by slice:

1. some slices are completion and efficiency wins
2. some slices are completion wins without efficiency wins

This is a product-strengthening reality, not a failure, but it limits how broadly efficiency claims should be framed.

## Current Assessment

The project is strong enough to say:

1. Aionis is already a real product line, not a speculative architecture exercise
2. the execution-continuity kernel is already shaping real runtime behavior
3. the OpenClaw adapter path now has real install, real workflow, real benchmark, and real nightly validation loops
4. the next work should prioritize verified runtime value over broader abstraction

The project is not yet strong enough to say:

1. every runtime surface is adopted
2. every realistic workflow is now an efficiency win
3. the generic platform story is fully proven outside the current OpenClaw wedge
4. `ExecutionState` is already the universal source of truth

## Phase 2 Refreshed Real-Workflow Readout

The current strongest three-slice readout after the Phase 2 state-first context path landed is:

1. dashboard auth drift: completion win, token win, wall-clock win
2. pairing / approval recovery: completion win, token win, wall-clock win
3. service token drift repair: completion win, but not an efficiency win

This makes the current Phase 2 story:

1. positive on reviewer-ready completion across all three strongest slices
2. positive on efficiency for two of the three strongest slices
3. not yet a universal efficiency story
4. resilient enough to absorb a real route-level regression, fix it, and confirm the repaired path on both single-run and `3`-repeat real-Lite workflow validation
5. now positive on a third runtime-surface checkpoint where `tools/select` can consume durable execution state directly rather than only continuity-delivered profile payloads
6. that third surface is currently a completion-first story across the strongest three-slice family: two strong completion wins and one supporting completion signal, not an efficiency win
7. current promotion discipline for that surface is strict: cost improvements do not justify a move if the strongest-slice completion baseline drops


## Tool Evolution Risk

Aionis is now strong at continuity, but not yet strong at controlled migration from older tools to newer tools in the same capability family.

That gap is now tracked explicitly in:

1. [Tool Evolution Plan](../plans/AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md)

The core reason this matters is simple:

1. continuity can preserve the wrong tool choice for too long
2. replay can overfit to older successful paths
3. `tools/select` still needs a capability-family layer if newer tools should safely replace older tools

## Recommended Next Focus

The next highest-value work remains:

1. continue validating `ControlProfile` and continuity-kernel adoption on additional high-value runtime surfaces
2. prefer runtime-surface proofs over new abstract kernel work
3. keep Phase 2 Step 1 additive until the state store and transition contract are strong enough to back state-first packet assembly
4. only after that, continue pushing `ExecutionState` toward a more independent source-of-truth role
5. the immediate next work should be either shaping this `tools/select` surface toward lower cost or moving to another high-value surface; the third strongest-slice proof now exists

In short:

**Aionis should keep going deeper on verified execution continuity, not wider on abstractions.**
