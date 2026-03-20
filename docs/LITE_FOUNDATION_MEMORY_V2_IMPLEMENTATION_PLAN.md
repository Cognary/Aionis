# Aionis Lite Foundation Memory V2 Implementation Plan

Last reviewed: 2026-03-20

This document turns `V2` of the foundation memory roadmap into an implementation plan.

Primary reference:

1. [docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md)
2. [docs/LITE_EXECUTION_MEMORY_STRATEGY.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_STRATEGY.md)
3. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
4. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)

## V2 Objective

Shift Lite memory substrate from:

`execution semantics recoverable from flexible slots`

to:

`execution-native write, recall, and context substrate`

This phase does not aim to finish lifecycle learning.

It makes execution-native semantics first-class beneath the runtime surface that `V1` already stabilized.

## Current Status

Status as of 2026-03-20:

`V2 mainline implemented; execution-native substrate is the current baseline`

Completed or active work packages:

1. `Work Package 1: Execution-Native Write Contract`
2. `Work Package 2: Execution-First Store Query Paths`
3. `Work Package 3: Recall And Runtime-Hint Consumption`
4. `Work Package 4: Context Structure Propagation`
5. `Work Package 5: Query/Route Contract Consolidation`
6. `Work Package 6: Test Coverage`

Remaining work packages:

1. none at the implementation-plan level; future follow-on work moves into `V3`

Current documentation-finalization references:

1. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
2. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
3. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)

Completion note:

1. the execution-native write contract is live
2. the execution-native recall/context/runtime-hint substrate is live
3. planner/context route schemas now formalize the stable response contract
4. further credibility and lifecycle deepening should now be tracked as `V3`, not as unfinished `V2`

Current implementation references:

1. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
2. [src/memory/write.ts](/Volumes/ziel/Aionisgo/src/memory/write.ts)
3. [src/memory/write-distillation.ts](/Volumes/ziel/Aionisgo/src/memory/write-distillation.ts)
4. [src/store/lite-write-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-write-store.ts)
5. [src/memory/recall.ts](/Volumes/ziel/Aionisgo/src/memory/recall.ts)
6. [src/store/recall-access.ts](/Volumes/ziel/Aionisgo/src/store/recall-access.ts)
7. [src/store/lite-recall-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-recall-store.ts)
8. [src/memory/runtime-tool-hints.ts](/Volumes/ziel/Aionisgo/src/memory/runtime-tool-hints.ts)
9. [src/memory/context.ts](/Volumes/ziel/Aionisgo/src/memory/context.ts)
10. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
11. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
12. [scripts/ci/lite-execution-native-write-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-execution-native-write-contract.test.ts)
13. [scripts/ci/lite-replay-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-replay-anchor.test.ts)
14. [scripts/ci/lite-runtime-tool-hints.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-runtime-tool-hints.test.ts)
15. [scripts/ci/lite-context-build.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-build.test.ts)
16. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)

## Scope

V2 covers:

1. execution-native write normalization
2. execution-first store query helpers
3. execution-native-aware recall ranking and action-memory classification
4. execution-native-aware context packing and citation/item surfacing
5. contract tests for these substrate semantics

V2 does not cover:

1. full lifecycle promotion redesign
2. multi-tier archive orchestration
3. LLM adjudication policy evolution
4. full `slots` decomposition into new storage tables

## Desired End State

At the end of V2, Lite should have a substrate where:

1. execution-native objects are written through a stable contract
2. execution-native fields can be queried without general slot inspection
3. recall/runtime logic can identify workflow and pattern memory without depending solely on `anchor_v1`
4. context items and citations can preserve execution-memory classification directly
5. planner/context surfaces are still `V1`-stable, but now sit on a cleaner execution-native base

## Work Package 1: Execution-Native Write Contract

Goal:

Make execution-native metadata a formal write contract rather than a loose derived convention.

### Required changes

1. define `execution_native_v1`
2. normalize anchor and distillation writes onto it
3. preserve key fields such as:
   1. `execution_kind`
   2. `summary_kind`
   3. `compression_layer`
   4. `task_signature`
   5. `error_signature`
   6. `workflow_signature`
   7. `anchor_kind`
   8. `anchor_level`
   9. `pattern_state`
   10. `promotion`
   11. `rehydration`

### Primary files

1. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
2. [src/memory/write.ts](/Volumes/ziel/Aionisgo/src/memory/write.ts)
3. [src/memory/write-distillation.ts](/Volumes/ziel/Aionisgo/src/memory/write-distillation.ts)

### Output expectations

1. execution-native nodes are durable and queryable after write
2. distilled facts can carry machine-usable signature fields
3. write-side execution semantics are no longer recoverable only from ad hoc slot interpretation

## Work Package 2: Execution-First Store Query Paths

Goal:

Add a Lite-native query path for execution-native objects.

### Required changes

1. add execution-first node query helpers
2. filter by fields such as:
   1. `execution_kind`
   2. `anchor_kind`
   3. `pattern_state`
   4. `task_signature`
   5. `error_signature`
   6. `workflow_signature`
   7. `compression_layer`
3. keep visibility semantics identical to normal Lite memory access

### Primary files

1. [src/store/lite-write-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-write-store.ts)

### Output expectations

1. execution-native queries become explicit and readable
2. downstream runtime code can stop reaching into general node scans for core workflow/pattern lookups

