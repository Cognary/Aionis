# Aionis Lite Foundation Memory Upgrade Roadmap

Last reviewed: 2026-03-20

This document turns the current `Aionis Lite` memory direction into an execution roadmap.

It does not propose replacing general memory with pure execution memory.

It proposes:

`General Memory substrate + Execution-Memory-first runtime`

That means:

1. general memory remains part of Lite
2. execution memory becomes the default runtime center
3. writing, recall, and context assembly should prefer reusable action structure over generic semantic accumulation

## Goal

Upgrade the Lite memory foundation from:

`general memory runtime with execution-memory extensions`

to:

`execution-memory-first runtime built on a general memory substrate`

## Core Principle

Lite should still retain:

1. facts
2. entities
3. rules
4. evidence
5. ordinary context and notes

But the default planner-facing path should prioritize:

1. workflow anchors
2. stable pattern anchors
3. trusted decision provenance
4. rehydration candidates

General memory should support execution memory.
It should not compete with it for the center of the runtime.

## Non-Goals

This roadmap does not aim to:

1. remove general memory from Lite
2. rebuild the storage layer from scratch
3. introduce a full dynamic-memory research platform in one step
4. add a large multi-level lifecycle engine before the core runtime shifts are complete
5. turn Lite into a control-plane or multi-tenant memory product

## Current Problem Statement

Lite already has strong execution-memory mainlines:

1. `Anchor-Guided Rehydration Loop`
2. `Execution Policy Learning Loop`

But the foundation below those loops is still relatively general-purpose.

In practice, that means:

1. execution semantics still live too often in flexible `slots`
2. recall is still partly organized around generic relevance instead of action usefulness
3. context assembly still behaves more like broad context packing than planner packet construction

The result is not that Lite memory is broken.

The result is that the strongest product direction in Lite has outgrown the default organization of the foundation beneath it.

## Upgrade Sequence

The recommended upgrade order is:

1. `V1` shift recall and context to execution-memory-first behavior
2. `V2` harden write-side execution-native schema and store paths
3. `V3` deepen promotion, credibility, and lifecycle behavior

This order is intentional.

It first improves runtime behavior that users and agents feel directly, then hardens the underlying substrate, then expands evolution logic.

## Current Roadmap Status

Status as of 2026-03-20:

1. `V1` is implemented as the current runtime baseline
2. `V2` is now the active substrate baseline for execution-native write, recall, context, and planner/context route contract hardening
3. `V3` is now active in the current runtime for pattern credibility, counter-evidence propagation, planner/selector lifecycle summaries, low-cost maintenance summaries, workflow-maintenance hardening, and replay-learning workflow-candidate observation governance

Current `V1` contract reference:

1. [docs/LITE_FOUNDATION_MEMORY_V1_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V1_IMPLEMENTATION_PLAN.md)
2. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)

Current `V2` implementation plan:

1. [docs/LITE_FOUNDATION_MEMORY_V2_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V2_IMPLEMENTATION_PLAN.md)
2. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)

Current `V3` implementation plan:

1. [docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md)
2. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
3. [docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md)

Current `V3` active slice reference:

1. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
2. [src/memory/tools-pattern-anchor.ts](/Volumes/ziel/Aionisgo/src/memory/tools-pattern-anchor.ts)
3. [src/memory/tools-feedback.ts](/Volumes/ziel/Aionisgo/src/memory/tools-feedback.ts)
4. [src/memory/tools-select.ts](/Volumes/ziel/Aionisgo/src/memory/tools-select.ts)
5. [src/memory/replay.ts](/Volumes/ziel/Aionisgo/src/memory/replay.ts)
6. [src/memory/recall.ts](/Volumes/ziel/Aionisgo/src/memory/recall.ts)
7. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
8. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
9. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)
10. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
11. [scripts/ci/lite-tools-pattern-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-pattern-anchor.test.ts)
12. [scripts/ci/lite-replay-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-replay-anchor.test.ts)
13. [scripts/ci/lite-planning-summary.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-planning-summary.test.ts)
14. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)

Current `V2` active slice reference:

1. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
2. [src/memory/write.ts](/Volumes/ziel/Aionisgo/src/memory/write.ts)
3. [src/memory/write-distillation.ts](/Volumes/ziel/Aionisgo/src/memory/write-distillation.ts)
4. [src/store/lite-write-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-write-store.ts)
5. [src/memory/recall.ts](/Volumes/ziel/Aionisgo/src/memory/recall.ts)
6. [src/store/recall-access.ts](/Volumes/ziel/Aionisgo/src/store/recall-access.ts)
7. [src/store/lite-recall-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-recall-store.ts)
8. [src/memory/runtime-tool-hints.ts](/Volumes/ziel/Aionisgo/src/memory/runtime-tool-hints.ts)
9. [src/memory/context.ts](/Volumes/ziel/Aionisgo/src/memory/context.ts)
10. [scripts/ci/lite-execution-native-write-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-execution-native-write-contract.test.ts)
11. [scripts/ci/lite-replay-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-replay-anchor.test.ts)
12. [scripts/ci/lite-runtime-tool-hints.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-runtime-tool-hints.test.ts)
13. [scripts/ci/lite-context-build.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-build.test.ts)

