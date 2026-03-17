# Aionis Runtime Architecture

Date: `2026-03-17`  
Status: `accepted working model`

## Core Concept

Aionis is a runtime system for agent workflows that must continue and converge.

It should now be read through four runtime pillars:

1. `Execution Memory`
2. `Execution Continuity`
3. `Execution Control`
4. `Execution Evaluation`

This is not a generic workflow-engine model.

It is a coding-agent runtime model for:

1. preserving execution state
2. keeping execution continuous across boundaries
3. constraining runtime behavior
4. determining whether execution outcomes are good enough to pass

## Pillar 1: Execution Memory

`Execution Memory` is the state foundation of the runtime.

It includes:

1. `ExecutionState`
2. context
3. `ExecutionPacket`
4. `ControlProfile`
5. execution artifacts

Purpose:

1. persist execution state in a structured form
2. avoid rediscovery and state loss
3. provide the state substrate used by continuity and control surfaces

Current Aionis mapping:

1. `src/execution/types.ts`
2. `src/execution/packet.ts`
3. `src/execution/profiles.ts`
4. `src/execution/state-store.ts`
5. `src/routes/memory-context-runtime.ts`
6. `src/routes/memory-write.ts`

## Pillar 2: Execution Continuity

`Execution Continuity` is the core runtime loop that keeps execution moving across steps, agents, and sessions.

It includes:

1. handoff
2. recover
3. replay
4. resume

Key idea:

**Execution should not restart from zero when the task already has usable state.**

Purpose:

1. preserve workflow progress
2. support multi-agent coding-task pipelines
3. maintain state across execution boundaries
4. keep runs converging after interruption or degradation

Current Aionis mapping:

1. `src/routes/handoff.ts`
2. `src/memory/handoff.ts`
3. `src/execution/assemble.ts`
4. replay and packet continuity paths consumed on the OpenClaw route

## Pillar 3: Execution Control

`Execution Control` is the runtime guardrails layer.

It constrains and guides execution while the run is active.

It includes:

1. policy
2. constraints
3. route guards
4. loop control
5. tool governance

Examples:

1. prevent infinite loops
2. avoid broad tool misuse
3. enforce execution boundaries
4. suppress obviously unproductive execution patterns

Important boundary:

`tool selection` belongs here only as a narrow governance surface.

At the current project state, tool preference and candidate ordering should be treated as:

1. limited
2. benchmark-gated
3. not a promoted primary product promise

Current Aionis mapping:

1. `src/memory/tools-select.ts`
2. `src/memory/tool-selector.ts`
3. `src/routes/memory-feedback-tools.ts`
4. adapter-side loop control and rule surfaces on the OpenClaw path

## Pillar 4: Execution Evaluation

`Execution Evaluation` is the validation layer.

It determines whether execution outcomes are valid, complete, and good enough to pass.

It includes:

1. workflow completion checks
2. reviewer-ready validation
3. regression checks
4. nightly execution evaluation

Purpose:

1. ensure outcome quality
2. define success conditions for runtime promotion
3. support continuous validation and release gating

Current Aionis mapping:

1. `src/eval/types.ts`
2. `src/eval/score.ts`
3. `src/eval/summarize.ts`
4. `scripts/eval/execution-eval.ts`

## Runtime Relationships

These pillars should not be read as a strict linear pipeline.

The more accurate relationship is:

1. `Execution Memory` is the state substrate
2. `Execution Continuity` and `Execution Control` operate on top of that substrate
3. `Execution Evaluation` judges whether the resulting execution is good enough to pass

Mental model:

```text
Execution Memory
  -> provides state, context, packets, and artifacts

Execution Continuity
  -> uses state to preserve progress across boundaries

Execution Control
  -> uses state to constrain runtime behavior

Execution Evaluation
  -> evaluates the resulting execution outcome
```

This means:

1. memory is foundational
2. continuity and control are sibling runtime layers, not a strict sequence
3. evaluation is a judgment layer over the run outcome, not just the last step in a chain

## Summary

Aionis is not just a memory system.

It is a runtime that:

1. remembers execution
2. keeps workflows continuous
3. constrains runaway behavior
4. evaluates whether outcomes are actually good enough to pass

This is the current working architecture model for Aionis:

**Execution Memory + Execution Continuity + Execution Control + Execution Evaluation**

That model fits the current product and kernel reality better than:

1. generic workflow engine framing
2. generic agent platform framing
3. tool-selection-first framing
