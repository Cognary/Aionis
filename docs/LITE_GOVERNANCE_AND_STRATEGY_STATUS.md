# Aionis Lite Governance And Strategy Status

Last reviewed: 2026-03-20

This document compares the current `Aionis Lite` implementation against:

1. [docs/LITE_MEMORY_GOVERNANCE_MODEL.md](/Volumes/ziel/Aionisgo/docs/LITE_MEMORY_GOVERNANCE_MODEL.md)
2. [docs/LITE_EXECUTION_MEMORY_STRATEGY.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_STRATEGY.md)

The goal is not to restate either source document.
The goal is to record:

1. what is already real in the current Lite runtime
2. what is only partially implemented
3. what still remains roadmap or contract-first design
4. what should be prioritized next

## Executive Summary

Current overall judgment:

1. the core execution-memory thesis is already real in Lite
2. the two named mainlines are implemented enough to treat them as product behavior, not just strategy language
3. the governance model is partly implemented as runtime behavior and partly implemented as schema/contract scaffolding
4. the largest unfinished area is not the mainline itself, but the broader memory-governance productization around it

Current confidence by area:

1. execution-memory mainline: high
2. planner/packet/runtime contract: high
3. policy-learning and selector reuse: high
4. governance model as a complete product surface: medium
5. tier lifecycle and maintenance platform: medium-low

## What Is Already Implemented

The following ideas from the two source documents are already real in the current Lite runtime.

### 1. Lite As A Local Execution-Memory Kernel

Implemented status: `Implemented`

Evidence:

1. Lite is a standalone local SQLite runtime
2. replay, playbook, context assembly, tool decision memory, automation, and sandbox are all present
3. the public product story is now centered on execution memory rather than generic memory storage

Primary code:

1. `src/app/runtime-services.ts`
2. `src/host/http-host.ts`
3. `src/routes/memory-context-runtime.ts`
4. `src/memory/replay.ts`

### 2. Anchor-Guided Rehydration Loop

Implemented status: `Implemented`

Document claim:

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

Current runtime reality:

1. stable workflow anchors are produced from replay/playbook flows
2. planning and context assembly expose planner-facing workflow and rehydration signals
3. runtime tool hints expose `rehydrate_payload`
4. anchor payload rehydration is available as an explicit runtime action
5. Lite now inherits the default local actor for normal rehydration calls

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/runtime-tool-hints.ts`
3. `src/memory/rehydrate-anchor.ts`
4. `src/routes/memory-access.ts`
5. `src/routes/memory-feedback-tools.ts`

### 3. Execution Policy Learning Loop

Implemented status: `Implemented`

Document claim:

`feedback -> pattern -> recall -> selector reuse`

Current runtime reality:

1. tool feedback can produce pattern anchors
2. recalled stable patterns can influence selector ordering
3. explicit `tool.prefer` still stays ahead of trusted pattern reuse
4. the runtime exposes `candidate`, `trusted`, and `contested` pattern credibility
5. planner and selector summaries both expose the same trust language family

Primary code:

1. `src/memory/tools-feedback.ts`
2. `src/memory/tools-pattern-anchor.ts`
3. `src/memory/tools-select.ts`
4. `src/app/planning-summary.ts`

### 4. Planner Packet, Signal Surfaces, And Execution Kernel

Implemented status: `Implemented`

Current runtime reality:

1. `planner_packet` is the canonical planner-facing full collection surface
2. `workflow_signals` and `pattern_signals` are canonical route-level signal surfaces
3. `execution_kernel` is the compact aligned runtime summary surface
4. `planning_summary` and `assembly_summary` explain workflow guidance, pattern trust, and rehydration availability
5. replay-learning workflow maturity and pattern credibility are visible without reconstructing state from raw internals

Primary code:

1. `src/routes/memory-context-runtime.ts`
2. `src/app/planning-summary.ts`
3. `src/memory/context-orchestrator.ts`
4. `src/memory/schemas.ts`

### 5. Workflow Anchors And Replay-Learning Maturity

Implemented status: `Implemented`

Current runtime reality:

1. stable playbooks are normalized onto workflow anchors
2. already-stable latest playbooks are normalized in place rather than being left behind on an old shape
3. replay-learning candidates can progress to stable workflow guidance
4. workflow lifecycle and maintenance summaries are exposed in planner and execution-kernel surfaces

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/replay-learning.ts`
3. `src/app/planning-summary.ts`

### 6. Runtime-Governed Adjudication Contract

Implemented status: `Partially Implemented`

What is real:

1. the schema family for governed memory operations exists
2. Lite explicitly models admissibility-requiring operations
3. proposals and admissibility results have stable contract shapes
4. rehydration already follows the runtime-governed model in product behavior

