# Aionis Lite Foundation Memory V3 Implementation Plan

Last reviewed: 2026-03-20

This document turns `V3` of the foundation memory roadmap into an implementation plan.

Primary reference:

1. [docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md](/Volumes/ziel/Aionisgo/docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md)
2. [docs/LITE_EXECUTION_MEMORY_STRATEGY.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_STRATEGY.md)
3. [docs/LITE_MEMORY_GOVERNANCE_MODEL.md](/Volumes/ziel/Aionisgo/docs/LITE_MEMORY_GOVERNANCE_MODEL.md)
4. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
5. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
6. [docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md)

## V3 Objective

Shift Lite memory evolution from:

`reuse supported by stable substrate`

to:

`governed credibility and lifecycle evolution`

This phase does not aim to create a full autonomous memory research platform.

It aims to make workflow and pattern reuse behave like governed learning, not just successful caching.

## Current Status

Status as of 2026-03-20:

`V3 active; Work Package 1, Work Package 2, Work Package 3, Work Package 4, and Work Package 5 are now in current runtime`

Already-present V3 precursor behavior:

1. `provisional -> stable` pattern promotion gate exists
2. negative feedback can demote stable patterns back to provisional
3. recall ranking already prefers stable patterns over contested ones
4. selector trust already distinguishes trusted vs contested pattern reuse
5. planner/runtime summaries already expose trusted and contested pattern state
6. planner/context routes now expose explicit lifecycle summaries for candidate/trusted/contested pattern maturity
7. planner/context and selector summaries now expose explicit low-cost maintenance summaries for execution-memory upkeep
8. stable replay workflow anchors now carry structured `workflow_promotion` metadata
9. planner/context and execution-kernel summaries now expose explicit workflow lifecycle and workflow maintenance summaries
10. replay-learning episode projection now emits first-class `workflow_candidate` memory with structured `observed_count` and `required_observations`
11. planner/context and execution-kernel workflow lifecycle summaries now expose `promotion_ready_count` for workflow candidates
12. recall ranking and planner explanation now prioritize promotion-ready workflow candidates ahead of generic candidates
13. replay-learning now auto-promotes promotion-ready workflow candidates into stable workflow anchors, and same-signature candidates are suppressed from planner-facing recall once the stable workflow exists
14. replay-learning producer now has direct contract coverage for both pre-threshold candidate output and auto-promoted stable workflow output
15. planner/context routes now expose first-class `workflow_signals` and compact `workflow_signal_summary` so stable, promotion-ready, and observing workflow maturity is visible without reconstructing it from packet sections
16. Lite now also exposes a dedicated execution-memory introspection route that aggregates workflow signals, pattern signals, and maintenance summaries into a demo-friendly surface

What is still missing is no longer basic credibility visibility, compact maintenance surfacing, or replay-origin workflow governance.

What is still missing is the broader automatic workflow-promotion path beyond existing replay promotion entrypoints, even though candidate workflows now carry governed observation strength.

Current implementation references:

1. [src/memory/replay.ts](/Volumes/ziel/Aionisgo/src/memory/replay.ts)
2. [src/memory/tools-feedback.ts](/Volumes/ziel/Aionisgo/src/memory/tools-feedback.ts)
3. [src/memory/tools-pattern-anchor.ts](/Volumes/ziel/Aionisgo/src/memory/tools-pattern-anchor.ts)
4. [src/memory/tools-select.ts](/Volumes/ziel/Aionisgo/src/memory/tools-select.ts)
5. [src/store/recall-access.ts](/Volumes/ziel/Aionisgo/src/store/recall-access.ts)
6. [src/store/lite-recall-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-recall-store.ts)
7. [src/memory/runtime-tool-hints.ts](/Volumes/ziel/Aionisgo/src/memory/runtime-tool-hints.ts)
8. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
9. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)
10. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
11. [scripts/ci/lite-tools-pattern-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-pattern-anchor.test.ts)
12. [scripts/ci/lite-replay-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-replay-anchor.test.ts)
13. [scripts/ci/lite-planning-summary.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-planning-summary.test.ts)
14. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)

## Scope

V3 covers:

1. workflow and pattern promotion hardening
2. explicit credibility-state transitions
3. counter-evidence propagation across recall, selector, and summaries
4. lifecycle-aware maintenance and importance handling
5. planner-facing visibility for credibility and lifecycle state

V3 does not cover:

1. a full multi-tier archive engine
2. a broad autonomous demotion/promotion graph service
3. large-scale LLM-owned memory mutation
4. a complete `L0-L5` research-grade memory hierarchy

## Desired End State

At the end of V3, Lite should have a governed execution-memory lifecycle where:

1. workflow and pattern promotion rules are explicit
2. credibility state changes are visible and test-backed
3. counter-evidence affects recall, selector trust, and summary surfaces consistently
4. importance and maintenance behavior support execution-memory value instead of raw memory accumulation
5. planner/runtime outputs can explain not only what was recalled, but how trustworthy and stable it is

## Work Package 1: Workflow Promotion Hardening

Goal:

Make `event -> workflow candidate -> workflow anchor` a more explicit and governed path.

### Required changes

1. define clearer promotion criteria for workflow anchors
2. distinguish provisional workflow candidates from stable workflow anchors where needed
3. keep replay promotion behavior aligned with the same stable workflow shape for both new and already-stable playbooks

### Primary files

1. [src/memory/replay.ts](/Volumes/ziel/Aionisgo/src/memory/replay.ts)
2. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)

### Output expectations

