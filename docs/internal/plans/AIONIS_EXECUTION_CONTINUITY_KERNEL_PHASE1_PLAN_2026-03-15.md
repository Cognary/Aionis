# Aionis Execution Continuity Kernel Phase 1 Plan

Date: `2026-03-15`
Status: `proposed execution plan`
Depends on:
- [AIONIS Execution Continuity Kernel ADR](/Users/lucio/Desktop/Aionis-worktrees/execution-continuity-phase1/docs/internal/architecture/AIONIS_EXECUTION_CONTINUITY_KERNEL_ADR_2026-03-15.md)
- [Generic Adapter Core Architecture](/Users/lucio/Desktop/Aionis-worktrees/execution-continuity-phase1/docs/internal/architecture/2026-03-14-generic-adapter-core-architecture.md)

## Summary

Phase 1 exists to make the kernel direction executable without breaking the current product line.

The approved direction is to evolve Aionis from memory-centered continuity into execution-state continuity for coding agents. The implementation rule for Phase 1 is stricter:

1. no big-bang rewrite
2. no public route breakage
3. no regression to the current `@aionis/openclaw-adapter` benchmarked path
4. no generic workflow-engine abstractions

Phase 1 will introduce the minimum durable execution contract behind existing routes.

## Goals

Phase 1 must achieve all of the following:

1. define a narrow `ExecutionState v1` schema
2. define a narrow `ExecutionPacket v1` schema
3. define a data-driven `ControlProfile v1` schema
4. establish source-of-truth rules for execution state updates
5. establish how the new contract overlays the existing routes without changing their public semantics
6. establish benchmark gates for future promotion

## Non-Goals

Phase 1 does not attempt to:

1. replace current `memory/write`, `context/assemble`, `handoff/store`, `handoff/recover`, or replay routes
2. migrate all existing runtime continuity to the new contract in one step
3. introduce generic DAG or business workflow abstractions
4. expose a new public kernel API family
5. fully tune role-aware control in runtime behavior

## Why Phase 1 Must Be Additive

Current product evidence already exists on top of the current Aionis surfaces and the OpenClaw adapter. The kernel direction is justified only if it improves those same surfaces.

The current proven path depends on:

1. `POST /v1/memory/context/assemble`
2. `POST /v1/memory/write`
3. `POST /v1/handoff/store`
4. `POST /v1/handoff/recover`
5. replay candidate and dispatch routes

Phase 1 therefore adds a new internal contract under the existing route family instead of replacing the route family.

## Phase 1 Deliverables

### 1. ExecutionState v1

`ExecutionState v1` is the minimum durable statement of coding-task execution continuity.

It is intentionally narrower than the full ADR target.

Required fields for v1:

1. `state_id`
2. `scope`
3. `task_brief`
4. `current_stage`
5. `active_role`
6. `owned_files`
7. `modified_files`
8. `pending_validations`
9. `completed_validations`
10. `last_accepted_hypothesis`
11. `rejected_paths`
12. `unresolved_blockers`
13. `rollback_notes`
14. `reviewer_contract`
15. `resume_anchor`
16. `updated_at`
17. `version`

Out of scope for v1:

1. arbitrary nested state trees
2. organization-specific approval semantics
3. generalized business workflow state

### 2. ExecutionPacket v1

`ExecutionPacket v1` is the consumer-facing delivery object assembled from execution state plus current continuity surfaces.

Required packet layers for v1:

1. `task_brief`
2. `hard_constraints`
3. `accepted_facts`
4. `rejected_paths`
5. `pending_validations`
6. `rollback_notes`
7. `review_contract`
8. `resume_anchor`
9. `evidence_refs`

The packet remains a coding-task continuity object. It is not a transcript dump.

### 3. ControlProfile v1

`ControlProfile v1` is data, not conditional sprawl.

Required initial profiles:

1. `triage`
2. `patch`
3. `review`
4. `resume`

Required control knobs:

1. `max_same_tool_streak`
2. `max_no_progress_streak`
3. `max_duplicate_observation_streak`
4. `max_steps`
5. `allow_broad_scan`
6. `allow_broad_test`
7. `escalate_on_blocker`
8. `reviewer_ready_required`

