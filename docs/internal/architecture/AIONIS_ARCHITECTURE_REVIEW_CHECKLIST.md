---
title: "Aionis Architecture Review Checklist"
---

# Aionis Architecture Review Checklist

Status: `active` (`2026-03-10`)

Use this checklist for PRs that touch architecture boundaries, kernel contracts, runtime host composition, or control-plane packaging.

Practice/reference drill:

1. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_DRILL.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_DRILL.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md)
3. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_REPORT_TEMPLATE.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_REPORT_TEMPLATE.md)

## 1. Layer Classification

Reviewer should confirm:

1. the PR declares one primary layer: `Kernel`, `Runtime Services`, or `Control & Extensions`
2. the stated layer matches the files actually changed
3. multi-layer changes are explicitly justified

## 2. Dependency Direction

Reviewer should confirm:

1. no reversed dependency is introduced
2. `src/memory/*` does not gain route, host, app, control-plane, or apps packaging dependencies
3. `src/app/*` stays out of `src/routes/*` and `src/host/*`
4. `src/routes/*` does not depend on `src/host/*` or other route registrars
5. `src/host/*` does not reach directly into `src/memory/*`
6. `src/control-plane.ts` does not start depending on `src/app/*`, `src/routes/*`, `src/host/*`, or `apps/*`

Machine checks:

1. `npm run -s test:dependency-direction`
2. GitHub workflow: `PR Architecture Metadata`

## 3. Kernel Contract

Reviewer should confirm:

1. the PR states whether it is `kernel-impacting` or `packaging-only`
2. if kernel-impacting, the touched surface exists in the current checklist:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md)
3. if semantics changed intentionally, the checklist/spec was updated too

Machine checks:

1. `npm run -s test:layer:kernel`
2. `npm run -s test:kernel-contract`

## 4. Verification Discipline

Reviewer should confirm:

1. the PR includes exact verification commands
2. `lint`, `build`, and docs remain green
3. the chosen tests match the claimed layer impact

Minimum expected commands for architecture-impacting work:

1. `npm run -s lint -- --no-cache`
2. `npm run -s build`
3. `npm run -s test:dependency-direction`
4. `npm run -s docs:check`

Author-side template/workflow:

1. [/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md](/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md)
2. [/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml](/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml)

## 5. Rollback Clarity

Reviewer should confirm:

1. the PR describes the smallest rollback unit
2. runtime-host touching changes identify the affected host/route module
3. kernel-touching changes identify the affected semantic surface

## 6. Review Order

Review in this order:

1. layer placement
2. dependency direction
3. kernel contract impact
4. behavior and regression risk
5. tests and docs
