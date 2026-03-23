# Lite Governance Provider Precedence Benchmark Spec

Date: 2026-03-23

## Goal

Add one real benchmark scenario that proves explicit governance reviews override internal provider fallback on live Lite runtime paths.

## Why

The contract test already proves explicit review precedence at the generic runner layer.

What is still missing is a real benchmark that proves the same precedence survives through route/runtime wiring on the actual governed paths.

## Scenario

Add `governance_provider_precedence_runtime_loop` to the real benchmark suite.

The scenario should cover:

1. workflow promotion on `/v1/memory/write`
2. tools pattern formation on `/v1/memory/tools/feedback`

Both paths should run with static governance providers enabled.

Both paths should also receive an explicit low-confidence review result that conflicts with the provider-backed recommendation.

## Required Assertions

### Workflow path

1. explicit review reason is preserved
2. admissibility is false
3. policy effect does not apply
4. runtime apply does not change promotion state
5. `governed_promotion_state_override` stays unset

### Tools path

1. explicit review reason is preserved
2. admissibility is false
3. policy effect does not apply
4. runtime apply does not change pattern state
5. resulting pattern remains provisional/candidate rather than provider-promoted stable/trusted

## Scope

This benchmark should only extend:

1. `scripts/lite-real-task-benchmark.ts`
2. `docs/LITE_TESTING_STRATEGY.md`

No public route changes.
No governance semantic changes.

## Verification

1. `npx tsc --noEmit`
2. `npx tsx scripts/lite-real-task-benchmark.ts`
3. suite should remain fully green with one extra benchmark scenario
