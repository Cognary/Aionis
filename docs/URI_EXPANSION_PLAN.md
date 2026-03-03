---
title: "URI Expansion Plan"
---

# URI Expansion Plan

Last updated: 2026-03-03

## Progress Update (2026-03-03)

Started implementation and completed first production slice:

1. URI type system expanded to include `edge`, `commit`, `decision`.
2. Recall `subgraph.edges[]` now carries `id` + `uri` (and `commit_uri` when meta is enabled).
3. Write/session/event/tool decision surfaces now expose `commit_uri` and/or `decision_uri` where applicable.
4. Tool APIs accept `decision_uri` as a first-class input path (`tools/decision`, `tools/feedback`).
5. API contract and SDK typing were updated accordingly.
6. Added `POST /v1/memory/resolve` as a unified URI resolver for `node|edge|commit|decision` objects (with tenant/scope checks and lane visibility guard for nodes).
7. Added trajectory `uri_links` (nodes/edges/commits/decisions + replay chain anchor) to recall-family responses.
8. Upgraded `packs/export` to URI-first artifacts (`nodes/edges/commits` now include canonical URI fields).
9. Added contract-smoke coverage for `memory/resolve` typed payload resolution and filter conflict handling.
10. Added optional decision export (`include_decisions`) so replay bundles can include URI-linked `decision -> commit` provenance objects.
11. Added CI probe coverage for `/v1/memory/resolve` and `packs/export(include_decisions=true)`, including commit linked-object count checks.

## Phase Status

1. `P1 Edge URI`: completed
2. `P2 Commit URI`: completed
3. `P3 Decision URI`: completed
4. `P4 Unified resolver + trajectory linking + URI-first export`: completed

## Goal

Extend Aionis URI coverage from memory nodes to additional auditable objects while keeping backward compatibility.

Current external statement (accurate now):

`All memory node entries have unique URIs: aionis://tenant/scope/type/id`

## Current State (Implemented)

1. URI format is stable: `aionis://tenant/scope/type/id`.
2. Node types covered today:
   - `event`, `entity`, `topic`, `rule`, `evidence`, `concept`, `procedure`, `self_model`
3. Recall/context outputs already carry node URIs:
   - `seeds[]`, `ranked[]`, `subgraph.nodes[]`, `context.items[]`, `context.citations[]`.
4. `find` already supports URI lookup for node objects.

## Why Expand

Edge, commit, and decision are first-class audit objects in production operations:

1. Edge: relation-level provenance and diff/replay debugging.
2. Commit: immutable write-chain anchor for compliance and incident forensics.
3. Decision: policy/planner execution provenance (`decision_id`, `run_id`) for replay and governance.

## Target URI Scope

Keep one canonical scheme:

`aionis://tenant/scope/type/id`

Planned new `type` values:

1. `edge`
2. `commit`
3. `decision`

## Design Principles

1. Backward compatible:
   - Existing node URI format and behavior must not change.
2. Tenant/scope hard boundary:
   - URI resolution is always constrained by `(tenant_id, scope)`.
3. Deterministic object identity:
   - URI must map to one object only.
4. Contract-first rollout:
   - API contract and SDK types ship before broad UI/ops exposure.

## Phase Plan

### P1: Edge URI (High Priority)

Deliverables:

1. Add `edge` to URI type allowlist.
2. Expose `edge.id` and `edge.uri` in graph responses where edge objects are returned.
3. Add edge resolver surface:
   - either extend `find` with edge mode
   - or add dedicated endpoint (`/v1/memory/resolve`).

Acceptance:

1. Every returned edge row has stable `id` and `uri`.
2. Edge URI resolves to exact `(src_id, dst_id, type, weight, confidence, commit_id)`.
3. Tenant/scope mismatch returns explicit auth/scope error.

### P2: Commit URI (High Priority)

Deliverables:

1. Add `commit` URI type.
2. Return `commit_uri` alongside `commit_id` where commit metadata is returned.
3. Add commit readback endpoint contract (by URI and by id).

Acceptance:

1. `commit_uri` is present for all write-path commit responses.
2. Commit URI readback includes commit hash and linked object counts.
3. Replay tooling can jump to a commit directly from URI.

### P3: Decision URI (Medium Priority)

Deliverables:

1. Add `decision` URI type.
2. Return `decision_uri` from tool-selection and decision-readback flows.
3. Ensure feedback/provenance flows can reference decision by URI (not only raw id).

Acceptance:

1. `tools/select` and `tools/decision` responses expose `decision_uri`.
2. `tools/feedback` accepts `decision_uri` input equivalently to `decision_id`.
3. Ops and Playground can replay a decision via URI.

### P4: Unified Object Resolver + Trajectory Linking (Medium Priority)

Deliverables:

1. Unified resolver for node/edge/commit/decision URIs.
2. Optional trajectory payload section with cross-object URI links.
3. URI-first export format for incident and replay bundles.

Acceptance:

1. A single resolver API can return typed object payload by URI.
2. Replay flow can traverse:
   - decision -> commit -> node/edge evidence chain.
3. Export artifacts include URI references for all included object classes.

## Contract and SDK Changes

Before each phase is marked complete:

1. Update `docs/API_CONTRACT.md`.
2. Update TypeScript SDK types:
   - `src/sdk/types.ts`
   - `packages/sdk/src/types.ts`
3. Update Python SDK types:
   - `packages/python-sdk/src/aionis_sdk/types.py`
4. Add/extend contract smoke and CI probe coverage.

## Compatibility and Migration Rules

1. Existing node URIs remain valid forever.
2. New URI types are additive.
3. Any endpoint that only supports node URI must return a typed error for non-node URI.
4. No silent fallback from unsupported URI type to other filters.

## Security Requirements

1. URI decode and validation remain strict (encoding, empties, UUID format where required).
2. Resolver must enforce tenant/scope before object fetch.
3. No cross-scope data leakage through URI parsing or error messages.

## Risks

1. Overloading `find` may blur semantics between node search and object resolve.
2. Decision/commit URI adoption may create temporary dual-input complexity (`id` + `uri`).
3. UI may expose links before resolver support is complete unless rollout is gated.

## Suggested Execution Order

1. P1 Edge URI
2. P2 Commit URI
3. P3 Decision URI
4. P4 Unified resolver and trajectory linking

## Done Definition (Full Plan)

1. Node/edge/commit/decision all have canonical URI representation.
2. Resolver/API/SDK/docs are consistent.
3. CI and contract probes cover all URI object classes.
4. Ops and Playground can inspect and replay with URI-only references.
