# Aionis Lite Memory Governance Model

Last reviewed: 2026-03-20

This document defines how memory evolution decisions should be governed in `Aionis Lite`.

Preferred short module term:

`Runtime-Governed Semantic Memory`

Named execution-memory mainline:

`Anchor-Guided Rehydration Loop`

Definition:

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

Current runtime semantics:

1. `rehydrate_payload` inherits Lite's default local actor on the normal single-user path
2. runtime hints may therefore expose direct rehydrate calls without repeating local identity

Named execution-policy loop:

`Execution Policy Learning Loop`

Definition:

`feedback -> pattern -> recall -> selector reuse`

Current runtime expression:

1. planner-facing packet surfaces explain trusted and contested pattern visibility through `planner_explanation`
2. selector-facing summaries explain the same trust state through `selection_summary.provenance_explanation`
3. this keeps planner reasoning and selector reasoning aligned under one runtime-governed provenance contract

Current runtime semantics:

1. only stable patterns may participate in trusted selector reuse
2. explicit rule or operator `tool.prefer` remains higher priority than recalled trusted pattern preference
3. pattern memory may guide ordering after explicit preference, but it does not override explicit policy intent

The central principle is:

System handles deterministic mechanics.
LLM handles semantic judgment.

But the full governance model is slightly stricter than that:

1. the system executes deterministic mechanics
2. the LLM proposes semantic judgments
3. the system enforces boundaries, budgets, and write contracts

This means Lite does not treat the LLM as the owner of memory state.
It treats the LLM as a bounded adjudicator inside a governed memory runtime.

Practical trigger reference:

1. [docs/LITE_MEMORY_TRIGGER_MATRIX.md](/Volumes/ziel/Aionisgo/docs/LITE_MEMORY_TRIGGER_MATRIX.md)

## Why This Model Exists

A memory system for tool-using agents contains two different kinds of decisions.

### 1. Mechanism Decisions

These are operational and deterministic.

Examples:

1. append raw event
2. update usage counters
3. apply time decay
4. move payload from hot to cold storage
5. maintain anchor indexes
6. run base recall ranking

These are best handled by the system.

### 2. Meaning Decisions

These are semantic and context-dependent.

Examples:

1. is this trace worth long-term retention
2. should this memory be modeled as event, workflow, or pattern
3. which details are redundant and which are future clues
4. is this failure noise or reusable experience
5. do these two histories represent the same pattern
6. is this low-frequency memory strategically important

These are better handled with LLM participation.

If Lite forces both categories into hard rules, memory quality will be too rigid.
If Lite gives both categories to the LLM, memory governance will become unstable and hard to audit.

The correct design is a governed split.

## Governance Principle

The governing rule for Lite memory should be:

The LLM may interpret meaning.
The runtime remains responsible for state transition authority.

In practical terms:

1. the LLM can recommend
2. the system decides whether the recommendation is admissible
3. the system performs the actual state mutation
4. every mutation should remain inspectable after the fact

## Responsibility Split

### System-Owned Responsibilities

These should remain deterministic and runtime-owned:

1. raw event write and append-only evidence capture
2. payload archival and relocation
3. time decay and recency bookkeeping
4. usage frequency counting
5. hot/warm/cold/archive tier transitions
6. anchor index maintenance
7. baseline recall ranking
8. budget enforcement
9. schema validation
10. commit and provenance recording

These are mechanism problems, not meaning problems.

### LLM-Adjudicated Responsibilities

These should allow bounded LLM participation:

1. retention value judgment
2. event vs workflow vs pattern classification
3. surface detail vs signal compression judgment
4. noise vs reusable failure pattern judgment
5. pattern merge and split judgment
6. strategic-value judgment for low-frequency memories
7. policy-hint candidacy judgment

These are meaning problems.

### Shared Responsibilities

Some decisions should be split across the runtime and the LLM.

Recommended shared model:

1. the system generates candidate objects
2. the LLM evaluates their semantic significance
3. the system enforces thresholds and admissibility
4. the system persists the accepted result

This is the preferred model for:

1. promotion
2. demotion
3. compression
4. pattern formation
5. policy-hint generation

One practical example already enforced in Lite:

1. stable pattern memory can participate in tool ordering
2. explicit runtime policy still remains authoritative
3. selector reuse is therefore governed assistance, not silent policy replacement

## Decision Types

The governance model should distinguish three different decision outputs.

### 1. Proposal

Generated by:

1. the LLM
2. or deterministic candidate generation plus LLM review

Examples:

1. promote this trace to workflow memory
2. compress these two log sections away
3. treat these three workflows as the same pattern

### 2. Admissibility Check

Generated by:

1. the runtime

Checks:

1. budget limits
2. schema validity
3. threshold satisfaction
4. confidence floor
5. policy restrictions
6. write-scope safety

