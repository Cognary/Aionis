# Lite Custom Model-Client Benchmark Spec

Date: 2026-03-23

## Goal

Add one real benchmark scenario that proves a custom `modelClientFactory` replacement can flow through live Lite runtime paths.

## Why

Current contract tests prove the replacement hook exists.

What is still missing is a real benchmark that proves runtime wiring actually honors a custom client on:

1. workflow promotion
2. tools feedback
3. replay repair review

## Scenario

Add `custom_model_client_runtime_loop` to the real benchmark suite.

The scenario should:

1. inject a custom `modelClientFactory`
2. force `modelClientMode: "custom"` on the chosen live paths
3. leave static fallback enabled so the benchmark proves the custom path really overrides default fallback wiring

## Required Assertions

### Workflow

1. governance preview reason comes from the custom client
2. policy effect still applies
3. governed promotion state reaches `stable`

### Tools

1. governance preview reason comes from the custom client
2. policy effect still applies
3. resulting pattern reaches `stable/trusted`

### Replay

1. governance preview reason comes from the custom client
2. replay learning projection still applies
3. generated rule state reaches `shadow`

## Scope

This benchmark should only:

1. extend runtime registration with optional internal provider-builder overrides
2. extend `scripts/lite-real-task-benchmark.ts`
3. update benchmark strategy docs

No public route changes.
No governance semantic changes.

## Verification

1. `npx tsc --noEmit`
2. `npx tsx scripts/lite-real-task-benchmark.ts`
3. suite remains fully green with one extra benchmark scenario
