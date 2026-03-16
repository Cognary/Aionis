# Aionis Execution Continuity Kernel ADR

Date: `2026-03-15`  
Status: `accepted`

## Context

Aionis had already proven product value on the OpenClaw path, but the continuity layer still depended too heavily on:

1. transcript carryover
2. free-form handoff text
3. route-local projection helpers
4. generic memory-shaped abstractions

That made continuity useful but structurally weak. The system needed a narrower kernel that could preserve execution state for coding agents without turning Aionis into a generic workflow engine.

## Decision

Aionis will evolve into a **stateful execution-continuity layer for coding agents**.

The kernel is defined by three internal contracts:

1. `ExecutionState`
2. `ExecutionPacket`
3. `ControlProfile`

The rollout rule is additive:

1. no big-bang route rewrite
2. no public route-family breakage
3. no regression to the benchmarked OpenClaw product path
4. no drift into generic business-workflow orchestration

## Boundary Rules

The kernel is specifically for **coding-agent execution continuity**.

It exists to answer three questions:

1. `ExecutionState`: where is the coding task now
2. `ExecutionPacket`: what must this role or stage see now
3. `ControlProfile`: how is execution allowed to proceed now

The kernel does **not** exist to model arbitrary workflow systems.

## Admission Rules

New kernel work is in scope only if it improves at least one of these:

1. multi-agent coding-task continuity
2. reviewer-ready workflow completion
3. state-aware execution control on a measured runtime surface
4. durable execution recovery after interruption or degradation

New kernel work is out of scope if it primarily adds:

1. generic DAG orchestration
2. business workflow management
3. project-management semantics unrelated to coding-task execution
4. public API churn without benchmarked runtime value

## Consequences

Phase 1 should introduce the kernel behind the existing route family.

Phase 2 should promote the system from projection-driven continuity to state-driven execution control.

All promotion decisions remain benchmark-gated on the real OpenClaw path.
