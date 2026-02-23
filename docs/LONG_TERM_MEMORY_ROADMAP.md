---
title: "Long-Term Memory Roadmap (Executable)"
---

# Long-Term Memory Roadmap (Executable)

This file is the source of truth for building Aionis from persistent storage into true cognitive long-term memory.

Scope:
- Consolidation
- Forgetting
- Compression

Non-goals (for now):
- Hard delete by default
- Automatic rule activation based on memory jobs

## Principles

- SoR first: writes stay durable and auditable (`memory_commits` chain).
- Derived-only mutation: memory evolution runs as async jobs via outbox/worker.
- Reversible by design: no silent destructive rewrite; keep provenance.
- Bounded impact: each run has mutation caps and deterministic checkpoints.

## Hard Constraints

- `pin` / `legal_hold`: pinned nodes are excluded from forgetting/consolidation.
- `max_daily_mutation_ratio`: cap daily mutated nodes per scope.
- All evolution writes must have `commit_id` and stable replay behavior.
- Recall contracts stay bounded (no embedding leakage, response caps unchanged).

## Phase 1: Forgetting + Tiering

Status: `completed`

Goals:
- Expand tier model from `hot/cold` to `hot/warm/cold/archive`.
- Move from one-step demotion to policy-driven multi-step transitions.
- Keep recall default to `hot + warm` (cold/archive opt-in later).

Work items:
- [x] Add DB support for new tiers (`warm`, `archive`).
- [x] Add tier policy env/config (thresholds, inactivity windows, mutation cap).
- [x] Upgrade `job:salience-decay` into tier transition job:
  - salience decay
  - `hot -> warm`, `warm -> cold`, `cold -> archive`
  - respect `pin/legal_hold`
  - respect daily mutation cap
- [x] Update recall seed query to include `hot + warm`.
- [x] Extend consistency-check with tier policy sanity checks.

DoD:
- Tier transitions are auditable (`commit_id`, `commit_hash`, per-tier counts).
- Pinned nodes are never demoted.
- Recall quality does not regress for active memory.
- Contract smoke and build pass.

## Phase 2: Compression (Non-destructive)

Status: `completed`

Goals:
- Reduce recall token footprint without losing citation traceability.

Work items:
- [x] Add summary nodes (topic/run rollups) with explicit citations.
- [x] Introduce compression job (periodic, bounded, idempotent).
- [x] Make recall_text prefer summaries with evidence backfill.
- [x] Add compression consistency checks (orphan citations, broken refs).

DoD:
- [x] `recall_text` token usage decreases materially (validated on local e2e baseline: context length `4699 -> 4244`, event items `10 -> 5`).
- [x] Evidence trace remains intact for compressed outputs (citations + consistency checks).

## Phase 3: Consolidation (Merge/Alias)

Status: `completed`

Goals:
- Merge duplicates and near-duplicates while preserving lineage.

Work items:
- [x] Add consolidation candidate scoring job (shadow mode first).
- [x] Introduce canonicalization (`alias_of`, `superseded_by` in slots).
- [x] Add edge redirection job (idempotent, auditable).
- [x] Add conflict policy for contradictory concept/topic candidates.

DoD:
- Duplicate topic/concept rate decreases.
- No dangling edges after redirection.
- Full replay yields stable state.

## Phase 4: Long-Horizon Optimization

Status: `completed`

Goals:
- Improve memory quality over months of operation.

Work items:
- [x] Adaptive decay based on feedback quality and access patterns.
- [x] Scope-level memory budget controls.
- [x] Archive retrieval policy (on-demand rehydrate).
- [x] Offline quality evaluation suite for long-term drift.

DoD:
- Stable recall latency and quality under sustained growth.
- Controlled storage growth with explicit operator levers.

## Phase 5: Operationalization Loop

Status: `completed`

Goals:
- Turn long-term memory behavior into repeatable operator workflows.
- Provide a compact, executable quality gate for production rollout.

Work items:
- [x] Add one-command Phase 4 smoke (`write -> rehydrate -> activate -> decay -> quality-eval`).
- [x] Add CI-ready health gate (consistency + quality strict mode).
- [x] Add weekly operator runbook section (suggested cadence + thresholds).

DoD:
- Operators can verify lifecycle correctness with one command.
- Promotion to prod has explicit pass/fail gate outputs.

## Regression Commands

Use this set after each phase increment:

```bash
npm run build
npm run test:contract
npm run job:consistency-check
```

If DB migrations were added:

```bash
make db-migrate
```

## Verification Stamp

- Last reviewed: `2026-02-16`
- Verification commands:
  - `npm run docs:check`
  - `npm run job:health-gate -- --strict-warnings`
