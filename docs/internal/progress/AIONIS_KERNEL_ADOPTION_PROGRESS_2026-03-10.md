---
title: "Aionis Kernel Adoption Progress"
---

# Aionis Kernel Adoption Progress

Date: `2026-03-10`
Source plan: [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md)

## Summary

The architecture adoption has moved from planning into active convergence.

Current state:

1. `Phase A1` runtime host convergence is effectively complete.
2. `Phase A2` dependency direction enforcement has started with executable guardrails.
3. `Phase A3` kernel contract hardening has started with a minimum checklist and executable smoke-presence guard.
4. `Phase A4` test layering now has runnable entrypoints instead of only documented intent.
5. `Phase A5` release discipline now has author template, reviewer checklist, and PR metadata workflow gate.

## What Landed

### Runtime host convergence

1. `src/index.ts` was reduced from multi-thousand-line mixed runtime/business logic to a thin bootstrap entrypoint.
2. host-facing modules were extracted into:
   - [/Users/lucio/Desktop/Aionis/src/host/http-host.ts](/Users/lucio/Desktop/Aionis/src/host/http-host.ts)
   - [/Users/lucio/Desktop/Aionis/src/host/bootstrap.ts](/Users/lucio/Desktop/Aionis/src/host/bootstrap.ts)
3. route families were moved behind dedicated registrars under `src/routes/*`.
4. runtime helper clusters were moved into `src/app/*`.

Reference sizes at this checkpoint:

1. [/Users/lucio/Desktop/Aionis/src/index.ts](/Users/lucio/Desktop/Aionis/src/index.ts): `266` lines
2. [/Users/lucio/Desktop/Aionis/src/host/http-host.ts](/Users/lucio/Desktop/Aionis/src/host/http-host.ts): `567` lines
3. [/Users/lucio/Desktop/Aionis/src/host/bootstrap.ts](/Users/lucio/Desktop/Aionis/src/host/bootstrap.ts): `51` lines

### Dependency direction

1. executable guardrail added:
   - [/Users/lucio/Desktop/Aionis/scripts/ci/dependency-direction.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/dependency-direction.test.mjs)
2. current hard rules enforced:
   - `src/memory/*` must not import `src/routes/*`
   - `src/memory/*` must not import `src/app/*`
   - `src/memory/*` must not import `src/control-plane.ts`
   - `src/memory/*` must not import `apps/*`
   - `src/app/*` must not import `src/routes/*`
   - `src/app/*` must not import `src/host/*`
   - `src/routes/*` must not import `src/host/*`
   - `src/routes/*` must not import other `src/routes/*` registrars
   - `src/host/*` must not import `src/memory/*`
   - `src/host/*` must not import `apps/*`
   - `src/control-plane.ts` must not import `src/app/*`
   - `src/control-plane.ts` must not import `src/routes/*`
   - `src/control-plane.ts` must not import `src/host/*`
   - `src/control-plane.ts` must not import `apps/*`
3. `src/app/http-host.ts` and `src/app/bootstrap.ts` were reclassified into `src/host/*` so the rule can stay hard without exceptions.

### Test layering

1. layer entrypoints added in [/Users/lucio/Desktop/Aionis/package.json](/Users/lucio/Desktop/Aionis/package.json):
   - `test:layer:kernel`
   - `test:layer:runtime-host`
   - `test:layer:control`
   - `test:layers`
   - `test:dependency-direction`
2. current layer mapping documented in:
   - [/Users/lucio/Desktop/Aionis/docs/internal/testing/AIONIS_TEST_LAYERING.md](/Users/lucio/Desktop/Aionis/docs/internal/testing/AIONIS_TEST_LAYERING.md)

### Kernel contract hardening

1. minimum checklist added:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md)
2. executable smoke-presence guard added:
   - [/Users/lucio/Desktop/Aionis/scripts/ci/kernel-contract.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/kernel-contract.test.mjs)
3. kernel layer test entrypoint now runs:
   - `test:contract`
   - `test:kernel-contract`
4. minimum replay contract now included for:
   - `replayPlaybookCompileFromRun`
   - `replayPlaybookGet`
   - `replayPlaybookPromote`
   - `replayPlaybookRepair`
   - `replayPlaybookRun` (`simulate`, no write recording)
   - `replayPlaybookRepairReview` pre-write gate semantics
   - `replayRunStart`
   - `replayStepBefore`
   - `replayStepAfter`
   - `replayRunEnd`
   - `replayRunGet`

### Release discipline

1. PR template added:
   - [/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md](/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md)
2. reviewer checklist added:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md)
3. PR workflow added:
   - [/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml](/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml)
4. template now asks for:
   - primary architecture layer
   - dependency/boundary impact
   - kernel-impacting vs packaging-only classification
   - rollback surface
5. architecture PR drill added:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_DRILL.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_DRILL.md)
6. PR template contract is now test-covered through:
   - `npm run -s test:pr-architecture-metadata`
7. workflow cost evaluation pack added:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md)
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_COST_LOG_TEMPLATE.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_COST_LOG_TEMPLATE.md)
8. final report template added:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_REPORT_TEMPLATE.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_REPORT_TEMPLATE.md)

## Verification At This Checkpoint

The following passed at this checkpoint:

1. `npm run -s lint -- --no-cache`
2. `npm run -s build`
3. `npm run -s test:contract`
4. `npm run -s test:layers`
5. `npm run -s test:dependency-direction`
6. `npm run -s docs:check`

## Next Moves

Recommended next steps:

1. expand machine-checked boundaries only after the target module family is already stable
2. keep Phase A5 focused on release discipline rather than new structure churn
3. only strengthen PR metadata checks when the template fields are already part of normal author workflow

Related checkpoint:

1. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_KERNEL_ADOPTION_PHASE_STATUS_2026-03-10.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_KERNEL_ADOPTION_PHASE_STATUS_2026-03-10.md)
