# Aionis Lite Governance And Strategy Status

Last reviewed: 2026-03-21

This document compares the current `Aionis Lite` implementation against:

1. [LITE_MEMORY_GOVERNANCE_MODEL.md](./LITE_MEMORY_GOVERNANCE_MODEL.md)
2. [LITE_EXECUTION_MEMORY_STRATEGY.md](./LITE_EXECUTION_MEMORY_STRATEGY.md)

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
4. the largest unfinished area is no longer the planner/context contract surface itself, but the broader automatic workflow-promotion and memory-governance productization around it

Current confidence by area:

1. execution-memory mainline: high
2. planner/packet/runtime contract: high
3. policy-learning and selector reuse: high
4. governance model as a complete product surface: medium
5. tier lifecycle and maintenance platform: medium-low
6. real route-level validation of the main product loops: medium-high
7. repeatable product-value benchmark coverage: medium-high
8. pattern trust hardening as a production-grade model: low-medium

## 1.0 Readiness Judgment

Current release-readiness judgment:

1. the execution-memory mainline is now stable enough to describe as product behavior rather than an active research thesis
2. the most important product loops are no longer the largest 1.0 risk
3. the remaining 1.0 risk is concentrated in governance breadth, shared-core alignment, and production posture rather than in workflow/pattern mainline correctness

More precise interpretation:

1. execution-memory, workflow progression, pattern trust hardening, and the slim planner/context surface are now relatively stable
2. operator governance is no longer absent, but it is still only a `suppress-first` slice rather than a complete human-governed policy-control product surface
3. the standalone Aionis runtime and the broader platform stack are still not fully settled on a shared-core source-of-truth boundary, which matters more if the external story is a unified execution-memory platform rather than a standalone local runtime
4. Aionis deployment and safety defaults are still strongest for single-user local and advanced-user workflows, not for broad hosted or multi-tenant production defaults

What this means in practice:

1. if Aionis is positioned as a local, single-user, execution-memory-first runtime, it is close to a credible `1.0` baseline
2. if Aionis is positioned as a fully governed, shared-core-aligned, broadly production-default platform, it still has real gaps
3. those gaps are now more about operator productization, shared-core governance, and deployment posture than about planner/context or workflow/pattern correctness

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
4. same-signature workflow candidates are now aggregated by maturity in planner-facing and introspection surfaces instead of appearing as duplicate observing and promotion-ready rows
5. the replay-governed producer path from `repair/review -> learning projection -> planning_context` is now route-tested end to end
6. workflow lifecycle and maintenance summaries are exposed in planner and execution-kernel surfaces
7. execution-native-only workflow display now carries stable `source` and `tool_set` presentation in planner/introspection surfaces
8. structured execution-continuity `/v1/memory/write` requests can now project governed workflow memory, including packet-only continuity writes, and repeated unique writes can move that path into stable workflow guidance on the default planner surface
9. lightweight handoff-style `/v1/memory/write` continuity can now also enter the same governed workflow producer even when callers do not provide explicit `execution_state_v1` or `execution_packet_v1`, as long as resumable handoff fields are present
10. `handoff/store` now also flows through the generic workflow producer, so ordinary handoff-backed continuity writes can progress into planner-visible workflow guidance without going through replay
11. `memory/events` session-event writes can now also participate in the generic workflow producer when callers provide explicit execution continuity, so session-backed execution runs no longer require replay or handoff to enter workflow guidance
12. the current continuity-backed producer family now shares one Lite projected-write commit pipeline across `memory/write`, `handoff/store`, and `memory/events`, reducing the risk that workflow projection, commit, and inline embedding semantics drift by route
13. continuity-backed producer preconditions and distinct-observation semantics are now covered by an explicit projection contract test instead of remaining only implicit in route behavior
14. `execution/introspect` now exposes continuity-producer provenance and compact inventory counts for projected workflow memory, so operator/debug workflows can see which workflow rows were produced by generic execution-write projection without widening the default planner surface
15. Lite now has a first `suppress-first` operator intervention slice for learned pattern reuse, with dedicated `patterns/suppress` and `patterns/unsuppress` routes that preserve learned credibility while blocking trusted selector reuse
16. selector and introspection surfaces now expose suppression as operator overlay state, so a historically trusted pattern can remain learned-trusted while still being operator-blocked in live selection
17. Lite now has a repeatable `benchmark:lite:real` command that exercises policy learning, cross-task isolation, nearby-task generalization, contested revalidation cost, wrong-turn recovery, workflow progression, multi-step repair continuity, and the slim planner/context boundary on fresh SQLite-backed route fixtures instead of relying only on one-off validation notes
18. Lite now has a dedicated pattern-trust robustness spec and a follow-on hardening plan, because benchmark evidence was able to expose the original cross-task bleed and cheap contested recovery baseline before the current hardening slices tightened both behaviors
19. pattern anchors now persist explicit trust-hardening metadata such as `task_family`, `error_family`, distinct family counts, and current gate metadata, so the next trust-hardening slice no longer depends on implicit branch logic alone
20. Lite now requires `3` distinct positive runs before a pattern becomes `trusted` by default, and contested recovery now requires `2` fresh post-contest runs before revalidation; one narrow `tools/feedback` `form_pattern` governance path can now override `provisional/candidate -> stable/trusted` under bounded semantic-review control
21. selector reuse now applies deterministic task-affinity weighting, so nearby cross-task recall can remain visible without inheriting flat trusted reuse
22. selector and execution introspection route contracts now expose persisted pattern `trust_hardening` metadata directly, so operator/debug and benchmark surfaces no longer need to infer current gate and revalidation semantics indirectly from internal anchor payloads
23. the generic workflow producer now has an explicit source-provenance observation contract, so equivalent continuity payloads stay in one workflow family and repeated writes from the same underlying source no longer inflate workflow maturity through duplicate projection rows

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/replay-learning.ts`
3. `src/app/planning-summary.ts`
4. `src/memory/workflow-candidate-aggregation.ts`
5. `src/memory/execution-introspection.ts`
6. `scripts/ci/lite-replay-governed-learning-projection-route.test.ts`
7. `src/memory/workflow-write-projection.ts`
8. `scripts/ci/lite-memory-write-workflow-projection-route.test.ts`
9. `scripts/ci/lite-handoff-workflow-projection-route.test.ts`
10. `scripts/ci/lite-session-event-workflow-projection-route.test.ts`
11. `src/memory/pattern-operator-override.ts`
12. `scripts/ci/lite-pattern-suppress-route.test.ts`
13. `scripts/lite-real-task-benchmark.ts`
14. `docs/plans/2026-03-21-lite-pattern-trust-robustness-spec.md`
15. `docs/plans/2026-03-21-lite-pattern-trust-hardening-plan.md`

### 6. Runtime-Governed Adjudication Contract

Implemented status: `Partially Implemented`

What is real:

1. the schema family for governed memory operations exists
2. Lite explicitly models admissibility-requiring operations
3. proposals and admissibility results have stable contract shapes
4. rehydration already follows the runtime-governed model in product behavior
5. Lite now has internal-only semantic-review slices for both `form_pattern` and `promote_memory`, where the runtime builds bounded review packets, accepts bounded review results, and still keeps final admissibility under deterministic runtime control
6. replay-governed repair review now emits a bounded `promote_memory` governance preview on approved learning-projection paths, can optionally evaluate a supplied bounded review result through runtime admissibility, exposes a bounded `policy_effect` preview, allows that policy effect to influence replay learning projection `target_rule_state` in one narrow case (`draft -> shadow`), and now also emits a stable governance `decision_trace` that records the packet/review/admissibility/policy-effect/apply chain for auditability
7. `tools/feedback` now also has a bounded `form_pattern` governance path when pattern-anchor formation has at least two matched source nodes, and that route can now optionally accept a bounded review result, evaluate runtime admissibility, derive a bounded `policy_effect` preview, and in one narrow case apply `provisional/candidate -> stable/trusted` to the persisted pattern anchor while returning a stable preview packet, admissibility result, policy-effect preview, decision trace, and explicit trust-hardening override markers

Primary code:

1. `src/memory/schemas.ts`
2. `src/memory/governance.ts`
3. `src/memory/form-pattern-governance.ts`
4. `scripts/ci/lite-memory-governance-contract.test.ts`
5. `scripts/ci/lite-form-pattern-governance-contract.test.ts`

What is not yet fully real:

1. the general governed operations are not all exposed as public product routes
2. only `form_pattern` and `promote_memory` have concrete internal semantic-review slices so far; the rest of the governed operations are still contract-first
3. replay repair review now accepts an optional bounded review result for governance preview, can narrowly influence replay learning target rule state, and exposes a bounded decision trace for auditability, but still does not let governance directly widen mutation scope beyond that one bounded configuration effect
4. the schema family is still ahead of the route/product surface

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
4. structured execution-continuity ordinary writes can now project governed workflow memory into the planner recall path
5. a minimal operator stop-loss path now exists for learned pattern reuse through `patterns/suppress` and `patterns/unsuppress`
6. lightweight handoff-style continuity can now enter the generic workflow producer without requiring explicit execution-state or packet scaffolding

But:

1. Lite does not yet have a broad automatic promotion pipeline from arbitrary event streams into reusable workflow or pattern memory
2. the strongest stable promotion paths still come from replay-centered or explicit continuity entry points
3. Lite still does not have the broader operator intervention surface proposed in ADR-0002 beyond the new `suppress-first` slice

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/tools-pattern-anchor.ts`
3. `src/memory/workflow-write-projection.ts`
4. `src/memory/write.ts`

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
| Replay-learning workflow maturity | Implemented | Candidate-to-stable path is visible, aggregated, and route-tested through the replay-governed producer path. |
| Runtime-governed adjudication model | Partially Implemented | Strong schema/contract, partial public product surface. |
| Tier-aware memory semantics | Partially Implemented | Tier model exists; lifecycle control plane does not. |
| Distillation beyond replay/tools entry points | Partially Implemented | Replay/tool-feedback remain strongest, but structured and lightweight continuity writes now produce governed workflow memory, including conservative generic-path auto-promotion. |
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

