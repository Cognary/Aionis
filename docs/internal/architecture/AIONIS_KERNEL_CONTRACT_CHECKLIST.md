---
title: "Aionis Kernel Contract Checklist"
---

# Aionis Kernel Contract Checklist

Status: `active` (`2026-03-10`)  
Source spec: [/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md](/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md)

## 1. Purpose

This note is the minimum `Phase A3` checklist.

It answers three engineering questions:

1. which objects are canonical kernel objects
2. which current entrypoints are treated as stable kernel surface
3. which of those surfaces must stay represented in `src/dev/contract-smoke.ts`

This is not a full API catalog.

This is the smallest checklist needed to tell whether a change is touching kernel behavior or only host / extension packaging.

## 2. Canonical Kernel Objects

The following object families are treated as canonical kernel semantics:

1. `node`
2. `edge`
3. `commit`
4. `event`
5. `rule`
6. `decision`
7. `context`
8. `session`

Practical reading:

1. changes to shape, lifecycle, visibility, or invariants of these objects are kernel-impacting
2. changes that only alter host wiring, telemetry, admin packaging, or extension UI are not kernel changes unless they redefine one of the objects above

## 3. Minimum Stable Kernel Surface

The current minimum stable kernel surface is:

1. memory write preparation and apply
   - [/Users/lucio/Desktop/Aionis/src/memory/write.ts](/Users/lucio/Desktop/Aionis/src/memory/write.ts)
2. memory recall and recall authorization boundary
   - [/Users/lucio/Desktop/Aionis/src/memory/recall.ts](/Users/lucio/Desktop/Aionis/src/memory/recall.ts)
3. planning/context request contracts
   - [/Users/lucio/Desktop/Aionis/src/memory/schemas.ts](/Users/lucio/Desktop/Aionis/src/memory/schemas.ts)
4. rule evaluation and applied-only visibility behavior
   - [/Users/lucio/Desktop/Aionis/src/memory/rules-evaluate.ts](/Users/lucio/Desktop/Aionis/src/memory/rules-evaluate.ts)
5. tool policy selection and feedback
   - [/Users/lucio/Desktop/Aionis/src/memory/tool-selector.js](/Users/lucio/Desktop/Aionis/src/memory/tool-selector.js)
   - [/Users/lucio/Desktop/Aionis/src/memory/tool-policy.js](/Users/lucio/Desktop/Aionis/src/memory/tool-policy.js)
   - [/Users/lucio/Desktop/Aionis/src/memory/tools-feedback.js](/Users/lucio/Desktop/Aionis/src/memory/tools-feedback.js)
6. session event visibility and append guard
   - [/Users/lucio/Desktop/Aionis/src/memory/sessions.js](/Users/lucio/Desktop/Aionis/src/memory/sessions.js)
7. unified URI resolve semantics
   - [/Users/lucio/Desktop/Aionis/src/memory/resolve.js](/Users/lucio/Desktop/Aionis/src/memory/resolve.js)
8. pack import/export schema defaults
   - [/Users/lucio/Desktop/Aionis/src/memory/schemas.ts](/Users/lucio/Desktop/Aionis/src/memory/schemas.ts)
9. replay playbook read / simulate / repair-review gate semantics
   - [/Users/lucio/Desktop/Aionis/src/memory/replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts)
10. replay run lifecycle semantics
   - [/Users/lucio/Desktop/Aionis/src/memory/replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts)
11. playbook compile / promote / repair write semantics
   - [/Users/lucio/Desktop/Aionis/src/memory/replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts)

This is a minimum set, not the final complete set.

It is intentionally biased toward:

1. high-value behavior that external callers can feel
2. semantics already backed by contract smoke
3. surfaces likely to break compatibility if changed casually

## 4. Contract Smoke Requirement

The following minimum coverage must remain represented in [/Users/lucio/Desktop/Aionis/src/dev/contract-smoke.ts](/Users/lucio/Desktop/Aionis/src/dev/contract-smoke.ts):

1. `prepareMemoryWrite` and `applyMemoryWrite`
2. `memoryRecallParsed`
3. `PlanningContextRequest.parse` and `ContextAssembleRequest.parse`
4. `evaluateRules` and `evaluateRulesAppliedOnly`
5. `applyToolPolicy`, `computeEffectiveToolPolicy`, and `toolSelectionFeedback`
6. `listSessionEvents` and `writeSessionEvent`
7. `memoryResolve`
8. `MemoryPackExportRequest.parse` and `MemoryPackImportRequest.parse`
9. `replayPlaybookGet`, `replayPlaybookRun`, and `replayPlaybookRepairReview`
10. `ReplayPlaybookRunRequest.parse` and `ReplayPlaybookRepairReviewRequest.parse`
11. `replayRunStart`, `replayStepBefore`, `replayStepAfter`, `replayRunEnd`, and `replayRunGet`
12. `ReplayRunStartRequest.parse`, `ReplayStepBeforeRequest.parse`, `ReplayStepAfterRequest.parse`, `ReplayRunEndRequest.parse`, and `ReplayRunGetRequest.parse`
13. `replayPlaybookCompileFromRun`, `replayPlaybookPromote`, and `replayPlaybookRepair`
14. `ReplayPlaybookCompileRequest.parse`, `ReplayPlaybookPromoteRequest.parse`, and `ReplayPlaybookRepairRequest.parse`

Executable guard:

1. [/Users/lucio/Desktop/Aionis/scripts/ci/kernel-contract.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/kernel-contract.test.mjs)
2. `npm run -s test:kernel-contract`

## 5. Change Classification Rule

Treat a change as `kernel-impacting` if any of the following are true:

1. it changes canonical object shape or invariants
2. it changes write / recall / planning-context / resolve semantics
3. it changes rule or tool policy outcomes
4. it changes session visibility or append safety
5. it changes pack schema defaults or import/export meaning

Treat a change as `host-or-extension scoped` if it only changes:

1. route registration
2. bootstrap wiring
3. auth / quota / host telemetry plumbing
4. admin packaging
5. ops or playground surfaces

## 6. Current Deliberate Exclusions

The checklist does not yet claim full stable coverage for:

1. automation orchestration packaging
2. hosted alerting and incident control surfaces

Those surfaces remain important, but they are not yet part of the minimum machine-checked kernel contract set.

## 7. Review Use

When a PR touches one of the surfaces above, reviewers should answer:

1. is this changing kernel behavior or only packaging
2. does `test:layer:kernel` still represent the touched surface
3. if semantics changed intentionally, was the checklist or spec updated too
