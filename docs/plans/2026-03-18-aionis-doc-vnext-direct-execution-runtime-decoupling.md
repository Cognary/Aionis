# Aionis Doc vNext: Direct Execution + Runtime Decoupling

**Status:** Draft  
**Date:** 2026-03-18  
**Owner:** Aionis Core

## 1. Why This Document Exists

Aionis Doc has made clear progress as:

1. an authoring format
2. a compiler target
3. a runtime continuity carrier
4. a handoff publish and recover surface

But the current product shape still has three structural limits:

1. it is too tightly coupled to Aionis continuity and memory flows
2. it does not yet close the loop from `Doc -> execute -> result`
3. it behaves more like an infra pipeline than a primary user entrypoint

This document defines the next architecture step required to move Aionis Doc from:

`execution continuity protocol`

toward:

`portable executable document interface`

## 2. Current Diagnosis

Today the dominant path is:

`Doc -> compile -> runtime-handoff -> handoff/store -> recover`

This path is useful, but it creates the wrong product gravity if it remains the only first-class path.

### 2.1 Tight Aionis Binding

The current public workflow is strongly optimized for Aionis-native continuity:

1. compile into Aionis-specific contracts
2. publish through Aionis handoff memory
3. recover through Aionis-native endpoints

That is excellent for Aionis itself, but weak for external adoption. A document protocol should not require every adopter to also adopt the full Aionis runtime and memory layer.

### 2.2 No Direct Execution Closure

The compiler produces:

1. AST
2. IR
3. graph
4. runtime handoff

But it does not yet produce a first-class direct execution path. As a result, Aionis Doc is still closer to an execution carrier than a full execution protocol.

### 2.3 Toolchain First, User Entry Second

The current user path is:

1. write a document
2. run several CLI commands
3. inspect intermediate envelopes
4. publish and recover continuity

That is valid for infra and integration work, but it does not yet make the document itself the most obvious operational entrypoint.

## 3. Corrected Product Positioning

The right current positioning is:

**Aionis Doc is an Execution Continuity Protocol with an emerging execution interface.**

It is not yet:

1. a complete AI collaboration language
2. a general execution runtime
3. a universally portable workflow system

This corrected positioning matters because it prevents product and documentation drift.

## 4. vNext Goal

The next milestone is not “more directives” or “more compiler detail.”

The next milestone is:

**Make Aionis Doc directly executable, while making Aionis continuity an optional enhancement layer rather than a mandatory dependency.**

That requires three architectural shifts:

1. `Doc -> Direct Execution`
2. `Runtime Decoupling`
3. `Capability Downgrade`

## 5. Target Architecture

The architecture should split into four layers.

### 5.1 Layer A: Authoring and Compile

This layer remains format-focused and runtime-agnostic.

Inputs:

1. `.aionis.md` source

Outputs:

1. AST
2. IR
3. graph
4. diagnostics
5. execution plan

This layer must not depend on Aionis memory, handoff storage, or recover APIs.

### 5.2 Layer B: Execution Plan

This is the new portability layer.

The compiler should emit a stable `execution_plan_v1` artifact that represents:

1. normalized document identity
2. context inputs
3. execution nodes
4. dependency graph
5. replay hints
6. required capabilities
7. expected outputs

This is the contract that direct execution runtimes consume.

The key rule:

`execution_plan_v1` must be runtime-neutral.

It must not encode Aionis handoff storage assumptions.

### 5.3 Layer C: Runtime Adapter

This layer executes a compiled plan against some runtime implementation.

The runtime adapter should expose a small standard interface such as:

1. `prepare(plan, options)`
2. `execute(plan, inputs, options)`
3. `resume(state, packet, options)`
4. `capabilities()`

This is where portability is created.

Examples:

1. `AionisRuntimeAdapter`
2. `LocalSingleProcessAdapter`
3. `ExternalWorkflowAdapter`

### 5.4 Layer D: Continuity Adapter

This layer is optional and Aionis-specific.

It turns execution artifacts into:

1. `runtime_handoff_v1`
2. `handoff_store_request`
3. publish results
4. recover results

This means Aionis continuity becomes a superpower, not a prerequisite.

## 6. New Primary Contracts

### 6.1 `execution_plan_v1`

This should become the primary portable compiled artifact.

Suggested top-level shape:

1. `plan_version`
2. `doc`
3. `context`
4. `executions`
5. `graph`
6. `expected_outputs`
7. `required_capabilities`
8. `determinism`
9. `diagnostics`

This contract should be the output of:

1. `compile-aionis-doc --emit plan`
2. `aionis doc compile --emit plan`

### 6.2 `execution_result_v1`

This should become the direct execution output.

Suggested top-level shape:

1. `result_version`
2. `plan_version`
3. `doc_id`
4. `status`
5. `outputs`
6. `node_results`
7. `artifacts`
8. `warnings`
9. `errors`
10. `replay_summary`

This contract is what closes the loop from document to result.

### 6.3 `runtime_handoff_v1`

This remains valid, but it should be repositioned.

It should no longer be treated as the primary compiled output.
It should be treated as:

`execution continuity adapter output for Aionis`

## 7. New Runtime Interface

The runtime layer needs a standard execution contract so that Aionis Doc is not hard-wired to one backend.

Suggested interface:

```ts
type ExecutionRuntime = {
  runtime_id: string;
  capabilities(): RuntimeCapabilities;
  execute(plan: ExecutionPlanV1, input: ExecutionRequestV1): Promise<ExecutionResultV1>;
  resume?(state: ExecutionStateV1, packet: ExecutionPacketV1, input?: ExecutionResumeRequestV1): Promise<ExecutionResultV1>;
};
```

Suggested capability surface:

1. `direct_execution`
2. `deterministic_replay`
3. `state_persistence`
4. `memory_publish`
5. `handoff_recover`
6. `module_registry`
7. `evidence_capture`

This lets Aionis remain the richest runtime while enabling weaker runtimes to participate.

## 8. Capability Downgrade Model

Portability depends on graceful degradation.

An adopter must be able to use Aionis Doc without implementing every Aionis feature.

### 8.1 Minimum Portable Mode

Required:

1. parse
2. compile
3. direct execute

Not required:

1. memory publish
2. handoff recover
3. replay storage
4. evidence persistence

### 8.2 Continuity-Enhanced Mode

Adds:

1. execution state persistence
2. packet continuity
3. recover and resume
4. publishable handoffs

This is the natural Aionis-native mode.

### 8.3 Full Aionis Mode

Adds:

1. continuity memory
2. replay inspection
3. policy-governed tool selection
4. execution intelligence and writeback

This model makes “not using Aionis” a supported downgrade, not a failure case.

## 9. Direct Execution Path

This is the most important missing product path.

The new primary workflow should become:

`Doc -> compile -> execute -> result`

And the extended Aionis path becomes:

`Doc -> compile -> execute -> continuity -> publish -> recover -> resume`

### 9.1 New Commands

Standalone package:

1. `execute-aionis-doc`

Main CLI:

1. `aionis doc execute`

### 9.2 Minimum Execution Scope

The first direct execution milestone should support only the stable subset:

1. `@doc`
2. `@context`
3. `@execute`
4. `@replay`

Do not block direct execution on:

1. `@memory`
2. `@evidence`
3. `@state`
4. advanced policy layers

### 9.3 Result Philosophy

The first shipped direct execution path can be narrow.

It does not need:

1. full scheduler abstraction
2. cross-runtime orchestration
3. advanced replay governance

It does need:

1. one document
2. one compiled plan
3. one runtime adapter
4. one result envelope

That is the minimum line between “carrier” and “executable protocol.”

## 10. Module Contract Standardization

Runtime decoupling is impossible unless execution nodes have a stable contract.

Each execution module should declare:

1. `module_id`
2. `version`
3. `input_schema`
4. `output_schema`
5. `determinism_level`
6. `side_effect_profile`
7. `required_capabilities`

Suggested determinism levels:

1. `deterministic`
2. `bounded_nondeterministic`
3. `interactive`

Suggested side-effect profiles:

1. `pure`
2. `local_io`
3. `network_read`
4. `network_write`
5. `human_approval_required`

Without this, execution portability remains hand-wavy.

## 11. CLI Surface Strategy

The CLI should be intentionally split.

### 11.1 Portable Path

This path should work without Aionis continuity:

1. `compile`
2. `execute`

### 11.2 Aionis Continuity Path

This path should remain available as an enhanced workflow:

1. `runtime-handoff`
2. `store-request`
3. `publish`
4. `recover`

This makes the product story much cleaner:

1. Aionis Doc can be used anywhere at compile and execute level
2. Aionis gives the best continuity, memory, and replay implementation

## 12. Recommended Product Narrative

The public narrative should shift from:

“Aionis Doc is the format that publishes into Aionis handoff memory.”

to:

“Aionis Doc is a portable executable document protocol. Aionis is the richest runtime and continuity implementation for it.”

That framing is strategically stronger.

It allows:

1. external adoption
2. better ecosystem positioning
3. cleaner product layering
4. better internal architecture decisions

## 13. Proposed Roadmap

### Phase 1: Direct Execution MVP

Deliver:

1. `execution_plan_v1`
2. `execution_result_v1`
3. `execute-aionis-doc`
4. `aionis doc execute`
5. one local runtime adapter

Non-goals:

1. publish
2. recover
3. memory integration changes

### Phase 2: Runtime Decoupling

Deliver:

1. standard runtime interface
2. module contract schema
3. Aionis runtime adapter
4. local direct runtime adapter

Non-goals:

1. multi-runtime federation
2. plugin marketplace

### Phase 3: Capability Downgrade

Deliver:

1. optional memory features
2. optional replay features
3. portable feature negotiation
4. clear diagnostics for unsupported runtime capabilities

### Phase 4: Continuity as Enhancement Layer

Deliver:

1. clean mapping from `execution_result_v1` to `runtime_handoff_v1`
2. continuity writeback hooks
3. resume bridge from recovered handoffs back into `execute`

At this point Aionis Doc becomes both:

1. directly executable
2. continuity-aware

## 14. Non-Goals for This vNext Design

This design does not propose:

1. a new general-purpose language
2. speculative plugin ecosystems
3. immediate multi-agent orchestration syntax
4. replacing Aionis runtime internals in one step
5. making every current Aionis continuity object public and portable

The point is to establish the right layering, not to overbuild.

## 15. Acceptance Criteria

This vNext direction should be considered real only if all of the following become true:

1. a document can execute without publish or recover
2. compile output includes a runtime-neutral `execution_plan_v1`
3. execution returns a stable `execution_result_v1`
4. Aionis continuity flows consume execution artifacts as an optional adapter layer
5. a runtime without Aionis memory can still compile and execute a valid document

## 16. Recommended Immediate Next Work

The next implementation sequence should be:

1. define `execution_plan_v1`
2. define `execution_result_v1`
3. add `--emit plan`
4. add `execute-aionis-doc`
5. add `aionis doc execute`
6. implement one minimal local runtime adapter
7. refactor Aionis handoff generation to consume execution artifacts instead of acting as the primary output path

## 17. Final Position

If Aionis Doc stays only on the current path, it will likely remain:

`a strong Aionis-specific continuity format`

If it executes this vNext architecture, it can become:

`a portable executable document protocol with Aionis as its strongest runtime implementation`

That is the real strategic fork.
