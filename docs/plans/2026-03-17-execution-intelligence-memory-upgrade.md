# 2026-03-17 Aionis Execution Intelligence Upgrade

Status: proposed

## Goal

Define the next memory-model upgrade for Aionis so that:

1. `L0-L5` remains the compression/serving ladder
2. execution-native assets become first-class internal objects
3. replay, precedent, and eval stop living as ad hoc sidecars
4. the system can learn from successful and failed execution paths without overloading the current memory-layer abstraction

This document is intentionally architectural. It does not prescribe an immediate public API expansion.

## Executive Summary

The current Aionis model already has three strong foundations:

1. a durable memory graph with node/edge provenance
2. a compression ladder (`L0-L5`) used for recall and context assembly
3. an execution reuse path (`run -> playbook -> replay -> repair -> review -> learning projection`)

But these foundations are split across different object styles:

1. memory layers are graph-native
2. execution decisions are persisted as sidecar ledgers
3. replay/playbook assets are stored as graph nodes with `slots.replay_kind`
4. eval mostly lives outside the graph as offline artifacts

That split is workable, but it is now the main reason the model feels incomplete.

The recommended upgrade is:

1. keep `L0-L5` as the memory compression/serving axis
2. introduce a second, orthogonal axis for execution intelligence objects
3. model four execution object families explicitly:
   - `decision`
   - `precedent`
   - `compiled_workflow`
   - `eval_artifact`

The key architectural rule is:

> Do not keep extending `L0-L5` to mean "any important execution thing."

`L0-L5` should continue to answer "how compressed or abstracted is this memory?"

The new execution object axis should answer "what kind of reusable execution asset is this?"

## Current State

### 1. Compression layers already exist

Current runtime code resolves memory layers from node shape plus metadata:

1. `L0`
   - raw `event`
   - raw `evidence`
2. `L1`
   - write-time distilled evidence/facts
3. `L2`
   - `topic`
4. `L3`
   - deterministic compression rollups
5. `L4`
   - semantic abstraction
6. `L5`
   - serving-side compaction, not currently treated as a primary durable derived-memory layer

This logic is already visible in:

1. `src/memory/recall.ts`
2. `src/memory/context.ts`
3. `src/memory/layer-policy.ts`

### 2. Execution decisions already exist, but as a sidecar ledger

Tool decisions are not absent. They are already durable, but they are not graph-native memory nodes.

Current storage:

1. `memory_execution_decisions`
2. `lite_memory_execution_decisions`

Current shape is still narrow:

1. mostly `decision_kind = tools_select`
2. linked to rule feedback and run metadata
3. useful for audit and policy loop
4. not yet a rich memory object family

### 3. Compiled replay assets already partially exist

The system already has a durable compiled asset concept:

1. replay `run`
2. replay `step`
3. replay `playbook`
4. replay repair/review lifecycle
5. replay learning projection

These are stored as graph nodes plus replay metadata in `slots`, not as a separate typed asset family.

Current replay/playbook path is already strong enough to prove that Aionis is not only a recall system.

### 4. Eval exists, but mostly outside the graph

Current eval surfaces include:

1. `quality-eval`
2. benchmarks
3. capability gates
4. rollout gates
5. contract smoke / observability summaries

These are useful operationally, but most are emitted as:

1. offline JSON
2. benchmark docs
3. gate outputs
4. summary artifacts

They are not yet first-class internal objects that can be queried as part of runtime intelligence.

## Problem Statement

The current system is missing a coherent execution-intelligence object model.

That creates four architectural gaps.

### Gap A: decisions are durable, but not memory-native

We can persist tool-selection decisions, but we cannot yet treat them as rich, queryable execution memory objects with their own summaries, precedents, and quality signals.

### Gap B: precedent is implicit, not explicit

The system can reuse playbooks and project replay learning, but it does not yet expose a canonical "precedent" object that says:

1. this task shape was seen before
2. this path succeeded or failed
3. this workflow is reusable or risky
4. here is why

### Gap C: compiled workflow assets are real, but under-modeled

Playbooks already exist, but the system does not yet distinguish clearly between:

1. descriptive summaries
2. executable compiled assets
3. reusable workflow fragments
4. replay recipes

### Gap D: eval is externalized too aggressively

The system can evaluate itself, but cannot yet answer graph-native questions like:

1. which layer combination works best for a task family?
2. which precedents generalize?
3. which compiled assets are stable?
4. which decision patterns correlate with good outcomes?

## Design Principles

### 1. Do not overload `L0-L5`

`L0-L5` should remain about compression, abstraction, and serving shape.

It should not become a catch-all classification for execution intelligence.

### 2. Introduce a second axis, not more layer numbers

Recommended model:

1. axis A: `memory_layer` (`L0-L5`)
2. axis B: `object_family`
3. axis C: `lifecycle tier` (`hot/warm/cold/archive`)
4. axis D: `visibility lane` (`shared/private`)

### 3. Prefer internal-first convergence over public taxonomy explosion

Do not immediately expand the public node-type surface with many new types.

First converge internally on:

1. `object_family`
2. `object_kind`
3. required metadata contracts
4. selection/use cases

Only then decide which kinds deserve promotion to public API concepts.

### 4. Separate descriptive memory from executable assets

`summary` and `workflow` are not the same thing.

The system must distinguish:

1. memory that helps reasoning
2. assets that can be executed or replayed

### 5. Eval should be queryable, but not allowed to pollute the main graph indiscriminately

Not every metric should become a durable graph node.

A dedicated eval object family or ledger should exist, with selective projection back into memory when signals become durable and reusable.

## Proposed Model

## 1. Keep the existing compression ladder

Compression ladder remains:

1. `L0` raw execution events and raw evidence
2. `L1` write-time distilled evidence/facts
3. `L2` topic aggregation
4. `L3` deterministic rollup
5. `L4` semantic abstraction
6. `L5` serving-side compaction only

No change in principle:

1. `L5` is not the right place to store compiled workflows
2. `precedent` is not itself a higher compression layer
3. `eval` is not a memory layer

## 2. Add an execution-intelligence object axis

Recommended canonical fields for internal objects:

```ts
type ExecutionObjectEnvelope = {
  object_family: "decision" | "precedent" | "compiled_workflow" | "eval_artifact";
  object_kind: string;
  object_version: number;
  source_run_id?: string | null;
  source_playbook_id?: string | null;
  source_commit_id?: string | null;
  task_fingerprint?: string | null;
  constraint_fingerprint?: string | null;
  workflow_fingerprint?: string | null;
};
```

This envelope should be attachable to existing graph nodes and sidecar ledgers before any public node-type expansion.

## 3. Define four execution object families

### A. Decision

Decision is the smallest execution-intelligence object family.

Recommended kinds:

1. `decision_event`
2. `decision_summary`
3. `decision_rollup`

Optional later kind:

1. `decision_precedent`

Why not start with four separate public node types:

1. the current system does not yet have enough stable query patterns
2. early over-specialization will create migration drag
3. most near-term value comes from making decision graph-native, not from fully splitting decision taxonomy

Minimum required decision fields:

1. `decision_kind`
2. `decision_subject`
3. `decision_outcome`
4. `reasoning_summary`
5. `policy_fingerprint`
6. `tool_path_signature`
7. `linked_rule_ids`
8. `linked_run_id`
9. `linked_raw_evidence_ids`

Recommended mapping:

1. `decision_event` lives close to `L0`
2. `decision_summary` can appear in `L1`
3. `decision_rollup` can appear in `L3`
4. `L4` may carry abstractions over decision clusters, but that is still an abstraction layer, not a new object family

### B. Precedent

Precedent should become a distinct execution object family.

It is not just "a helpful memory snippet."

It is a reusable judgment about a prior task/path.

Recommended kinds:

1. `task_precedent`
2. `failure_precedent`
3. `repair_precedent`
4. `workflow_precedent`

Minimum required fields:

1. `task_fingerprint`
2. `constraint_fingerprint`
3. `tool_path_signature`
4. `outcome`
5. `failure_mode`
6. `replayability_score`
7. `generalization_hints`
8. `linked_raw_evidence_ids`
9. `linked_compiled_workflow_ids`
10. `linked_eval_ids`