Phase 1 only defines the contract and default values. Runtime promotion can remain behind existing heuristics until Phase 2.

## Source-Of-Truth Rule

Phase 1 must establish a single rule:

1. transcript and summaries are supporting evidence
2. `ExecutionState` is the canonical continuity object for durable task status

This means:

1. route handlers may continue to read transcript-like inputs
2. state transitions must produce explicit state updates
3. packet assembly must prefer explicit state when present
4. missing state fields must degrade safely to `unknown` or empty lists

## Overlay Plan On Current Routes

Phase 1 overlays new internals onto existing surfaces as follows.

### `memory/write`

Role in Phase 1:

1. continues to accept existing write flows
2. may persist execution-state sidecar material when state-bearing metadata is present
3. does not change current response contract

### `handoff/store`

Role in Phase 1:

1. continues to store handoff memory objects
2. additionally records normalized execution-state projections when available
3. remains backward compatible for current callers

### `handoff/recover`

Role in Phase 1:

1. continues current recovery behavior
2. prefers explicit execution-state-backed packet assembly when present
3. preserves current response shape, optionally enriched internally first

### `context/assemble`

Role in Phase 1:

1. remains the main delivery surface for compact continuity
2. can assemble from `ExecutionState` and `ExecutionPacket` before falling back to recall-only assembly
3. keeps current public route semantics

### Replay surfaces

Role in Phase 1:

1. continue current replay semantics
2. allow future replay eligibility and reviewer packet projections to bind to the same execution contract
3. do not change deterministic replay rules yet

## Proposed Internal Layout

Phase 1 should add an internal kernel scaffold only.

```text
src/
  execution/
    types.ts
    packet.ts
    profiles.ts
    index.ts
```

This stage intentionally avoids route rewrites.

## Migration Sequence

### Step 1

Add internal schemas and builders.

Exit criteria:

1. build passes
2. kernel scaffold is type-safe
3. no route behavior changes yet

### Step 2

Define one narrow integration seam into existing continuity routes.

Recommended first seam:

1. packet assembly helper callable from `handoff/recover` and `context/assemble`

Exit criteria:

1. current route shapes preserved
2. explicit packet can be assembled from provided state

### Step 3

Promote one narrow real benchmark slice onto the new contract.

Recommended first slice:

1. real reviewer-ready workflow for OpenClaw adapter continuity

Exit criteria:

1. no regression on the current strongest real workflow slices
2. packet-backed continuity equals or exceeds current behavior on at least one real workflow scenario

## Benchmark Gates

Phase 1 must be judged by existing real product evidence, not by abstract architecture completion.

Minimum benchmark gate:

1. keep current real OpenClaw + real Lite + real provider workflow path non-regressing

Recommended benchmark set:

1. `dashboard auth drift reviewer-ready workflow`
2. `pairing / approval recovery reviewer-ready workflow`
3. `service token drift repair reviewer-ready workflow`
4. `markdown parser fallback reviewer-ready workflow`

Phase 1 should not be considered successful if it only creates new types while degrading these routes.

## Risks

### 1. Over-abstracting too early

Risk:

A giant generic kernel abstraction slows product progress and weakens current proof.

Mitigation:

1. keep the boundary fixed on coding-task continuity
2. only add v1 schema and packet layers
3. do not introduce generic workflow concepts

### 2. Creating a second summary blob

Risk:

`ExecutionState` becomes another transcript-like text object.

Mitigation:

1. require explicit fields
2. require typed packet layers
3. prefer narrow lists and anchors over prose blobs

### 3. Conditional policy sprawl

Risk:

role-aware control becomes many ad hoc branches.

Mitigation:

1. define `ControlProfile` as data
2. centralize defaults
3. keep profile selection explicit

## Immediate Next Actions

1. land `ExecutionState v1`, `ExecutionPacket v1`, and `ControlProfile v1` internal schemas
2. land a packet builder over those schemas
3. add a CI guard that preserves the Phase 1 scaffold
4. do not change public route contracts in the same change
5. only after that, plan the first route-level adoption PR
