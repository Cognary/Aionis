# Lite Governed Replay Benchmark Spec

Date: 2026-03-23

## Goal

Extend the real-task benchmark with a replay-governed runtime scenario that proves provider-backed replay review produces real Lite learning output and planner-visible workflow guidance.

## Why

The benchmark already covers:

1. policy learning
2. workflow progression
3. provider-backed workflow and tools governed learning

What is still missing is a benchmark scenario for:

1. replay repair review
2. provider-backed `promote_memory`
3. inline replay learning projection
4. planning-context consumption of replay-learned workflow state

## Scenario

Add one scenario:

1. `governed_replay_runtime_loop`

The scenario should:

1. seed a pending-review playbook with workflow-signature evidence
2. enable the replay static governance provider
3. call the real replay review route
4. assert the learning projection is applied inline to `shadow`
5. assert governance preview reports admissible runtime apply
6. assert the generated replay-learning rule exists
7. assert planning context now exposes workflow guidance
8. assert execution introspection shows stable workflow state

## Non-Goals

This change does not:

1. change replay governance semantics
2. add new public route fields
3. replace static providers with real external inference

## Validation

1. `npx tsc --noEmit`
2. `npx tsx scripts/lite-real-task-benchmark.ts`
