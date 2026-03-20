# Aionis Lite Execution-Memory V2 Mirror Migration Sketch

Last reviewed: 2026-03-20

This document is a migration sketch for any future `Execution-Memory Product Contract v2` narrowing of planner/context packet-array mirrors.

It is not a deprecation notice.

It exists to answer one practical question in advance:

`if v2 narrows transitional mirrors, what should consumers read instead`

Primary references:

1. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
2. [docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md)
3. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
4. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)

## Status

Status:

`forward-looking migration sketch`

Current rule:

1. `v1` keeps the full current planner/context top-level shape
2. no field in this document is deprecated today
3. this sketch only defines the canonical read path if a later contract version narrows transitional mirrors

## Canonical Replacement Rule

If a future contract version narrows planner/context top-level packet-array mirrors, the canonical replacement is always:

`planner_packet.sections.*`

Current replacement map:

1. top-level `recommended_workflows` -> `planner_packet.sections.recommended_workflows`
2. top-level `candidate_workflows` -> `planner_packet.sections.candidate_workflows`
3. top-level `candidate_patterns` -> `planner_packet.sections.candidate_patterns`
4. top-level `trusted_patterns` -> `planner_packet.sections.trusted_patterns`
5. top-level `contested_patterns` -> `planner_packet.sections.contested_patterns`
6. top-level `rehydration_candidates` -> `planner_packet.sections.rehydration_candidates`

Current non-migrations:

1. top-level `supporting_knowledge`
   Reason:
   it is currently retained as a compatibility mirror
2. top-level `workflow_signals`
   Reason:
   it is already canonical
3. top-level `pattern_signals`
   Reason:
   it is already canonical
4. `execution_kernel.*_summary`
   Reason:
   it is retained as the compact aligned kernel contract

## Consumer Migration Patterns

### 1. Packet-First Reader

Recommended future read style:

1. read `planner_packet`
2. consume all workflow/pattern/rehydration arrays from `planner_packet.sections.*`
3. use top-level mirrors only as `v1` compatibility affordances

Best fit:

1. SDK wrappers
2. route adapters
3. planner-facing clients

### 2. Summary-First Reader

Recommended future read style:

1. use `planning_summary` or `assembly_summary` for compact counts and explanations
2. use `planner_packet.sections.*` for full collections
3. do not depend on top-level packet-array mirrors as the only source of collection data

Best fit:

1. dashboards
2. operator views
3. evaluation harnesses

### 3. Kernel-First Reader

Recommended future read style:

1. use `execution_kernel.*_summary` for compact aligned runtime state
2. use `planner_packet.sections.*` only when full object lists are needed

Best fit:

1. runtime consumers
2. compact telemetry surfaces
3. planner execution bridges

## Migration Example

Current `v1` convenience read:

```ts
const trustedPatterns = response.trusted_patterns;
const candidateWorkflows = response.candidate_workflows;
```

Future packet-first read:

```ts
const trustedPatterns = response.planner_packet.sections.trusted_patterns;
const candidateWorkflows = response.planner_packet.sections.candidate_workflows;
```

Current rule:

1. clients may already adopt the packet-first read style in `v1`
2. doing so reduces future migration cost
3. summary and kernel surfaces do not need to be reconstructed from mirrors

## Migration Guardrails

Any future `v2` mirror narrowing should follow these rules:

1. document the exact mirror set being narrowed before any implementation change
2. keep route-level contract tests during any overlap period
3. ensure `planner_packet.sections.*` stays byte-for-byte or semantically aligned with the outgoing mirror
4. never remove a mirror before the canonical replacement path is already stable in docs and tests

## Current Recommendation

For new consumers:

1. prefer `planner_packet.sections.*` for full workflow/pattern/rehydration collections
2. use `workflow_signals`, `pattern_signals`, and `execution_kernel.*_summary` directly where they are already canonical
3. treat top-level packet-array mirrors as `v1` convenience, not as the future-proof ownership layer
