# Lite Benchmark Regression Gate Spec

Date: 2026-03-23

## Goal

Turn the Lite real benchmark from a compare-only artifact producer into a benchmark runner that can fail on baseline regression.

## Why

The benchmark already supports `--baseline-json`, but currently only reports deltas.

That is useful for inspection, but it does not yet act as a real regression gate for:

1. scenario status flips
2. suite score drops
3. scenario score drops

## Required Behavior

Add benchmark CLI support for:

1. `--fail-on-status-regression`
2. `--max-suite-score-drop <number>`
3. `--max-scenario-score-drop <number>`

When a baseline is provided:

1. status regressions should fail the command when enabled
2. suite score drops beyond threshold should fail the command
3. scenario score drops beyond threshold should fail the command

## Validation Flow

`scripts/lite-real-validation.sh` should accept an optional baseline path and pass regression-gate arguments through to the benchmark step.

## Scope

This change should only affect:

1. benchmark CLI behavior
2. isolated validation script behavior
3. benchmark/testing docs

No runtime behavior changes.
No route contract changes.

## Verification

1. `npx tsc --noEmit`
2. `npx tsx scripts/lite-real-task-benchmark.ts`
3. `npx tsx scripts/lite-real-task-benchmark.ts --out-json /tmp/...`
4. rerun with `--baseline-json` and zero-drop thresholds to confirm regression gate path still passes when baseline matches
