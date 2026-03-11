---
title: "Aionis Agent Cost Reduction Roadmap"
---

# Aionis Agent Cost Reduction Roadmap

Date: `2026-03-10`
Status: `in_progress`

Latest status snapshot: [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md)

## Purpose

This document defines the next-stage roadmap for making Aionis materially reduce agent execution cost.

The goal is not "better prompt compression" in isolation.

The real goal is to make agents:

1. inject less low-value context
2. ask the primary model to reason less often
3. reuse more already-validated execution paths
4. preserve auditability while reducing hot-path token cost

## Executive Summary

The proposed directions are valid and aligned with Aionis's current trajectory.

However, they do not have equal value.

Recommended priority order:

1. `P1` deterministic replay gating for inference-free execution
2. `P1` forgetting policy that changes default context injection behavior
3. `P2` selective injection of static system/bootstrap/config blocks
4. `P2` write-time distillation into structured evidence and fact surfaces
5. `P3` tool-output summarization inside Aionis before primary-model handoff

The main principle is:

> Aionis should reduce cost primarily by making the primary model participate less, not only by compressing more text.

## Rollout Rule

Once a new optimization policy exists, Aionis should not promote it to a default solely from single-run benchmark wins.

Default-policy rollout should require:

1. canonical benchmark fixture coverage
2. repeated-run median comparison
3. class-level evidence when the policy is workload-sensitive
4. an explicit opt-in mode first if the evidence is strong for one class but not strong enough for a global default

For lower-risk context-side optimizations, the preferred rollout path is:

1. request-level opt-in first
2. endpoint default next
3. only later consider wider mode-level defaults

Current evidence update:

1. selector-by-default still fails rollout-gate evidence and should remain experimental
2. endpoint-default rollout for `context_optimization_profile=aggressive` now has two seeded query-class artifacts and a passing context rollout gate

## Current Baseline

Aionis already has partial building blocks for this roadmap:

1. structured memory objects and write/recall surfaces:
   - [/Users/lucio/Desktop/Aionis/src/memory/write.ts](/Users/lucio/Desktop/Aionis/src/memory/write.ts)
   - [/Users/lucio/Desktop/Aionis/src/memory/recall.ts](/Users/lucio/Desktop/Aionis/src/memory/recall.ts)
2. layered context assembly and context budgets:
   - [/Users/lucio/Desktop/Aionis/src/memory/context.ts](/Users/lucio/Desktop/Aionis/src/memory/context.ts)
   - [/Users/lucio/Desktop/Aionis/src/memory/context-orchestrator.ts](/Users/lucio/Desktop/Aionis/src/memory/context-orchestrator.ts)
   - [/Users/lucio/Desktop/Aionis/src/routes/memory-context-runtime.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-context-runtime.ts)
3. replay and playbook surfaces:
   - [/Users/lucio/Desktop/Aionis/src/memory/replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts)
   - [/Users/lucio/Desktop/Aionis/src/routes/memory-replay-core.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-replay-core.ts)
   - [/Users/lucio/Desktop/Aionis/src/routes/memory-replay-governed.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-replay-governed.ts)
4. governance and repair review:
   - [/Users/lucio/Desktop/Aionis/src/app/replay-repair-review-policy.ts](/Users/lucio/Desktop/Aionis/src/app/replay-repair-review-policy.ts)
5. tiering, compaction, decay, and archive/rehydrate:
   - [/Users/lucio/Desktop/Aionis/src/store/embedded-memory-runtime.ts](/Users/lucio/Desktop/Aionis/src/store/embedded-memory-runtime.ts)
   - [/Users/lucio/Desktop/Aionis/src/jobs/salience-decay.ts](/Users/lucio/Desktop/Aionis/src/jobs/salience-decay.ts)
   - [/Users/lucio/Desktop/Aionis/src/routes/memory-lifecycle.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-lifecycle.ts)

So the roadmap is not a greenfield rewrite.

It is mainly about:

1. tightening what gets injected
2. tightening when the model is invoked
3. making reuse more deterministic

## Direction 1: Deterministic Replay Gating

Priority: `P1`

### Problem

Current replay already provides `simulate / strict / guided`, but the system still leaves too much room for the primary model to participate in repeated tasks.

That means Aionis can help guide repeated execution, but it does not yet fully realize the strongest cost advantage:

1. no primary-model call on high-confidence exact-match paths
2. direct deterministic execution from validated playbooks
3. escalation to guided repair only on deviation

### Target Outcome

For repeated tasks that match a validated playbook fingerprint:

1. skip planner/model reasoning by default
2. execute the playbook deterministically
3. attach deviation detection and audit telemetry
4. only trigger guided repair when preconditions or observed outputs diverge

### Design Direction

Introduce a replay gating stage ahead of main-model invocation:

1. compute task fingerprint and execution precondition fingerprint
2. match against promoted playbook plus relevant policy fingerprint
3. if confidence is above threshold:
   - run deterministic path
   - mark request as `inference_skipped=true`
4. if confidence is below threshold:
   - route to existing replay or guided path

### Why It Matters

This is the single most important cost lever because it reduces:

1. primary-model call count
2. repeated planning tokens
3. repeated tool-selection reasoning

### Risks

1. false-positive replay matching could execute the wrong path
2. fingerprint drift could cause brittle misses or unsafe hits
3. policy mismatch could make an old playbook unsafe under new control conditions

### Mitigations

1. require matcher + policy fingerprint alignment
2. keep deterministic mode opt-in behind confidence thresholds at first
3. emit explicit replay-deviation telemetry and rollback switches

## Direction 2: Forgetting Policy, Not Only Compaction

Priority: `P1`

