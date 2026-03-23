# Aionis Lite Governance And Strategy Status

Last reviewed: 2026-03-23

This document compares the current `Aionis Lite` runtime against:

1. [LITE_MEMORY_GOVERNANCE_MODEL.md](./LITE_MEMORY_GOVERNANCE_MODEL.md)
2. [LITE_EXECUTION_MEMORY_STRATEGY.md](./LITE_EXECUTION_MEMORY_STRATEGY.md)

The goal is to record:

1. what is already real in the current Lite runtime
2. what is only partially implemented
3. what remains contract-first or roadmap-first
4. what should be prioritized next

## Executive Summary

Current overall judgment:

1. the execution-memory thesis is real, stable, and no longer the main unknown
2. the three live governance paths are real runtime behavior, not just schema scaffolding
3. Lite now has a shared internal governance stack that reaches from adjudication modules to runtime builder wiring
4. Lite has now also been validated against a real external LLM governance backend in shadow mode without outcome drift on the current benchmark suite
5. the largest unfinished area is no longer basic workflow/pattern correctness, but productionizing real external governance behavior, lifecycle/maintenance posture, and broader governed operations

Current confidence by area:

1. execution-memory mainline: high
2. planner/packet/runtime contract: high
3. policy learning and selector reuse: high
4. workflow progression and generic continuity-backed promotion: high
5. governance runtime behavior on current live paths: high
6. internal governance model-client architecture: high
7. real route-level validation and benchmark posture: high
8. external LLM governance shadow alignment: medium-high
9. lifecycle and maintenance platform: medium-low
10. fully productized operator governance surface: medium-low

## 1.0 Readiness Judgment

Current release-readiness judgment:

1. Lite is now strong enough to describe as a real local execution-memory product, not an active thesis
2. the core differentiation risk is no longer whether workflow and pattern learning work at all
3. the remaining risk is concentrated in external-governance production posture, maintenance/lifecycle productization, and how much operator control should become public surface

More precise interpretation:

1. execution memory, workflow progression, pattern trust hardening, and slim planner/context surfaces are stable enough to treat as product behavior
2. replay, workflow-write promotion, and tools feedback all now have bounded governance packet/result/admissibility/policy/apply chains
3. the internal governance stack is now shared and replaceable:
   - adjudication modules
   - builtin client
   - model client factory
   - provider factory
   - runtime builder
4. a real external Anthropic-compatible HTTP backend has now been used in shadow benchmark mode and matched builtin/static governed outcomes across workflow, tools, and replay
5. Lite still does not expose a full operator control plane, lifecycle platform, or broad hosted-production posture

What this means in practice:

1. if Lite is positioned as a local, single-user, execution-memory-first runtime, it is already beyond a fragile `0.x research slice`
2. if Lite is positioned as a broadly hosted, multi-tenant, human-governed control plane, real gaps still remain
3. those gaps are now mostly around external model operations, maintenance posture, and public governance boundaries rather than around the core memory loops

## What Is Already Implemented

### 1. Local Execution-Memory Kernel

Implemented status: `Implemented`

Current runtime reality:

1. Lite is a standalone local SQLite runtime
2. replay, playbooks, context assembly, tool-decision memory, sandbox, and automation kernel paths are all present
3. repository and public framing now match the runtime-core identity

Primary code:

1. `src/app/runtime-services.ts`
2. `src/host/http-host-sdk-demo.ts`
3. `src/routes/memory-context-runtime.ts`
4. `src/memory/replay.ts`

### 2. Anchor-Guided Rehydration Loop

Implemented status: `Implemented`

Document claim:

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

Current runtime reality:

