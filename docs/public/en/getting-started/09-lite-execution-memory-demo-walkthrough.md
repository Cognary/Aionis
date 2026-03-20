---
title: "Lite Execution-Memory Demo Walkthrough"
---

# Lite Execution-Memory Demo Walkthrough

Use this page when you want a simple demo flow for showing what `Aionis Lite` now does as an execution-memory runtime.

This is not the full technical contract.

It is the recommended demo script.

If you only need the shortest pre-demo checklist, see [Lite Execution-Memory Demo Checklist](/public/en/getting-started/10-lite-execution-memory-demo-checklist).

## Demo Goal

Show three things in one pass:

1. stable executions become reusable workflow memory
2. tool outcomes can become reusable policy memory
3. the runtime exposes compact state directly instead of making operators reconstruct it

## Demo Story

The cleanest story is:

1. run or reuse a stable execution
2. show that Lite surfaces a workflow anchor
3. show that Lite can suggest optional rehydration
4. show that tool feedback creates or strengthens a pattern
5. show that later selection can reuse the trusted pattern

## Recommended Demo Sequence

### Step 1. Show The Starting Position

Explain:

1. Lite is a local execution-memory runtime
2. it is not just storing raw text or generic notes
3. the goal is to remember how stable work got done

Good line:

`Lite remembers reusable execution structure, not just isolated memory entries.`

### Step 2. Show Workflow Memory

Show:

1. a stable replay or playbook outcome
2. `planning_context` or `context_assemble`
3. `planner_packet.sections.recommended_workflows`
4. `workflow_signals`

Explain:

1. stable execution has become workflow memory
2. the runtime now surfaces that workflow directly
3. workflow maturity is visible without re-parsing raw context

Good line:

`A stable execution is no longer just history. It becomes reusable workflow guidance.`

### Step 3. Show Optional Rehydration

Show:

1. a recalled workflow anchor
2. `rehydration_candidates`
3. the runtime hint that deeper payload can be opened only if needed

Explain:

1. Lite does not expand all history by default
2. it keeps the compact anchor first
3. it rehydrates detail only when the runtime actually needs it

Good line:

`Lite leads with the anchor and opens the payload only on demand.`

### Step 4. Show Policy Learning

Show:

1. a tool feedback path
2. `trusted_patterns`, `candidate_patterns`, or `contested_patterns`
3. `pattern_signals`
4. `selection_summary.provenance_explanation`

Explain:

1. tool outcomes are not treated as one-off events
2. successful repeated choices become trusted pattern memory
3. contested or weak patterns remain visible but not blindly reused

Good line:

`Lite does not just remember what happened. It learns which tool patterns are worth trusting.`

### Step 5. Show Compact Runtime State

Show:

1. `planning_summary`
2. `execution_kernel.*_summary`
3. optionally `POST /v1/memory/execution/introspect`

Explain:

1. the runtime already exposes compact aligned summaries
2. operators and integrators do not have to rebuild state from raw nodes
3. the execution-memory surface is already productized enough to inspect directly

Good line:

`The runtime already exposes compact execution-memory state instead of making you reconstruct it yourself.`

## Recommended Routes To Show

The shortest good demo path usually uses:

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`
3. `POST /v1/memory/tools/select`
4. `POST /v1/memory/tools/feedback`
5. `POST /v1/memory/execution/introspect`
6. optionally `POST /v1/memory/tools/rehydrate_payload`

## Recommended Reading Order During The Demo

If you only show a few fields, use this order:

1. `planner_packet.sections.*`
2. `workflow_signals`
3. `pattern_signals`
4. `planning_summary.planner_explanation`
5. `execution_kernel.*_summary`

This is the cleanest path because it matches the current canonical and recommended integration model.

## What Not To Center The Demo On

Avoid centering the story on:

1. `layered_context` as the main reading surface
2. raw node dumps
3. top-level packet-array mirrors as if they were the long-term ownership layer

Reason:

1. those are noisier
2. they hide the execution-memory product shape
3. they make Lite look more generic than it really is

## One-Sentence Close

If you need one sentence to end the demo:

`Aionis Lite is a local execution-memory runtime that turns stable work into reusable workflow memory, learns trusted tool patterns from feedback, and only expands historical detail when the runtime actually needs it.`
