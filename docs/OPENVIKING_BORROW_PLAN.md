---
title: "OpenViking Borrow Plan"
---

# OpenViking Borrow Plan

Last updated: `2026-02-23`

Goal:

1. Borrow OpenViking's strong developer-facing abstractions.
2. Keep Aionis kernel positioning unchanged: `Verifiable / Operable Memory Kernel`.
3. Avoid weakening Aionis SoR + commit-chain + production gate constraints.

## Guardrails (Non-Negotiable)

1. Do not replace Postgres + commit-chain as source of record.
2. Do not relax API contract safety defaults (embedding/debug boundaries).
3. Do not move hosted/private implementation details back into Open Core repo.
4. New abstraction layers must remain backward-compatible with existing `write/recall/recall_text` contracts.

## Borrow Items (Priority-Ordered)

1. URI unified addressing layer (`aionis://tenant/scope/type/id`) - High
2. Find + Search dual retrieval channels - High
3. Explicit L0/L1/L2 recall strategy + trajectory output - High
4. Session/Event first-class APIs - High
5. Pack import/export with hash verification - Medium-High
6. Runtime mode presets (`AIONIS_MODE=local|service|cloud`) - Medium
7. Provider adapter standardization (LLM/Embedding) - Medium
8. Structured observability output (recall-stage explain blocks) - Medium

## Execution Phases

## Phase P0 (Now): URI + Find/Search baseline

Status: `completed`

Deliverables:

1. `src/memory/uri.ts`:
   - parse/format `aionis://tenant/scope/type/id`
   - strict scheme and segment validation
2. `POST /v1/memory/find`:
   - exact fetch by URI/id/client_id/type and optional attribute filters
   - deterministic pagination and DTO whitelist output
3. Keep existing `recall/recall_text` as semantic search channel; document dual-channel usage.

Acceptance:

1. `npm run -s build` passes.
2. `POST /v1/memory/find` works for URI and non-URI filters.
3. API contract docs include find endpoint.

## Phase P1: L0/L1/L2 recall strategy + trajectory

Status: `completed`

Deliverables:

1. Add explicit strategy presets:
   - `local` (L0)
   - `balanced` (L1 default)
   - `global` (L2)
2. Return `trajectory` in recall responses:
   - per-stage counts
   - stage timing
   - pruning/rejection reasons (budget, quality threshold, visibility filtering)
3. Preserve current profile fields for backward compatibility.

Acceptance:

1. Existing clients remain compatible.
2. Tail-case diagnostics can explain `seed/subgraph/context` empties.

## Phase P2: Session/Event first-class APIs

Status: `completed`

Deliverables:

1. Add session/event API surface without changing memory core SoR:
   - `POST /v1/memory/sessions`
   - `POST /v1/memory/events`
   - `GET /v1/memory/sessions/:id/events`
2. Session/event writes still produce standard commit chain and graph nodes/edges.

Acceptance:

1. Session timeline can reconstruct memory evolution with commit references.
2. Rule/policy endpoints can consume session context directly.

## Phase P3: Pack import/export

Status: `completed`

Deliverables:

1. Export pack:
   - nodes/edges/commits + manifest hash
2. Import pack:
   - verification and idempotent replay semantics
3. Bench/backup migration path based on packs.

Acceptance:

1. Export -> Import -> Replay hash consistency passes.
2. No duplicate write side effects under repeated import.

## Phase P4: Mode presets + provider adapters + observability structure

Status: `completed`

Deliverables:

1. `AIONIS_MODE=local|service|cloud` env preset mapping.
2. Provider adapter contract cleanup for benchmark/prod parity.
3. Standardized observability payload for recall stages and worker/backfill health.

Acceptance:

1. One-command local/service bootstrap profiles.
2. Cross-provider benchmark scripts avoid ad-hoc per-vendor patches.
3. Operator can diagnose empty-recall and latency spikes from structured logs/response debug blocks.

## Progress Tracker

1. `[completed]` P0.1 URI layer
2. `[completed]` P0.2 `/v1/memory/find`
3. `[completed]` P1 L0/L1/L2 + trajectory
4. `[completed]` P2 Session/Event APIs
5. `[completed]` P3 Pack import/export
6. `[completed]` P4 Mode presets
7. `[completed]` P4 Provider adapter standardization
8. `[completed]` P4 Structured observability output

## Release Rules

1. Each phase must ship with API contract/doc updates in the same commit.
2. Production gates remain required (`health-gate`, `consistency-check`, `gate:core:prod`).
3. Any new endpoint must preserve tenant/scope isolation semantics and auth identity mapping.
