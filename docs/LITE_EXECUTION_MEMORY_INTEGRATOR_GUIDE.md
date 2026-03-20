# Aionis Lite Execution-Memory Integrator Guide

Last reviewed: 2026-03-20

This guide is for consumers integrating against the Lite execution-memory routes.

It does not explain the full cleanup plan or contract history.

It answers a simpler question:

`what fields should I read today if I want the most stable integration path`

Primary references:

1. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
2. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
3. [docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md)
4. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)

## Recommended Read Path

For new integrations, the recommended read order is:

1. `planner_packet`
2. `workflow_signals`
3. `pattern_signals`
4. `planning_summary` or `assembly_summary`
5. `execution_kernel`

Interpretation:

1. `planner_packet` is the canonical full collection surface
2. `workflow_signals` and `pattern_signals` are canonical signal surfaces
3. summary objects are the compact human-readable contract
4. `execution_kernel` is the compact aligned runtime contract

## What To Read For Each Need

### 1. Full Workflow And Pattern Collections

Read:

1. `planner_packet.sections.recommended_workflows`
2. `planner_packet.sections.candidate_workflows`
3. `planner_packet.sections.candidate_patterns`
4. `planner_packet.sections.trusted_patterns`
5. `planner_packet.sections.contested_patterns`
6. `planner_packet.sections.rehydration_candidates`

Why:

1. this is the canonical collection surface
2. it is the active default route shape now
3. it is the future-proof ownership layer

### 2. Compact Planner Explanation

Read:

1. `planning_summary.planner_explanation`
2. `assembly_summary.planner_explanation`

Why:

1. this is the stable planner-facing natural-language summary
2. it already follows execution-memory packet order

### 3. Compact Lifecycle And Maintenance State

Read:

1. `workflow_signal_summary`
2. `pattern_signal_summary`
3. `workflow_lifecycle_summary`
4. `workflow_maintenance_summary`
5. `pattern_lifecycle_summary`
6. `pattern_maintenance_summary`

Preferred source:

1. `execution_kernel.*_summary` for compact runtime consumption
2. `planning_summary` / `assembly_summary` for planner-facing consumption

### 4. Secondary Knowledge

Read:

1. `planner_packet.sections.supporting_knowledge`

Recommended default:

1. read supporting knowledge from packet sections like the rest of the planner collections
2. use `POST /v1/memory/execution/introspect` when you want a heavier inspection-oriented surface

### 5. Selector Provenance

Read:

1. `selection_summary.provenance_explanation`
2. `selection_summary.pattern_lifecycle_summary`
3. `selection_summary.pattern_maintenance_summary`
4. `decision.pattern_summary`

Why:

1. this is the stable selector-facing contract
2. it already explains whether a trusted pattern supported the choice, was available but not used, or was visible but not trusted

### 6. Replay Review Producer Outcome

Read:

1. `learning_projection_result`

Why:

1. this is the canonical execution-memory producer outcome for Lite replay review
2. other review/governance fields are context, not the primary execution-memory output

## What To Avoid

Avoid building a new integration around:

1. `layered_context` as the primary execution-memory read path or as a default route dependency
2. top-level packet-array mirrors as the only source of workflow/pattern collections
3. reconstructing signal counts from raw collections when summary objects already exist

Reason:

1. these paths are noisier
2. they are less stable as long-term ownership layers
3. they force consumers to recreate contract logic the runtime already provides

Operational rule:

1. `layered_context` should now be treated as explicit debug/operator output only
2. default planner/context integrations should assume the slim product surface

## Current Stability Guide

Treat these as canonical now:

1. `planner_packet`
2. `workflow_signals`
3. `pattern_signals`
4. `planning_summary`
5. `assembly_summary`
6. `execution_kernel`
7. `selection_summary.provenance_explanation`
8. `selection_summary.pattern_lifecycle_summary`
9. `selection_summary.pattern_maintenance_summary`
10. `learning_projection_result`

## Minimal Integration Recipe

If you want one simple default approach:

1. call `planning_context` or `context_assemble`
2. read all full collections from `planner_packet.sections.*`
3. read signal state from `workflow_signals` and `pattern_signals`
4. read compact explanations from `planning_summary` or `assembly_summary`
5. read compact runtime summaries from `execution_kernel` when you need a small state view

This is the recommended default for any new integration.
