# Aionis Lite Planner Packet And Provenance Contract

Last reviewed: 2026-03-20

This document defines the stable planner-facing and selector-facing provenance contract introduced during Foundation Memory `V1`.

Status:

`active V1/V3 runtime contract`

Primary implementation references:

1. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
2. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
3. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
4. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
5. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)

## Purpose

The goal is to make planner-facing and selector-facing execution-memory output readable without re-deriving semantics from mixed recall layers, raw hints, or decision metadata.

This contract defines:

1. which packet sections are primary
2. which summary fields are canonical
3. how natural-language provenance should be phrased
4. how planner-side and selector-side explanations stay aligned
5. which route-response schemas now formalize the packet contract

## Route Contract Schemas

The stable planner/context response shape is now also represented as runtime schemas.

Current schema entrypoints:

1. `PlanningContextRouteContractSchema`
2. `ContextAssembleRouteContractSchema`
3. `PlannerPacketTextSurfaceSchema`
4. `ActionPacketSummarySchema`
5. `PatternSignalSummarySchema`
6. `WorkflowSignalSummarySchema`
7. `PatternLifecycleSummarySchema`
8. `PatternMaintenanceSummarySchema`
9. `WorkflowLifecycleSummarySchema`
10. `WorkflowMaintenanceSummarySchema`
11. `ExecutionKernelPacketSummarySchema`

Companion route-contract reference:

1. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
2. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)

Interpretation:

1. the route contract is no longer defined only by handler behavior and tests
2. planner packet, packet summary, and execution-kernel summary are now parseable as one schema family
3. route-level contract tests should parse responses through these schemas before doing semantic assertions

## Primary Planner Packet

Planner-oriented Lite routes now expose a stable `planner_packet`.

