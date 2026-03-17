# Many-Tools Benchmark Plan

Date: `2026-03-17`
Status: `design ready`
Depends on:
- [AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md)
- [AIONIS_TOOL_EVOLUTION_RUNTIME_ROLLOUT_DECISION_2026-03-17.md](/Users/lucio/Desktop/Aionis/docs/internal/strategy/AIONIS_TOOL_EVOLUTION_RUNTIME_ROLLOUT_DECISION_2026-03-17.md)
- [AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md)

## Summary

This benchmark is designed to answer one narrow question:

**as the number of available tools or skills increases, can Aionis keep tool selection accuracy from degrading as quickly as a baseline model-only path?**

This is not a generic workflow benchmark.
It is a focused many-tools selection benchmark.

The benchmark should measure:

1. whether the agent calls a tool when it should
2. whether it calls the correct tool on the first attempt
3. whether candidate governance from Aionis improves selection quality as tool count increases
4. whether continuity metadata helps in multi-step settings where the first tool choice affects later steps

This benchmark is a better fit for the current Tool Evolution state than adapter-side runtime rollout because it does not require host reroute support.
It can directly exercise `tools/select` with full candidate sets.

## Problem Statement

There is a recurring industry claim that tool or skill selection degrades as the available tool count grows.
The exact threshold is model-specific and should not be hard-coded as a universal rule.

So the benchmark should not try to prove a specific number such as `12`.
Instead, it should test a curve.

The benchmark question is:

**for the same task family, how does correct tool selection change when the available candidate set grows from small to medium to large?**

Aionis should be tested as a candidate-governance layer, not as an unconstrained planner.

## Goals

This benchmark must produce evidence for all of the following:

1. the effect of tool-count growth on first-choice tool accuracy
2. whether Aionis `tools/select` improves correct-tool selection under larger candidate sets
3. whether family-aware ordering from Tool Evolution Phase B improves results further inside same-family ambiguity
4. whether multi-step continuity context reduces repeat wrong-tool calls after an initial miss
5. whether gains hold without relying on host-side tool reroute

## Non-Goals

This benchmark does not attempt to:

1. prove a universal industry threshold for all models
2. measure full end-to-end OpenClaw workflow completion as the primary outcome
3. validate replay migration behavior
4. require host executor changes
5. benchmark every possible tool family at once

## Benchmark Variants

The benchmark should run in three variants.

### Variant A: Model-Only Baseline

The model receives the task and the full candidate list.
There is no Aionis tool governance.

This isolates raw many-tools degradation.

### Variant B: Aionis Selection Only

The model receives the task, but candidate selection is first narrowed or ordered by Aionis `tools/select`.
The benchmark should use:

1. stage-aware control profile when available
2. current `tools/select` policy filtering
3. Tool Evolution Phase B family-aware ordering

This measures whether Aionis can improve selection quality without continuity memory.

### Variant C: Aionis Selection Plus Continuity

This variant adds execution state and compact continuity packet.
The goal is to measure whether the second and later decisions degrade less after the first step.

This should only be used for multi-step case families.

## Candidate Bucket Design

The benchmark should use fixed candidate-count buckets.

Recommended buckets:

1. `4`
2. `8`
3. `12`
4. `16`
5. `24`

Each bucket should contain:

1. `1` correct tool
2. `2-6` same-family distractors depending on bucket size
3. enough cross-family distractors to fill the bucket
4. at least `1` misleading tool with name similarity when the bucket is `8+`

This produces degradation pressure from both:

1. same-family ambiguity
2. general candidate overload

## Case Family Design

Start with a small, clear case library.
Each case family should correspond to one capability family and one dominant failure mode.

### Family 1: Focused Repo Read

Target question:
can the agent choose the correct targeted read tool instead of broad scanning or the wrong read variant?

Correct tool examples:

1. `read-source-focused-v2`
2. `read-markdown-impl`

Distractor types:

1. broad scan tool
2. wrong read subtype
3. test runner
4. patch tool
5. similarly named legacy read tool

### Family 2: Focused Test Execution

Target question:
can the agent choose a targeted test runner instead of broad test execution?

Correct tool examples:

1. `run-focused-test`
2. `pytest-targeted`

Distractor types:

1. full-suite test tool
2. repo scan tool
3. patch tool
4. review formatter

### Family 3: Targeted Patch Apply

Target question:
can the agent choose the patch tool that edits the requested file instead of a broader or irrelevant edit path?

Distractor types:

1. read tool
2. broad edit tool
3. test tool
4. review tool

The first release of this benchmark should only require Family 1.
Family 2 and Family 3 can be added after the harness is stable.

## Primary Metrics

The benchmark should report these as the primary metrics.

### 1. First Correct Tool Rate

The fraction of runs where the first tool actually chosen is the correct tool.

This is the most important metric.

### 2. Tool Omission Rate

The fraction of runs where a tool should have been called but no tool was called.

### 3. Wrong Tool Invocation Rate

The fraction of runs where a non-correct tool was invoked first.

### 4. Recovery Rate After Wrong First Tool

For multi-step cases only.
This measures whether the system recovers to the correct tool path after the first miss.

## Secondary Metrics

These matter, but they are not promotion gates ahead of correctness.

1. total tool calls
2. broad-scan tool calls
3. broad-test tool calls
4. prompt tokens
5. completion tokens
6. wall-clock time

## Promotion Rule

This benchmark must follow the same product rule used elsewhere in Aionis:

**correctness and completion come before token or wall-clock wins.**

A variant must not be promoted if:

1. first correct tool rate regresses on the strongest case bucket
2. omission rate rises materially
3. wrong-tool rate improves only by avoiding tool calls entirely

