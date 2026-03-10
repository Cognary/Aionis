---
title: "Aionis Kernel Adoption Phase Status"
---

# Aionis Kernel Adoption Phase Status

Date: `2026-03-10`  
Source plan: [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md)

## Summary

This note records the current phase-by-phase status of the kernel architecture adoption.

Use it as the checkpoint document for:

1. what is already converged
2. what is partially landed but still open
3. what remains before the plan can be considered operationally complete

## Phase Status

### Phase A0: Architecture Adoption Freeze

Status: `completed`

Evidence:

1. positioning doc exists:
   - [/Users/lucio/Desktop/Aionis/docs/AIONIS_RUNTIME_KERNEL_POSITIONING.md](/Users/lucio/Desktop/Aionis/docs/AIONIS_RUNTIME_KERNEL_POSITIONING.md)
2. engineering spec exists:
   - [/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md](/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md)
3. adoption plan exists:
   - [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md)

Residual risk:

1. vocabulary can still drift in future PRs if review discipline weakens

### Phase A1: Runtime Host Convergence

Status: `completed`

Evidence:

1. [/Users/lucio/Desktop/Aionis/src/index.ts](/Users/lucio/Desktop/Aionis/src/index.ts) is now a thin bootstrap entrypoint
2. host concerns live in:
   - [/Users/lucio/Desktop/Aionis/src/host/http-host.ts](/Users/lucio/Desktop/Aionis/src/host/http-host.ts)
   - [/Users/lucio/Desktop/Aionis/src/host/bootstrap.ts](/Users/lucio/Desktop/Aionis/src/host/bootstrap.ts)
3. route families are isolated under:
   - [/Users/lucio/Desktop/Aionis/src/routes](/Users/lucio/Desktop/Aionis/src/routes)

Residual risk:

1. future feature work could re-inflate host files if registrar boundaries are not maintained

### Phase A2: Dependency Direction Enforcement

Status: `in_progress`

What is landed:

1. executable dependency-direction checks exist:
   - [/Users/lucio/Desktop/Aionis/scripts/ci/dependency-direction.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/dependency-direction.test.mjs)
2. enforced boundaries now cover:
   - `memory -> !routes/app/control-plane/apps`
   - `app -> !routes/host`
   - `routes -> !host/other routes`
   - `host -> !memory/apps`
   - `control-plane -> !app/routes/host/apps`

What remains:

1. keep extending rules only after the target module family is already stable
2. watch for cross-layer helper creep that may require explicit injected interfaces

### Phase A3: Kernel Contract Hardening

Status: `in_progress`

What is landed:

1. minimum kernel contract checklist exists:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md)
2. executable smoke-presence guard exists:
   - [/Users/lucio/Desktop/Aionis/scripts/ci/kernel-contract.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/kernel-contract.test.mjs)
3. current contract set covers:
   - write / recall / planning-context / resolve
   - rule and tool policy surfaces
   - replay run lifecycle
   - replay playbook read / simulate / repair-review gate
   - replay compile / promote / repair write flows

What remains:

1. expand only when a new surface is important enough to be treated as stable kernel behavior
2. avoid adding noisy or low-signal contract claims just to increase checklist size

### Phase A4: Test Layering

Status: `in_progress`

What is landed:

1. layer entrypoints exist in:
   - [/Users/lucio/Desktop/Aionis/package.json](/Users/lucio/Desktop/Aionis/package.json)
2. current layer mapping exists in:
   - [/Users/lucio/Desktop/Aionis/docs/internal/testing/AIONIS_TEST_LAYERING.md](/Users/lucio/Desktop/Aionis/docs/internal/testing/AIONIS_TEST_LAYERING.md)

What remains:

1. require more new complex tests to declare which layer they belong to
2. keep test buckets meaningful rather than turning them into broad catch-all groups

### Phase A5: Release Discipline Update

Status: `in_progress`

What is landed:

1. PR template exists:
   - [/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md](/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md)
2. reviewer checklist exists:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md)
3. PR metadata workflow exists:
   - [/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml](/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml)

What remains:

1. make sure the template/checklist/workflow become normal team behavior rather than one-off additions
2. only tighten metadata rules further after author usage is stable

## Current Read

The adoption is no longer in the planning-only stage.

Current maturity by phase:

1. `A0` done
2. `A1` done
3. `A2` active and machine-enforced
4. `A3` active and machine-enforced
5. `A4` active with runnable entrypoints
6. `A5` active with template, checklist, and workflow gate

## Recommended Next Move

Do not add more architecture abstractions right now.

Prefer:

1. using the new PR/review discipline for real changes
2. extending machine checks only when a boundary is already stable
3. treating this checkpoint as the baseline for the next adoption review
