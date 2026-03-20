# Aionis Lite Anchor Schema

Last reviewed: 2026-03-20

This document defines the first concrete `anchor schema` for `Aionis Lite`.

Related governance reference:

1. [docs/LITE_MEMORY_GOVERNANCE_MODEL.md](/Volumes/ziel/Aionisgo/docs/LITE_MEMORY_GOVERNANCE_MODEL.md)
2. [docs/LITE_MEMORY_TRIGGER_MATRIX.md](/Volumes/ziel/Aionisgo/docs/LITE_MEMORY_TRIGGER_MATRIX.md)

The design goal is simple:

Give Lite a compact execution-memory object that can be stored, recalled, ranked, and later expanded into fuller workflow memory without requiring a new storage subsystem on day one.

## Purpose

An anchor is the smallest durable memory object that should help a later task answer:

1. have we done something structurally similar before
2. which tool path worked
3. what outcome did it produce
4. where is the fuller payload if we need more detail

In Lite, an anchor is not the full trace.
It is the ranked entry point into the trace.

## Design Goals

The first Lite anchor schema must:

1. fit the current `memory_nodes` write contract
2. map onto existing replay, distillation, and tool-decision data
3. support anchor-first recall before payload restoration
4. avoid introducing a new top-level storage table in v1
5. preserve a clean migration path toward richer workflow and pattern memory later

## Non-Goals

This schema does not try to:

1. replace raw replay traces
2. replace the `lite_memory_execution_decisions` table
3. implement full automatic policy derivation
4. model every future memory lifecycle transition
5. solve multi-agent memory sharing

## Core Design Decision

In v1, an anchor is a logical memory type, not a new physical top-level table.

The preferred storage form is:

1. a node in `lite_memory_nodes`
2. with a stable `slots.anchor_v1` payload
3. plus normal `tier`, `salience`, `importance`, and `confidence` ranking signals
4. plus standard `derived_from` and `part_of` edges to payload sources

This is the right v1 tradeoff because Lite already supports:

1. node writes with flexible `slots`
2. ranking via salience, importance, and confidence
3. retrieval by node type, tier, and embedding
4. edges for provenance

Anchor evolution should also follow the Lite governance model:

1. the runtime owns storage and state mutation
2. the LLM may propose semantic promotion or compression judgments
3. the runtime decides whether those proposals are admissible

## Why Reuse Existing Node Types

Lite already allows these node types:

1. `event`
2. `evidence`
3. `concept`
4. `procedure`
5. others not central to this design

The current code also already uses:

1. `procedure` for replay steps and playbooks
2. `concept` for distilled factual abstractions

Because of that, the first anchor design should not add a new `anchor` node type.

Recommended mapping:

1. workflow-like anchors use `procedure`
2. decision and pattern-like anchors use `concept`

## Anchor Levels

The Lite anchor schema should support three practical levels first.

### Level 1: Execution Anchor

Purpose:

Represent a single useful execution unit.

Examples:

1. a replay step that completed successfully
2. a repair step that fixed a known failure
3. a tool decision with enough context to be reusable

Recommended node type:

1. `procedure` for step-like execution units
2. `concept` for compact decision-oriented anchors

### Level 2: Workflow Anchor

Purpose:

Represent a reusable multi-step path.

Examples:

1. a compiled playbook
2. a repeated repair sequence
3. a stable task-specific tool order

Recommended node type:

1. `procedure`

### Level 3: Pattern Anchor

Purpose:

Represent stable repeated guidance, not a full policy engine.

Examples:

1. preferred tool family for a task signature
2. recurring retry pattern
3. stable workflow choice for a task class

Recommended node type:

1. `concept`

## Canonical Anchor Schema

The canonical anchor payload should live in `slots.anchor_v1`.

