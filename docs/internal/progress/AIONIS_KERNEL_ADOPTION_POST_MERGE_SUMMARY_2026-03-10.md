---
title: "Aionis Kernel Adoption Post-Merge Summary"
---

# Aionis Kernel Adoption Post-Merge Summary

Date: `2026-03-10`  
Merged PRs:

1. [#8 Harden playground egress and admin secret surfaces](https://github.com/Cognary/Aionis/pull/8)
2. [#9 Converge the runtime host around a kernel architecture](https://github.com/Cognary/Aionis/pull/9)
3. [#10 Institutionalize architecture review workflow metadata](https://github.com/Cognary/Aionis/pull/10)

## Summary

The kernel architecture adoption is now merged into `main`.

This means the effort has moved out of proposal mode and out of branch-local experimentation. The current repository baseline now includes:

1. security hardening for key exposed runtime surfaces
2. runtime host convergence around explicit kernel-oriented layering
3. executable dependency and contract guardrails
4. review workflow discipline that reflects the adopted architecture

## What Is Now True On `main`

### Security baseline

The repository now includes these hardening changes on `main`:

1. playground server-side proxy egress is allowlisted through:
   - [/Users/lucio/Desktop/Aionis/apps/playground/app/lib/egress-guard.mjs](/Users/lucio/Desktop/Aionis/apps/playground/app/lib/egress-guard.mjs)
2. admin and ops secret checks use constant-time comparison through:
   - [/Users/lucio/Desktop/Aionis/src/util/admin_auth.ts](/Users/lucio/Desktop/Aionis/src/util/admin_auth.ts)
   - [/Users/lucio/Desktop/Aionis/apps/ops/app/lib/secret-compare.mjs](/Users/lucio/Desktop/Aionis/apps/ops/app/lib/secret-compare.mjs)
3. memory write batches reject duplicate `client_id` and duplicate stable node `id` values through:
   - [/Users/lucio/Desktop/Aionis/src/memory/write.ts](/Users/lucio/Desktop/Aionis/src/memory/write.ts)

### Runtime host convergence

The repository now has a clear runtime host split:

1. thin entrypoint:
   - [/Users/lucio/Desktop/Aionis/src/index.ts](/Users/lucio/Desktop/Aionis/src/index.ts)
2. host assembly:
   - [/Users/lucio/Desktop/Aionis/src/host/http-host.ts](/Users/lucio/Desktop/Aionis/src/host/http-host.ts)
   - [/Users/lucio/Desktop/Aionis/src/host/bootstrap.ts](/Users/lucio/Desktop/Aionis/src/host/bootstrap.ts)
3. runtime services:
   - [/Users/lucio/Desktop/Aionis/src/app](/Users/lucio/Desktop/Aionis/src/app)
4. route registrars:
   - [/Users/lucio/Desktop/Aionis/src/routes](/Users/lucio/Desktop/Aionis/src/routes)

The main effect is that `src/index.ts` is no longer the maintenance center of the runtime.

### Machine-enforced architecture guardrails

The repository now includes executable architecture checks:

1. dependency direction enforcement:
   - [/Users/lucio/Desktop/Aionis/scripts/ci/dependency-direction.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/dependency-direction.test.mjs)
2. kernel contract smoke enforcement:
   - [/Users/lucio/Desktop/Aionis/scripts/ci/kernel-contract.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/kernel-contract.test.mjs)
3. layered test entrypoints:
   - [/Users/lucio/Desktop/Aionis/docs/internal/testing/AIONIS_TEST_LAYERING.md](/Users/lucio/Desktop/Aionis/docs/internal/testing/AIONIS_TEST_LAYERING.md)
   - [/Users/lucio/Desktop/Aionis/package.json](/Users/lucio/Desktop/Aionis/package.json)

This is the point where the architecture stopped being only a documentation claim.

### Review process discipline

The repository now includes architecture-aware review workflow assets:

1. PR template:
   - [/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md](/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md)
2. PR metadata workflow gate:
   - [/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml](/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml)
3. reviewer checklist:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md)
4. workflow drill and cost-evaluation pack:
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_DRILL.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_DRILL.md)
   - [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md)

## Current Read

The adoption is now in the operational baseline stage.

That means:

1. the target architecture is defined
2. the code structure is converged enough to reflect that definition
3. the most important layer boundaries are machine-checked
4. the review process is aligned enough to keep vocabulary and boundary expectations stable

It does **not** mean the adoption is finished forever.

It means future work should now default to preserving and using this baseline rather than re-debating it.

## Remaining Risks

The remaining risks are no longer "missing architecture definition" risks.

They are now mostly operational discipline risks:

1. future feature work could re-inflate host or route files if registrars are not maintained
2. new kernel surfaces could land without contract promotion if reviewers stop treating the checklist as a real gate
3. PR metadata could become a box-checking exercise if the cost-evaluation trial is never actually run
4. multi-instance shared rate-limit and quota enforcement is still an open architectural gap outside this merge set

## Recommended Next Moves

Keep the next steps narrow:

1. run the planned workflow cost trial on real PRs instead of adding more process
2. extend dependency or contract checks only when a new boundary is already stable
3. treat this merge as the baseline checkpoint for future kernel-impacting reviews

## Related Records

1. [/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md](/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md)
3. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_KERNEL_ADOPTION_PROGRESS_2026-03-10.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_KERNEL_ADOPTION_PROGRESS_2026-03-10.md)
4. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_KERNEL_ADOPTION_PHASE_STATUS_2026-03-10.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_KERNEL_ADOPTION_PHASE_STATUS_2026-03-10.md)