### 3. Mutation

Executed by:

1. the runtime only

Examples:

1. write anchor node
2. add derived edge
3. update tier
4. archive payload
5. mark promotion complete

This keeps Lite safe and auditable.

## Recommended LLM Output Shape

The LLM should not directly mutate memory state.

It should emit structured adjudication outputs such as:

```json
{
  "decision": "promote",
  "target_kind": "workflow",
  "target_level": "L2",
  "reason": "Repeated successful repair path with stable tool order",
  "confidence": 0.82,
  "keep_details": [
    "error signature",
    "patched file",
    "tool order"
  ],
  "drop_details": [
    "duplicate log tail",
    "repeated stack frames"
  ],
  "related_memory_ids": [
    "node_1",
    "node_2"
  ]
}
```

The runtime should then:

1. validate the shape
2. decide whether the action is allowed
3. perform the mutation
4. record the proposal and the result

## Promotion Governance

Promotion should follow this governed sequence:

1. the runtime nominates candidate memories
2. the LLM judges whether they represent reusable structure
3. the runtime checks confidence, repetition, and budget requirements
4. the runtime writes the promoted anchor or pattern if admissible

The LLM should be allowed to answer:

1. not reusable
2. reusable as execution anchor
3. reusable as workflow anchor
4. reusable as pattern anchor
5. insufficient evidence

This creates meaningful semantic participation without granting unconstrained write authority.

## Compression And Forgetting Governance

Compression is a good fit for LLM assistance.
Deletion is not.

Recommended rule:

1. the LLM may recommend `compress`
2. the LLM may recommend `demote`
3. the LLM may recommend `archive`
4. the LLM should not directly decide irreversible `delete`

Reason:

Compression and demotion are reversible enough to tolerate semantic mistakes.
Deletion is not.

For Lite, the preferred forgetting model is:

1. semantic compression first
2. demotion second
3. archival third
4. deletion only through strong runtime policy or long-horizon GC

## Pattern Formation Governance

Pattern formation should be governed by a signature-first runtime gate and an LLM semantic review.

Recommended sequence:

1. the runtime groups candidate workflows by `task_signature`, `error_signature`, and `workflow_signature`
2. the LLM judges whether the grouped workflows represent the same reusable pattern
3. the runtime checks outcome stability and repetition thresholds
4. the runtime writes a pattern anchor only if the proposal remains admissible

This prevents the LLM from inventing broad patterns from superficial tool overlap.

## Rehydration Governance

Rehydration should follow the same governance logic.

Default model:

1. the runtime presents recalled anchors and payload cost hints
2. the LLM decides whether to call `rehydrate_payload`
3. the runtime performs the rehydration if requested and allowed

The runtime may still force rehydration in narrow cases:

1. irreversible actions
2. policy-mandated verification
3. repeated failure after anchor-only guidance
4. safety-critical missing context

This preserves LLM agency without sacrificing runtime control.

## Importance Governance

Importance scoring should also be split by role.

The system should own:

1. usage counters
2. recency tracking
3. time decay
4. tier state
5. batch maintenance

The LLM should influence:

1. strategic-value assessment
2. whether a low-frequency item is still worth retaining
3. whether an item deserves promotion despite sparse usage

This allows importance to stay dynamic without forcing all value judgments into formula weights.

## Safety Rules

The governance model should include the following safety rules.

### Rule 1

The LLM never receives unrestricted delete authority.

### Rule 2

Every semantic adjudication that changes memory state should produce a structured rationale.

### Rule 3

The runtime should be able to reject an LLM proposal on budget, confidence, or policy grounds.

### Rule 4

Promotion and pattern formation should require runtime-side threshold checks in addition to semantic judgment.

### Rule 5

Rehydration should remain explicit in the normal case.

## Recommended Runtime Contract

The cleanest contract for Lite is:

1. runtime generates candidates
2. LLM returns structured adjudication
3. runtime applies guardrails
4. runtime mutates state
5. runtime records provenance

This should be the default contract for:

1. `promote_memory`
2. `compress_memory`
3. `form_pattern`
4. `derive_policy_hint`
5. `rehydrate_payload`

## Suggested Terminology

Recommended names for this design:

1. `Policy-Bounded Semantic Memory`
2. `Rule-Bounded LLM Memory Adjudication`
3. `Governed Semantic Memory`

The clearest internal phrase is:

LLM-adjudicated, runtime-governed memory evolution.

## Summary

The memory system should not be fixed-rule only.
It should also not be LLM-owned.

The correct Lite model is:

1. mechanics remain deterministic
2. semantics are LLM-assisted
3. state transition authority stays with the runtime

That gives Aionis Lite a memory system that can evolve in meaning without becoming operationally ungoverned.