1. stable workflow anchors are produced from replay and continuity-backed workflow promotion
2. planning and context assembly expose planner-facing workflow and rehydration signals
3. runtime tool hints expose `rehydrate_payload`
4. anchor payload rehydration is available as an explicit runtime action

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/runtime-tool-hints.ts`
3. `src/memory/rehydrate-anchor.ts`
4. `src/routes/sdk-demo-memory-access.ts`

### 3. Execution Policy Learning Loop

Implemented status: `Implemented`

Document claim:

`feedback -> pattern -> recall -> selector reuse`

Current runtime reality:

1. tool feedback can form pattern anchors
2. pattern anchors move across `candidate`, `trusted`, `contested`, and `revalidated` states
3. trusted patterns influence selector ordering and planner summaries
4. explicit `tool.prefer` still outranks learned reuse
5. contested patterns become visible but not trusted
6. task-affinity weighting prevents flat cross-task trusted bleed

Primary code:

1. `src/memory/tools-feedback.ts`
2. `src/memory/tools-pattern-anchor.ts`
3. `src/memory/tools-select.ts`
4. `src/app/planning-summary.ts`

### 4. Planner Packet, Signal Surfaces, And Execution Kernel

Implemented status: `Implemented`

Current runtime reality:

1. `planner_packet` is the canonical full collection surface
2. `workflow_signals` and `pattern_signals` are canonical route-level signal surfaces
3. `execution_kernel` is the compact aligned runtime summary
4. `planning_summary` and `assembly_summary` expose workflow guidance, pattern trust, and rehydration availability
5. `execution/introspect` is the heavy debug/operator inspection path

Primary code:

1. `src/routes/memory-context-runtime.ts`
2. `src/app/planning-summary.ts`
3. `src/memory/context-orchestrator.ts`
4. `src/memory/schemas.ts`

### 5. Workflow Progression And Generic Continuity-Backed Promotion

Implemented status: `Implemented`

Current runtime reality:

1. replay-learning candidates can progress to stable workflow guidance
2. `/v1/memory/write` continuity writes can project governed workflow memory
3. lightweight handoff-style continuity can enter the same workflow producer
4. `handoff/store` and `memory/events` can flow through the generic workflow producer when continuity requirements are satisfied
5. the continuity-backed producer family shares one projected-write commit pipeline
6. source-provenance and distinct-observation semantics are contract-tested
7. workflow family identity now stays aligned across packet continuity and lightweight handoff continuity
8. stable workflow nodes can now also carry governance preview/apply state through workflow promotion

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/workflow-write-projection.ts`
3. `src/memory/workflow-candidate-aggregation.ts`
4. `src/memory/workflow-promotion-governance.ts`
5. `scripts/ci/lite-memory-write-workflow-projection-route.test.ts`
6. `scripts/ci/lite-handoff-workflow-projection-route.test.ts`
7. `scripts/ci/lite-session-event-workflow-projection-route.test.ts`

### 6. Runtime-Governed Adjudication On Live Paths

Implemented status: `Implemented On Current Live Paths`

Current runtime reality:

1. `form_pattern` and `promote_memory` both have bounded semantic review packets and bounded review results
2. runtime admissibility remains deterministic and final
3. replay repair review has:
   - review packet
   - review result
   - admissibility
   - policy-effect preview
   - narrow runtime apply
   - decision trace
4. tools feedback has:
   - review packet
   - review result
   - admissibility
   - policy-effect preview
   - narrow runtime apply
   - decision trace
5. workflow auto-promotion now also has:
   - review packet
   - review result
   - admissibility
   - policy-effect preview
   - real apply
   - decision trace