## V1: Recall And Context Upgrade

Primary goal:

Make Lite planning and runtime assembly default to action-oriented memory retrieval.

### What changes

1. split recall into `action recall` and `knowledge recall`
2. make `action recall` first-class in planning paths
3. make context assembly emit a planner packet instead of a broad context dump
4. move general memory into a clearly supporting role for planner/runtime outputs

### Target output shape

Planner-facing context should stabilize around these sections:

1. `recommended_workflows`
2. `trusted_patterns`
3. `contested_patterns`
4. `rehydration_candidates`
5. `supporting_knowledge`

### Key code areas

1. [recall.ts](/Volumes/ziel/Aionisgo/src/memory/recall.ts)
2. [lite-recall-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-recall-store.ts)
3. [recall-access.ts](/Volumes/ziel/Aionisgo/src/store/recall-access.ts)
4. [context.ts](/Volumes/ziel/Aionisgo/src/memory/context.ts)
5. [context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
6. [planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
7. [memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)

### Exit criteria

1. planning paths explicitly prefer workflow and stable pattern anchors
2. supporting knowledge is present but structurally secondary
3. context responses carry stable planner-facing sections rather than only mixed layered content
4. planner summary can explain which workflow/pattern guidance was used and why

Detailed implementation plan:

1. [docs/LITE_FOUNDATION_MEMORY_V1_IMPLEMENTATION_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_V1_IMPLEMENTATION_PLAN.md)

## V2: Write And Store Upgrade

Primary goal:

Make execution-native objects first-class on the write side instead of relying mainly on later interpretation.

### What changes

1. harden the stable write contract for execution-native objects
2. distinguish general-memory fields from execution-memory fields
3. add execution-first query/index paths in Lite store behavior
4. reduce dependence on loose post-hoc parsing for core runtime paths

### Execution-native fields to stabilize

1. `task_signature`
2. `error_signature`
3. `workflow_signature`
4. `anchor_kind`
5. `anchor_level`
6. `pattern_state`
7. `promotion`
8. `rehydration`

### Key code areas

1. [schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
2. [write.ts](/Volumes/ziel/Aionisgo/src/memory/write.ts)
3. [write-distillation.ts](/Volumes/ziel/Aionisgo/src/memory/write-distillation.ts)
4. [lite-write-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-write-store.ts)

### Exit criteria

1. execution-native nodes and decisions have a more stable write contract
2. Lite store paths expose clearer execution-first retrieval helpers
3. recall, context packing, and runtime hints no longer depend on ad hoc slot inspection for their primary semantics
4. anchor and pattern retrieval become cheaper to express and reason about

## V3: Promotion And Credibility Upgrade

Primary goal:

Turn reuse from a storage effect into a governed learning effect.

### What changes

1. strengthen `event -> workflow candidate -> workflow anchor`
2. strengthen `feedback -> provisional pattern -> stable pattern`
3. deepen negative-feedback-driven demotion and revocation
4. unify recall ranking, selector trust, and summary outputs around credibility state
5. add low-cost importance maintenance that favors execution-memory value

### Key code areas

1. [replay.ts](/Volumes/ziel/Aionisgo/src/memory/replay.ts)
2. [tools-feedback.ts](/Volumes/ziel/Aionisgo/src/memory/tools-feedback.ts)
3. [tools-pattern-anchor.ts](/Volumes/ziel/Aionisgo/src/memory/tools-pattern-anchor.ts)
4. [governance.ts](/Volumes/ziel/Aionisgo/src/memory/governance.ts)
5. [runtime-tool-hints.ts](/Volumes/ziel/Aionisgo/src/memory/runtime-tool-hints.ts)

### Exit criteria

1. workflow and pattern promotion rules are explicit and test-backed
2. counter-evidence reliably changes recall and selector trust
3. stable patterns behave like governed reusable policy memory, not like raw success cache
4. lifecycle outputs are visible in planner/runtime summaries
5. low-cost maintenance outputs are visible in planner/runtime and selector summaries
6. stable workflow anchors expose the same governed maintenance shape as pattern anchors

## Recommended Delivery Order

If only one phase can be executed at a time, use this order:

1. `V1`
2. `V2`
3. `V3`

Reason:

1. `V1` improves runtime behavior immediately
2. `V2` hardens the substrate after the runtime shape is clearer
3. `V3` is most valuable once recall, context, and writes already reflect the intended architecture

## Metrics

The roadmap should be judged by runtime value, not by memory volume.

Recommended metrics:

1. workflow anchor hit rate
2. stable pattern reuse rate
3. contested pattern suppression rate
4. rehydration precision
5. repeat-task cost reduction
6. planner packet usefulness

Avoid evaluating success mainly through:

1. node count growth
2. payload size growth
3. generic storage accumulation

## Final Summary

The intended end state is not:

`remove general memory`

The intended end state is:

`keep general memory as substrate, but make Lite execution-memory-first by default`

That is the clearest path to a Lite runtime that remains flexible enough to store general context while becoming much better at helping agents remember how work gets done.
