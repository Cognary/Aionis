# Aionis Lite Foundation Memory V1 Implementation Plan

Last reviewed: 2026-03-20

This document turns `V1` of the foundation memory roadmap into an implementation plan.

Primary reference:

1. [docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md)
2. [docs/LITE_EXECUTION_MEMORY_STRATEGY.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_STRATEGY.md)
3. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)

## V1 Objective

Shift Lite planning and runtime assembly from:

`general relevance first`

to:

`execution-memory-first recall and context`

This phase does not redesign the whole storage layer.

It changes runtime behavior first.

## Current Status

Status as of 2026-03-20:

`V1 mainline implemented`

Completed work packages:

1. `Work Package 1: Recall Split`
2. `Work Package 2: Anchor-First Planning Path`
3. `Work Package 3: Planner Packet Assembly`
4. `Work Package 4: Summary And Explanation Surface`
5. `Work Package 5: Test Coverage`

Current implementation references:

1. [src/memory/recall.ts](/Volumes/ziel/Aionisgo/src/memory/recall.ts)
2. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
3. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
4. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
5. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)
6. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)

Current contract references:

1. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)

Residual follow-up:

1. `V1` should now be treated as the active runtime baseline, not as an open design sketch
2. deeper write-schema cleanup, query/index reshaping, and lifecycle deepening remain `V2` and `V3` work

## Scope

V1 covers:

1. recall behavior
2. context assembly behavior
3. planner-facing output structure
4. summary and explanation surfaces

V1 does not cover:

1. write-schema redesign
2. new storage tables
3. full lifecycle promotion refactor
4. deep archive-tier changes

## Desired End State

At the end of V1, a planner-facing Lite request should naturally produce:

1. `recommended_workflows`
2. `trusted_patterns`
3. `contested_patterns`
4. `rehydration_candidates`
5. `supporting_knowledge`

The first four should be execution-memory-first sections.

`supporting_knowledge` should still exist, but it should stop dominating the packet.

## Work Package 1: Recall Split

Goal:

Introduce an explicit internal split between action recall and knowledge recall.

### Required changes

1. define a stable internal distinction between:
   1. `action recall`
   2. `knowledge recall`
2. classify anchors and decision-memory objects into the action-recall path
3. classify general `rule / evidence / concept / topic` items into the knowledge-recall path
4. ensure planning routes run action recall first

### Primary files

1. [src/memory/recall.ts](/Volumes/ziel/Aionisgo/src/memory/recall.ts)
2. [src/store/recall-access.ts](/Volumes/ziel/Aionisgo/src/store/recall-access.ts)
3. [src/store/lite-recall-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-recall-store.ts)

### Output expectations

1. recall code can explain whether an item was selected as action memory or supporting knowledge
2. workflow anchors and stable patterns are no longer just “relevant nodes”; they are first-class action-memory candidates

## Work Package 2: Anchor-First Planning Path

Goal:

Make planning-oriented routes prefer action-oriented seeds before broad semantic support material.

### Required changes

1. planning paths should prioritize:
   1. workflow anchors
   2. stable pattern anchors
   3. trusted decision provenance
2. contested pattern anchors should remain visible but clearly non-authoritative
3. broad semantic support should be appended after the action-memory packet is built

### Primary files

1. [src/memory/recall.ts](/Volumes/ziel/Aionisgo/src/memory/recall.ts)
2. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
3. [src/memory/runtime-tool-hints.ts](/Volumes/ziel/Aionisgo/src/memory/runtime-tool-hints.ts)

### Output expectations

1. planning recall responses expose clear action-memory priority
2. stable workflows and trusted patterns appear before supporting knowledge in planner-facing structures

## Work Package 3: Planner Packet Assembly

Goal:

Turn context assembly into a stable planner packet instead of a mixed bag of useful items.

### Required changes

1. add or stabilize these top-level planner packet sections:
   1. `recommended_workflows`
   2. `trusted_patterns`
   3. `contested_patterns`
   4. `rehydration_candidates`
   5. `supporting_knowledge`
2. map current layered context into these packet sections
3. keep existing layered structures where needed, but make the planner packet the intended primary surface

### Primary files

1. [src/memory/context.ts](/Volumes/ziel/Aionisgo/src/memory/context.ts)
2. [src/memory/context-orchestrator.ts](/Volumes/ziel/Aionisgo/src/memory/context-orchestrator.ts)
3. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)

### Output expectations

1. planner-facing consumers no longer need to infer packet structure from mixed context layers
2. rehydration candidates are clearly distinct from workflow guidance and pattern guidance
3. `planning_context` and `context_assemble` return the packet sections as first-class top-level fields, not only as layered-context internals
4. a stable `planner_packet` object is available for planner-facing natural-language and structured consumers

## Work Package 4: Summary And Explanation Surface

Goal:

Make the packet explain itself.

### Required changes

1. summary output should say:
   1. which workflow guidance is present
   2. which trusted patterns influenced ranking
   3. which contested patterns were visible but not trusted
   4. whether rehydration is recommended
2. planner-facing explanation should become a stable contract, not a best-effort string

### Primary files

1. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
2. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)
3. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)

### Output expectations

1. summary fields and explanation strings agree with the structured packet
2. planner-facing explanation can be consumed without re-deriving provenance from raw fields
3. selector-facing summaries should use the same provenance language family as planner-facing summaries

## Work Package 5: Test Coverage

Goal:

Lock the new runtime behavior down as contract, not aspiration.

### Required changes

1. add planner-packet tests for:
   1. action recall preferred over supporting knowledge
   2. workflow anchors visible in `recommended_workflows`
   3. stable patterns visible in `trusted_patterns`
   4. contested patterns visible in `contested_patterns`
   5. rehydration hints visible in `rehydration_candidates`
2. add summary tests for planner explanations and packet consistency

### Primary files

1. [scripts/ci/lite-runtime-tool-hints.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-runtime-tool-hints.test.ts)
2. [scripts/ci/lite-planning-summary.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-planning-summary.test.ts)
3. new packet-oriented tests under [scripts/ci](/Volumes/ziel/Aionisgo/scripts/ci)

## Recommended Delivery Order

Implement V1 in this order:

1. Work Package 1
2. Work Package 2
3. Work Package 3
4. Work Package 4
5. Work Package 5

Reason:

1. recall semantics should be defined before packet assembly
2. packet assembly should be stable before summary text is finalized
3. tests should lock the intended behavior after the packet shape is real

## Acceptance Criteria

V1 should be considered complete when all of the following are true:

1. planning paths explicitly prioritize action-memory objects over generic support material
2. planner-facing outputs expose stable execution-memory-first sections
3. workflow, pattern, and rehydration guidance are structurally separated
4. supporting knowledge remains present but secondary
5. planner explanation and structured packet agree
6. selector summary provenance language agrees with trusted/contested pattern behavior
7. new behavior is covered by CI tests

## Out Of Scope Until V2

Do not pull these into V1:

1. execution-native schema redesign
2. query/index substrate redesign
3. major `slots` decomposition work
4. write-side object model cleanup

Those belong in `V2`.

## Summary

`V1` is the runtime-behavior phase.

It should make Lite feel execution-memory-first before deeper storage and lifecycle upgrades begin.
