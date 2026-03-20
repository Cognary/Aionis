---
title: "Lite Execution-Memory Beta Narrative"
---

# Lite Execution-Memory Beta Narrative

Use this page when you need a short public-facing explanation of what `Aionis Lite` is today.

This is not the full contract or capability matrix.

It is the concise release/demo narrative.

If you need the step-by-step demo script, see [Lite Execution-Memory Demo Walkthrough](/public/en/getting-started/09-lite-execution-memory-demo-walkthrough).

## Short Positioning

Aionis Lite is a single-user local runtime for execution memory.

It is not just a generic memory API.

Its current product center is:

1. remembering how stable work got done
2. surfacing reusable workflow guidance
3. reusing validated tool-selection patterns
4. expanding historical detail only when needed

## Two Named Loops

### Anchor-Guided Rehydration Loop

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

What this means in practice:

1. successful stable executions become reusable workflow memory
2. recall can surface those workflow anchors directly
3. the runtime can suggest deeper payload expansion without forcing it

### Execution Policy Learning Loop

`feedback -> pattern -> recall -> selector reuse`

What this means in practice:

1. tool outcomes can become governed pattern memory
2. trusted patterns can influence future selection
3. explicit operator or rule preference still stays ahead of recalled pattern preference

## What Makes Lite Different

Lite is now designed around an execution-memory-first reading model:

1. `planner_packet.sections.*` is the canonical collection surface
2. `workflow_signals` and `pattern_signals` expose compact maturity and trust state
3. `planning_summary`, `assembly_summary`, and `execution_kernel` expose compact aligned summaries

This means integrators do not have to reconstruct workflow, pattern, and rehydration state from raw nodes or layered context.

## Recommended Integration Model

For new integrations:

1. read full workflow, pattern, and rehydration collections from `planner_packet.sections.*`
2. read signal state from `workflow_signals` and `pattern_signals`
3. read compact explanations from `planning_summary` or `assembly_summary`
4. read compact runtime state from `execution_kernel.*_summary`

The top-level packet arrays still exist in `v1`, but they are convenience mirrors rather than the future-proof ownership layer.

## What Lite Public Beta Is Good For

Lite beta is strongest for:

1. single-developer workflows
2. local agent runtime experiments
3. IDE and MCP integrations
4. replay/playbook and execution-memory prototyping
5. evaluating Aionis without starting from Docker plus Postgres

## What Lite Public Beta Is Not

Lite public beta is not:

1. a Server replacement
2. a multi-user governance plane
3. a promise of full Server parity
4. the default production deployment profile

## Practical One-Sentence Summary

Aionis Lite is a local execution-memory runtime that can remember stable workflows, reuse trusted tool patterns, and rehydrate historical detail only when the runtime actually needs it.
