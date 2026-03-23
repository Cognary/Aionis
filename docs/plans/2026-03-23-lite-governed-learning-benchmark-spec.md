# Lite Governed Learning Benchmark Spec

Date: 2026-03-23

## Goal

Extend the real-task benchmark with one scenario that exercises provider-backed governed learning through real Lite runtime routes.

## Why

The benchmark already proves:

1. workflow progression
2. pattern learning
3. contested recovery
4. slim surface behavior

What it does not yet prove directly is:

1. workflow governance apply on the runtime path
2. tools governance apply on the runtime path
3. internal provider fallback changing Lite-visible learned state without explicit review payloads

## Scenario

Add one benchmark scenario:

1. `governed_learning_runtime_loop`

The scenario should:

1. enable workflow static governance provider in the benchmark app
2. enable tools static governance provider in the benchmark app
3. produce a stable workflow through repeated execution continuity writes
4. verify governed workflow promotion state is applied
5. seed repeated tool rules
6. produce a trusted stable pattern through provider-backed tools feedback
7. disable the source rules
8. verify selector reuse still comes from the learned pattern

## Required Assertions

Minimum assertions:

1. first write stays candidate
2. second write yields a stable workflow with governed promotion apply
3. planning surface exposes workflow guidance after governed promotion
4. provider-backed tools feedback yields trusted/stable pattern state
5. governance preview reports runtime apply on the tools path
6. selector still reuses the learned pattern after source rules are disabled

## Non-Goals

This change does not:

1. change governance semantics
2. add new public runtime surface
3. change current smoke behavior
4. expand beyond workflow + tools in the benchmark

## Validation

1. `npx tsc --noEmit`
2. `npx tsx scripts/lite-real-task-benchmark.ts`
