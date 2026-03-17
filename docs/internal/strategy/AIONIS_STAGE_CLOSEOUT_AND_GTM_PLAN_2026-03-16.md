---
title: "Stage Closeout and GTM Plan"
---

# Aionis Stage Closeout and GTM Plan

Date: `2026-03-16`  
Status: `active stage closeout`

Related:

1. [Execution Continuity Kernel ADR](../architecture/AIONIS_EXECUTION_CONTINUITY_KERNEL_ADR_2026-03-15.md)
2. [Phase 1 Progress](../progress/AIONIS_EXECUTION_CONTINUITY_PHASE1_PROGRESS_2026-03-15.md)
3. [Project Status](../progress/AIONIS_PROJECT_STATUS_2026-03-15.md)
4. [Phase 2 Plan](../plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md)
5. [Tool Evolution Runtime Rollout Decision](AIONIS_TOOL_EVOLUTION_RUNTIME_ROLLOUT_DECISION_2026-03-17.md)

## Executive Summary

Aionis should now move from open-ended kernel expansion into staged product closeout.

The current goal is not to keep adding runtime surfaces or benchmark variants. The current goal is to freeze one credible product line, align install paths with the validated runtime, and push a version of Aionis that users can install, understand, and trust.

The current wedge is:

**Aionis is an execution-continuity layer for coding agents, with the strongest current proof on the OpenClaw adapter path.**

This document defines what is now in scope for release, what is explicitly out of scope, what claims are allowed, what must be frozen, and which remaining kernel items move into roadmap rather than blocking release.

## Stage Objective

This stage should achieve all of the following:

1. freeze one product definition that matches the real strongest proof
2. freeze one install path that matches the published npm packages
3. freeze one evidence set that is strong enough to support early user adoption
4. stop treating every new kernel increment as release-blocking
5. downgrade remaining Phase 2 work from "must land before launch" to "post-launch roadmap" unless it directly protects completion on the main product path

## Product Definition to Freeze

The product to push now is not a generic agent platform and not a generic workflow engine.

The product to push now is:

**Aionis = execution continuity and execution control for coding-agent runs.**

Current proving wedge:

1. OpenClaw runtime
2. `@aionis/openclaw-adapter`
3. Aionis Lite started through `@aionis/sdk`
4. reviewer-ready workflow scenarios on the real runtime path

Current user-visible value:

1. better continuity across interrupted or multi-stage runs
2. more controlled tool behavior
3. better reviewer-ready completion on the strongest workflow slices
4. handoff, replay, and context assembly working together behind one install path

## What We Sell Now

The current public story should stay narrow.

Lead with:

1. coding-agent execution continuity
2. reviewer-ready completion uplift
3. execution control on the OpenClaw path
4. continuity-aware handoff and replay

Do not lead with:

1. generic agent orchestration
2. universal workflow state platform
3. broad "memory for everything" claims
4. full efficiency dominance across every slice

The right outside sentence is:

**Aionis helps coding-agent runs stay continuous, controlled, and more likely to finish reviewer-ready.**

## What We Do Not Sell Yet

The following remain out of scope for the current product push:

1. generic workflow engine positioning
2. claims that every realistic workflow slice is an efficiency win
3. claims that `ExecutionState` is already the universal source of truth for all host/runtime paths
4. claims that every runtime surface is already fully stabilized
5. broad host/runtime support beyond the current OpenClaw proving wedge

These are roadmap topics, not release claims.

## Canonical Install Path

The current install path must be treated as the official path.

Runtime package:

1. `@aionis/sdk@0.2.20`

Adapter package:

1. `@aionis/openclaw-adapter@0.1.2`

Canonical first-use flow:

1. start Lite with `npx @aionis/sdk@0.2.20 dev`
2. verify Lite with `npx @aionis/sdk@0.2.20 health`
3. install the adapter with `openclaw plugins install @aionis/openclaw-adapter`
4. apply the minimal OpenClaw config from `clawbot-aionis-adapter/examples/openclaw.json`
5. run one controlled OpenClaw turn and confirm the adapter is active

Install-path rules:

1. the README must lead with the minimal config
2. advanced threshold knobs must stay clearly marked as advanced
3. benchmark-only knobs must not appear as mandatory install steps
4. the npm-published versions must match the docs examples

## Evidence Set to Freeze

The evidence set should now be intentionally smaller and stronger.

Use the following as the main product proof:

