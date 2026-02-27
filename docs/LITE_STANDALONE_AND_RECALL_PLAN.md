---
title: "Standalone + Lite Recall Plan"
---

# Standalone + Lite Recall Plan

Last updated: `2026-02-27`
Status: `completed (with follow-up in progress)`

## Objective

Deliver two low-risk enhancements for local-first usage:

1. `standalone + lite profile`: reduce local deployment/operation weight while preserving SoR + commit-chain + derived-async architecture.
2. `official lite recall profile`: provide a first-class low-budget recall preset so clients do not need to hand-tune recall knobs per request.

## Scope

In scope:

1. Add a new official recall profile: `lite`.
2. Expose `lite` in env parsing, policy validation, runtime profile resolution, and API docs.
3. Add a managed throughput preset file for local-lite operation.
4. Make standalone docs include a `--env-file .env` path using managed lite profile values.

Out of scope:

1. Database replacement or storage adapter work.
2. Schema-level Stage2 hop=0 changes.
3. Any change to SoR guarantees, commit hash chain, or outbox delivery semantics.

## Design Principles

1. Keep `strict_edges` as production-safe default.
2. Keep all existing APIs backward compatible.
3. Lite is opt-in by config; never forced globally.
4. Keep rollback to previous behavior as one env/profile switch.

## Work Plan

## Phase 0: Baseline and Plan (done)

Deliverables:

1. This plan document.
2. File-level impact map and acceptance criteria.

Acceptance:

1. Plan reviewed and committed to repo.

## Phase 1: Official Lite Recall Profile (completed)

Changes:

1. Add `lite` to allowed profile enums:
   - `MEMORY_RECALL_PROFILE`
   - `MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE`
2. Add runtime defaults in `RECALL_PROFILE_DEFAULTS.lite`.
3. Extend recall policy JSON validation to accept `lite`.
4. Update API contract and `.env.example` profile descriptions.

Proposed lite defaults:

1. `limit=12`
2. `neighborhood_hops=1`
3. `max_nodes=24`
4. `max_edges=24`
5. `ranked_limit=48`
6. `min_edge_weight=0.25`
7. `min_edge_confidence=0.25`

Acceptance:

1. `npm run build` passes.
2. `/v1/memory/recall` and `/v1/memory/recall_text` accept `MEMORY_RECALL_PROFILE=lite`.
3. Existing profiles (`legacy|strict_edges|quality_first`) remain unchanged.

Rollback:

1. Set `MEMORY_RECALL_PROFILE=strict_edges`.
2. If needed, revert `lite` profile code paths.

## Phase 2: Standalone + Lite Throughput Path (completed)

Changes:

1. Add managed profile file: `scripts/env/profiles/lite.env`.
2. Extend `apply-throughput-profile.sh` to support `lite`.
3. Add npm script shortcut: `env:throughput:lite`.
4. Update README standalone section with `--env-file .env` + lite profile flow.

Lite throughput goals:

1. Lower API inflight/queue budgets for local machines.
2. Lower worker batch/poll aggressiveness for reduced background pressure.
3. Default local recall profile to `lite` in this managed preset.
4. Disable auto topic clustering by default in lite preset (can still be manually triggered or re-enabled).

Acceptance:

1. `npm run env:throughput:lite` updates managed block in `.env`.
2. Standalone runs with `--env-file .env` and starts healthy.
3. Existing `prod|benchmark` throughput profile behavior remains unchanged.

Rollback:

1. `npm run env:throughput:prod` (or `benchmark`) to restore prior managed block.
2. Remove `--env-file .env` when running standalone.

## Phase 3: Validation and Evidence (completed)

Validation commands:

```bash
npm run build
npm run env:throughput:lite
npm run -s docker:build:standalone
npm run -s e2e:standalone-lite-smoke
# optional runtime check:
# docker run --rm -it -p 3001:3001 --env-file .env -v aionis-standalone-data:/var/lib/postgresql/data aionis-standalone:local
```

Evidence to capture:

1. Build success.
2. Diff of docs/config/profile files.
3. Optional `/health` and a sample `/v1/memory/recall_text` with lite defaults.

## Risks and Mitigations

1. Risk: Lite defaults reduce recall coverage too much.
   Mitigation: keep opt-in and document override per request.
2. Risk: Throughput profile confusion with abstraction profile.
   Mitigation: keep profile ownership explicit; throughput script only touches managed throughput block.
3. Risk: Profile policy JSON rejects new value.
   Mitigation: update validation + docs together in same patch.

## Current Progress

1. `Phase 0`: completed.
2. `Phase 1`: completed.
3. `Phase 2`: completed.
4. `Phase 3`: completed.

## Follow-up (Quantification)

Status: `in_progress`

1. Added `perf-benchmark --recall-profile` for deterministic profile A/B runs.
2. Added `job:perf-profile-compare` to generate markdown/json profile comparison reports.
3. Added `perf:lite-vs-strict` one-command script for seed + strict/lite benchmark + comparison gate.
4. Added manual CI workflow `Perf Lite vs Strict Compare` (`.github/workflows/perf-lite-vs-strict.yml`) for repeatable artifact capture.
5. Added optional p99 regression gate (`--max-recall-p99-regression-pct`) for stricter tail-latency control when needed.
