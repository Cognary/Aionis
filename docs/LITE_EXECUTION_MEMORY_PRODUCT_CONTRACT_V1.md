# Aionis Lite Execution-Memory Product Contract v1

Last reviewed: 2026-03-20

This document defines the stable product-facing execution-memory contract for `Aionis Lite`.

It sits above:

1. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
2. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
3. [docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md)
4. [docs/LITE_EXECUTION_MEMORY_REDUNDANCY_AUDIT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_REDUNDANCY_AUDIT.md)
5. [docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md)
6. [docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md)

It exists to make one thing explicit:

`Aionis Lite` is no longer just a generic memory API surface.
It now exposes a stable execution-memory product surface centered on two loops.

## Contract Status

Status:

`active execution-memory product contract`

Primary runtime references:

1. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
2. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
3. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
4. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
5. [src/memory/tools-select.ts](/Volumes/ziel/Aionisgo/src/memory/tools-select.ts)
6. [src/memory/replay.ts](/Volumes/ziel/Aionisgo/src/memory/replay.ts)
7. [src/routes/sdk-demo-memory-replay-governed.ts](/Volumes/ziel/Aionisgo/src/routes/sdk-demo-memory-replay-governed.ts)

Primary test references:

1. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)
2. [scripts/ci/lite-planning-summary.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-planning-summary.test.ts)
3. [scripts/ci/lite-tools-pattern-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-pattern-anchor.test.ts)
4. [scripts/ci/lite-tools-select-route-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-select-route-contract.test.ts)
5. [scripts/ci/lite-replay-governed-learning-projection-route.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-replay-governed-learning-projection-route.test.ts)

## Product Thesis

The stable product surface is execution-memory-first.

That means:

1. generic memory storage remains part of the substrate
2. the product center is now reusable execution structure
3. planner, selector, and replay-review surfaces must expose execution-memory state directly
4. route consumers should not need to reconstruct the core loops from mixed raw nodes, layered context, or hidden metadata

## Named Product Loops

### 1. Anchor-Guided Rehydration Loop

Definition:

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

Current product meaning:

1. stable workflow memory is a first-class planner/runtime surface
2. payload expansion is optional and guided by anchor recall
3. rehydration follows the normal Lite single-user identity model

### 2. Execution Policy Learning Loop

Definition:

`feedback -> pattern -> recall -> selector reuse`

Current product meaning:

1. decision memory becomes governed pattern memory
2. selector reuse is trust-gated, not blind reuse
3. explicit operator or rule preference remains higher priority than recalled pattern preference

## Stable Product Surfaces

The current stable execution-memory product surface is spread across four route families.

### 1. Planner Surface

