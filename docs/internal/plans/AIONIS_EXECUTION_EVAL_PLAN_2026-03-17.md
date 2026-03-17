# Aionis Execution Eval Plan

Date: `2026-03-17`
Status: `design for internal eval layer`
Depends on:
- [AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md)
- [AIONIS_PROJECT_STATUS_2026-03-15.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_PROJECT_STATUS_2026-03-15.md)
- [AIONIS_STAGE_CLOSEOUT_AND_GTM_PLAN_2026-03-16.md](/Users/lucio/Desktop/Aionis/docs/internal/strategy/AIONIS_STAGE_CLOSEOUT_AND_GTM_PLAN_2026-03-16.md)
- [AIONIS_TOOL_EVOLUTION_RUNTIME_ROLLOUT_DECISION_2026-03-17.md](/Users/lucio/Desktop/Aionis/docs/internal/strategy/AIONIS_TOOL_EVOLUTION_RUNTIME_ROLLOUT_DECISION_2026-03-17.md)

## Summary

Aionis is now strong enough to add an internal `Execution Eval` layer.

This is a better next step than continuing to force `skill selection` into the product story.

Current reality:

1. Aionis is strongest on execution continuity, recovery, and control
2. Aionis already emits structured state, packet, profile, and decision artifacts
3. real workflow evidence already exists on the OpenClaw proving wedge
4. tool-selection uplift is not strong enough to define the next product layer

So the next eval layer should answer a narrower and more valuable question:

**did this run stay controlled, recover correctly, and finish in a reviewer-ready state?**

This plan defines that eval layer.

## Problem

Aionis already has many of the ingredients of an eval system, but they remain distributed:

1. `ExecutionState` describes where the task currently is
2. `ExecutionPacket` describes what the current stage should see
3. `ControlProfile` describes how the run should proceed
4. handoff, replay, and recovery emit continuity evidence
5. benchmark harnesses and nightly jobs already produce repeatable artifacts

What is missing is a single eval contract that turns those pieces into a stable answer to:

1. did the run complete
2. did it stay on a controlled path
3. did recovery behave correctly after interruption or failure
4. is the output reviewer-ready enough to count as a real success
5. did a new kernel change improve or regress execution quality

Without that layer, the team keeps relying on a mix of:

1. one-off benchmark interpretation
2. manual artifact reading
3. route-specific telemetry
4. argument over single-case outcomes

That is not enough for product hardening.

## Goals

Execution Eval must achieve all of the following:

1. create one internal eval contract for coding-agent runs
2. measure execution quality, not just retrieval or token cost
3. make completion and reviewer-readiness the top-line metrics
4. make continuity and recovery quality first-class eval dimensions
5. provide a stable gate for regression, promotion, and release decisions
6. stay narrow to the current OpenClaw proving wedge first

## Non-Goals

Execution Eval does not attempt to:

1. become a generic agent-eval platform
2. score every model quality dimension under one framework
3. replace product benchmarks with one synthetic score
4. promote `skill selection` as a solved Aionis capability
5. turn every telemetry event into an externally visible KPI

## Core Product Reading

Execution Eval should be treated as:

**an internal execution-quality layer for Aionis, built on top of the existing continuity kernel.**

It is not a new product promise yet.

It should first serve three internal roles:

1. regression gate
2. release-readiness gate
3. architecture truth source for what Aionis is actually good at

If it becomes stable later, it may also become a product surface.

## Eval Object Model

The first eval layer should stay simple.

Each eval run should produce one `execution_eval_v1` record with:

1. `eval_id`
2. `suite_id`
3. `case_id`
4. `variant`
5. `run_id`
6. `scope`
7. `task_family`
8. `result`
9. `dimension_scores`
10. `decision_summary`
11. `artifact_refs`
12. `operator_notes`

Suggested top-level shape:

```json
{
  "eval_version": "execution_eval_v1",
  "suite_id": "openclaw_real_workflow_core_v1",
  "case_id": "dashboard_auth_drift",
  "variant": "aionis_treatment",
  "result": "pass",
  "dimension_scores": {
    "completion": 1,
    "reviewer_readiness": 1,
    "continuity": 1,
    "recovery": 0.67,
    "control_quality": 0.8
  },
  "decision_summary": {
    "stop_reason": null,
    "handoff_used": true,
    "replay_used": false,
    "control_profile_origin": "continuity-delivered"
  },
  "artifact_refs": {
    "summary": "artifacts/.../summary.json",
    "cases": "artifacts/.../cases.jsonl"
  }
}
```

## Primary Eval Dimensions

The first release of Execution Eval should score only five dimensions.

### 1. Completion

Hard question:

**did the run finish the intended task?**

This remains the top gate.

Suggested scoring:

1. `1.0` completed
2. `0.5` partial or ambiguous completion
3. `0.0` not completed

### 2. Reviewer-Readiness

Hard question:

**is the output in a state that a reviewer or operator would treat as a valid handoff?**

This should stay separate from pure completion because a run can finish mechanically without producing a reviewer-ready result.

### 3. Continuity

Hard question:

**did the run preserve the right execution state across turns, stages, or interruptions?**

Signals may include:

1. packet continuity present
2. state-first assembly used
3. resume anchor preserved
4. target files and pending validations carried forward correctly

### 4. Recovery

Hard question:

**when execution was interrupted, blocked, or forced to stop, did the system recover into a correct next state?**

Signals may include:

1. successful handoff or replay use
2. recovery without destructive drift
3. blocker carry-forward correctness
4. recovery without redundant rediscovery

### 5. Control Quality

Hard question:

**did the run stay within intended execution bounds?**

Signals may include:

1. broad scan overuse
2. broad test overuse
3. duplicate observation loops
4. threshold-triggered stop quality
5. whether control decisions preserved completion instead of harming it

## Secondary Metrics

These should be recorded, but not treated as top-line proof:

1. token usage
2. wall-clock time
3. total tool calls
4. replay count
5. handoff count
6. stop count
7. candidate-filter events

Rule:

**secondary metrics never override completion and reviewer-readiness.**

## Canonical Eval Suites

The first execution-eval layer should stay narrow and use suites that already match Aionis's strongest proof.

### Suite A: Real Workflow Core

Use the strongest current OpenClaw workflow slices:

1. dashboard auth drift
2. pairing / approval recovery
3. service token drift repair

Purpose:

1. protect the current strongest product proof
2. gate kernel changes against real workflow regressions

### Suite B: Continuity Recovery Core

Use repeated interruption and resume cases where handoff/replay/resume quality can be scored directly.

Purpose:

1. measure continuity correctness separately from pure completion
2. detect regressions in state carry-forward and recovery behavior

### Suite C: Control Quality Core

Use a narrower set of cases that measure:

1. broad-scan control
2. broad-test control
3. duplicate-loop suppression
4. stop behavior correctness

Purpose:

1. prove bounded execution is helping, not only stopping runs earlier

## Explicit Exclusions for Phase 1

The following should stay outside the first Execution Eval layer:

1. many-skills selection uplift as a headline eval dimension
2. generic retrieval-quality eval
3. generalized cross-host benchmarks beyond OpenClaw
4. external ranking leaderboard behavior
5. one-number summary scores for all capabilities

This is important.

Execution Eval should harden the product we actually have, not turn into a kitchen sink.

## Required Inputs

Execution Eval should be built from data Aionis already emits or can emit cheaply.

Primary sources:

1. `ExecutionState`
2. `ExecutionPacket`
3. `ControlProfile`
4. handoff/recover artifacts
5. replay and stop artifacts
6. `tools/feedback` and decision traces
7. benchmark `summary.json` and `cases.jsonl`
8. nightly review outputs on the strongest slice

If a dimension cannot be derived from these sources, it should not be in Phase 1.

## Proposed Internal Layout

Execution Eval should live as a narrow layer, not a new top-level product tree.

Suggested layout:

```text
src/
  eval/
    types.ts
    score.ts
    summarize.ts
    suites.ts
scripts/
  eval/
    execution-eval.ts
    execution-eval-report.ts
scripts/ci/
  execution-eval-core.test.mjs
```

Key rule:

1. scoring logic belongs in `src/eval/`
2. suite wiring and artifact generation belong in `scripts/eval/`
3. benchmark harnesses remain where they are and feed the eval layer

## Rollout Plan

### Phase 1: Eval Contract and Report Layer

Deliver:

1. `execution_eval_v1` schema
2. score calculator for the five primary dimensions
3. one report generator producing:
   - `execution_eval_summary.json`
   - `execution_eval_summary.md`
4. one focused CI test set

Do not yet:

1. change runtime behavior
2. invent new benchmark suites
3. add external product docs

### Phase 2: Regression Gate

Deliver:

1. one command that evaluates the strongest real workflow suite
2. pass/fail thresholds for completion and reviewer-readiness
3. stable CI or nightly gate output

Gate rule:

**no kernel promotion if completion or reviewer-readiness regresses on the core suite.**

### Phase 3: Release Readiness Overlay

Deliver:

1. release checklist integration
2. explicit pre-release execution-eval runbook
3. score history tracking across tagged releases

At this point, Execution Eval becomes part of release discipline.

## Promotion Rules

Execution Eval should directly reinforce the product discipline already established.

Rules:

1. completion first
2. reviewer-readiness second
3. continuity and recovery third
4. control quality fourth
5. efficiency metrics last

That means:

1. a token win with completion loss is still a regression
2. a wall-clock win with reviewer-readiness loss is still a regression
3. a stricter control path that blocks successful completion is still a regression

## Risks

### Risk 1: Eval scope creep

If this expands into generic model eval, it will dilute the product and consume too much engineering time.

Mitigation:

1. keep the first three suites narrow
2. forbid generic leaderboards in Phase 1

### Risk 2: Overfitting to current benchmark artifacts

If scores merely restate benchmark output without measuring execution-quality structure, the layer will add little value.

Mitigation:

1. score continuity and recovery explicitly
2. keep dimension definitions independent from any single harness

### Risk 3: Premature externalization

If Execution Eval is turned into a public promise too early, it will create another product surface before the first one is fully hardened.

Mitigation:

1. keep it internal first
2. use it as a gate before using it as a message

## Exit Criteria

Execution Eval Phase 1 should be considered complete only when:

1. `execution_eval_v1` exists in code
2. the strongest workflow suite can emit stable eval summaries
3. continuity and recovery are scored from real artifacts rather than manual interpretation
4. a kernel regression can be called from eval output without ad hoc argument
5. the system still stays narrowly aligned with execution continuity rather than generic agent evaluation

## Decision

Execution Eval is worth doing now because it compounds Aionis's strongest current advantage.

It should not be framed as a new attempt to solve everything.

It should be framed as:

**the internal truth layer for whether Aionis is actually improving execution quality on the product wedge that already exists.**