Precedent is where the system stops remembering only "what happened" and starts remembering "what usually works here."

### C. Compiled Workflow

This family should unify the existing replay/playbook concept and future execution assets.

Recommended kinds:

1. `compiled_workflow`
2. `replay_recipe`
3. `playbook`
4. `playbook_fragment`

Important rule:

These are not summary nodes.

They are executable or partially executable assets.

Current playbooks should be treated as the first implemented member of this family.

Minimum required fields:

1. `workflow_fingerprint`
2. `matcher_fingerprint`
3. `policy_constraint_fingerprint`
4. `entry_conditions`
5. `expected_tools`
6. `step_structure`
7. `determinism_level`
8. `replayability_score`
9. `stability_status`
10. `linked_source_run_ids`
11. `linked_precedent_ids`

### D. Eval Artifact

Eval should become an internal object family, not remain purely external.

Recommended kinds:

1. `eval_run`
2. `eval_metric`
3. `path_score`
4. `decision_quality_score`
5. `replay_stability_score`
6. `context_efficiency_score`

Minimum required fields:

1. `eval_scope`
2. `subject_object_family`
3. `subject_object_id`
4. `metric_name`
5. `metric_value`
6. `metric_window`
7. `sample_count`
8. `eval_version`
9. `linked_run_ids`
10. `linked_context_policy`

This family answers:

1. what worked?
2. how well?
3. under what constraints?
4. does it generalize?

## Relationship To Existing Layers

The clean way to think about the future model is:

1. compression layer answers "how transformed is this memory?"
2. object family answers "what execution role does this object play?"

Examples:

1. a raw decision can be `object_family=decision` and `memory_layer=L0`
2. a structured decision fact can be `object_family=decision` and `memory_layer=L1`
3. a decision cluster summary can be `object_family=decision` and `memory_layer=L3`
4. a precedent may have its own summary forms across `L1/L3/L4`
5. a playbook is usually not best described by `Lx`; it is a compiled asset with optional linked summaries
6. eval artifacts should mostly sit outside the compression ladder, with selective projections back into summarized memory

## Data Modeling Recommendation

## Phase 1 recommendation: do not add many new public node types

Use current node types plus internal object taxonomy in `slots`:

1. `event`
2. `concept`
3. `procedure`
4. `rule`
5. replay nodes already in `event`/`procedure` style with `slots.replay_kind`

Recommended internal slots contract:

```json
{
  "object_family": "decision",
  "object_kind": "decision_event",
  "object_version": 1,
  "task_fingerprint": "sha256:...",
  "constraint_fingerprint": "sha256:...",
  "tool_path_signature": "sha256:...",
  "linked_run_id": "uuid",
  "linked_raw_evidence_ids": ["uuid"],
  "linked_compiled_workflow_ids": ["uuid"]
}
```

Why this is the right first step:

1. no immediate public type explosion
2. no forced route-contract expansion
3. selection and recall logic can evolve incrementally
4. existing graph jobs remain compatible

## Phase 2 recommendation: add dedicated ledgers where graph shape is not enough

Keep or introduce dedicated sidecar tables where append-only lineage matters more than graph projection:

1. `execution_decisions_v2`
2. `execution_precedents`
3. `compiled_workflows`
4. `eval_artifacts`

Then project stable objects into graph nodes when they become recall-worthy.

This preserves:

1. audit fidelity
2. operational write ergonomics
3. graph cleanliness

## Read/Write Path Upgrades

## 1. Decision ingestion

Current decision persistence should evolve from simple ledger rows into a two-stage path:

1. write decision ledger record
2. optionally project graph-native decision memory object

Projection triggers:

1. repeated decision pattern
2. decision linked to success/failure outcome
3. decision referenced by replay/repair loop
4. decision selected for planning-context reuse

## 2. Precedent compilation

Precedent should be compiled, not manually written.

Primary sources:

1. successful replay runs
2. repeated guided-repair resolutions
3. repeated tool-decision outcomes
4. failed paths with stable failure signatures

Compiler inputs:

1. task fingerprint
2. context constraint fingerprint
3. tool path signature
4. result summary
5. replayability / determinism evidence
6. linked playbook version

## 3. Compiled workflow evolution

Current playbook flow should become the canonical compiled-workflow path.

Future extension:

1. `playbook` remains the full compiled asset
2. `playbook_fragment` supports partial reuse
3. `replay_recipe` supports execution-path recommendation when full determinism is unavailable

## 4. Eval writeback

Eval should follow a two-level model:

1. ledger-level detailed metrics
2. graph-level summarized conclusions

Example:

1. many `path_score` observations stay in ledger
2. only a durable "high-confidence precedent for task family X" is projected back into graph memory

## Context/Recall Implications

The current layer policy should remain intact, but context selection should gradually learn to consume execution object families.

Near-term additions:

1. allow planning/context to prefer:
   - precedent summaries
   - decision summaries
   - workflow summaries
2. allow replay dispatch to query:
   - precedents
   - compiled workflows
   - eval-backed stability scores

Do not do this by replacing `L0/L3` trust anchors.

Instead:

1. keep `L0/L3` trust anchors for factual grounding
2. add execution-object retrieval as a parallel selection channel

## Recommended Rollout

### Phase 0: naming and metadata convergence

Deliverables:

1. internal `object_family` / `object_kind` schema
2. shared fingerprint helpers
3. no public contract change

### Phase 1: decision graph-native upgrade

Deliverables:

1. richer decision ledger
2. decision projection into graph
3. decision summaries usable by planning/context

### Phase 2: precedent compiler

Deliverables:

1. precedent object family
2. compiler from replay/repair/tool outcomes
3. replay candidate path can consult precedents

### Phase 3: compiled-workflow family unification

Deliverables:

1. formalize playbook as compiled workflow
2. optional replay recipe / fragment assets
3. unify reuse metadata and stability scoring

### Phase 4: eval artifact ledger and selective graph projection

Deliverables:

1. eval-run / metric object family
2. stable subject-object linking
3. policy/runtime tuning from internal eval evidence

## Non-Goals

This upgrade should not do the following in its first pass:

1. redesign the public memory API wholesale
2. turn every metric into a graph node
3. replace replay playbooks with a brand-new asset system immediately
4. add many new public node types before internal taxonomy stabilizes
5. merge compiled execution assets into the `L5` label

## Risks

### 1. Taxonomy explosion

If too many new public kinds are added early, the model will become harder to operate and explain.

Mitigation:

1. converge internally first
2. keep public surface narrow

### 2. Graph pollution

If eval and transient decision data are written too aggressively into the graph, recall quality will degrade.

Mitigation:

1. use ledgers for high-volume transient records
2. project only durable summaries into graph

### 3. Replay model fragmentation

If `playbook`, `recipe`, `workflow`, and `precedent` are all introduced without a shared model, reuse semantics will diverge.

Mitigation:

1. define the canonical compiled-workflow family first
2. make `playbook` the first concrete member

### 4. Wrong abstraction boundary

If we keep treating execution assets as just more compressed memory, the architecture will remain conceptually muddy.

Mitigation:

1. keep compression layers separate from object families
2. make this distinction explicit in code and docs

## Acceptance Criteria

The upgrade should be considered successful when:

1. Aionis can explain decisions as reusable memory objects, not only ledger rows
2. precedent is queryable as a distinct execution object family
3. playbooks are recognized as compiled execution assets, not just replay-flavored nodes
4. eval evidence can tune runtime strategy without requiring external benchmark docs only
5. `L0-L5` remains clean and understandable as the compression/serving ladder

## Final Recommendation

Adopt the upgrade direction, but with one correction:

Do not frame `decision`, `precedent`, `compiled workflow`, and `eval` as "more memory layers."

Frame them as:

1. a new execution-intelligence object axis
2. partially projected into existing graph memory
3. selectively summarized through the existing `L0-L5` ladder where useful

This keeps the current Aionis strengths intact:

1. memory compression
2. context control
3. replay/playbook reuse
4. shadow-first evolution

while giving the system the missing thing it needs to grow into a true runtime-intelligence kernel:

> explicit, queryable, reusable execution objects.