## Work Package 3: Recall And Runtime-Hint Consumption

Goal:

Make recall and runtime hints consume execution-native semantics directly.

### Required changes

1. prefer `execution_native_v1` when identifying:
   1. workflow anchors
   2. pattern anchors
   3. trust state
   4. promotion state
   5. selected tool
2. keep `anchor_v1` where rehydration payload hints still require it
3. allow execution-native workflow procedures into action recall even when `anchor_v1` is absent

### Primary files

1. [src/memory/recall.ts](/Volumes/ziel/Aionisgo/src/memory/recall.ts)
2. [src/store/recall-access.ts](/Volumes/ziel/Aionisgo/src/store/recall-access.ts)
3. [src/store/lite-recall-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-recall-store.ts)
4. [src/memory/runtime-tool-hints.ts](/Volumes/ziel/Aionisgo/src/memory/runtime-tool-hints.ts)

### Output expectations

1. action-memory recognition no longer depends solely on `anchor_v1`
2. trust/ranking semantics can follow execution-native state
3. runtime hints stay aligned with execution-native pattern credibility

## Work Package 4: Context Structure Propagation

Goal:

Push execution-native semantics into lower-level context structures, not only planner packet summaries.

### Required changes

1. make `buildContext()` prefer execution-native workflow procedures in topic/context packing
2. expose execution-native classification on:
   1. `context.items`
   2. `context.citations`
3. let supporting event/evidence text surface `summary_kind`, `execution_kind`, and `compression_layer`

### Primary files

1. [src/memory/context.ts](/Volumes/ziel/Aionisgo/src/memory/context.ts)

### Output expectations

1. lower-level context output can distinguish action memory from supporting knowledge without slot re-parsing
2. citations preserve execution-memory classification instead of only raw provenance

## Work Package 5: Query/Route Contract Consolidation

Goal:

Make execution-native substrate semantics more visible at route level and reduce duplication between helper layers and route surfaces.

### Required changes

1. review whether route-level responses should expose more direct execution-native contract fields
2. reduce repeated helper logic where route assembly re-derives semantics already available in execution-native form
3. preserve existing public route compatibility while making execution-native fields easier to consume
4. unify `planner_packet`, top-level planner arrays, `pattern_signals`, and `execution_kernel` summaries around a single extracted planner surface

### Primary files

1. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
2. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)

### Output expectations

1. route-level planner/context responses stop re-deriving packet sections independently
2. `planner_packet`, top-level `recommended_workflows/trusted_patterns/contested_patterns/rehydration_candidates/supporting_knowledge`, and top-level `pattern_signals` come from one extracted surface
3. `execution_kernel.action_packet_summary` and `execution_kernel.pattern_signal_summary` stay aligned with the same extracted planner surface
4. stable route-response schemas exist for `planning_context` and `context_assemble`, so packet/kernel/summary contract checks do not rely only on ad hoc test assertions

## Work Package 6: Test Coverage

Goal:

Lock execution-native substrate behavior down as contract.

### Required changes

1. add write-contract tests
2. add recall tests for execution-native workflow recognition without `anchor_v1`
3. add runtime-hint tests for execution-native trust precedence
4. add context-build tests for execution-native item/citation propagation

### Primary files

1. [scripts/ci/lite-execution-native-write-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-execution-native-write-contract.test.ts)
2. [scripts/ci/lite-replay-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-replay-anchor.test.ts)
3. [scripts/ci/lite-runtime-tool-hints.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-runtime-tool-hints.test.ts)
4. [scripts/ci/lite-context-build.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-build.test.ts)

## Work Package 7: Documentation And Contract Finalization

Goal:

Keep Lite's written contract aligned with the substrate actually running in code.

### Required changes

1. update planner/context contract docs when execution-native shape changes
2. update roadmap status as each V2 slice lands
3. keep README and API capability docs aligned with the runtime baseline

### Primary files

1. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
2. [docs/LITE_API_CAPABILITY_MATRIX.md](/Volumes/ziel/Aionisgo/docs/LITE_API_CAPABILITY_MATRIX.md)
3. [docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md)
4. [README.md](/Volumes/ziel/Aionisgo/README.md)

## Recommended Delivery Order

Implement or finish V2 in this order:

1. Work Package 1
2. Work Package 2
3. Work Package 3
4. Work Package 4
5. Work Package 6
6. Work Package 5
7. Work Package 7

Reason:

1. substrate semantics should stabilize before route cleanup
2. route cleanup is safer after tests lock the substrate down
3. docs should reflect the actual post-test runtime baseline

## Acceptance Criteria

V2 should be considered complete when all of the following are true:

1. execution-native semantics are written through one stable contract
2. Lite store exposes clear execution-first query helpers
3. recall and runtime hints identify workflow/pattern memory from execution-native semantics directly
4. context items and citations carry execution-native classification without slot re-parsing
5. contract tests cover write, recall, runtime-hint, and context propagation behavior
6. route and planner contracts describe the same execution-native substrate that the runtime actually uses

## Out Of Scope Until V3

Do not pull these into V2:

1. stable pattern policy derivation beyond current selector reuse
2. full semantic forgetting lifecycle
3. broad archive-tier orchestration
4. governed promotion/demotion redesign beyond current anchor/pattern runtime state

Those belong in `V3`.

## Summary

`V2` is the phase where Lite stops merely having execution-memory features and starts building an execution-native substrate beneath them.
