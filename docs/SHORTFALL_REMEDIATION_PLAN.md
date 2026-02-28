---
title: "Shortfall Remediation Plan"
---

# Shortfall Remediation Plan

Last updated: `2026-02-28`  
Status: `in_progress (P0/P1 delivered, P2 tracking)`

## Context

This plan addresses four active shortfalls:

1. MemoryStore adapter is still marked `phase_p2_in_progress` (`docs/MEMORY_STORE_ADAPTER_PLAN.md`).
2. `standalone` is local/demo oriented, not HA production (`README.md`).
3. `lint` is a placeholder (`package.json`).
4. Plan-level observability gap remained (`decision readback`) in adapter follow-ups.

## Priority Order

1. **P0 - Decision observability gap closure (execution decision readback)**
2. **P1 - Engineering hygiene baseline (real lint + CI gate)**
3. **P2 - MemoryStore adapter phase-P2 exit stabilization**
4. **P3 - Standalone to HA promotion path hardening**

Rationale:

1. P0/P1 are highest leverage with small-to-medium effort and immediate regression reduction.
2. P2 is larger and should be driven with explicit exit criteria after contract and tooling are stable.
3. P3 is mostly runbook/productization work once storage/CI contracts are stable.

## Workstreams

## P0 - Decision Readback (High, Small)

Goal:
Provide explicit query-by-id for persisted tool decisions so operators and probes can verify provenance without relying only on feedback inference paths.

Deliverables:

1. `POST /v1/memory/tools/decision` API endpoint.
2. Shared CI probe coverage in policy/planner probe flow.
3. SDK surface coverage (TS + Python).
4. API and planner docs updates.

Acceptance:

1. Decision readback returns 200 for in-scope `decision_id`.
2. Returns typed 404 `decision_not_found_in_scope` for missing id.
3. CI probes validate decision consistency (`decision_id`, `run_id`, `selected_tool`, `decision_kind`).

Current status:

1. API endpoint and shared probes implemented.
2. TS SDK implemented.
3. Python SDK method/export implemented.

## P1 - Lint Baseline (High, Medium)

Goal:
Replace placeholder lint with enforceable static checks and include them in CI validate path.

Deliverables:

1. ESLint baseline config (TS + JS/MJS).
2. `npm run lint` and `npm run lint:fix`.
3. `sdk-ci` validate job runs lint before build.

Acceptance:

1. `npm run lint` is non-placeholder and passes locally.
2. Lint failures block `sdk-ci`.
3. Ruleset is intentionally minimal/high-signal to avoid noisy rollout.

Rollout notes:

1. Start with correctness-focused rules (unused vars, accidental globals, unreachable code, etc.).
2. Expand rule strictness after one clean CI cycle.

## P2 - MemoryStore Adapter Stabilization (High, Large)

Goal:
Move from `phase_p2_in_progress` to an explicit exit milestone with stable adapter contracts and backend parity confidence.

Deliverables:

1. Phase P2 exit checklist in `docs/MEMORY_STORE_ADAPTER_PLAN.md`.
2. Capability contract completeness audit (`read/write/feature` + fallback semantics).
3. Backend parity evidence bundle (API probes + SDK probes + contract smoke + drift checks).
4. Remaining in-memory feature parity gaps triaged into P3/P4 backlog.

Acceptance:

1. P2 checklist items all green in CI matrix.
2. No backend-hardcoded assumptions in shared probes.
3. Adapter contract version + capability declaration documented and stable.

## P3 - Standalone to HA Promotion Path (Medium, Medium)

Goal:
Keep standalone lightweight for local/demo while giving a clear and safe production promotion path.

Deliverables:

1. Explicit docs split: `standalone(local/demo)` vs `production(HA)` topology.
2. Recommended HA deployment profile (separate DB/API/worker, persistence, restart policy, backup/SLO basics).
3. A concise migration checklist: standalone -> service profile.

Acceptance:

1. No ambiguity in docs about standalone production suitability.
2. Production checklist is actionable and aligned with existing env/ops scripts.

## Execution Log

1. `2026-02-28`: P0 delivered; decision readback API + probes + docs + TS/Python SDK support landed.
2. `2026-02-28`: P1 delivered; ESLint baseline + npm lint scripts + `sdk-ci` lint gate landed.
3. `2026-02-28`: P1 hardening delivered; added dedicated GitHub Actions lint workflow for repo-level PR/push checks.
4. `2026-02-28`: P2 advanced; added local exit gate command (`gate:memory-store-p2:local`) and CI verification matrix mapping in adapter plan.
5. `2026-02-28`: P3 started; added standalone-to-HA runbook and wired docs/README references for production topology guidance.
6. `2026-02-28`: P3 docs chain completed; linked standalone-to-HA runbook from go-live gate and onboarding production section.
7. `2026-02-28`: P2 hardening delivered; added remote CI evidence gate command (`gate:memory-store-p2:remote`) to verify key workflow statuses via `gh`.
8. `2026-02-28`: P2 evidence snapshot captured; remote gate confirms latest `Backend Parity Smoke` / `SDK CI` / `Core Production Gate` runs are all success.
9. `2026-02-28`: P2 releaseability delivered; added unified release evidence command (`gate:memory-store-p2:release`) to run local + remote gates and emit consolidated artifact summary.
10. `2026-02-28`: P3 reliability docs delivered; added `HA_FAILURE_DRILL_TEMPLATE` and linked it from HA runbook, docs index, and README operator section.
11. `2026-02-28`: P2 CI enforcement delivered; added `MemoryStore P2 Release Gate` workflow and wired `core-release` to enforce remote P2 gate before release publish.
12. `2026-02-28`: P3 operator enablement delivered; added filled `HA_FAILURE_DRILL_SAMPLE` for direct team reuse.
