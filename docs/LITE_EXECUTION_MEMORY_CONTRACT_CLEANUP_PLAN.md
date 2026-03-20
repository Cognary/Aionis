# Aionis Lite Execution-Memory Contract Cleanup Plan

Last reviewed: 2026-03-20

This document turns the `canonical vs transitional` split in the execution-memory product contract into a concrete cleanup plan.

Primary references:

1. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
2. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
3. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
4. [docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md)
5. [docs/LITE_EXECUTION_MEMORY_REDUNDANCY_AUDIT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_REDUNDANCY_AUDIT.md)
6. [docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md)

## Purpose

The goal is not to redesign the execution-memory surface.

The goal is to make the current surface easier to keep stable by answering three practical questions:

1. which fields are the canonical long-term product contract
2. which fields are temporary convenience mirrors
3. what testing and sequencing must happen before any response-shape cleanup

## Current Problem

The current execution-memory product surface is useful but intentionally redundant.

That redundancy is helping adoption right now, but it creates three risks:

1. the same packet state is exposed in too many shapes
2. one surface can drift semantically while others still look correct
3. future cleanup becomes risky if there is no explicit deprecation sequence

This plan exists to prevent that drift.

## Cleanup Objective

Move from:

`canonical packet + transitional mirrors with implicit status`

to:

`canonical packet + explicitly-governed compatibility mirrors`

That means:

1. the canonical product surfaces stay stable
2. compatibility mirrors remain allowed for now
3. no mirror is removed until schema, tests, and docs all agree on the canonical replacement

## Canonical Contract Surface

These fields are the long-term execution-memory contract and should be treated as product-owned.

### Planner/Context

1. `planner_packet`
2. `action_recall_packet`
3. `planning_summary`
4. `assembly_summary`
5. `execution_kernel`
6. `workflow_signals`
7. `pattern_signals`

### Selector

1. `selection_summary.provenance_explanation`
2. `selection_summary.pattern_lifecycle_summary`
3. `selection_summary.pattern_maintenance_summary`
4. `decision.pattern_summary`

### Replay Review

1. `learning_projection_result`

### Introspection

1. `demo_surface`
2. `workflow_signal_summary`
3. `pattern_signal_summary`
4. `workflow_lifecycle_summary`
5. `workflow_maintenance_summary`
6. `pattern_lifecycle_summary`
7. `pattern_maintenance_summary`

## Transitional Compatibility Surface

These fields remain intentionally duplicated for current ergonomics, but should be treated as mirrors rather than primary contract owners:

1. top-level `recommended_workflows`
2. top-level `candidate_workflows`
3. top-level `candidate_patterns`
4. top-level `trusted_patterns`
5. top-level `contested_patterns`
6. top-level `rehydration_candidates`
7. top-level `supporting_knowledge`

Current classification:

1. `recommended_workflows` = transitional compatibility mirror
2. `candidate_workflows` = transitional compatibility mirror
3. `candidate_patterns` = transitional compatibility mirror
4. `trusted_patterns` = transitional compatibility mirror
5. `contested_patterns` = transitional compatibility mirror
6. `rehydration_candidates` = transitional compatibility mirror
7. `supporting_knowledge` = retained compatibility mirror

Current rule:

1. they must remain byte-for-byte or semantically aligned with `planner_packet.sections.*`
2. they cannot gain unique semantics that do not also exist in the canonical packet
3. new execution-memory meaning should be added to canonical packet or summary surfaces first

## Cleanup Phases

### Phase 1: Canonical Freeze

Goal:

Make the canonical execution-memory surface explicit and stable.

Required changes:

1. keep `planner_packet`, `action_recall_packet`, and `execution_kernel` aligned as one schema family
2. explicitly mark top-level packet arrays as compatibility mirrors in docs
3. ensure `planning_context` and `context_assemble` route tests assert canonical-first alignment

Primary files:

1. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
2. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
3. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
4. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)

Exit criteria:

1. every canonical field is represented in route schema
2. canonical packet alignment is validated before mirror assertions
3. docs call out mirrors as transitional rather than primary

### Phase 2: Contract Redundancy Audit

Goal:

Find the remaining response duplication that exists only for convenience.

Required changes:

1. list every execution-memory field that appears in more than one route surface
2. classify each duplicate as:
   - canonical
   - compatibility mirror
   - accidental duplication
3. remove accidental duplication from handlers or summaries

Primary files:

1. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
2. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
3. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
4. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)

Exit criteria:

1. route-level execution-memory duplication is intentional and named
2. packet, summary, and kernel each have a clearly bounded purpose
3. no field exists in multiple places without a written reason

### Phase 3: End-To-End Contract Hardening

Goal:

Strengthen the execution-memory contract at the flow level, not just field level.

Required changes:

1. keep `planning_context` end-to-end tests centered on packet-to-summary-to-kernel alignment
2. keep `context_assemble` end-to-end tests centered on packet-to-summary-to-kernel alignment
3. keep `tools_select` tests centered on pattern provenance and lifecycle alignment
4. keep `replay review` tests centered on governed learning projection outcomes

Primary files:

1. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)
2. [scripts/ci/lite-planning-summary.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-planning-summary.test.ts)
3. [scripts/ci/lite-tools-pattern-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-pattern-anchor.test.ts)
4. [scripts/ci/lite-replay-governed-learning-projection-route.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-replay-governed-learning-projection-route.test.ts)
5. [scripts/ci/lite-tools-select-route-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-select-route-contract.test.ts)

Exit criteria:

1. every named loop has at least one end-to-end contract test
2. replay review remains covered as an execution-memory producer surface
3. selector contract is validated as a product surface, not just an implementation detail
4. `tools_select` and `replay review` route responses are schema-validated, not just field-asserted

### Phase 4: Compatibility Mirror Decision

Goal:

Decide which top-level mirrors remain part of the public Lite product shape long term.

Required changes:

1. evaluate actual consumer value of each top-level mirror
2. keep mirrors that materially reduce integrator complexity
3. mark any removal candidate as:
   - deprecated in docs
   - still tested during overlap period
   - removable only after a versioned contract change decision

Primary files:

1. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
2. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
3. [docs/LITE_API_CAPABILITY_MATRIX.md](/Volumes/ziel/Aionisgo/docs/LITE_API_CAPABILITY_MATRIX.md)
4. [README.md](/Volumes/ziel/Aionisgo/README.md)

Exit criteria:

1. each mirror is either retained, deprecated, or explicitly promoted to canonical
2. no mirror removal happens without contract documentation first
3. release narrative can describe the stable surface in one pass without caveats

Current decision already made:

1. top-level `supporting_knowledge` is retained as a compatibility mirror
2. the full `execution_kernel.*_summary` family is retained as the compact aligned kernel contract
3. the remaining top-level packet arrays remain transitional compatibility mirrors
4. future open decisions are centered on any packet-only simplification or narrower operator-specific surfaces

Current versioning rule:

1. `Phase 4` does not remove any mirror in `Execution-Memory Product Contract v1`
2. `Phase 4` now treats `v2` as the first possible contract version for narrowing the transitional packet-array mirrors
3. `Phase 4` does not reopen the status of `supporting_knowledge`, `workflow_signals`, `pattern_signals`, or `execution_kernel.*_summary`

Current `v2` review set:

1. `recommended_workflows`
2. `candidate_workflows`
3. `candidate_patterns`
4. `trusted_patterns`
5. `contested_patterns`
6. `rehydration_candidates`

Current explicit non-goals:

1. no `v1` packet-array mirror removal
2. no `v1` deprecation banner for retained fields
3. no packet-only rewrite during implementation cleanup

Current migration note:

1. any future `v2` narrowing should follow the replacement map in [docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md)

## Recommended Delivery Order

Recommended order:

1. `Phase 1`
2. `Phase 3`
3. `Phase 2`
4. `Phase 4`

Reason:

1. freeze the canonical contract first
2. harden end-to-end guarantees before removing any response redundancy
3. only then audit and reduce duplication
4. make keep/remove decisions last, once the contract is already stable

## Immediate Next Work

The most valuable immediate work is:

1. strengthen `planning_context` and `context_assemble` route-level contract assertions around canonical-vs-mirror alignment
2. strengthen `tools_select` end-to-end assertions around selector provenance and lifecycle
3. keep `replay review -> learning_projection_result` covered as a first-class execution-memory producer path

That work should happen before any field removal discussion.
