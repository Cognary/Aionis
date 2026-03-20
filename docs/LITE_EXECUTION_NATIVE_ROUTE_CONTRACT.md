# Aionis Lite Execution-Native Route Contract

Last reviewed: 2026-03-20

This document defines the stable execution-native route contract for Lite planner/context surfaces.

It sits one layer below the higher-level planner-packet narrative and one layer above raw route-handler implementation.

Primary references:

1. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
2. [docs/LITE_FOUNDATION_MEMORY_V2_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V2_IMPLEMENTATION_PLAN.md)
3. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
4. [docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md)
5. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
6. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
7. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)

## Purpose

The purpose of this document is to state, in one place, the formal route-level contract that now governs:

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`

This contract is not just descriptive.

It is represented directly in runtime schemas and is exercised by route-level CI.

## Contract Status

Status:

`active V2/V3 route contract`

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

## Core Rule

The route contract is execution-memory-first.

That means:

1. planner/context routes do not expose only a generic layered context
2. they expose a stable planner packet and aligned summaries
3. execution-memory sections are promoted to first-class top-level fields
4. the same packet state is visible through structured packet, summary, and kernel surfaces

## Route Families

The contract currently covers two route families.

### 1. Planning Context

Route:

`POST /v1/memory/planning/context`

Schema:

`PlanningContextRouteContractSchema`

Additional required field:

1. `planning_summary`

### 2. Context Assemble

Route:

`POST /v1/memory/context/assemble`

Schema:

`ContextAssembleRouteContractSchema`

Additional required field:

1. `assembly_summary`

## Stable Top-Level Fields

Both routes now expose these stable top-level fields:

1. `planner_packet`
2. `action_recall_packet`
3. `recommended_workflows`
4. `candidate_workflows`
5. `candidate_patterns`
6. `trusted_patterns`
7. `contested_patterns`
8. `rehydration_candidates`
9. `supporting_knowledge`
10. `pattern_signals`
11. `workflow_signals`
12. `execution_kernel`

Interpretation:

1. these fields are part of the stable planner/context route contract
2. they do not all have the same contract status
3. route consumers should prefer them over re-deriving packet state from `layered_context`

Current field status:

1. `planner_packet`, `action_recall_packet`, and `execution_kernel` are canonical structured route surfaces
2. `workflow_signals` and `pattern_signals` are canonical route-level signal surfaces
3. `supporting_knowledge` is a retained compatibility mirror of `planner_packet.sections.supporting_knowledge`
4. `recommended_workflows`, `candidate_workflows`, `candidate_patterns`, `trusted_patterns`, `contested_patterns`, and `rehydration_candidates` are transitional compatibility mirrors of `planner_packet.sections.*`

Versioning rule:

1. `v1` keeps all of these top-level route fields
2. `supporting_knowledge` is not a `v2` reduction candidate under the current contract
3. the transitional packet-array mirrors are the only current candidates for any future route-shape narrowing
4. the current replacement map for any future narrowing is documented in [docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md)

## Planner Packet Contract

`planner_packet` is the primary planner-facing structured object.

Schema:

`PlannerPacketTextSurfaceSchema`

Current required fields:

1. `packet_version = "planner_packet_v1"`
2. `sections.recommended_workflows`
3. `sections.candidate_workflows`
4. `sections.candidate_patterns`
5. `sections.trusted_patterns`
6. `sections.contested_patterns`
7. `sections.rehydration_candidates`
8. `sections.supporting_knowledge`
9. `merged_text`

Interpretation:

1. `planner_packet` is the canonical textual packet surface
2. the top-level arrays are structured mirrors of the same packet state
3. packet sections should remain aligned with the summary and kernel surfaces
4. among those mirrors, only `supporting_knowledge` is currently retained long term; the other packet-array mirrors remain transitional

## Summary Contract

Planner/context routes expose one summary object plus one kernel summary surface.

### Planning Summary

Used by:

1. `planning_context`

Schema:

`PlanningSummaryContractSchema`

Required aligned fields:

1. `planner_explanation`
2. `workflow_signal_summary`
3. `action_packet_summary`
4. `workflow_lifecycle_summary`
5. `workflow_maintenance_summary`
6. `pattern_lifecycle_summary`
7. `pattern_maintenance_summary`
8. `trusted_pattern_count`
9. `contested_pattern_count`
10. `trusted_pattern_tools`
11. `contested_pattern_tools`

### Assembly Summary

Used by:

1. `context_assemble`

Schema:

`AssemblySummaryContractSchema`

Required aligned fields:

1. `planner_explanation`
2. `workflow_signal_summary`
3. `action_packet_summary`
4. `workflow_lifecycle_summary`
5. `workflow_maintenance_summary`
6. `pattern_lifecycle_summary`
7. `pattern_maintenance_summary`
8. `trusted_pattern_count`
9. `contested_pattern_count`
10. `trusted_pattern_tools`
11. `contested_pattern_tools`

## Kernel Contract

`execution_kernel` is not a separate interpretation model.

Schema:

`ExecutionKernelPacketSummarySchema`

Required fields:

1. `packet_source_mode`
2. `state_first_assembly`
3. `execution_packet_v1_present`
4. `execution_state_v1_present`
5. `pattern_signal_summary`
6. `workflow_signal_summary`
7. `workflow_lifecycle_summary`
8. `workflow_maintenance_summary`
9. `pattern_lifecycle_summary`
10. `pattern_maintenance_summary`
11. `action_packet_summary`

Interpretation:

1. `execution_kernel.action_packet_summary` must align with the same top-level packet state
2. `execution_kernel.pattern_signal_summary` must align with the same top-level `pattern_signals`
3. `execution_kernel.workflow_signal_summary` must align with the same top-level `workflow_signals`
4. `execution_kernel.workflow_lifecycle_summary` must align with the same top-level workflow packet sections, including `candidate_workflows`
5. the full kernel summary family is currently retained as the compact kernel contract, not treated as temporary convenience duplication
5. `execution_kernel.workflow_maintenance_summary` must align with the same top-level workflow packet sections, including `candidate_workflows`
6. `execution_kernel.pattern_lifecycle_summary` must align with the same top-level packet sections
7. `execution_kernel.pattern_maintenance_summary` must align with the same top-level packet sections
8. kernel summary is therefore a compact contract view, not a parallel planner model

## Pattern Signal Contract

`pattern_signals` is now a first-class route surface.

Schema support:

1. top-level `pattern_signals`
2. `PatternSignalSummarySchema`
3. `execution_kernel.pattern_signal_summary`

Interpretation:

1. route consumers should not need to dig through `layered_context.pattern_signals`
2. trust and contested-state visibility are part of the stable route contract
3. packet, summary, and kernel views must agree on candidate vs trusted vs contested counts

## Workflow Signal Contract

`workflow_signals` is now a first-class route surface.

Schema support:

1. top-level `workflow_signals`
2. `WorkflowSignalSummarySchema`
3. `execution_kernel.workflow_signal_summary`

Interpretation:

1. route consumers should not need to reconstruct workflow maturity from only `candidate_workflows` and `recommended_workflows`
2. stable, promotion-ready, and observing workflow state are part of the stable route contract
3. packet, summary, and kernel views must agree on stable vs promotion-ready vs observing workflow counts

## Lifecycle Contract

`pattern_lifecycle_summary` is now part of the stable route contract.

It exists on:

1. `planning_summary.pattern_lifecycle_summary`
2. `assembly_summary.pattern_lifecycle_summary`
3. `execution_kernel.pattern_lifecycle_summary`

It records:

1. `candidate_count`
2. `trusted_count`
3. `contested_count`
4. `near_promotion_count`
5. `counter_evidence_open_count`
6. transition counts for `candidate_observed`
7. transition counts for `promoted_to_trusted`
8. transition counts for `counter_evidence_opened`
9. transition counts for `revalidated_to_trusted`

## Maintenance Contract

`pattern_maintenance_summary` is now part of the stable route contract.

It exists on:

1. `planning_summary.pattern_maintenance_summary`
2. `assembly_summary.pattern_maintenance_summary`
3. `execution_kernel.pattern_maintenance_summary`

It records:

1. `model = "lazy_online_v1"`
2. `observe_count`
3. `retain_count`
4. `review_count`
5. `promote_candidate_count`
6. `review_counter_evidence_count`
7. `retain_trusted_count`

## Execution-Native Source Rule

This route contract assumes an execution-native substrate.

Current source rule:

1. route surfaces may still carry `anchor_v1`-derived detail
2. but planner/context semantics now assume `execution_native_v1` is a first-class runtime source
3. workflow and pattern recognition should not rely only on generic slot inspection

This means the route contract is stable at the surface level even as the substrate continues moving from:

`slot-derived interpretation`

to:

`execution-native-first interpretation`

## Alignment Rules

The runtime must preserve these rules:

1. `planner_packet.sections.*` counts must align with the corresponding top-level arrays
2. `action_packet_summary` must describe the same packet state
3. `execution_kernel.action_packet_summary` must describe the same packet state
4. `execution_kernel.pattern_signal_summary` must describe the same pattern-signal state
5. `pattern_lifecycle_summary` must describe the same packet lifecycle state
6. `pattern_maintenance_summary` must describe the same packet maintenance state
7. `planner_explanation` must not contradict packet state
8. selector-side provenance must continue using the same candidate/trusted/contested language family

## Verification

This contract is currently verified through:

1. schema parsing via `PlanningContextRouteContractSchema`
2. schema parsing via `ContextAssembleRouteContractSchema`
3. route-level CI in [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)

## Non-Goals

This document does not define:

1. write-store layout
2. full recall ranking policy
3. lifecycle promotion rules
4. archive orchestration
5. LLM adjudication behavior

Those belong to the execution-memory, governance, and substrate documents.

## Summary

The current Lite execution-native route contract means:

1. planner/context routes have formal response schemas
2. packet, summary, and kernel surfaces are intentionally aligned
3. execution-memory-first route behavior is now contract-level, not just implementation-level