Primary code:

1. `src/memory/schemas.ts`
2. `src/memory/governance.ts`
3. `scripts/ci/lite-memory-governance-contract.test.ts`

What is not yet fully real:

1. the general governed operations are not all exposed as public product routes
2. the schema family is ahead of the route/product surface

## What Is Only Partially Implemented

These areas clearly exist in the current codebase, but they are not yet complete in the same sense as the two main loops above.

### 1. Tier-Aware Memory Without A Full Lifecycle Platform

Status: `Partially Implemented`

Current reality:

1. Lite nodes already carry `hot`, `warm`, `cold`, and `archive` tier state
2. context assembly already applies forgetting policy with tier and archived filtering
3. anchor schemas and recall behavior already treat tier as a ranking and filtering signal

But:

1. Lite does not expose the full archive lifecycle control-plane surface
2. `/v1/memory/archive/rehydrate*` remains unsupported in Lite
3. `/v1/memory/nodes/activate*` remains unsupported in Lite

Interpretation:

Lite already has tier-aware memory semantics.
It does not yet expose the full lifecycle-management product surface described in the broader governance model.

Primary code:

1. `src/memory/context-orchestrator.ts`
2. `src/store/lite-write-store.ts`
3. `src/host/lite-edition.ts`

### 2. Distillation Beyond Replay And Tool-Feedback Entry Points

Status: `Partially Implemented`

Current reality:

1. replay can promote stable workflow memory
2. tools feedback can distill stable or contested pattern memory
3. execution-native writes now carry signatures, anchor metadata, and compression metadata

But:

1. Lite does not yet have a broad automatic promotion pipeline from arbitrary event streams into reusable workflow or pattern memory
2. the strongest promotion paths still come from replay and tool-feedback entry points

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/tools-pattern-anchor.ts`
3. `src/memory/write.ts`

### 3. Strategy-Level Maintenance Model

Status: `Partially Implemented`

Current reality:

1. pattern anchors carry maintenance state
2. workflow memory now also carries lifecycle and maintenance summaries
3. planner and execution-kernel surfaces expose low-cost lifecycle language

But:

1. the full maintenance model remains mostly descriptive, not fully operationalized
2. there is not yet a clearly productized nightly or batch maintenance system in Lite
3. promotion, demotion, archive relocation, and redundancy cleanup are not yet a complete operator-facing subsystem

Primary code:

1. `src/memory/tools-pattern-anchor.ts`
2. `src/memory/replay.ts`
3. `src/app/planning-summary.ts`

### 4. Slim Default Planner/Context Surface

Status: `Implemented`

Current reality:

1. the old top-level packet mirrors have been removed from the default planner/context route surface
2. `planner_packet` now owns the full collection sections
3. heavier inspection content is being moved toward `POST /v1/memory/execution/introspect`
4. both `planning_context` and `context_assemble` now default `return_layered_context=false`
5. `layered_context` is now an explicit debug/operator output only

Contract consequence:

1. the default planner/context product surface is now slim by default
2. heavy assembly inspection is still available, but only via `return_layered_context=true`

Primary code:

1. `src/routes/memory-context-runtime.ts`
2. `src/memory/schemas.ts`
3. `docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md`

## What Remains Contract-First Or Roadmap-First

These areas are real as design direction, but they are not yet fully productized in Lite.

### 1. General Governed Memory Mutation APIs

Status: `Contract-First`

Current reality:

1. `promote_memory`
2. `compress_memory`
3. `form_pattern`
4. `derive_policy_hint`
5. `rehydrate_payload`

All exist as governed operation names or request/adjudication schemas.

But:

1. only `rehydrate_payload` is already a clear runtime-facing product action
2. the others are not yet a fully public Lite API family

Interpretation:

The governance contract is ahead of the product surface here.

### 2. Signature-First Pattern Formation As A Full Product Pipeline

Status: `Early Productization`

Current reality:

1. signatures are already part of workflow and pattern memory
2. pattern credibility and structural reuse are real

But:

1. the full product pipeline for broad workflow clustering and pattern formation is not yet exposed as a separate, mature subsystem
2. Lite still relies on a few strong entry points rather than a general pattern-governance platform

### 3. Policy Hint Productization

Status: `Mostly Roadmap`

Current reality:

1. policy-hint governance is named in the contracts and strategy
2. some reuse behavior is already visible through selector memory

But:

1. there is not yet a first-class Lite route family or operator feature set for policy hints
2. this remains mostly an architectural direction

### 4. Full Importance Update And Offline Memory Operations

Status: `Mostly Roadmap`

Current reality:

1. the documents clearly define a cheap online path plus offline maintenance path
2. the current runtime already surfaces some lifecycle and maintenance state

But:

1. Lite does not yet expose a complete operating system for demotion, archival relocation, stale-anchor cleanup, and redundancy reduction
2. the strategy is ahead of the operational product here

## Consolidated Progress Matrix

| Area | Status | Notes |
|---|---|---|
| Local execution-memory kernel | Implemented | Product identity now matches runtime reality. |
| Anchor-Guided Rehydration Loop | Implemented | Workflow anchor -> recall -> runtime hint -> rehydrate is real. |
| Execution Policy Learning Loop | Implemented | Feedback -> pattern -> selector reuse is real. |
| Planner packet / signal / execution-kernel contract | Implemented | Stable and tested. |
| Replay-learning workflow maturity | Implemented | Candidate-to-stable path is visible and Lite-native. |
| Runtime-governed adjudication model | Partially Implemented | Strong schema/contract, partial public product surface. |
| Tier-aware memory semantics | Partially Implemented | Tier model exists; lifecycle control plane does not. |
| Distillation beyond replay/tools entry points | Partially Implemented | Mainline paths exist; general promotion does not. |
| Maintenance model | Partially Implemented | Summaries exist; full maintenance system does not. |
| Slim default planner/context response | Implemented | Default planner/context routes are slim; `layered_context` is explicit debug/operator output only. |
| General governed mutation APIs | Contract-First | Schemas exist, product routes mostly do not. |
| Policy-hint subsystem | Mostly Roadmap | Direction is present, feature surface is not. |
| Full archive/activation lifecycle platform | Mostly Roadmap | Explicitly not part of current Lite surface. |

## What This Means Practically

The two source documents are not aspirational in the same way.

Current practical reading:

1. `LITE_EXECUTION_MEMORY_STRATEGY.md` is already mostly describing the current Lite product
2. `LITE_MEMORY_GOVERNANCE_MODEL.md` is describing the right governing model, but some of its named operations are still ahead of the product surface

If someone asks whether the current Lite runtime already matches those documents, the most accurate answer is:

1. the execution-memory strategy is mostly live
2. the governance model is directionally live, but still partly schema-first and platform-incomplete

## Recommended Next Steps

These are the next steps that most directly close the remaining gap between the source documents and the current Lite runtime.

### Priority 1: Finish The Slim Default Planner/Context Contract

Why:

1. the contract docs now say default planner/context routes should stay slim
2. this is now implemented in runtime and contract tests

Concrete next step:

1. keep `layered_context` out of the default planner/context response
2. continue treating explicit `return_layered_context=true` and introspection as the heavy inspection surfaces

### Priority 2: Decide Whether Governed Mutation APIs Stay Internal Or Become Public

Why:

1. the governance model already names `promote_memory`, `compress_memory`, `form_pattern`, and `derive_policy_hint`
2. today those mostly exist as schemas and contract helpers

Concrete next step:

1. choose a deliberate boundary
2. either expose a Lite-governed route family
3. or mark them explicitly internal for now and stop implying near-term public availability

### Priority 3: Define The Lite Position On Tier Lifecycle

Why:

1. Lite clearly has tier-aware memory
2. Lite clearly does not yet have the full lifecycle platform

Concrete next step:

1. decide whether Lite should gain a narrow local-only lifecycle surface
2. or keep lifecycle orchestration entirely in Pro and strengthen the current partial-local rehydration story instead

### Priority 4: Productize Maintenance Rather Than Just Summaries

Why:

1. lifecycle and maintenance summaries now exist
2. but the underlying maintenance system is still only partly real

Concrete next step:

1. define a minimal Lite maintenance model
2. specify what runs online
3. specify what runs offline
4. specify what is operator-visible and what is internal only

### Priority 5: Expand Distillation Beyond Current Strong Entry Points

Why:

1. replay and tool-feedback entry points are strong
2. more general event-to-workflow or event-to-pattern promotion is still narrow

Concrete next step:

1. add a broader promotion pipeline from arbitrary execution-native evidence into workflow and pattern candidates
2. keep it signature-gated and runtime-governed

## Final Assessment

The current Lite runtime has already crossed the important threshold.

It is no longer merely “moving toward” the two source documents.
It already implements the main strategic product story:

1. execution memory
2. anchor-guided rehydration
3. policy learning through trusted patterns
4. runtime-governed semantics

The remaining gap is now more specific:

1. finish contract cleanup
2. decide which governance operations become real public Lite APIs
3. decide how much of lifecycle and maintenance should exist in Lite as a local product feature

In short:

1. strategy is mostly live
2. governance is partly live
3. the next phase is product-boundary clarification, not thesis discovery
