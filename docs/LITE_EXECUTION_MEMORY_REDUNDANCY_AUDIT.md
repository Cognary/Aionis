# Aionis Lite Execution-Memory Redundancy Audit

Last reviewed: 2026-03-20

This document records the current duplication map of the execution-memory product surface.

It exists to answer one practical question:

`which repeated fields are intentional mirrors, and which were only implementation duplication`

Primary references:

1. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
2. [docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md)
3. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
4. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
5. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)

## Audit Status

Status:

`active phase-2 redundancy audit`

Current implementation note:

1. `planning_context` and `context_assemble` now emit packet mirrors through one shared helper:
   [buildPlannerPacketResponseSurface()](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
2. this removes one clear source of accidental response-shape drift between the two route handlers
3. execution-memory summary families are now also produced through one shared bundle:
   [buildExecutionMemorySummaryBundle()](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)

## Surface Map

### 1. Planner/Context

Canonical owner:

1. `planner_packet`
2. `action_recall_packet`
3. `planning_summary`
4. `assembly_summary`
5. `execution_kernel`
6. `workflow_signals`
7. `pattern_signals`

Intentional mirrors:

1. top-level `recommended_workflows`
2. top-level `candidate_workflows`
3. top-level `candidate_patterns`
4. top-level `trusted_patterns`
5. top-level `contested_patterns`
6. top-level `rehydration_candidates`
7. top-level `supporting_knowledge`

Current mirror classification:

1. `recommended_workflows` = transitional compatibility mirror
2. `candidate_workflows` = transitional compatibility mirror
3. `candidate_patterns` = transitional compatibility mirror
4. `trusted_patterns` = transitional compatibility mirror
5. `contested_patterns` = transitional compatibility mirror
6. `rehydration_candidates` = transitional compatibility mirror
7. `supporting_knowledge` = retained compatibility mirror

Reason they still exist:

1. they reduce integrator work for common route consumers
2. they support direct UI and operator views without packet re-walking
3. they are already covered as mirrors of canonical packet state

Derived summaries:

1. `planning_summary.action_packet_summary`
2. `planning_summary.workflow_signal_summary`
3. `planning_summary.workflow_lifecycle_summary`
4. `planning_summary.workflow_maintenance_summary`
5. `planning_summary.pattern_lifecycle_summary`
6. `planning_summary.pattern_maintenance_summary`
7. the matching `execution_kernel.*_summary` fields

Rule:

1. summaries are allowed to derive from canonical packet/signal surfaces
2. summaries must not become independent sources of truth

### 2. Selector

Canonical owner:

1. `decision.pattern_summary`
2. `selection_summary.provenance_explanation`
3. `selection_summary.pattern_lifecycle_summary`
4. `selection_summary.pattern_maintenance_summary`

Related but not canonical:

1. `pattern_matches`

Reason:

1. `pattern_matches` is the raw matching trace
2. `decision.pattern_summary` is the compact persisted decision provenance
3. `selection_summary.*` is the planner/operator-facing explanation surface

Rule:

1. `pattern_matches` may be more verbose
2. the product contract is centered on `decision.pattern_summary` and `selection_summary.*`

### 3. Replay Review

Canonical owner:

1. `learning_projection_result`

Related but not canonical:

1. `auto_promote_policy_resolution`
2. `shadow_validation`
3. `auto_promotion`

Reason:

1. `learning_projection_result` is the execution-memory producer outcome
2. the other fields are governance and review context, not the core product output

### 4. Introspection

Canonical owner:

1. `demo_surface`
2. `workflow_signal_summary`
3. `pattern_signal_summary`
4. `workflow_lifecycle_summary`
5. `workflow_maintenance_summary`
6. `pattern_lifecycle_summary`
7. `pattern_maintenance_summary`

Intentional overlap:

1. introspection also returns raw workflow/pattern collections
2. introspection also re-exposes `workflow_signals` and `pattern_signals`

Reason:

1. introspection is explicitly a demo/operator surface
2. raw collections and compact summaries are both first-class there
3. `workflow_signals` and `pattern_signals` remain canonically defined by the planner/context signal model, then reused by introspection

## Accidental Duplication Removed

This audit already removed one implementation-level duplicate:

1. `planning_context` and `context_assemble` no longer hand-maintain separate field spreads for planner packet mirrors
2. both now use the same response-surface helper in [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
3. `execution_kernel` and `planning_summary` no longer each hand-assemble the same execution-memory summary family
4. both now consume the same summary bundle logic in [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
5. `execution_introspection` no longer hand-assembles a separate signal/lifecycle summary family
6. it now reuses the same summary bundle logic in [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)

This is an implementation cleanup, not a public contract change.

## Current Decision

At this stage:

1. no public top-level mirror is being removed
2. no canonical field is being renamed
3. the main phase-2 rule is to remove only accidental implementation duplication first
4. `supporting_knowledge` is now treated as a retained compatibility mirror, not a pending packet-only candidate
5. the full `execution_kernel.*_summary` family is currently retained as a compact aligned kernel contract
6. the remaining top-level packet arrays stay transitional rather than retained

## Next Decision Points

The next useful audit steps are:

1. decide whether any signal summaries should become packet-only in a future contract version
2. decide whether any future version should narrow the transitional packet-array mirror set
3. decide whether any future kernel contract should split operator-facing and runtime-facing summaries

## Current Versioning Position

The current audit position is now:

1. `Execution-Memory Product Contract v1` keeps the full current planner/context packet-array mirror set
2. the only retained mirror within that set is `supporting_knowledge`
3. the remaining packet-array mirrors are transitional and may only be narrowed in a future versioned contract

Current `v2` narrowing candidates:

1. `recommended_workflows`
2. `candidate_workflows`
3. `candidate_patterns`
4. `trusted_patterns`
5. `contested_patterns`
6. `rehydration_candidates`

Current non-candidates:

1. `supporting_knowledge`
2. `workflow_signals`
3. `pattern_signals`
4. `execution_kernel.*_summary`
