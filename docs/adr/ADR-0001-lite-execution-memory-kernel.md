# ADR-0001: Position Lite As An Execution Memory Kernel

Status: Accepted

Date: 2026-03-20

## Context

The broader Aionis direction emphasizes tool use, execution memory, workflow reuse, and memory evolution through action.

At the same time, the current `Aionis Lite` repository is already a real local runtime with:

1. SQLite-backed local persistence
2. replay and playbook execution
3. tool decision capture
4. context assembly and recall policy
5. a local automation kernel

However, the repository is not yet positioned around one narrow product thesis.

Without a clear thesis, Lite risks being described too broadly as:

1. a generic AI memory system
2. a local agent platform
3. a tool-centric AGI framework

Those labels create unnecessary ambiguity and encourage roadmap sprawl.

## Decision

We will position `Aionis Lite` as a local execution memory kernel for tool-using agents.

The primary product promise is:

1. capture execution evidence
2. distill it into reusable memory
3. recall prior execution structure during similar tasks
4. rehydrate missing detail only when necessary
5. support replay and workflow reuse

We will not use `Tool-Centric AGI` as the primary Lite product label.

That phrase may still describe long-range research direction, but it will not define Lite's near-term product identity.

## Rationale

### 1. This matches the current implementation

Lite already contains the strongest parts of an execution-memory story:

1. replay and playbooks
2. decision capture for tool selection
3. write distillation
4. context assembly with tier and forgetting controls

This means the positioning is supported by working product surfaces rather than speculative modules.

### 2. This avoids narrative overshoot

`AGI` language expands expectations faster than the current repository can satisfy.

`Execution memory kernel` is narrower, more defensible, and easier to evaluate.

### 3. This creates better roadmap discipline

If Lite is framed as an execution memory kernel, roadmap choices become easier:

1. prefer replay-linked memory over generic note storage
2. prefer workflow recall over broad semantic retrieval
3. prefer partial rehydration over full archival complexity
4. prefer repeated-task cost reduction over abstract capability claims

## Consequences

### Positive consequences

1. Lite gains a clear product identity.
2. Existing replay and tool-decision work becomes central rather than incidental.
3. The memory roadmap can be evaluated with repeated-task metrics.
4. Architecture choices can focus on execution structure instead of broad knowledge accumulation.

### Negative consequences

1. Some broader research concepts will be intentionally deferred.
2. Public messaging will undersell the long-range AGI ambition in the short term.
3. Some existing general-memory surfaces may need to be reframed rather than expanded.

## Scope Guidance

### In scope for Lite

1. execution trace capture
2. distilled execution anchors
3. workflow and replay reuse
4. partial payload rehydration
5. repeated-task optimization
6. basic importance decay and demotion

### Out of scope for the current Lite positioning

1. full autonomous multi-agent optimization
2. automatic tool discovery as a primary v1 feature
3. a full standalone uncertainty-estimation subsystem
4. broad policy learning across all memory objects
5. complete dynamic lifecycle management across many memory tiers

## Architectural Implications

The preferred near-term progression for Lite memory is:

1. event memory
2. workflow memory
3. pattern memory

This is preferred over immediately implementing a deeper autonomous hierarchy such as:

1. raw event
2. distilled step
3. workflow
4. pattern
5. policy

The deeper hierarchy remains a possible future direction, but not a required v1 architecture.

## Evaluation Implications

Lite should be evaluated primarily on:

1. memory hit rate on repeated tasks
2. workflow reuse rate
3. repeated-task cost reduction
4. stale-memory interference rate
5. decision provenance coverage

Lite should not be evaluated primarily on:

1. total node count
2. raw storage growth
3. number of memory tiers introduced

## Follow-Up

Recommended next steps:

1. define an anchor schema for execution memory objects
2. add anchor-first recall to planning/context assembly
3. implement partial payload rehydration for replay-linked artifacts
4. add repeated-task evaluation fixtures and metrics reporting