Current routes:

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`

The primary packet sections are:

1. `recommended_workflows`
2. `candidate_workflows`
3. `candidate_patterns`
4. `trusted_patterns`
5. `contested_patterns`
6. `rehydration_candidates`
7. `supporting_knowledge`

Interpretation:

1. the first five sections are execution-memory-first
2. `supporting_knowledge` remains present, but should remain secondary
3. once a stable workflow anchor exists for the same workflow signature, duplicate candidate workflows should not continue occupying planner-facing packet space
4. planner-facing consumers should prefer this packet over reconstructing meaning from `layers.*.items`

## Packet Surface Rules

The current contract is:

1. `planner_packet` is the primary structured planner surface
2. the same packet sections are also exposed as top-level arrays for convenience
3. `pattern_signals` and `workflow_signals` are also exposed as top-level arrays so planner/runtime consumers do not have to reach through `layered_context`
4. `layered_context` remains available, but it is no longer the only planner-facing interpretation layer
5. if `action_recall_packet` is present, the planner packet is derived from it first
6. if only `runtime_tool_hints` are present, the planner packet may be derived from those hints so planner-facing output does not silently collapse

Current mirror status:

1. `recommended_workflows`, `candidate_workflows`, `candidate_patterns`, `trusted_patterns`, `contested_patterns`, and `rehydration_candidates` are transitional compatibility mirrors
2. `supporting_knowledge` is a retained compatibility mirror
3. `workflow_signals` and `pattern_signals` are canonical route-level signal surfaces, not packet mirrors

## Planner Summary Contract

The planner-side canonical summaries are:

1. `planning_summary`
2. `assembly_summary`
3. `execution_kernel.action_packet_summary`
4. `execution_kernel.workflow_signal_summary`
5. `execution_kernel.workflow_lifecycle_summary`
6. `execution_kernel.workflow_maintenance_summary`
7. `execution_kernel.pattern_lifecycle_summary`
8. `execution_kernel.pattern_maintenance_summary`

Current structured summary field:

`action_packet_summary`

It records:

1. `recommended_workflow_count`
2. `candidate_workflow_count`
3. `candidate_pattern_count`
4. `trusted_pattern_count`
5. `contested_pattern_count`
6. `rehydration_candidate_count`
7. `supporting_knowledge_count`
8. `workflow_anchor_ids`
9. `candidate_workflow_anchor_ids`
10. `candidate_pattern_anchor_ids`
11. `trusted_pattern_anchor_ids`
12. `contested_pattern_anchor_ids`
13. `rehydration_anchor_ids`

Additional lifecycle summary field:

`workflow_signal_summary`

It records:

1. `stable_workflow_count`
2. `promotion_ready_workflow_count`
3. `observing_workflow_count`
4. `stable_workflow_titles`
5. `promotion_ready_workflow_titles`
6. `observing_workflow_titles`

Additional lifecycle summary field:

`workflow_lifecycle_summary`

It records:

1. `candidate_count`
2. `stable_count`
3. `replay_source_count`
4. `rehydration_ready_count`
5. `promotion_ready_count`
6. `transition_counts.candidate_observed`
7. `transition_counts.promoted_to_stable`
8. `transition_counts.normalized_latest_stable`

Additional maintenance summary field:

`workflow_maintenance_summary`

It records:

1. `model = "lazy_online_v1"`
2. `retain_count`
3. `retain_workflow_count`

Additional lifecycle summary field:

`pattern_lifecycle_summary`

It records:

1. `candidate_count`
2. `trusted_count`
3. `contested_count`
4. `near_promotion_count`
5. `counter_evidence_open_count`
6. `transition_counts.candidate_observed`
7. `transition_counts.promoted_to_trusted`
8. `transition_counts.counter_evidence_opened`
9. `transition_counts.revalidated_to_trusted`

Additional maintenance summary field:

`pattern_maintenance_summary`

It records:

1. `model = "lazy_online_v1"`
2. `observe_count`
3. `retain_count`
4. `review_count`
5. `promote_candidate_count`
6. `review_counter_evidence_count`
7. `retain_trusted_count`

Interpretation:

1. this is the stable compact summary of the packet
2. packet summary fields should agree with the planner-facing explanation string
3. `execution_kernel` should expose the same compact packet summary, not a separate interpretation model
4. `execution_kernel.pattern_signal_summary` should agree with the same top-level `pattern_signals` surface
5. `execution_kernel.workflow_signal_summary` should agree with the same top-level `workflow_signals` surface
6. `execution_kernel.workflow_lifecycle_summary` should agree with the same top-level workflow packet sections
7. `execution_kernel.workflow_maintenance_summary` should agree with the same top-level workflow packet sections
8. `execution_kernel.pattern_lifecycle_summary` should agree with the same top-level packet sections
9. `execution_kernel.pattern_maintenance_summary` should agree with the same top-level packet sections
10. the current contract retains the whole `execution_kernel` summary family as a stable compact surface rather than narrowing it during cleanup

## Execution-Native Packet Semantics

The planner/context contract now assumes an execution-native substrate beneath the packet.

Current runtime rule:

1. `execution_native_v1` is now a first-class semantic source for planner/context runtime paths
2. `anchor_v1` still exists and remains authoritative for rehydration payload hints
3. recall, context packing, and runtime hint generation should prefer `execution_native_v1` when both are present
4. older slot-based payloads may still exist, but the runtime contract is no longer defined only by ad hoc `summary_kind` or raw `anchor_v1` inspection

Execution-native fields currently consumed by planner/runtime surfaces:

1. `execution_kind`
2. `summary_kind`
3. `compression_layer`
4. `anchor_kind`
5. `anchor_level`
6. `task_signature`
7. `pattern_state`
8. `promotion`
9. `selected_tool`
10. `workflow_promotion`
11. `maintenance`

Interpretation:

1. workflow and pattern recognition should not depend solely on `anchor_v1`
2. context-layer classification should not depend solely on generic `summary_kind`
3. planner/runtime trust state should prefer the execution-native record when both layers are available

## Planner Explanation Contract

The canonical planner-side natural-language field is:

`planner_explanation`

Current ordering rule:

1. workflow guidance
2. selected tool
3. trusted pattern support or availability
4. contested pattern visibility
5. rehydration availability
6. supporting knowledge append behavior

Current phrasing family:

1. `workflow guidance: ...`
2. `promotion-ready workflow candidates: ...`
3. `candidate workflows visible but not yet promoted: ...`
4. `selected tool: ...`
5. `trusted pattern support: ...`
6. `trusted patterns available but not used: ...`
7. `candidate patterns visible but not yet trusted: ...`
8. `contested patterns visible but not trusted: ...`
9. `rehydration available: ...`
10. `supporting knowledge appended: ...`

Interpretation:

1. the explanation is not a free-form string
2. it is a stable runtime contract for planner-facing consumers
3. promotion-ready workflow candidates should be surfaced before generic candidate-workflow wording
4. the explanation should follow packet order rather than tool-selection order alone

## Context Item And Citation Semantics

The planner packet sits above `context.items` and `context.citations`, but those lower-level surfaces are now also expected to expose execution-native semantics directly.

Current runtime shape:

1. `context.items[*]` may expose:
   1. `summary_kind`
   2. `execution_kind`
   3. `anchor_kind`
   4. `compression_layer`
2. `context.citations[*]` may expose the same execution-native classification fields
3. supporting event/evidence lines may now surface `summary_kind`, `execution_kind`, and `level`
4. workflow procedures may now surface execution-native metadata in topic/context text rendering

Interpretation:

1. planner-side consumers no longer need to reverse-engineer “main action memory vs supporting knowledge” purely from node type
2. citations are no longer only provenance pointers; they can now preserve execution-memory classification
3. lower-level context surfaces should remain semantically consistent with the packet and summary layers

## Selector Provenance Contract

The selector-side canonical provenance field is:

`selection_summary.provenance_explanation`

This field uses the same trust language family as `planner_explanation`.

Current phrasing family:

1. `selected tool: ...`
2. `trusted pattern support: ...`
3. `trusted patterns available but not used: ...`
4. `candidate patterns visible but not yet trusted: ...`
5. `contested patterns visible but not trusted: ...`
6. `fallback applied: ...`

Interpretation:

1. selector summaries should explain whether trusted patterns actively supported the choice
2. selector summaries should also explain when trusted patterns were visible but not used
3. contested patterns should be described as visible but not trusted, not as implicit policy
4. planner-side and selector-side provenance should therefore remain semantically aligned

## Alignment Rules

The runtime should preserve these alignment rules:

1. planner packet sections and `action_packet_summary` must agree
2. `planner_explanation` must describe the same packet state exposed by structured fields
3. `selection_summary.provenance_explanation` must not contradict candidate/trusted/contested pattern behavior
4. explicit operator or rule `tool.prefer` remains higher priority than trusted pattern reuse
5. a contested pattern may remain visible in both planner-side and selector-side explanations, but it must not be described as trusted support

## Non-Goals

This contract does not define:

1. write-schema redesign
2. storage/index layout
3. full lifecycle promotion or archive semantics beyond the compact lifecycle summary surface
4. LLM adjudication payloads

Those belong to separate memory and governance documents.

## Summary

The current runtime contract is now:

1. planner-facing routes expose a stable execution-memory-first packet
2. planner summaries expose a stable compact packet summary
3. planner and kernel summaries expose a compact lifecycle summary
4. planner and kernel summaries now also expose workflow lifecycle and workflow maintenance
5. planner explanations follow packet order
6. selector summaries use the same provenance language family

This is the current runtime meaning of `execution-memory-first` in Lite.
