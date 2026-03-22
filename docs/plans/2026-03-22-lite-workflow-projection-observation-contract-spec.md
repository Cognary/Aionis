# Lite Workflow Projection Observation Contract Spec

## Goal

Lock the generic workflow producer around two core rules:

1. equivalent execution continuity should derive the same `workflow_signature`
2. repeated writes from the same underlying continuity source should not count as new distinct workflow observations

## Why

Lite already projects workflow memory from:

- `/v1/memory/write`
- `/v1/handoff/store`
- `/v1/memory/events`

That producer is now broad enough that the next real risk is no longer eligibility drift alone, but observation drift:

1. same task semantics across packet-backed and lightweight-handoff continuity must stay in one workflow family
2. repeated writes for the same continuity source must not inflate candidate maturity just because they arrive through duplicate projection rows

If this stays implicit, workflow promotion becomes benchmark-sensitive and route-sensitive.

## Contract To Lock

### 1. Workflow family identity

The producer must keep deriving one stable `workflow_signature` from:

- normalized task brief
- normalized target files
- normalized resume anchor

Equivalent continuity payloads across packet-backed and lightweight-handoff forms must land in the same workflow family.

### 2. Distinct observation identity

Distinct workflow observations must prefer source provenance over projection-node identity.

Observation identity order:

1. `workflow_write_projection.source_client_id`
2. `workflow_write_projection.source_node_id`
3. node `client_id`
4. node `id`

This prevents repeated projection rows for the same underlying source continuity from counting as fresh observations.

### 3. Duplicate projection suppression

Before creating a new projected workflow candidate, the producer should treat an existing projection as already present when any of these match:

1. exact projection client id
2. projected node with the same `workflow_write_projection.source_client_id`
3. projected node with the same `workflow_write_projection.source_node_id`

This keeps the write path aligned with the explain path and avoids maturity inflation through duplicated projections.

## Scope

In scope:

- `src/memory/workflow-write-projection.ts`
- projection contract tests
- route tests only if needed to pin observable behavior

Out of scope:

- changing promotion thresholds
- changing workflow signature inputs
- widening planner surfaces
- new routes

## Acceptance

1. projection contract tests prove equivalent packet/handoff continuity derives the same `workflow_signature`
2. projection contract tests prove distinct observation counting dedupes by source provenance
3. projection contract tests prove duplicate projection detection respects linked source provenance, not only exact projection client id
4. `tsc` and `test:lite` stay green
