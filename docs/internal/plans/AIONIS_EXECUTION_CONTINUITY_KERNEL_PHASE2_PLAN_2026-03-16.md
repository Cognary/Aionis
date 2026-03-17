# Aionis Execution Continuity Kernel Phase 2 Plan

Date: `2026-03-16`
Status: `active design and rollout plan`
Depends on:
- [AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE1_PLAN_2026-03-15.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE1_PLAN_2026-03-15.md)
- [AIONIS_EXECUTION_CONTINUITY_PHASE1_PROGRESS_2026-03-15.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_EXECUTION_CONTINUITY_PHASE1_PROGRESS_2026-03-15.md)
- [AIONIS_PROJECT_STATUS_2026-03-15.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_PROJECT_STATUS_2026-03-15.md)
- [AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md)

## Summary

Phase 2 exists to turn the Phase 1 continuity contract into a stronger execution kernel without breaking the current product wedge.

Phase 1 proved that:

1. `ExecutionState`, `ExecutionPacket`, and `ControlProfile` can be introduced additively
2. the current route family can carry those structures without public route breakage
3. the OpenClaw adapter can consume the continuity contract on the actual runtime path
4. `ControlProfile` can already influence two runtime surfaces:
   - adapter threshold selection
   - Aionis `tools/select` candidate filtering

Phase 2 should not be a rewrite. It should promote the kernel from "projection-driven continuity contract" to "state-driven execution control loop" for coding agents.

The core move is:

**make `ExecutionState` a more independent source of truth for coding-task continuity, then let packet assembly and control decisions read from that state first.**

## Phase 2 Goals

Phase 2 must achieve all of the following:

1. make `ExecutionState` more independent from handoff slots
2. define explicit state transition rules for coding-task execution
3. centralize packet assembly around state-first composition
4. promote `ControlProfile` from dual-surface adoption to multi-surface runtime control
5. keep OpenClaw as the proving wedge and benchmark gate
6. avoid turning Aionis into a generic workflow engine

## Non-Goals

Phase 2 does not attempt to:

1. replace the current route family with a new public kernel API family
2. generalize Aionis into arbitrary business workflow orchestration
3. introduce generic DAG execution or project management abstractions
4. require host runtimes to adopt a new protocol all at once
5. claim that every realistic slice becomes an efficiency win

## Why Phase 2 Matters

Phase 1 got the kernel into the live route path, but it still relies heavily on projection and bridging:

1. `handoff/store` produces structured continuity material
2. `handoff/recover` restores structured continuity material
3. `context/assemble` consumes projected packet/state inputs
4. runtime control is beginning to consume `ControlProfile`

That is enough for additive rollout, but not enough for a durable execution kernel.

Without Phase 2, the system risks staying in an unstable middle state where:

1. continuity is still too dependent on handoff-shaped events
2. state updates are implicit instead of governed
3. packet assembly stays a route bridge instead of becoming a canonical execution delivery surface
4. new runtime-surface adoption keeps adding ad hoc control logic

## Core Architecture Direction

Phase 2 should solidify three rules:

1. `ExecutionState` is the durable statement of "where the coding task currently is"
2. `ExecutionPacket` is the durable delivery object of "what this stage/role must see now"
3. `ControlProfile` is the durable statement of "how execution is allowed to proceed now"

That yields a tighter internal loop:

```text
state transition
  -> persisted ExecutionState
  -> packet assembly from state + recall/evidence
  -> profile-guided runtime control
  -> new execution evidence
  -> next state transition
```

## Phase 2 Deliverables

### 1. ExecutionState Persistence Layer

Phase 2 should introduce a more route-independent persistence layer for execution state.

The minimum requirement is not "new database family." The minimum requirement is:

1. state can be written and read without going through handoff-only flows
2. state records have stable identity and versioning
3. state records can be updated through controlled transitions
4. handoff slots become one carrier of state, not the only durable carrier

At minimum, the persistence layer should support:

1. `state_id`
2. `scope`
3. `version`
4. `updated_at`
5. `current_stage`
6. `active_role`
7. `task_brief`
8. `pending_validations`
9. `completed_validations`
10. `last_accepted_hypothesis`
11. `unresolved_blockers`
12. `rollback_notes`
13. `reviewer_contract`
14. `resume_anchor`
15. state metadata for provenance

### 2. State Transition Contract

Phase 2 should define explicit transition rules instead of relying on free-form projection.

Minimum transition types:

1. `stage_started`
2. `stage_completed`
3. `validation_added`
4. `validation_completed`
5. `hypothesis_accepted`
6. `path_rejected`
7. `blocker_recorded`
8. `blocker_cleared`
9. `reviewer_contract_updated`
10. `resume_anchor_updated`

Each transition must answer:

1. who is allowed to emit it
2. what state fields it can change
3. whether it is append-only or destructive
4. how conflicts are resolved

### 3. Packet-First Assembly

Phase 2 should move packet assembly from "route bridge" toward "canonical continuity delivery."

The rule should be:

1. assemble from `ExecutionState` first
2. enrich from recall/evidence second
3. compact into `ExecutionPacket` third
4. only then degrade to projection fallback

Phase 2 packet assembly should explicitly produce:

1. `task_brief`
2. `hard_constraints`
3. `accepted_facts`
4. `rejected_paths`
5. `pending_validations`
6. `rollback_notes`
7. `review_contract`
8. `resume_anchor`
9. `evidence_refs`
10. `target_files`
11. `current_stage`
12. `active_role`

### 4. Broader ControlProfile Runtime Surfaces

Phase 2 should expand `ControlProfile` to additional high-value surfaces only where real value can be validated.

Priority candidates:

1. `context/assemble` shaping defaults
2. replay candidate selection and dispatch gating inputs
3. handoff recovery shaping
4. evidence compaction / packet compaction policy

Lower-priority candidates:

1. generic write-path behavior
2. low-level recall engine behavior

Rule:

**adopt only where benchmarked runtime value can be measured.**

### 5. Runtime-State Health and Observability

Phase 2 should make kernel state auditable.

Minimum required visibility:

1. state version and last transition type
2. packet source mode:
   - state-first
   - state+recall
   - projection fallback
3. control-profile origin:
   - runtime default
   - continuity-delivered
   - host override
4. transition conflict or fallback counters

This is necessary to debug regressions without falling back to prompt archaeology.

## Proposed Internal Layout

Phase 2 can stay within the current source tree but should deepen the kernel module.

```text
src/
  execution/
    types.ts
    packet.ts
    profiles.ts
    state-store.ts
    transitions.ts
    assemble.ts
    telemetry.ts
```

The key point is not folder count. The key point is to move from loose projection helpers toward:

1. state storage
2. transition rules
3. packet composition
4. kernel telemetry

## Route Overlay Plan

Phase 2 should still preserve public route compatibility.

### `memory/write`

Phase 2 role:

1. accept state-bearing writes more explicitly
2. emit state transitions when eligible metadata is present
3. continue to support plain memory writes unchanged

### `handoff/store`

Phase 2 role:

1. continue to persist handoff objects
2. bind handoff writes to an existing state record when available
3. emit transition events for handoff completion and resume-anchor updates

### `handoff/recover`

Phase 2 role:

1. read state first when state is available
2. assemble packet from state-first flow
3. degrade to stored projection only when state is incomplete

### `context/assemble`

Phase 2 role:

1. prefer state-backed packet assembly
2. make projection bridge a fallback path
3. expose enough response metadata to understand whether state-first assembly happened

### `tools/select`

Phase 2 role:

1. continue `ControlProfile` candidate shaping
2. optionally read current stage and role from execution state rather than only continuity payload
3. remain safe when profile filters eliminate all candidates

## Rollout Sequence

### Step 1. State Store Scaffold

Deliver:

1. `state-store.ts`
2. state read/write helpers
3. versioned state record schema

Exit criteria:

1. build passes
2. state store is internal-only
3. no public route breakage

Checkpoint status and live benchmark outcomes belong in the progress documents, not in this rollout plan.

### Step 2. Transition Contract

Deliver:

1. `transitions.ts`
2. explicit transition validation
3. minimal tests for conflict and update behavior

