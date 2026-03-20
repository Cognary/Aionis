# Aionis Lite Execution Memory Strategy

Last reviewed: 2026-03-20

This document narrows the broader `Tool-Centric Intelligence` framework into a product and architecture strategy that fits the current `Aionis Lite` repository.

Related governance reference:

1. [docs/LITE_MEMORY_GOVERNANCE_MODEL.md](/Volumes/ziel/Aionisgo/docs/LITE_MEMORY_GOVERNANCE_MODEL.md)
2. [docs/LITE_MEMORY_TRIGGER_MATRIX.md](/Volumes/ziel/Aionisgo/docs/LITE_MEMORY_TRIGGER_MATRIX.md)
3. [docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md)
4. [docs/LITE_FOUNDATION_MEMORY_V1_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V1_IMPLEMENTATION_PLAN.md)
5. [docs/LITE_FOUNDATION_MEMORY_V2_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V2_IMPLEMENTATION_PLAN.md)
6. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
7. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
8. [docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md)
9. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
10. [docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md)

## Purpose

The goal of this document is not to restate a general AGI theory.

The goal is to define:

1. what `Aionis Lite` should be
2. what `Aionis Lite` should not try to be yet
3. which parts of the broader framework map cleanly onto the current Lite runtime
4. which next steps create the shortest path to a differentiated product

## Product Positioning

Recommended external positioning:

`Aionis Lite` is a local execution memory kernel for tool-using agents.

Recommended memory-governance module term:

`Runtime-Governed Semantic Memory`

Recommended supporting phrases:

1. `Dynamic Execution Memory`
2. `Memory Lifecycle for Tool-Using AI`
3. `Anchor-Payload Memory Architecture`
4. `Replay and workflow reuse for local agent runtimes`
5. `Anchor-Guided Rehydration Loop`
6. `Execution Policy Learning Loop`

Recommended internal framing:

`Aionis Lite` is the minimal runtime that helps agents remember how work got done, recall the right prior traces, and reuse successful workflows at lower cost.

Recommended named loop:

`Anchor-Guided Rehydration Loop`

Definition:

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

Interpretation:

This is the clearest name for the current Lite execution-memory mainline.
It describes the path where a stable execution artifact becomes a workflow anchor, gets recalled later, exposes a runtime hint, and only expands payload when the agent actually needs more detail.

Current runtime rule:

1. `rehydrate_payload` follows the Lite single-user identity model by default
2. planner/runtime hints may surface `rehydrate_payload(anchor_id=..., mode=...)` without restating actor, because the local actor is inherited on the normal Lite path

Recommended named policy loop:

`Execution Policy Learning Loop`

Definition:

`feedback -> pattern -> recall -> selector reuse`

Interpretation:

This is the clearest name for Lite's tool-decision learning mainline.
It describes the path where tool feedback becomes a governed pattern anchor, later gets recalled, and only stable patterns are allowed to influence selector reuse.

Current runtime rule:

1. stable patterns may influence selector ordering
2. explicit rule or operator `tool.prefer` remains higher priority than recalled stable pattern preference
3. pattern reuse is therefore memory-guided, not policy-overriding
4. selector-facing summaries now expose `provenance_explanation`, so policy reuse can be explained in the same language as planner-facing packet summaries
5. pattern credibility is now surfaced as `candidate`, `trusted`, and `contested`, rather than collapsing all non-trusted patterns into one bucket
6. planner/runtime and selector summaries now expose compact lifecycle and maintenance summaries, so policy reuse is visible as a governed state machine rather than a raw reuse count

## What Lite Is

At the product level, Lite should be treated as a local single-user runtime with four core jobs:

1. capture execution evidence
2. distill raw traces into reusable memory
3. recall prior execution structure during later tasks
4. support replay and workflow reuse

This framing matches the current repository shape:

1. local SQLite-backed runtime
2. replay and playbook kernel
3. tool decision capture
4. context assembly and recall policy
5. local automation kernel

## What Lite Is Not

Lite should not currently be positioned as:

1. a general AGI runtime
2. a full autonomous orchestration platform
3. a multi-agent optimization system
4. a complete dynamic memory research platform
5. a fully automatic policy-learning system

These may become future directions, but they should not define the present product promise.

## Translation From The Broader Framework

The broader framework says:

`Recall -> Assess -> Retrieve -> Act -> Distill`

For Lite, the practical product loop should be narrowed to:

`Capture -> Distill -> Recall -> Decide -> Rehydrate -> Replay`

Why this narrower loop:

1. `Capture` is already real in Lite through writes, replay traces, run/step events, and tool decisions.
2. `Distill` already exists in early form through write distillation and evidence/fact extraction.
3. `Recall` already exists through recall, find, context assembly, and recall policy shaping.
4. `Decide` already exists through tool selection, rule evaluation, and execution decision recording.
5. `Rehydrate` exists conceptually, but in Lite should first mean partial context restoration rather than a full archive lifecycle platform.
6. `Replay` is already one of the strongest differentiators in the current codebase.

This is the shortest loop that turns the current runtime into a coherent product.

## Core Lite Thesis

The key Lite thesis should be:

The value of memory for tool-using agents is not storing more text.
The value is preserving reusable execution structure.

In Lite, that means the memory system should prioritize:

1. successful action traces over generic notes
2. decision provenance over opaque outcomes
3. reusable workflows over one-off raw logs
4. small recall anchors over large always-hot payloads

## Memory Governance Principle

Lite memory evolution should not be fixed-rule only and should not be LLM-owned.

Recommended principle:

1. the runtime handles deterministic mechanics
2. the LLM handles bounded semantic adjudication
3. the runtime retains state transition authority

This applies to:

1. promotion
2. compression
3. pattern formation
4. strategic retention judgment
5. rehydration decisions in the normal case

This principle should be treated as a system rule, not a prompt convention.

## Current Capability Mapping

The current Lite runtime already covers part of the proposed framework.

### 1. Capture

Current fit:

1. memory write flow
2. replay run and step events
3. tool decision persistence
4. automation run execution records

Interpretation:

Lite already captures enough raw evidence to support execution memory. The immediate problem is not missing capture. The immediate problem is making that capture easier to reuse.

### 2. Distill

Current fit:

1. write distillation from raw input and event/evidence nodes
2. evidence summary generation
3. fact extraction heuristics

Interpretation:

Lite already has the start of an `L0 -> L1` pipeline and now has stable governed promotion shapes for replay workflow anchors and tool-feedback pattern anchors.
What remains incomplete is the broader automatic promotion path from arbitrary event streams into reusable workflow or pattern memory without those existing replay and feedback entrypoints.

### 3. Recall

Current fit:

1. recall routes
2. find and resolve behavior
3. context orchestration
4. layer and forgetting policy

Interpretation:

Lite no longer treats action-oriented recall as an add-on.
The current V1/V2/V3 runtime exposes a stable `planner_packet` on `planning_context` and `context_assemble`, with explicit `recommended_workflows`, `candidate_workflows`, `candidate_patterns`, `trusted_patterns`, `contested_patterns`, `rehydration_candidates`, and `supporting_knowledge`.
Planner-facing consumers no longer need to infer execution-memory priority from mixed context layers alone.

### 4. Decide

Current fit:

1. tool selection policies
2. control-profile filtering
3. rule evaluation
4. decision metadata persistence

Interpretation:

Lite already records decision evidence that can become future action memory.
The current V3 runtime now governs that path through candidate, trusted, and contested pattern states, plus low-cost lifecycle and maintenance summaries that are visible to both planner and selector surfaces.

On the workflow side, the current V3 runtime now also distinguishes stable workflow guidance from replay-learning workflow candidates, carries governed observation strength before stable promotion, and automatically promotes replay-learning candidates into stable workflow guidance once the observation threshold is met.
Planner/context routes now also expose first-class `workflow_signals`, plus compact `workflow_signal_summary` on planning, assembly, and execution-kernel surfaces, so stable, promotion-ready, and observing workflow maturity can be consumed without reconstructing it from raw packet sections.

### 5. Rehydrate

Current fit:

1. tier-aware recall shaping
2. server-side archive rehydrate design already exists in the wider code shape

Interpretation:

For Lite, rehydration should first be partial and local. It should restore just enough payload to complete the next action, not rebuild a large archival subsystem.

This is why the `Anchor-Guided Rehydration Loop` is a better product description than generic archive language.
The loop is guided by small anchors, not by eager payload restoration.
The route now follows the same default local actor model as the rest of Lite, so private local anchors remain rehydratable without extra caller identity ceremony.

### 6. Replay

Current fit:

1. replay runs
2. playbook compile/promote/run
3. guided repair and review surfaces
4. replay learning projection seams

Interpretation:

Replay is already the strongest proof that Aionis is not just a note-taking memory store. This should remain central to the product story.
Stable playbooks are not only produced as workflow anchors on new promotion writes. Lite now also normalizes already-stable latest playbooks onto the same workflow-anchor shape, so old and new stable playbooks share one recall surface.
Those stable workflow anchors now also carry governed maintenance shape, so workflow reuse participates in the same low-cost lifecycle language as pattern reuse.

## Recommended External Narrative

Recommended short narrative:

Most agent systems can generate plans, but they struggle to reliably remember how work actually got done across repeated tasks.

`Aionis Lite` focuses on execution memory:

1. record what happened during tool use
2. compress repeated traces into reusable memory
3. recall the right prior workflow when a similar task appears
4. restore missing context only when it becomes necessary
5. reduce repeat work through replay and workflow reuse

Recommended sentence to avoid:

`Aionis Lite is a Tool-Centric AGI framework`

Reason:

That statement is too broad for the current product and dilutes the more concrete differentiation.

## Recommended Internal Architecture Model

Lite should adopt a pragmatic three-level memory progression first.

### Level A: Event Memory

Purpose:

Store raw execution evidence.

Examples:

1. run and step traces
2. tool inputs and outputs
3. errors and validation results
4. decision provenance

### Level B: Workflow Memory

Purpose:

Store reusable task-level execution structures.

Examples:

1. step sequence summaries
2. successful playbook candidates
3. common repair sequences
4. reusable tool orderings

### Level C: Pattern Memory

Purpose:

Store stable repeated guidance that improves later decisions.

Examples:

1. preferred tool family for a task class
2. retry pattern for a recurring failure mode
3. routing hint for a workflow type

This is a better near-term fit for Lite than a full `L0 -> L4` autonomous hierarchy.

## Anchor-Payload Strategy For Lite

The `Anchor-Payload` idea is useful, but Lite should implement it narrowly.

Recommended definition:

1. `Anchor`
   Small recall object containing task signature, key steps, outcome, tool set, and references.
2. `Payload`
   Larger trace object containing raw logs, tool IO, intermediate states, and replay evidence.

Recommended Lite rule:

Keep anchors cheap and easy to rank.
Load payloads only when recall confidence is not enough for action.

That gives Lite most of the benefit of the larger concept without forcing a full cold-storage architecture in v1.

## Rehydration Decision Model

The key design question is:

Who decides whether an anchor hit should trigger payload rehydration

Recommended answer:

Use a hybrid model where the runtime exposes rehydration as an explicit tool, but the LLM makes the ordinary case decision.

Recommended flow:

1. the system recalls anchors first
2. the system presents the LLM with compact anchor summaries, provenance, and payload cost hints
3. the LLM decides whether to continue from the anchor only or call `rehydrate_payload(anchor_id=...)`
4. the runtime reserves automatic rehydration for a small number of hard-rule cases

Why this is the preferred model:

1. it minimizes default token cost
2. it keeps the interaction highly agent-native
3. it avoids building a large fully automatic gating engine too early
4. it gives Lite a clean tool-using execution pattern instead of opaque retrieval magic

Hard-rule automatic rehydration should be limited to cases like:

1. irreversible or high-risk operations
2. repeated failure after anchor-only guidance
3. low-confidence anchor hits with missing critical context
4. explicit policy requirements

This means Lite should not try to solve rehydration with one global automatic threshold. It should expose rehydration as a normal action choice under runtime guardrails.

## Signature-First Pattern Formation

The hardest part of `workflow -> pattern` promotion is not recall.
It is deciding which workflows actually belong together.

Vector similarity alone is not sufficient.

Two unrelated workflows may both use similar tools, and that does not make them the same reusable pattern.

Recommended Lite approach:

Use multi-signal pattern formation with signatures as the first gate and semantic similarity as a later support signal.

Required first signals:

1. `task_signature`
2. `error_signature` when a failure mode exists
3. `workflow_signature`
4. `tool_set`
5. `outcome`

Recommended pipeline:

1. candidate generation
   Use task and error signatures to gather likely-similar workflows.
2. structural verification
   Check whether tool order, repair path, and outcome shape are compatible.
3. pattern extraction
   Distill repeated successful structure into a reusable pattern anchor.
4. policy hint derivation
   Only after repeated stable success should Lite generate stronger routing hints.

This keeps pattern formation grounded in execution structure instead of generic text likeness.

The LLM may assist at the pattern-review step, but only after runtime-side signature gating has produced an admissible candidate set.

## Importance Update Model

The importance function should remain conceptually rich, but its update model must stay operationally cheap.

Recommended runtime model:

1. online lazy updates for hot dynamic signals
2. offline batch maintenance for promotion, demotion, archive, and redundancy cleanup

Recommended split:

1. `base_importance`
   Slow-moving value determined by anchor kind, outcome quality, and strategic importance
2. `dynamic_importance`
   Fast-moving value affected by recent usage, recency, and recent reuse success or failure

Online path should update only:

1. usage count
2. last used time
3. recent reuse counters
4. lightweight derived dynamic score

Offline batch should handle:

1. demotion
2. archive relocation
3. stale anchor cleanup
4. promotion candidate scans
5. redundancy reduction

This is the right operating model for Lite because it preserves the semantics of dynamic memory without paying full recomputation cost after every task.

The LLM may still participate in strategic-value judgment for low-frequency memories, but it should do so through bounded proposals rather than direct state mutation.

## MVP Scope

Recommended MVP for the strategy:

1. raw execution capture
2. anchor extraction from runs, tool decisions, and distilled traces
3. anchor-first recall
4. partial payload rehydration
5. repeated-task workflow suggestion
6. basic importance decay

The MVP should explicitly exclude:

1. automatic tool discovery
2. full uncertainty estimation as a separate major subsystem
3. full policy derivation across all task classes
4. multi-agent shared optimization
5. heavy graph evolution logic with broad autonomous promotion/demotion

## Phased Roadmap

### Phase 1: Execution Memory Kernel

Objective:

Make repeated local tasks cheaper and more reliable.

Deliverables:

1. execution trace normalization
2. anchor extraction schema
3. decision memory capture normalization
4. partial rehydration path
5. workflow recall in planning/context assembly
6. metrics pipeline for repeated-task improvement

Exit criteria:

1. repeated tasks can hit prior execution memory
2. the system can explain which prior execution artifact influenced a decision
3. the system avoids pulling full raw traces by default

### Phase 2: Workflow Promotion

Objective:

Turn successful repeated traces into reusable workflow memory.

Deliverables:

1. workflow candidate extraction from replay runs
2. task-signature and error-signature based candidate grouping
3. workflow-level recall ranking
4. lightweight stale-memory demotion
5. structure-aware pattern verification before promotion

Exit criteria:

1. repeated tasks increasingly resolve at workflow level instead of raw trace level
2. memory noise declines as old raw traces lose priority

### Phase 3: Pattern And Policy Hints

Objective:

Learn stable tool-use hints from repeated success.

Deliverables:

1. pattern clustering for repeated successful workflows
2. tool preference hints by task signature
3. retry hints for recurring error classes
4. LLM-assisted but signature-constrained pattern review

Exit criteria:

1. tool selection improves from prior outcomes
2. pattern recall reduces failed first attempts on repeat work

## Metrics

Recommended first metrics:

1. memory hit rate
2. anchor recall precision
3. partial rehydration precision
4. repeated-task cost reduction
5. workflow reuse rate
6. stale-memory interference rate
7. decision provenance coverage
8. anchor-only resolution rate
9. rehydration call precision

Avoid using only storage-size or node-count metrics. They encourage accumulation rather than useful execution memory.

## Risks

### Risk 1: Narrative Overshoot

If Lite is described as an AGI framework too early, outside expectations will outrun the actual product.

Mitigation:

Keep the public story anchored on execution memory and replay.

### Risk 2: Schema Overdesign

If every idea becomes a new memory level, tier, or lifecycle state too early, implementation complexity will rise faster than user value.

Mitigation:

Start with event, workflow, and pattern only.

### Risk 3: Retrieval Drift

If Lite keeps optimizing generic semantic retrieval instead of action retrieval, the product will regress toward a traditional memory store.

Mitigation:

Make workflow recall and decision provenance first-class evaluation targets.

### Risk 4: Over-Automated Rehydration

If the runtime rehydrates too aggressively, Lite will waste tokens and quietly recreate the same context bloat it was supposed to avoid.

Mitigation:

Keep rehydration as an explicit tool choice for the LLM in the ordinary case, with only a narrow hard-rule auto path.

### Risk 5: False Pattern Merges

If Lite merges workflows mainly by semantic similarity or tool overlap, it will manufacture misleading patterns.

Mitigation:

Require task and error signatures before pattern promotion and treat vector similarity as a support signal, not the primary gate.

## Recommended Next Implementation Packages

The next concrete work packages should be:

1. define a Lite anchor schema for runs, steps, and tool decisions
2. add anchor-first ranking to planning/context assembly
3. expose `rehydrate_payload` as an explicit runtime tool with payload cost hints
4. implement partial payload rehydration for replay-linked memory objects
5. add task-signature and error-signature based workflow grouping
6. add lazy importance updates plus nightly maintenance passes
7. add evaluation fixtures around repeated-task recall and reuse

For the staged foundation upgrade sequence that follows from this strategy, see [docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md).

## Summary

The broad framework is directionally correct.

But for `Aionis Lite`, the winning move is to compress it into one product claim:

`Aionis Lite` helps tool-using agents remember how work got done and reuse that structure on the next task.

That is differentiated, implementable, and already partially supported by the current repository.