```json
{
  "anchor_v1": {
    "anchor_kind": "workflow",
    "anchor_level": "L2",
    "task_signature": "fix-node-test-failure",
    "task_class": "debug_test_failure",
    "error_signature": "node-test-export-mismatch",
    "workflow_signature": "inspect-patch-rerun-targeted-test",
    "summary": "Inspect failing test, patch export, rerun targeted test",
    "tool_set": ["edit", "test"],
    "selected_tool": null,
    "key_steps": [
      "inspect failing test",
      "patch target export",
      "rerun targeted test"
    ],
    "outcome": {
      "status": "success",
      "result_class": "task_completed",
      "success_score": 1
    },
    "source": {
      "source_kind": "playbook",
      "node_id": "uuid-or-lite-id",
      "decision_id": null,
      "run_id": "run_123",
      "step_id": null,
      "playbook_id": "pb_123",
      "commit_id": "commit_123"
    },
    "payload_refs": {
      "node_ids": ["uuid-or-lite-id"],
      "decision_ids": [],
      "run_ids": ["run_123"],
      "step_ids": [],
      "commit_ids": ["commit_123"]
    },
    "rehydration": {
      "default_mode": "summary_only",
      "payload_cost_hint": "medium",
      "recommended_when": [
        "need_full_logs",
        "need_step_inputs",
        "anchor_confidence_is_not_enough"
      ]
    },
    "recall_features": {
      "error_tags": ["node", "test"],
      "tool_tags": ["edit", "test"],
      "outcome_tags": ["success", "repair"],
      "keywords": ["export", "test failure", "rerun"]
    },
    "metrics": {
      "usage_count": 0,
      "reuse_success_count": 0,
      "reuse_failure_count": 0,
      "last_used_at": null
    },
    "schema_version": "anchor_v1"
  }
}
```

## Required Fields

These fields should always exist inside `slots.anchor_v1`:

1. `anchor_kind`
2. `anchor_level`
3. `task_signature`
4. `summary`
5. `tool_set`
6. `outcome.status`
7. `source.source_kind`
8. `payload_refs`
9. `schema_version`

## Optional Fields

These fields are optional but recommended:

1. `task_class`
2. `error_signature`
3. `workflow_signature`
4. `selected_tool`
5. `key_steps`
6. `outcome.result_class`
7. `outcome.success_score`
8. `rehydration`
9. `recall_features`
10. `metrics`

## Field Semantics

### `anchor_kind`

Allowed first values:

1. `execution`
2. `workflow`
3. `pattern`
4. `decision`

This describes what the anchor represents, not which table it came from.

### `anchor_level`

Allowed first values:

1. `L1`
2. `L2`
3. `L3`

This is intentionally narrower than the broader memory theory.

Recommended mapping:

1. `L1` = execution anchor
2. `L2` = workflow anchor
3. `L3` = pattern anchor

### `task_signature`

`task_signature` should be the primary compact retrieval key for action-oriented reuse.

It should be:

1. normalized
2. stable across repeated similar tasks
3. less verbose than full input text
4. more action-oriented than plain semantic summary

Recommended composition:

1. task intent
2. object under work
3. failure or goal class when present

Examples:

1. `fix-node-test-failure`
2. `compile-replay-playbook-from-run`
3. `select-tool-for-context-assembly`

### `error_signature`

`error_signature` should capture repeated failure shape when one exists.

It should be:

1. stable across repeated manifestations of the same operational problem
2. narrower than broad semantic similarity
3. usable as a hard or semi-hard grouping key during pattern formation

Examples:

1. `http-503-retry-exhausted`
2. `node-test-export-mismatch`
3. `sandbox-command-not-allowed`

### `workflow_signature`

`workflow_signature` should represent the action structure rather than the prose description.

It should be derived primarily from:

1. normalized step shape
2. stable tool sequence
3. key branch decisions when important

This makes it a stronger clustering input than text embeddings alone.

### `summary`

This is the short display and ranking summary.

It should be:

1. readable in context assembly output
2. short enough to fit the current char-budget logic
3. strong enough to justify recall without full payload load

### `tool_set`

This captures the tools materially involved in the successful action path.

It should include:

1. executed tools for execution and workflow anchors
2. candidate or preferred tools for decision anchors

### `source`

This records the primary provenance object.

Allowed `source_kind` values for v1:

1. `replay_step`
2. `playbook`
3. `distilled_trace`
4. `tool_decision`
5. `workflow_cluster`

### `payload_refs`

This points to the heavier evidence.

In Lite v1, payload refs should point to already-existing objects:

1. node ids in `lite_memory_nodes`
2. decision ids in `lite_memory_execution_decisions`
3. replay `run_id`
4. replay `step_id`
5. commit ids

This keeps rehydration cheap to design because the payload already exists.

### `rehydration`

This field tells the runtime and the LLM how expensive or necessary payload expansion is likely to be.

Recommended first subfields:

1. `default_mode`
2. `payload_cost_hint`
3. `recommended_when`

## Storage Mapping

The anchor schema should map onto existing Lite storage fields as follows.

### Physical row mapping

1. `lite_memory_nodes.id`
   Anchor object id
2. `lite_memory_nodes.type`
   `procedure` or `concept`
3. `lite_memory_nodes.tier`
   Default `warm`, optionally `hot` for fresh frequently reused anchors
4. `lite_memory_nodes.title`
   Human-readable anchor title
5. `lite_memory_nodes.text_summary`
   Short recall summary
6. `lite_memory_nodes.slots_json`
   Stores `anchor_v1` plus auxiliary lifecycle fields
7. `lite_memory_nodes.raw_ref` and `evidence_ref`
   Optional links to larger raw artifacts when appropriate
8. `lite_memory_nodes.salience`
   Short-term retrieval importance
9. `lite_memory_nodes.importance`
   Longer-term retention importance
10. `lite_memory_nodes.confidence`
   Confidence that the anchor is reusable

### Recommended slots shape

Outside `anchor_v1`, the following top-level `slots` fields are also useful:

1. `compression_layer`
2. `summary_kind`
3. `lifecycle_state`
4. `source_node_id`
5. `source_decision_id`
6. `source_run_id`
7. `source_playbook_id`

That keeps the anchor friendly to current context and debug surfaces that already inspect `slots`.

## Recommended Type And Tier Defaults

### Execution anchor defaults

1. `type = "procedure"` for step-like execution anchors
2. `tier = "warm"`
3. `compression_layer = "L1"`

### Workflow anchor defaults

1. `type = "procedure"`
2. `tier = "warm"`
3. `compression_layer = "L2"`

### Pattern anchor defaults

1. `type = "concept"`
2. `tier = "warm"`
3. `compression_layer = "L3"`

## Edge Strategy

Anchors should use existing edge types only.

Recommended edge usage:

1. `derived_from`
   Anchor -> source step, source playbook, or source concept
2. `part_of`
   Execution anchor -> workflow anchor when a workflow anchor is later created
3. `related_to`
   Pattern anchor -> sibling anchors in the same task class when needed

This avoids schema sprawl and preserves compatibility with current graph behavior.

## Rehydration Decision Contract

The default Lite behavior should be:

1. recall anchors first
2. present the LLM with anchor summary plus rehydration hints
3. let the LLM decide whether to call `rehydrate_payload(anchor_id=...)`

This is the preferred ordinary case because it preserves token efficiency and keeps decision-making inside the agent loop.

Recommended prompt surface for an anchor hit:

1. anchor summary
2. source kind
3. key steps
4. outcome
5. payload cost hint
6. recommended rehydration conditions

Example interaction shape:

The system found a historical successful anchor for a similar task. It used `bash` and `edit` to repair a related failure. If more detail is required, call `rehydrate_payload(anchor_id='a_123')` to inspect the full trace and logs.

Automatic rehydration should remain narrow and policy-driven.

Recommended hard-rule triggers:

1. irreversible actions
2. policy-required verification paths
3. repeated failure after anchor-only guidance
4. missing critical data that prevents safe execution

## First-Class Anchor Sources In Lite

The first anchor-producing sources should be:

### 1. Replay steps

Why:

Replay steps already create structured `procedure` nodes with tool name, step index, run id, status, and other execution metadata.

Use when:

1. step completed successfully
2. step resolved a known recurring failure
3. step contains stable enough input/output structure

### 2. Playbooks

Why:

Playbooks are already the cleanest reusable workflow object in Lite.

Use when:

1. playbook is promoted or repeatedly used
2. playbook has stable matchers or stable success criteria

### 3. Distilled traces

Why:

Write distillation already creates compressed evidence and concept nodes.

Use when:

1. a raw trace yields a stable reusable short summary
2. the trace is too small to justify a full workflow object

### 4. Tool decisions

Why:

The execution-decision table already records selected tool, candidates, rule provenance, and execution metadata.

Use when:

1. the same task signature repeatedly leads to the same winning tool or tool family
2. later task routing would benefit from a compact reusable decision hint

## Decision Anchors And The Existing Decision Table

Lite already stores `tools_select` decisions in `lite_memory_execution_decisions`.

V1 recommendation:

1. do not replace that table
2. do not mirror every decision into a node
3. create a decision anchor node only when a decision shows reuse value

Promotion triggers for a decision anchor:

1. same task signature seen repeatedly
2. same selected tool or tool family repeats
3. outcome is neutral-to-positive across repeated uses

This keeps node growth controlled and makes anchors value-driven rather than log-driven.

## Pattern Promotion Rules

An L2 workflow should not be promoted toward L3 pattern status only because it is semantically similar to another workflow.

Recommended first promotion gate:

1. matching or near-matching `task_signature`
2. matching `error_signature` when an error is present
3. compatible `workflow_signature`
4. sufficiently similar tool set
5. repeated successful outcome

Recommended two-stage approach:

1. candidate grouping by signatures
2. structural verification by workflow shape and outcome

Optional LLM involvement is useful at the review step, but only after the signature gate has already narrowed the candidate set.

This makes pattern formation resilient against false merges caused by generic tool overlap.

The LLM should therefore act as a bounded adjudicator, not as the first-pass clustering engine.

## Anchor Creation Rules

The first anchor creation policy should be conservative.

Create an anchor only when at least one of these is true:

1. the source completed successfully
2. the source is already a reusable workflow object
3. the source is repeatedly recalled or reused
4. the source represents a useful repair path

Avoid anchor creation when:

1. the step is low-information boilerplate
2. the decision was one-off or low-confidence
3. the trace failed without a useful recovery structure
4. the summary is too generic to support future action

## Rehydration Contract

Anchor recall should be cheap by default.

Recommended Lite rehydration behavior:

1. recall anchor first
2. inspect `payload_refs`
3. load only the minimum linked objects needed for the current task
4. prefer step or playbook summaries before full raw payload

Three practical rehydration modes:

1. `summary_only`
   Use `title`, `text_summary`, and `anchor_v1`
2. `partial`
   Load linked node summaries and selected decision metadata
3. `full`
   Load full replay-linked trace or raw payload only when explicitly necessary

Recommended default:

1. `summary_only` first
2. `partial` when the LLM asks for it
3. `full` only under explicit need or policy pressure

## Ranking Signals

Initial ranking should reuse existing Lite ranking fields rather than introduce a new scoring engine.

Recommended interpretation:

1. `salience`
   Short-term likely usefulness for the next few tasks
2. `importance`
   Long-term retention value
3. `confidence`
   Confidence that this anchor generalizes beyond its source event

Suggested defaults:

1. fresh execution anchor: `salience 0.70`, `importance 0.60`, `confidence 0.65`
2. workflow anchor: `salience 0.75`, `importance 0.72`, `confidence 0.75`
3. repeated pattern anchor: `salience 0.72`, `importance 0.80`, `confidence 0.82`

## Importance Update Strategy

The importance formula may be rich, but the update path should stay cheap.

Recommended runtime strategy:

1. lazy updates on hit
2. periodic offline maintenance

Lazy updates should change:

1. `metrics.usage_count`
2. `metrics.last_used_at`
3. `metrics.reuse_success_count`
4. `metrics.reuse_failure_count`
5. derived dynamic ranking hints

Offline maintenance should handle:

1. demotion
2. archive relocation
3. stale anchor review
4. promotion scans
5. redundancy cleanup

This avoids full-database rescoring after every task while preserving dynamic memory behavior.

Low-frequency but high-strategic-value anchors may still be nominated for retention through LLM adjudication, but the runtime should persist only structured, reviewable proposals.

## Anchor Recall In Context Assembly

The current context pipeline already recognizes:

1. `event`
2. `evidence`
3. `concept`
4. `rule`
5. `topic`

To make anchors useful without a large refactor:

1. workflow anchors should enter through existing `concept` or `procedure` compatible recall paths
2. `text_summary` and `slots.anchor_v1.summary` should be shaped for current char budgets
3. `compression_layer` should drive selection preferences where appropriate

The immediate design implication is:

Anchor usefulness depends more on summary quality and provenance links than on inventing a new node class.

## Example Anchor Instances

### Example A: Replay step anchor

```json
{
  "type": "procedure",
  "tier": "warm",
  "title": "Fix export mismatch in failing test",
  "text_summary": "Inspect test failure, patch export, rerun targeted test",
  "slots": {
    "compression_layer": "L1",
    "summary_kind": "execution_anchor",
    "anchor_v1": {
      "anchor_kind": "execution",
      "anchor_level": "L1",
      "task_signature": "fix-node-test-failure",
      "summary": "Inspect test failure, patch export, rerun targeted test",
      "tool_set": ["edit", "test"],
      "selected_tool": null,
      "key_steps": [
        "inspect failing test",
        "patch export",
        "rerun targeted test"
      ],
      "outcome": {
        "status": "success",
        "result_class": "repair_completed",
        "success_score": 1
      },
      "source": {
        "source_kind": "replay_step",
        "node_id": "step_node_123",
        "decision_id": null,
        "run_id": "run_123",
        "step_id": "step_3",
        "playbook_id": null,
        "commit_id": "commit_123"
      },
      "payload_refs": {
        "node_ids": ["step_node_123"],
        "decision_ids": [],
        "run_ids": ["run_123"],
        "step_ids": ["step_3"],
        "commit_ids": ["commit_123"]
      },
      "schema_version": "anchor_v1"
    }
  }
}
```

### Example B: Tool decision anchor

```json
{
  "type": "concept",
  "tier": "warm",
  "title": "Prefer edit before broad test on export mismatch",
  "text_summary": "For export mismatch failures, start with edit and rerun targeted test before broader validation",
  "slots": {
    "compression_layer": "L3",
    "summary_kind": "decision_anchor",
    "anchor_v1": {
      "anchor_kind": "decision",
      "anchor_level": "L3",
      "task_signature": "fix-node-export-mismatch",
      "task_class": "debug_export_mismatch",
      "summary": "Prefer edit and targeted retest before broader validation",
      "tool_set": ["edit", "test"],
      "selected_tool": "edit",
      "key_steps": [
        "inspect failing export path",
        "patch export",
        "rerun targeted test"
      ],
      "outcome": {
        "status": "success",
        "result_class": "tool_routing_hint",
        "success_score": 0.9
      },
      "source": {
        "source_kind": "tool_decision",
        "node_id": null,
        "decision_id": "decision_123",
        "run_id": "run_123",
        "step_id": null,
        "playbook_id": null,
        "commit_id": null
      },
      "payload_refs": {
        "node_ids": [],
        "decision_ids": ["decision_123"],
        "run_ids": ["run_123"],
        "step_ids": [],
        "commit_ids": []
      },
      "schema_version": "anchor_v1"
    }
  }
}
```

## Migration Path

This schema intentionally preserves a clean migration path.

### Stage 1

Use node-backed anchors only.

### Stage 2

Add anchor extraction jobs from replay runs and repeated tool decisions.

### Stage 3

If needed, introduce a dedicated anchor index or projection table later.

That future table, if it ever exists, should be a projection of `anchor_v1` rather than a different conceptual model.

## Recommended First Implementation Slice

The first implementation slice should do only this:

1. define `anchor_v1` TypeScript schema
2. create execution anchors from successful replay playbooks and selected replay steps
3. store them as `procedure` nodes in `lite_memory_nodes`
4. connect them with `derived_from` edges to source nodes
5. surface them in recall and context assembly through existing node ranking paths

This is the smallest slice that creates product-visible value without forcing a larger lifecycle system.

## Summary

The Lite anchor should be treated as:

1. a compact execution-memory object
2. stored as a normal node with a strict `slots.anchor_v1` payload
3. ranked through existing Lite memory signals
4. linked to heavier evidence through existing ids and edges

That makes anchors immediately implementable in the current repository and keeps the door open for richer memory evolution later.