Exit criteria:

1. supported transitions can be applied deterministically
2. invalid transitions fail in a controlled way
3. state mutation no longer depends on route-local ad hoc shaping

### Step 3. State-First Packet Assembly

Deliver:

1. `assemble.ts`
2. packet composition that prefers state
3. fallback metadata showing whether packet was state-first or projection fallback

Exit criteria:

1. `context/assemble` can produce packets from state-first path
2. current continuity path still degrades safely
3. strongest real workflow slices do not regress

### Step 4. Third and Fourth Runtime Surface Adoption

Deliver:

1. `ControlProfile` adoption on one additional high-value surface
2. one more adoption only if the first shows value

Exit criteria:

1. adoption is validated with real workflow evidence
2. no new surface is merged on abstraction value alone

### Step 5. Observability and Regression Gates

Deliver:

1. packet source mode visibility
2. state transition visibility
3. kernel health counters for fallback/conflicts

Exit criteria:

1. nightly and repeated runs can detect state-path regressions
2. performance/quality regressions can be attributed to state, packet, or profile changes

## Benchmark and Rollout Gates

Phase 2 should remain gated by the current strongest OpenClaw real-workflow family.

Required benchmark gates:

1. `dashboard auth drift`
2. `pairing / approval recovery`
3. `service token drift repair`

What must remain true to merge Phase 2 increments:

1. no crash regressions on actual runtime path
2. no forced reversion to legacy handoff text as primary continuity path
3. no regression from completion win to completion loss on strongest slices without explicit acceptance
4. parity or better on reviewer-ready completion for any adopted runtime surface
5. no `tools/select` optimization may be promoted on cost gains alone if it lowers the current strongest-slice completion baseline

Preferred but not mandatory:

1. token win
2. wall-clock win

The rule remains:

**completion and continuity are the hard gate; efficiency is a second gate.**

## Risks

### 1. Over-generalization

Risk:

The kernel drifts into a generic workflow engine.

Mitigation:

1. keep all state fields centered on coding-task execution continuity
2. reject business workflow abstractions
3. keep OpenClaw real workflow slices as the proving wedge

### 2. State Drift

Risk:

The stored state diverges from actual task progress.

Mitigation:

1. explicit transitions only
2. state versioning
3. packet source mode telemetry
4. state-first only when minimum required fields are present

### 3. Surface Sprawl

Risk:

Too many runtime surfaces adopt `ControlProfile` before value is measured.

Mitigation:

1. adopt one high-value surface at a time
2. require real benchmark evidence before broadening

### 4. Product Story Dilution

Risk:

The kernel work gets ahead of the actual product wedge.

Mitigation:

1. keep public story centered on coding-agent continuity
2. keep OpenClaw as the main proving path
3. keep docs explicit about what is foundational vs verified

### 5. Tool Migration Blindness

Risk:

The kernel becomes strong at continuity but weak at migrating from older tools to newer tools in the same capability family.

Mitigation:

1. track tool capability families explicitly instead of relying only on raw tool names
2. let `tools/select` prefer newer validated tools when they are present in the candidate set
3. stop replay from binding only to historical tool names
4. keep completion as the hard promotion gate for new-tool adoption

## Exit Criteria

Phase 2 should be considered complete only when all of the following are true:

1. `ExecutionState` has a route-independent persistence path
2. at least one state transition contract is live on the real route path
3. `context/assemble` prefers state-first packet composition on the strongest slices
4. `ControlProfile` has at least one additional validated runtime surface beyond today's two
5. strongest real workflow slices remain positive after those changes
6. nightly reporting can distinguish state-first from fallback continuity mode

## Rollout Discipline

When a new runtime surface lands in Phase 2:

1. first prove route safety with focused CI
2. then prove real-path safety with a strongest-slice smoke
3. then prove runtime value with repeated strongest-slice validation
4. only after that, expand to another surface or another strongest slice

Current checkpoint status and the latest proof obligations should be tracked in the progress documents.

Tool-evolution-specific migration rules are tracked separately in:

1. [Aionis Tool Evolution Plan](AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md)