1. strongest real workflow slices on the OpenClaw + Lite path
2. repeated continuity A/B showing packet continuity beating legacy continuity on the core slices
3. Phase 2 state-first context refreshed set
4. repaired handoff-transition repeated revalidation
5. nightly validation being connected on the strongest slice

Use `markdown parser fallback` and the weakest `tools/select` service-token result only as supporting slices, not as headline proof.

Evidence discipline:

1. headline claims must come from repeated real-workflow results
2. single-run checks are validation support, not headline evidence
3. completion and reviewer-ready outcomes remain the hard gate
4. token and wall-clock are second-order evidence, not substitutes for completion

## Product Claims We Can Make

The following claims are now strong enough to use:

1. Aionis is already a real product line on the OpenClaw path
2. Aionis improves reviewer-ready completion on the strongest benchmarked workflow slices
3. Aionis provides continuity-aware handoff, replay, and context assembly on the actual runtime path
4. Aionis has a nightly validation loop on the strongest slice
5. Aionis now has a real state-aware kernel layer behind the existing route family

## Claims We Must Not Make

The following claims are not yet justified:

1. every realistic workflow slice is an efficiency win
2. every runtime surface is already stabilized
3. Aionis is a generic workflow platform
4. `ExecutionState` is already the universal source of truth everywhere
5. the current kernel work is complete enough to justify Phase 3

## Closeout Rules

The current stage should follow these rules:

1. stop opening new runtime surfaces by default
2. do not expand the public story every time a new internal kernel increment lands
3. do not promote a `tools/select` optimization on token/wall-clock gains alone if strongest-slice completion drops
4. do not block product push on lower-priority kernel neatness
5. do not let benchmark harness edits redefine the product story

The release gate remains:

**completion first, continuity second, efficiency third**

## Phase 2 Items That Still Matter Before We Call It Stable

Only a small subset of Phase 2 work should still be treated as near-term.

Keep near-term:

1. stabilization of the current `tools/select` surface so strongest-slice completion does not regress
2. continued movement of `ExecutionState` toward authoritative state on the already-adopted high-value paths
3. publish/install path correctness
4. nightly and repeated validation on the strongest path

Do not treat as near-term blockers:

1. opening more runtime surfaces
2. naming Phase 3
3. generic platform abstractions
4. chasing every supporting slice until it becomes a headline slice

## Phase 2 Items to Downgrade Into Roadmap

The following work should now be treated as roadmap unless it directly protects the release path:

1. additional runtime-surface adoption beyond the current adopted set
2. broader host/runtime coverage beyond OpenClaw
3. more generalized state orchestration abstractions
4. broader platform/product narratives outside the coding-agent wedge
5. any efficiency-only tuning that does not preserve completion

This does not mean the work is wrong. It means it no longer belongs on the critical path for pushing Aionis out.

## Required Release Surfaces

Before the current push is considered operationally closed, the following surfaces must stay aligned:

1. `@aionis/sdk` version and install examples
2. `@aionis/openclaw-adapter` version and install examples
3. adapter README first-screen install path
4. minimal OpenClaw config example
5. benchmark evidence overview
6. project status and phase progress docs

If any of these drift, users will install one thing while the team is validating another. That is not acceptable.

## External Narrative Structure

For this stage, keep every outward-facing artifact in this order:

1. problem
2. what Aionis changes in the run
3. strongest evidence
4. boundaries
5. install path
6. next step

This avoids two common failures:

1. leading with internal kernel jargon
2. hiding the install path behind architecture talk

## Internal Operating Model for the Next Window

The next window should be run like a release candidate, not like open-ended research.

Working model:

1. default to fixing only regressions that threaten completion on the strongest path
2. require a clear reason before changing runtime behavior
3. prefer doc, packaging, install, and validation alignment over new kernel expansion
4. treat roadmap work as backlog, not as hidden release scope

## Exit Criteria for This Closeout Stage

This stage is successful when all of the following are true:

1. the product story is frozen around coding-agent execution continuity
2. install docs and npm versions are aligned
3. the strongest evidence set is frozen and easy to point to
4. the current `tools/select` surface is governed by a strict completion-first promotion rule
5. remaining kernel work is explicitly classified as roadmap rather than silently expanding release scope

## Immediate Next Focus

After this closeout document lands, the next work should be:

1. keep the current release versions as the official install baseline
2. resist opening new surfaces
3. fix only completion-threatening regressions on the strongest OpenClaw path
4. treat the rest of Phase 2 as selective hardening, not as an endless pre-launch requirement

That is how Aionis gets pushed out without turning the launch into an infinite architecture exercise.