## Benchmark Structure

Each benchmark case should have:

1. a task prompt
2. a candidate tool list
3. the expected correct tool
4. tool family metadata
5. a step mode
6. optional continuity state
7. acceptance rules

Recommended structure:

```json
{
  "id": "manytools-read-001",
  "family": "focused_repo_read",
  "difficulty": "medium",
  "bucket": 12,
  "task": {
    "instruction": "Read the implementation file that defines buildHandoffExecutionStateIdentity and summarize what state identity fields are produced.",
    "expected_action": "call_tool",
    "expected_correct_tool": "read-source-focused-v2"
  },
  "continuity": {
    "execution_state_v1": null,
    "execution_packet_v1": null,
    "control_profile_v1": {
      "tool": {
        "allow": ["read-source-focused-v2", "read-markdown-impl", "repo-scan-basic"],
        "deny": ["run-broad-test"],
        "prefer": ["read-source-focused-v2"]
      }
    }
  },
  "candidates": [
    {
      "tool_name": "read-source-focused-v2",
      "capability_family": "focused_repo_read",
      "quality_tier": "preferred",
      "role": "correct"
    },
    {
      "tool_name": "read-markdown-impl",
      "capability_family": "focused_repo_read",
      "quality_tier": "supported",
      "role": "same_family_distractor"
    },
    {
      "tool_name": "repo-scan-basic",
      "capability_family": "broad_repo_scan",
      "quality_tier": "supported",
      "role": "cross_family_distractor"
    },
    {
      "tool_name": "run-broad-test",
      "capability_family": "broad_test",
      "quality_tier": "deprecated",
      "role": "cross_family_distractor"
    }
  ],
  "acceptance": {
    "correct_first_tool": "read-source-focused-v2",
    "wrong_first_tools": ["repo-scan-basic", "run-broad-test", "read-markdown-impl"],
    "allow_no_tool": false
  }
}
```

## Minimal JSON Schema

The first benchmark implementation should support this minimal case schema.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AionisManyToolsCase",
  "type": "object",
  "required": ["id", "family", "bucket", "task", "candidates", "acceptance"],
  "properties": {
    "id": { "type": "string" },
    "family": { "type": "string" },
    "difficulty": { "type": "string", "enum": ["easy", "medium", "hard"] },
    "bucket": { "type": "integer", "enum": [4, 8, 12, 16, 24] },
    "task": {
      "type": "object",
      "required": ["instruction", "expected_action", "expected_correct_tool"],
      "properties": {
        "instruction": { "type": "string" },
        "expected_action": { "type": "string", "enum": ["call_tool"] },
        "expected_correct_tool": { "type": "string" }
      }
    },
    "continuity": {
      "type": "object",
      "properties": {
        "execution_state_v1": { "type": ["object", "null"] },
        "execution_packet_v1": { "type": ["object", "null"] },
        "control_profile_v1": { "type": ["object", "null"] }
      },
      "additionalProperties": true
    },
    "candidates": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["tool_name", "capability_family", "quality_tier", "role"],
        "properties": {
          "tool_name": { "type": "string" },
          "capability_family": { "type": ["string", "null"] },
          "quality_tier": {
            "type": ["string", "null"],
            "enum": ["experimental", "supported", "preferred", "deprecated", null]
          },
          "role": {
            "type": "string",
            "enum": ["correct", "same_family_distractor", "cross_family_distractor", "misleading_name_distractor"]
          }
        }
      }
    },
    "acceptance": {
      "type": "object",
      "required": ["correct_first_tool", "allow_no_tool"],
      "properties": {
        "correct_first_tool": { "type": "string" },
        "wrong_first_tools": {
          "type": "array",
          "items": { "type": "string" }
        },
        "allow_no_tool": { "type": "boolean" }
      }
    }
  },
  "additionalProperties": false
}
```

## Harness Design

The first harness should avoid host executor dependency.

Recommended path:

1. generate a candidate list from the case file
2. run a baseline prompt that asks the model to choose from the listed tools
3. run an Aionis-assisted prompt that first calls `POST /v1/memory/tools/select`
4. compare selected tool and tool-ordering metadata
5. score the first tool against `acceptance.correct_first_tool`

This harness can be implemented as a direct benchmark client.
It does not need OpenClaw hook integration for the first release.

## Output Format

The benchmark should write:

1. `summary.json`
2. `cases.jsonl`
3. `selection_traces.jsonl`

The summary should include:

1. per-bucket first correct tool rate
2. per-family first correct tool rate
3. omission rate
4. wrong-tool rate
5. broad-tool call rate when applicable
6. token and wall-clock statistics

## Rollout Sequence

### Phase 0

Write the case schema and `4` canonical Family 1 cases.

### Phase 1

Implement the direct harness with Variant A and Variant B only.

### Phase 2

Add Variant C for multi-step continuity-sensitive cases.

### Phase 3

Only after the harness is stable, consider a host-integrated shadow mode.
Do not make host reroute a requirement for this benchmark.

## Exit Criteria

This benchmark design is ready to implement when:

1. the case schema is frozen
2. Family 1 has at least `4` canonical cases
3. the harness reads case files instead of hard-coded prompts
4. the output format includes first correct tool rate by bucket
5. the benchmark can compare model-only against Aionis-assisted selection on the same candidate sets

## Recommendation

The first implementation slice should be intentionally narrow:

1. Family 1 only
2. buckets `4`, `8`, `12`, `16`
3. Variant A and Variant B only
4. first correct tool rate as the headline metric

This is the smallest slice that can answer the real product question:

**when tool count rises, does Aionis help the agent pick the right tool more often than a raw model-only path?**