1. workflow promotion is explicit and test-backed
2. replay-origin workflow memory uses one stable recallable shape
3. workflow recall does not depend on implicit promotion assumptions
4. workflow promotion origin and stable-transition metadata are preserved in structured form
5. planner/runtime summaries expose workflow lifecycle and workflow maintenance in the same governed language family as pattern reuse
6. replay-learning-origin workflow candidates expose governed observation strength before stable promotion
7. planner/context and execution-kernel surfaces expose compact workflow signal summaries in addition to workflow lifecycle and maintenance summaries

## Work Package 2: Pattern Credibility State Machine

Goal:

Turn pattern reuse into an explicit credibility state machine rather than a thin stable/provisional check.

### Required changes

1. formalize pattern states and transitions
2. keep multi-run consistency requirements explicit
3. track promotion, demotion, and revalidation metadata in one stable contract

### Primary files

1. [src/memory/tools-pattern-anchor.ts](/Volumes/ziel/Aionisgo/src/memory/tools-pattern-anchor.ts)
2. [src/memory/schemas.ts](/Volumes/ziel/Aionisgo/src/memory/schemas.ts)
3. [src/memory/tools-feedback.ts](/Volumes/ziel/Aionisgo/src/memory/tools-feedback.ts)

### Output expectations

1. pattern credibility rules are easier to reason about than ad hoc branch logic
2. stable pattern reuse remains conservative and explainable
3. promotion history is preserved in structured form

## Work Package 3: Counter-Evidence Propagation

Goal:

Ensure negative evidence changes all runtime surfaces coherently.

### Required changes

1. keep recall ranking, selector trust, and summaries aligned with counter-evidence
2. make contested-state propagation explicit instead of incidental
3. prevent stale trusted state from surviving after meaningful negative evidence

### Primary files

1. [src/store/recall-access.ts](/Volumes/ziel/Aionisgo/src/store/recall-access.ts)
2. [src/store/lite-recall-store.ts](/Volumes/ziel/Aionisgo/src/store/lite-recall-store.ts)
3. [src/memory/tools-select.ts](/Volumes/ziel/Aionisgo/src/memory/tools-select.ts)
4. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
5. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)

### Output expectations

1. contested memory is consistently de-trusted across runtime surfaces
2. planner and selector explanations stay semantically aligned
3. counter-evidence behavior is not hidden inside one subsystem

## Work Package 4: Importance And Maintenance Model

Goal:

Introduce explicit low-cost maintenance behavior for execution-memory value.

### Required changes

1. define online lazy-update signals
2. define offline maintenance responsibilities
3. prefer execution-memory usefulness over blind retention
4. avoid expensive full rescoring in the hot path

### Primary files

1. [src/memory/tools-pattern-anchor.ts](/Volumes/ziel/Aionisgo/src/memory/tools-pattern-anchor.ts)
2. [src/memory/replay.ts](/Volumes/ziel/Aionisgo/src/memory/replay.ts)
3. [docs/LITE_EXECUTION_MEMORY_STRATEGY.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_STRATEGY.md)

### Output expectations

1. importance handling has a stable model instead of scattered counters
2. maintenance can support promotion, demotion, and retention without hot-path cost blow-up
3. lifecycle behavior remains local-runtime friendly

## Work Package 5: Planner And Selector Lifecycle Surface

Goal:

Expose lifecycle and credibility state more directly to planner/runtime consumers.

### Required changes

1. make lifecycle state more visible in planner packet and summary surfaces
2. keep selector provenance aligned with planner-side lifecycle language
3. preserve a compact contract without collapsing credibility semantics into free-form text

### Primary files

1. [src/app/planning-summary.ts](/Volumes/ziel/Aionisgo/src/app/planning-summary.ts)
2. [src/routes/memory-context-runtime.ts](/Volumes/ziel/Aionisgo/src/routes/memory-context-runtime.ts)
3. [src/memory/tools-lifecycle-summary.ts](/Volumes/ziel/Aionisgo/src/memory/tools-lifecycle-summary.ts)
4. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)

### Output expectations

1. planner/runtime can see not only recalled memory, but its trust maturity
2. lifecycle and credibility explanations stay structured
3. summary output remains product-facing, not just debugging output

## Work Package 6: Test Coverage

Goal:

Lock V3 credibility and lifecycle behavior down as a contract.

### Required changes

1. add tests for workflow promotion rules
2. add tests for pattern-state transitions and revalidation
3. add tests for counter-evidence propagation
4. add tests for planner/selector lifecycle visibility

### Primary files

1. [scripts/ci/lite-tools-pattern-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-tools-pattern-anchor.test.ts)
2. [scripts/ci/lite-replay-anchor.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-replay-anchor.test.ts)
3. [scripts/ci/lite-context-runtime-packet-contract.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-context-runtime-packet-contract.test.ts)
4. [scripts/ci/lite-planning-summary.test.ts](/Volumes/ziel/Aionisgo/scripts/ci/lite-planning-summary.test.ts)

## Recommended Delivery Order

Recommended order:

1. `Work Package 2`
2. `Work Package 3`
3. `Work Package 5`
4. `Work Package 1`
5. `Work Package 4`
6. `Work Package 6`

Reason:

1. pattern credibility is already the most mature V3 precursor and should be formalized first
2. counter-evidence propagation is the highest-value behavior risk if left partially implicit
3. planner/selector lifecycle visibility should stabilize before deeper maintenance logic
4. workflow promotion hardening can then align replay with the same governed lifecycle model
5. importance and maintenance should come after the visible credibility model is clear
6. final contract coverage should lock the full phase down

## Summary

V3 should not be treated as:

`add more memory states`

It should be treated as:

`make execution-memory trust, promotion, and lifecycle behavior explicit and governed`