### Problem

Current context handling focuses on compaction and budgeting.

That is necessary but insufficient for long-lived agent systems.

If low-value historical material is always still eligible for injection, then compaction just delays context inflation.

### Target Outcome

Context assembly should treat memory tiers as injection policy, not only storage policy.

By default:

1. `hot` and selected `warm` surfaces remain injection-eligible
2. `cold` and `archive` surfaces do not enter context by default
3. cold/archive content only re-enters when explicitly recalled or rehydrated

### Design Direction

Connect tiering to context eligibility:

1. add per-tier injection defaults in context assembly policy
2. add explicit recall flags for cold/archive override
3. expose governance-level controls for promotion and cooling rules
4. produce telemetry on omitted-by-tier material

### Why It Matters

This changes the default from:

`compress everything that might matter`

to:

`inject only what is still likely to matter`

That is the more scalable long-term behavior.

### Risks

1. over-aggressive forgetting can remove needed facts
2. operators may lose confidence if omitted context is invisible

### Mitigations

1. log dropped-by-tier counts and sample references
2. provide explicit rehydrate and cold recall escape hatches
3. start with conservative defaults and tenant-level overrides

## Direction 3: Selective Injection of Static Config and Bootstrap Material

Priority: `P2`

### Problem

Many agent stacks re-inject bootstrap instructions, workspace configuration, and static policy blocks on every turn.

That is wasted context whenever only a subset is relevant.

### Target Outcome

Static system material should be assembled as addressable blocks and injected only when relevant to the current task.

### Design Direction

Introduce config-block selection in context assembly:

1. define addressable config block units
2. attach metadata such as scope, tool family, task class, risk class, and environment
3. select blocks in this order:
   - deterministic rule match
   - policy-driven match
   - optional lightweight classifier if needed
4. emit which blocks were included and why

### Why It Matters

This reduces pure static prompt bloat without changing core kernel semantics.

It is lower risk than summarizing tool outputs and should land earlier.

### Risks

1. missing block selection could break execution quality
2. model-based selection can cost more than it saves if used too early

### Mitigations

1. start with deterministic block inclusion rules
2. keep a fallback "safe full config" mode during rollout
3. track selected vs omitted block hit rates

## Direction 4: Write-Time Distillation into Structured Evidence

Priority: `P2`

### Problem

Storing large raw payloads and later recalling them as large raw text is one of the most expensive memory patterns.

### Target Outcome

At write time, Aionis should distill raw content into structured, decision-relevant memory objects:

1. facts
2. evidence
3. normalized tool outcomes
4. stable summaries with provenance

The hot-path recall result should prefer distilled structure over raw text blobs.

### Design Direction

Add a distillation stage before durable hot-path write completion:

1. classify incoming payload type:
   - webpage
   - tool response
   - operator note
   - model outcome
2. transform into structured nodes and slots
3. preserve raw source out-of-band via artifact or evidence reference
4. default recall to distilled nodes

### Why It Matters

This can materially reduce per-item token cost and improve downstream policy/replay matching quality.

### Risks

1. information loss if distillation is too aggressive
2. audit degradation if raw source is discarded
3. schema churn if node types are introduced too quickly

### Mitigations

1. never require raw deletion as part of first rollout
2. keep raw source through artifact pointers or evidence references
3. gate new schemas behind canonical object review

## Direction 5: Tool-Output Summarization Inside Aionis

Priority: `P3`

### Problem

Using the primary model to read and summarize large tool outputs is a poor cost allocation.

### Target Outcome

Large tool results should be compressed before they reach the primary model.

The primary model should see:

1. structured summary
2. decision-relevant fields
3. provenance pointer to raw output

### Design Direction

Introduce a layered summarization path in execution/runtime services:

1. rules-first extraction for known output shapes
2. lightweight model summarization only when rules are insufficient
3. explicit provenance, confidence, and truncation metadata
4. write the result as structured memory, not freeform prose only

### Why It Matters

This improves cost efficiency, but it is not the first thing to do because summarization quality errors can silently corrupt downstream execution.

### Risks

1. summary hallucination or omission
2. hidden information loss
3. hard-to-debug quality regressions

### Mitigations

1. prefer deterministic extraction for stable tool schemas
2. always retain raw pointer
3. expose confidence and summary source in telemetry

## Recommended Implementation Order

### Phase C1

1. deterministic replay gating
2. replay deviation telemetry
3. safe fallback to guided repair

### Phase C2

1. tier-to-injection policy bridge
2. cold/archive default exclusion
3. explicit rehydrate/override paths

### Phase C3

1. static config block registry
2. deterministic block selection
3. context assembly reporting for selected/omitted blocks

### Phase C4

1. write-time distillation for tool output and fetched content
2. artifact/raw pointer preservation
3. distilled recall preference

### Phase C5

1. rule-based tool summarization
2. optional lightweight model summarization
3. summary provenance telemetry

## Non-Goals

This roadmap does not propose:

1. deleting raw source material by default
2. turning Aionis into a general workflow engine
3. making the main model optional for every task
4. using a model classifier in every selection decision from day one

## Success Criteria

The roadmap should be considered successful only if it changes measurable system behavior.

Target metrics:

1. lower average context tokens on repeated tasks
2. lower primary-model invocation count on replay-eligible flows
3. lower average tool-output token handoff size
4. stable or improved task success rate under replay and policy constraints
5. preserved operator auditability

## Final Read

These directions are good and should be adopted.

But the main architectural lesson is:

> Aionis should win by reducing when the expensive model is needed, not only by getting better at compressing what the model still has to read.

That is why deterministic replay gating and forgetting policy should come before more aggressive summarization work.
