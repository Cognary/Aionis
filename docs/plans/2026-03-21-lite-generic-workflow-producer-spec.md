# Aionis Lite Generic Workflow Producer Spec

## Goal

Broaden `Aionis Lite` workflow-memory production beyond replay-centered entry points by allowing ordinary execution-continuity writes to produce governed `workflow_candidate` memory.

The immediate target is a conservative Lite-native slice that turns structured execution-continuity writes into governed workflow memory without making the default planner/runtime surface heavier.

## Problem

Current Lite runtime already has strong workflow memory once the producer path is replay-based:

1. replay promotion creates stable workflow anchors
2. replay-learning creates governed workflow candidates
3. planner and introspection surfaces consume those workflow artifacts correctly

But ordinary execution paths still have weaker producer coverage.
In practice this creates the biggest production risk currently visible in Lite:

1. workflow memory is strong where replay or governed review is used
2. workflow memory is weaker where normal execution writes happen without replay mediation
3. planner-facing reuse can therefore be uneven across real usage

## Design Principles

1. stay conservative on production semantics
2. do not add new default response surfaces
3. do not widen the public request contract unless necessary
4. prefer existing execution-native write paths over new product APIs
5. keep the first slice Lite-native and route-tested

## Alternatives Considered

### Option A: Add a new public route for workflow projection

Pros:

1. explicit product surface
2. easy to reason about in isolation

Cons:

1. adds API surface too early
2. duplicates logic already available in `/v1/memory/write`
3. weakens the “ordinary execution path” story

### Option B: Auto-project from arbitrary event writes

Pros:

1. widest producer coverage

Cons:

1. too aggressive
2. high false-positive risk
3. harder to govern safely

### Option C: Auto-project only from structured execution-continuity writes

Recommended.

Pros:

1. reuses current write surface
2. only triggers when caller is already writing structured execution continuity
3. low false-positive risk
4. naturally aligns with handoff/resume and future ordinary execution-state writes

Cons:

1. does not yet cover all generic event streams
2. still requires broader producer expansion later

## Chosen Scope

Phase 1 implemented Option C conservatively and the current active slice now supports:

Lite produces governed workflow memory from `/v1/memory/write` only when the write batch contains nodes with structured execution continuity:

1. `execution_state_v1`
2. `execution_packet_v1`

The current active slice will:

1. derive a stable `workflow_signature` from execution state and packet fields
2. create a governed `workflow_candidate`
3. count observations conservatively
4. mark candidates as `promotion_ready` when the observation threshold is met
5. auto-promote repeated generic execution-continuity writes into stable workflow anchors
5. avoid creating duplicate candidate rows for the same source write
6. avoid producing a new candidate when a stable workflow already exists for the same signature

The current active slice still does not yet:

1. expose a new public workflow-projection route
2. widen the planner/context default response
3. broaden production coverage beyond structured execution-continuity writes and the current continuity-backed route family

## Producer Semantics

The producer will run inside the Lite memory-write route after request preparation and before commit.

The current implementation has also been pulled into a shared Lite continuity write pipeline so the same governed workflow-projection semantics now apply across:

1. `/v1/memory/write`
2. `/v1/handoff/store`
3. `/v1/memory/events`

Candidate generation rules:

1. only in Lite
2. only for write batches that contain structured execution-continuity nodes
3. only one projected candidate per workflow signature per write batch
4. projected candidates inherit memory lane and owner visibility from the source node
5. projected candidates use deterministic client ids derived from source node id and workflow signature
6. if a stable workflow anchor already exists for the same signature, the producer does nothing
7. if a projected candidate for the same source node already exists, retries do not add a new observation

## Signature Model

The signature should be deterministic and conservative.

Phase 1 signature inputs:

1. normalized `task_brief`
2. normalized target file list from `execution_packet_v1.target_files` or execution state files
3. normalized `resume_anchor` fields when present

This is intentionally narrower than a future broad pattern-clustering system.
It is sufficient to group repeated continuation tasks without merging obviously unrelated execution writes.

## Runtime Surface Expectations

This work must not make the default planner/context surface fatter.

Expected effect instead:

1. more ordinary execution writes can produce `workflow_candidate`
2. `planning_context` can surface those candidates in the existing `planner_packet.sections.candidate_workflows`
3. `workflow_signals` and lifecycle summaries should reflect observing vs promotion-ready state
4. `execution/introspect` should show the same candidate inventory
5. `execution/introspect` should also expose compact continuity-producer provenance and skip reasons for operator/debug use without widening the default planner/context surface

## Testing Requirements

The first slice must be route-tested.

Minimum required validation:

1. real `POST /v1/memory/write` with execution-continuity-backed node creates a recallable candidate workflow
2. a second similar write auto-promotes stable workflow guidance
3. default `planning_context` remains slim
4. introspection and planner surfaces agree on candidate maturity

## Success Criteria

The current generic producer slice is successful when:

1. Lite can produce governed workflow memory from ordinary execution-continuity writes
2. repeated writes move the workflow path from observing to stable guidance
3. no new default route bloat is introduced
4. route-level tests lock the behavior down

## Follow-On Work

With the current slice stable, the next expansion should be:

1. broader producer coverage beyond structured execution-continuity writes
2. governed auto-promotion of non-replay workflow candidates
3. maintenance and cleanup for accumulated generic execution candidates
4. further consolidation of continuity-producer commit semantics so future continuity routes do not fork the Lite workflow-projection contract