Routes:

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`

Canonical structured objects:

1. `planner_packet`
2. `execution_kernel`

Canonical route-level signals:

1. `workflow_signals`
2. `pattern_signals`

Current field status:

1. `planner_packet` is the only default full collection owner on planner/context routes
2. `execution_kernel` is the compact aligned runtime owner
3. `workflow_signals` and `pattern_signals` are canonical route-level signal surfaces
4. `action_recall_packet` is still the canonical structured recall substrate, but it is no longer part of the default planner/context response surface
5. `recommended_workflows`, `candidate_workflows`, `candidate_patterns`, `trusted_patterns`, `contested_patterns`, `rehydration_candidates`, and `supporting_knowledge` are no longer returned as default top-level planner/context fields

Canonical summary objects:

1. `planning_summary`
2. `assembly_summary`
3. `execution_kernel.action_packet_summary`
4. `execution_kernel.workflow_signal_summary`
5. `execution_kernel.pattern_signal_summary`
6. `execution_kernel.workflow_lifecycle_summary`
7. `execution_kernel.workflow_maintenance_summary`
8. `execution_kernel.pattern_lifecycle_summary`
9. `execution_kernel.pattern_maintenance_summary`

### 2. Selector Surface

Primary runtime reference:

1. [src/memory/tools-select.ts](/Volumes/ziel/Aionisgo/src/memory/tools-select.ts)
2. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)

Primary route contract:

1. `ToolsSelectRouteContractSchema`

Canonical selector-facing outputs:

1. `selection_summary.provenance_explanation`
2. `selection_summary.pattern_lifecycle_summary`
3. `selection_summary.pattern_maintenance_summary`
4. `decision.pattern_summary`

### 3. Replay Review Surface

Primary runtime reference:

1. [src/memory/replay.ts](/Volumes/ziel/Aionisgo/src/memory/replay.ts)
2. [src/routes/sdk-demo-memory-replay-governed.ts](/Volumes/ziel/Aionisgo/src/routes/sdk-demo-memory-replay-governed.ts)

Primary route contract:

1. `ReplayPlaybookRepairReviewResponseSchema`

Canonical governed output:

1. `learning_projection_result`

Current execution-memory rule:

1. Lite repair review defaults replay-learning projection to `sync_inline`
2. Lite repair review does not treat `async_outbox` as a supported default product mode
3. approved review plus enabled learning projection is part of the execution-memory producer surface, not just replay governance detail

### 4. Introspection Surface

Route:

1. `POST /v1/memory/execution/introspect`

Canonical output:

1. `demo_surface`
2. `workflow_signals`
3. `pattern_signals`
4. `workflow_signal_summary`
5. `pattern_signal_summary`
6. `workflow_lifecycle_summary`
7. `workflow_maintenance_summary`
8. `pattern_lifecycle_summary`
9. `pattern_maintenance_summary`

## Canonical vs Transitional Fields

The product contract now distinguishes default route surfaces from internal or introspection-only surfaces.

### Canonical Long-Term Fields

These should be treated as the long-term stable execution-memory contract:

1. `planner_packet`
2. `planning_summary`
3. `assembly_summary`
4. `execution_kernel`
5. `workflow_signals`
6. `pattern_signals`
7. `selection_summary.provenance_explanation`
8. `selection_summary.pattern_lifecycle_summary`
9. `selection_summary.pattern_maintenance_summary`
10. `learning_projection_result`

### Internal Or Introspection-Only Surfaces

These remain part of the execution-memory contract family, but they are not part of the default planner/context response surface:

1. `action_recall_packet`
2. introspection route full collections and demo text
3. layered context internals used for assembly and verification

Current rule:

1. default planner/context routes stay slim
2. heavy recall substrate and inspection output move to `POST /v1/memory/execution/introspect`
3. no default top-level packet-array mirrors are retained on planner/context routes

## Product Contract Rules

### Rule 1

`planner_packet` is the canonical planner-facing execution-memory packet.

### Rule 2

`action_recall_packet` is the canonical structured recall substrate that feeds the planner packet.

It remains part of the internal/runtime and introspection contract family, but it is no longer part of the default planner/context route surface.

### Rule 3

`execution_kernel` is a compact aligned view of the same packet state, not a separate planner model.

Current retained kernel decision:

1. the full `execution_kernel` summary family is retained as part of the stable product contract
2. it is not currently being narrowed to a smaller kernel shape
3. any future narrowing would require a versioned contract change, not an implementation cleanup

### Rule 4

`workflow_signals` and `pattern_signals` are first-class product surfaces, not debug-only details.

### Rule 5

Selector reuse must expose provenance and lifecycle in the same language family as planner-facing summaries.

### Rule 6

Replay review learning projection is part of execution-memory production and must remain contract-tested in Lite.

## Required End-To-End Contract Coverage

The stable product contract should be protected by end-to-end tests across these flows:

1. `planning_context -> planner_packet -> planning_summary -> execution_kernel`
2. `context_assemble -> planner_packet -> assembly_summary -> execution_kernel`
3. `tools_select -> decision.pattern_summary -> selection_summary.provenance_explanation`
4. `replay review -> learning_projection_result`

Current rule:

1. route tests should parse the canonical route schemas first
2. semantic assertions should then verify alignment across packet, summary, and kernel outputs
3. execution-memory producer routes should verify not only request acceptance, but actual artifact generation or governed rejection

## Product Boundary

This contract does not turn every memory surface into execution-memory product surface.

General memory still exists as substrate for:

1. rules
2. concepts
3. evidence
4. notes
5. generic supporting knowledge

But the product center is now:

1. workflow memory
2. pattern memory
3. optional rehydration
4. governed selector reuse
5. replay-driven learning projection

## Recommended Next Contract Work

The highest-value next step is not adding more execution-memory concepts.

It is tightening product stability around the current ones:

1. keep `planner_packet` as the only default full collection owner
2. keep `execution_kernel` as the compact aligned runtime owner
3. keep `action_recall_packet` aligned as an internal/introspection substrate rather than re-expanding the default route surface
4. continue strengthening end-to-end contract coverage for planner, selector, and replay-review surfaces
