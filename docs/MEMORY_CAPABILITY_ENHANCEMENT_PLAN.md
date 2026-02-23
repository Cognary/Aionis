---
title: "Memory Capability Enhancement Plan"
---

# Memory Capability Enhancement Plan

Last updated: `2026-02-23`

## Goal

Close the four product-level capability gaps with a staged, production-safe path:

1. memory consolidation
2. abstraction
3. strategy memory
4. planning memory

## Current Assessment

1. Consolidation: implemented as jobs, needs stronger product-surface guidance and SLO evidence.
2. Abstraction: partially implemented (topic clustering + compression rollup), needs explicit policy and quality gates.
3. Strategy memory: partially implemented (rules evaluate/select/feedback), needs stricter lifecycle governance.
4. Planning memory: partially implemented (integration endpoints exist), needed one-call planner context surface.

## Phase Plan

### Phase 1: Planning Memory Product Surface

- [x] Add one-call planning context API: `POST /v1/memory/planning/context`
- [x] Return unified payload: recall + rules + optional tools decision
- [x] Reuse existing queue/rate/tenant controls and trajectory/observability output
- [x] Add runnable example script: `examples/planning_context.sh`
- [x] Add schema coverage in contract smoke

Exit criteria:

1. Build green.
2. Contract smoke green.
3. API contract/docs synced.

### Phase 2: Abstraction Policy Hardening

- [ ] Add abstraction policy profile (when to trigger compression/topic abstraction per scope and tier)
- [ ] Add abstraction quality counters to gate artifacts
- [ ] Add operator runbook for abstraction backfill and replay

Exit criteria:

1. Abstraction has measurable quality and latency signals in gate artifacts.

### Phase 3: Strategy Memory Lifecycle Hardening

- [ ] Add governance checks for rule promotion (`draft -> shadow -> active`)
- [ ] Add deterministic conflict-resolution report artifact (winner/loser deltas per rollout)
- [ ] Add shadow-to-active recommendation thresholds as documented policy

Exit criteria:

1. Rule lifecycle can be promoted with repeatable evidence.

### Phase 4: Consolidation + Replay Production Gate

- [ ] Add consolidation health SLO (candidate queue depth, apply success, redirect completeness)
- [ ] Add replay determinism report for consolidation+abstraction combined workloads
- [ ] Add rollback and re-run checklist for consolidation incidents

Exit criteria:

1. Consolidation and replay pass production gate with deterministic evidence.

## Verification Commands

```bash
npm run -s build
npm run -s test:contract
npm run -s docs:check
```
