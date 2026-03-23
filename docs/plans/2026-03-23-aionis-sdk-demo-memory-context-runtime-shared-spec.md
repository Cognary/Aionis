# Aionis SDK Demo Memory Context Runtime Shared Helper Spec

## Goal

Extract the reusable planning/context helper block from `memory-context-runtime.ts` into a shared module so the future demo-only context route can reuse the logic without copying the full route file.

## Why

The shrink audit still identifies `src/routes/memory-context-runtime.ts` as a residual runtime target. The public `sdk_demo` profile only needs:

1. `/v1/memory/planning/context`
2. `/v1/memory/context/assemble`

Before replacing that target directly, the helper block that handles execution-packet continuity, recall tuning, and planner response shaping needs to live in a stable shared module.

## Scope

1. add `memory-context-runtime-shared.ts`
2. move the reusable helper types and functions out of `memory-context-runtime.ts`
3. keep full route behavior unchanged
4. prepare the next slice that introduces a demo-only context route

## Non-Goals

1. no demo-only context route yet
2. no public SDK contract changes
3. no shrink-audit target reduction in this slice by itself
