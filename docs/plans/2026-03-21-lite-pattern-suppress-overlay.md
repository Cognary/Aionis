# Lite Pattern Suppress Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimal suppress-first operator overlay for Lite pattern anchors without mutating learned credibility.

**Architecture:** Store operator suppression beside learned pattern state in `slots.operator_override_v1`, apply it only in selector reuse and operator/introspection surfaces, and keep default planner/context responses slim.

**Tech Stack:** TypeScript, Fastify, Zod, SQLite Lite write store, existing selector/introspection contracts

---

### Task 1: Add suppress overlay request/response schemas

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/memory/schemas.ts`

Add:

1. `PatternOperatorOverrideSchema`
2. `PatternSuppressRequest`
3. `PatternUnsuppressRequest`
4. `PatternSuppressResponseSchema`

Include `mode = "shadow_learn" | "hard_freeze"` and the minimal operator overlay fields.

### Task 2: Implement suppress/unsuppress mutation helpers

**Files:**
- Create: `/Volumes/ziel/Aionisgo/src/memory/pattern-operator-override.ts`

Implement:

1. load pattern-anchor node by `anchor_id`
2. validate it is a pattern anchor
3. write `slots.operator_override_v1`
4. preserve learned fields unchanged
5. return compact updated state

Use existing Lite `findNodes` + `updateNodeAnchorState`.

### Task 3: Expose suppress routes

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/routes/memory-feedback-tools.ts`
- Modify: `/Volumes/ziel/Aionisgo/src/app/request-guards.ts`

Add:

1. `POST /v1/memory/patterns/suppress`
2. `POST /v1/memory/patterns/unsuppress`

Ensure Lite local actor identity is applied consistently.

### Task 4: Integrate suppression into selector behavior

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/memory/tools-select.ts`
- Modify: `/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts`
- Modify: `/Volumes/ziel/Aionisgo/src/memory/schemas.ts`

Change selector behavior so suppressed trusted patterns:

1. remain visible in `pattern_matches`
2. do not count as trusted reusable policy
3. do not contribute to preferred tool ordering
4. produce explicit provenance text

### Task 5: Expose suppression in introspection/operator surfaces

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/memory/execution-introspection.ts`
- Modify: `/Volumes/ziel/Aionisgo/src/memory/schemas.ts`

Add operator overlay fields to pattern entries/signals and demo/operator text.

### Task 6: Add tests

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-pattern-anchor.test.ts`
- Modify: `/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-select-route-contract.test.ts`
- Modify: `/Volumes/ziel/Aionisgo/scripts/ci/lite-execution-introspection-route.test.ts`
- Create: `/Volumes/ziel/Aionisgo/scripts/ci/lite-pattern-suppress-route.test.ts`
- Modify: `/Volumes/ziel/Aionisgo/package.json`

Cover:

1. suppress route contract
2. unsuppress route contract
3. selector skip behavior
4. introspection visibility

### Task 7: Update status docs

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/docs/LITE_GOVERNANCE_AND_STRATEGY_STATUS.md`
- Modify: `/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md`

Record that the first operator intervention slice is now `suppress-first`, not the full ADR surface.