### Priority 1: Broaden Automatic Workflow Promotion Beyond Current Strong Entry Points

Why:

1. replay- and replay-governed workflow promotion paths are now real and route-tested
2. structured execution-continuity ordinary writes now also produce governed workflow memory
3. lightweight handoff-style continuity now also enters the same producer without explicit packet/state scaffolding
4. broader event-to-workflow promotion is still narrower than the overall execution-memory direction

Concrete next step:

1. extend governed workflow-candidate creation beyond the current replay-centered producer paths
2. keep it signature-gated and compatible with the same workflow candidate aggregation and promotion-ready semantics

### Priority 2: Decide Whether Governed Mutation APIs Stay Internal Or Become Public

Why:

1. the governance model already names `promote_memory`, `compress_memory`, `form_pattern`, and `derive_policy_hint`
2. today those mostly exist as schemas and contract helpers

Concrete next step:

1. choose a deliberate boundary
2. either expose a Lite-governed route family
3. or mark them explicitly internal for now and stop implying near-term public availability
4. treat the new `suppress-first` slice as the only current runtime-real operator intervention baseline

### Priority 3: Harden Pattern Trust Before Treating Current Thresholds As Production-Grade

Why:

1. the benchmark suite now directly shows `cross_task_bleed_observed = false`
2. the benchmark suite now directly shows `contested_revalidation_fresh_runs_needed = 2`
3. current promotion now requires `3` distinct runs, and selector reuse is already affinity-weighted

Concrete next step:

1. execute the hardening work packages in [docs/plans/2026-03-21-lite-pattern-trust-hardening-plan.md](/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-lite-pattern-trust-hardening-plan.md)
2. treat route-visible `trust_hardening` as the stable contract surface for current promotion and revalidation semantics
3. only then decide whether to raise the promotion gate or strengthen the post-contest revalidation floor again
4. keep widening benchmark coverage before expanding selector authority further

### Priority 4: Define The Lite Position On Tier Lifecycle

Why:

1. Aionis clearly has tier-aware memory
2. Aionis clearly does not yet have the full lifecycle platform

Concrete next step:

1. decide whether Aionis should gain a narrow local-only lifecycle surface
2. or keep lifecycle orchestration entirely outside the standalone local runtime and strengthen the current partial-local rehydration story instead

### Priority 5: Productize Maintenance Rather Than Just Summaries

Why:

1. lifecycle and maintenance summaries now exist
2. but the underlying maintenance system is still only partly real

Concrete next step:

1. define a minimal Lite maintenance model
2. specify what runs online
3. specify what runs offline
4. specify what is operator-visible and what is internal only

### Priority 6: Preserve The Slim Default Planner/Context Contract

Why:

1. the default planner/context surface is now intentionally slim and aligned with the product contract
2. this should remain true even as more workflow and pattern signals are added

Concrete next step:

1. keep `layered_context` out of the default planner/context response
2. continue treating explicit `return_layered_context=true` and introspection as the heavy inspection surfaces

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
4. live governance paths are starting to share a common internal pipeline for trace/reason/apply plumbing
5. workflow auto-promotion now exposes a first bounded `promote_memory` governance preview surface
6. workflow auto-promotion preview can now evaluate bounded review results and emit admissibility/policy-effect trace without changing promotion semantics