6. replay, workflow, and tools now share:
   - governed preview runner
   - operation-specific shared runners
   - decision-trace helpers
   - policy-effect preview helpers
   - runtime-apply gate helpers

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/tools-feedback.ts`
3. `src/memory/workflow-promotion-governance.ts`
4. `src/memory/governance-operation-runner.ts`
5. `src/memory/governance-shared.ts`
6. `src/memory/promote-memory-governance-shared.ts`
7. `src/memory/form-pattern-governance-shared.ts`

### 7. Internal Governance Model-Client Architecture

Implemented status: `Implemented`

Current runtime reality:

1. Lite has shared adjudication modules for `promote_memory` and `form_pattern`
2. builtin governance model clients are thin wrappers over those adjudication modules
3. model-client selection is centralized in a shared factory
4. provider selection is centralized in a shared provider factory
5. runtime route wiring is centralized in a shared runtime provider builder
6. internal callers can inject a custom `modelClientFactory`
7. runtime wiring can override model-client mode per live path
8. HTTP governance clients now support both OpenAI-compatible chat completions and Anthropic-compatible messages transports

Primary code:

1. `src/memory/promote-memory-governance-adjudication.ts`
2. `src/memory/form-pattern-governance-adjudication.ts`
3. `src/memory/governance-model-client-builtin.ts`
4. `src/memory/governance-model-client-factory.ts`
5. `src/memory/governance-provider-factory.ts`
6. `src/app/governance-runtime-providers.ts`
7. `src/memory/governance-model-client-http.ts`
8. `src/memory/governance-model-client-http-contract.ts`

### 8. Real Validation And Benchmark Posture

Implemented status: `Implemented`

Current runtime reality:

1. Lite has an isolated real validation flow that writes artifacts outside the repository
2. the real benchmark suite currently passes `14/14`
3. benchmark baseline artifacts support:
   - status regression gates
   - score drop thresholds
   - hard/soft profile drift gates
4. HTTP governance prompt and response contract versions are included in the stable benchmark profile
5. provider precedence and custom replacement hooks are benchmarked
6. external HTTP shadow compare is benchmarked on the same runtime task arcs as local builtin/static governance

Primary code:

1. `scripts/lite-real-task-benchmark.ts`
2. `scripts/lite-real-validation.sh`
3. `docs/LITE_TESTING_STRATEGY.md`
4. `docs/LITE_REAL_TASK_BENCHMARK_REPORT.md`

### 9. Real External LLM Shadow Alignment

Implemented status: `Implemented In Shadow Mode`

Current runtime reality:

1. Lite now has a real external HTTP governance shadow-run path
2. an Anthropic-compatible external backend has already been run through the full benchmark suite
3. the current external benchmark validation has matched builtin/static governed outcomes across:
   - workflow promotion
   - tools feedback pattern formation
   - replay-governed learning projection
4. the current verified external benchmark configuration is:
   - backend kind: `external`
   - transport: `anthropic_messages_v1`
   - backend family: Anthropic-compatible HTTP

Interpretation:

1. Lite is no longer only internally self-consistent
2. Lite has now been validated against a real external LLM governance backend in shadow mode
3. the current evidence shows governed outcome alignment, not just transport connectivity

Primary evidence:

1. `scripts/lite-real-task-benchmark.ts`
2. `docs/LITE_REAL_TASK_BENCHMARK_REPORT.md`
3. `docs/LITE_TESTING_STRATEGY.md`

## What Is Only Partially Implemented

### 1. Tier-Aware Memory Without A Full Lifecycle Platform

Status: `Partially Implemented`

Current reality:

1. Lite nodes already carry `hot`, `warm`, `cold`, and `archive` tier state
2. context assembly already applies tier-aware forgetting and filtering
3. anchors and recall already treat tier as a ranking/filtering signal

But:

1. Lite does not expose a full archive/activation lifecycle control plane
2. `/v1/memory/archive/rehydrate*` remains unsupported in Lite
3. `/v1/memory/nodes/activate*` remains unsupported in Lite

Primary code:

1. `src/memory/context-orchestrator.ts`
2. `src/store/lite-write-store.ts`
3. `src/host/lite-edition.ts`

### 2. Distillation Beyond Current Strong Entry Points

Status: `Partially Implemented`

Current reality:

1. replay, workflow-write continuity, handoff-backed continuity, and session events can all contribute to workflow memory
2. tools feedback is a strong pattern-learning path
3. the current producer family is more generic than before

But:

1. Lite still does not have a broad arbitrary-event distillation platform
2. the strongest stable promotion paths still come from replay or explicit continuity-rich writes
3. general pattern formation is still narrower than a full memory-governance platform

Primary code:

1. `src/memory/replay.ts`
2. `src/memory/workflow-write-projection.ts`
3. `src/memory/tools-pattern-anchor.ts`
4. `src/memory/write.ts`

### 3. Maintenance Model

Status: `Partially Implemented`

Current reality:

1. workflow and pattern memory carry maintenance and lifecycle summaries
2. planner and execution-kernel surfaces expose maintenance-adjacent language

But:

1. Lite still does not have a productized nightly/batch maintenance subsystem
2. promotion, demotion, relocation, redundancy cleanup, and stale-anchor cleanup are not yet one operator-facing system
3. the maintenance model is still more descriptive than operational

Primary code:

1. `src/memory/tools-pattern-anchor.ts`
2. `src/memory/replay.ts`
3. `src/app/planning-summary.ts`

### 4. External Governance As Production Default

Status: `Partially Implemented`

Current reality:

1. real external governance shadow runs are now working
2. Anthropic-compatible HTTP transport is supported
3. prompt and response contracts are versioned and benchmark-monitored

But:

1. the real external backend is still shadow-mode validated, not the default governance path
2. latency, retries, budgets, and failure posture are not yet productized
3. there is not yet a formal operator policy for when external shadow can graduate to applied mode

Primary code:

1. `src/memory/governance-model-client-http.ts`
2. `src/memory/governance-model-client-http-contract.ts`
3. `scripts/lite-real-task-benchmark.ts`
4. `scripts/lite-real-validation.sh`

## What Remains Contract-First Or Roadmap-First

### 1. General Governed Mutation APIs Beyond Current Live Paths

Status: `Contract-First`

Current reality:

1. `promote_memory`
2. `compress_memory`
3. `form_pattern`
4. `derive_policy_hint`
5. `rehydrate_payload`

all exist as governed operation names or request/adjudication schemas.

But:

1. only `form_pattern` and `promote_memory` are strongly runtime-real as current governance slices
2. `rehydrate_payload` is runtime-real as an action, but not part of a broad governed mutation route family
3. the remaining operations are still mostly contract-first

### 2. Policy-Hint Productization

Status: `Mostly Roadmap`

Current reality:

1. policy-hint governance is named in the contracts
2. some selector reuse behavior already reflects learned policy

But:

1. there is not yet a first-class Lite operator surface for policy hints
2. this is still more architecture direction than product surface

### 3. Full Offline Lifecycle And Importance Operations

Status: `Mostly Roadmap`

Current reality:

1. lifecycle and maintenance state are surfaced
2. the strategy documents define online plus offline paths

But:

1. Lite does not yet expose a complete operating system for demotion, archival relocation, stale cleanup, and redundancy reduction
2. this remains ahead of current operational product shape

## Consolidated Progress Matrix

| Area | Status | Notes |
|---|---|---|
| Local execution-memory kernel | Implemented | Repository and runtime identity now match. |
| Anchor-guided rehydration loop | Implemented | Stable workflow recall and rehydration are real. |
| Execution policy learning loop | Implemented | Feedback -> pattern -> selector reuse is real and hardened. |
| Planner packet / signal / execution-kernel contract | Implemented | Stable and route-tested. |
| Workflow progression and generic continuity producer | Implemented | Replay plus ordinary continuity-backed producer family is now real. |
| Runtime-governed adjudication on current live paths | Implemented | Replay, workflow, and tools all have bounded preview/result/admissibility/policy/apply chains. |
| Internal governance model-client stack | Implemented | Adjudication modules -> client -> factory -> provider -> runtime builder is real. |
| Real validation and benchmark posture | Implemented | Isolated validation, baseline compare, regression gates, and profile policy are real. |
| Real external LLM shadow alignment | Implemented in shadow mode | Current external backend matches governed outcomes on the benchmark suite. |
| Tier-aware memory semantics | Partially Implemented | Tier semantics exist; lifecycle control plane does not. |
| Distillation beyond strong entry points | Partially Implemented | Broader than before, but not yet a general arbitrary-event distillation platform. |
| Maintenance model | Partially Implemented | Summaries exist; operator-facing maintenance system does not. |
| External governance as production default | Partially Implemented | Shadow validated, not productized as default applied mode. |
| General governed mutation API family | Contract-First | Beyond current live slices, mostly not public. |
| Policy-hint subsystem | Mostly Roadmap | Direction exists; product surface does not. |
| Full lifecycle control plane | Mostly Roadmap | Explicitly outside current Lite product shape. |

## Recommended Next Steps

### Priority 1: Productize Real External Governance Operations

Why:

1. real external shadow alignment now exists
2. this is now the highest-leverage unfinished step on the governance side

Concrete next step:

1. define retry, timeout, and degraded-mode policy for external governance calls
2. define the exact operator rule for when shadow mode can graduate to applied mode
3. decide whether external governance stays workflow/tools/replay-scoped or widens further
4. add benchmark and validation coverage for latency/failure budgets

### Priority 2: Expand Governed Operations Beyond The Current Three Live Paths

Why:

1. the current governance stack is now real and shared
2. it is ready to support more than the current replay/workflow/tools slices

Concrete next step:

1. choose the next highest-value governed operation
2. likely candidates are:
   - broader workflow promotion slices
   - policy-hint derivation
   - limited compress/maintenance operations

### Priority 3: Productize Maintenance Rather Than Summaries

Why:

1. lifecycle and maintenance state are already visible
2. actual maintenance behavior still lacks a product surface

Concrete next step:

1. define what runs online
2. define what runs offline
3. define what is operator-visible versus internal-only
4. define the minimum Lite lifecycle surface that should be real

### Priority 4: Decide Which Governed Operations Stay Internal

Why:

1. the internal governance stack is now strong enough that the public/internal boundary matters more
2. ambiguity here will create surface drift

Concrete next step:

1. explicitly mark which operations remain internal
2. explicitly mark which operations are candidates for public productization
3. avoid implying near-term public availability for contract-only operations

### Priority 5: Preserve And Tighten The Benchmark Contract

Why:

1. benchmark and profile gates are now one of the strongest product-defense layers
2. prompt/response drift and external shadow alignment are now part of the core contract

Concrete next step:

1. keep prompt/response versions and outcome-match signals in the hard profile
2. add more long-chain execution-memory arcs only if they defend real product claims
3. avoid diluting the suite with low-value synthetic scenarios

### Priority 6: Preserve The Slim Default Planner/Context Surface

Why:

1. the slim default surface is now a core product contract
2. governance and external-model growth can easily re-bloat it if left unchecked

Concrete next step:

1. keep heavy governance and lifecycle inspection in explicit debug/operator surfaces
2. do not let richer governance internals leak into default planner/context payloads

## Final Assessment

Lite has already crossed the important threshold.

It is no longer merely moving toward the strategy and governance documents.
It now implements the main product story:

1. execution memory
2. anchor-guided rehydration
3. policy learning through trusted patterns
4. runtime-governed semantics on current live paths
5. replaceable internal governance model-client architecture
6. real external LLM shadow alignment on benchmarked governed outcomes

The remaining gap is now much narrower:

1. productize real external governance operations
2. widen governed operations only where product value justifies it
3. settle lifecycle and maintenance posture
4. keep the benchmark contract strong while preserving the slim surface

In short:

1. strategy is live
2. governance is live on current paths
3. external shadow alignment is now real
4. the next phase is operational hardening and product-boundary clarity, not thesis discovery
