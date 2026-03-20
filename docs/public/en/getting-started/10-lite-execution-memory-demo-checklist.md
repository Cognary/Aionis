---
title: "Lite Execution-Memory Demo Checklist"
---

# Lite Execution-Memory Demo Checklist

Use this page right before a demo.

It is the shortest checklist version of the execution-memory walkthrough.

## Demo Objective

Make sure the audience leaves with these three points:

1. Lite turns stable work into reusable workflow memory
2. Lite learns reusable tool patterns from feedback
3. Lite exposes compact execution-memory state directly

## Recommended Route Order

Use this order:

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`
3. `POST /v1/memory/tools/select`
4. `POST /v1/memory/tools/feedback`
5. `POST /v1/memory/execution/introspect`
6. optionally `POST /v1/memory/tools/rehydrate_payload`

## Recommended Field Order

If you only show a few fields, use this order:

1. `planner_packet.sections.*`
2. `workflow_signals`
3. `pattern_signals`
4. `planning_summary.planner_explanation`
5. `execution_kernel.*_summary`

## Demo Sequence

### 1. Positioning

Say:

`Lite is a local execution-memory runtime, not just a generic memory API.`

### 2. Workflow Memory

Show:

1. `planner_packet.sections.recommended_workflows`
2. `workflow_signals`

Say:

`Stable execution becomes reusable workflow guidance.`

### 3. Optional Rehydration

Show:

1. `rehydration_candidates`
2. optional `rehydrate_payload`

Say:

`Lite leads with the anchor and opens payload detail only when needed.`

### 4. Policy Learning

Show:

1. `trusted_patterns`
2. `candidate_patterns` or `contested_patterns`
3. `selection_summary.provenance_explanation`

Say:

`Lite learns which tool patterns are worth trusting.`

### 5. Compact Runtime State

Show:

1. `planning_summary`
2. `execution_kernel.*_summary`
3. optionally `/v1/memory/execution/introspect`

Say:

`The runtime already exposes compact execution-memory state directly.`

## What Not To Center

Avoid centering the demo on:

1. `layered_context`
2. raw node dumps
3. top-level packet-array mirrors as if they were the long-term ownership layer

## One-Line Close

Use this line to close:

`Aionis Lite turns stable work into reusable workflow memory, learns trusted tool patterns from feedback, and expands history only when the runtime actually needs it.`
