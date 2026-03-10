---
title: "Aionis Kernel Architecture Adoption Plan"
---

# Aionis Kernel Architecture Adoption Plan

Status: `active` (`2026-03-10`)  
Owner: Aionis Core  
Depends on:

1. [/Users/lucio/Desktop/Aionis/docs/AIONIS_RUNTIME_KERNEL_POSITIONING.md](/Users/lucio/Desktop/Aionis/docs/AIONIS_RUNTIME_KERNEL_POSITIONING.md)
2. [/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md](/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md)

## 1. Goal

Adopt the `Kernel / Runtime Services / Control & Extensions` architecture as the official engineering operating model for Aionis, then converge the codebase, tests, and release discipline around that model without stalling feature delivery.

This is not a rewrite plan.

This is an adoption plan for:

1. architecture naming
2. dependency discipline
3. codebase convergence
4. test and review workflow
5. release-safe execution

## 2. Decision

Use the normal large-team flow:

1. architecture positioning document
2. engineering spec
3. adoption plan
4. phased execution with exit criteria
5. each phase lands in small reviewable PRs
6. every phase must keep `build`, `contract`, and docs green

Do not use:

1. one-shot large refactor
2. architecture rewrite branch
3. speculative directory churn before boundary decisions

## 3. Working Agreement

From this plan onward, all engineering discussion should use the same terms:

1. `Kernel`
2. `Runtime Services`
3. `Control & Extensions`

All new work should answer, in PR description or design note:

1. which layer the change belongs to
2. whether it introduces a new dependency direction
3. whether it expands kernel contract or only extension surface

## 4. Scope

### In scope

1. route and runtime host convergence
2. module placement convergence
3. dependency direction cleanup
4. architecture-aware test layering
5. documentation and review workflow updates

### Out of scope

1. changing the product positioning again
2. rewriting replay semantics
3. replacing the current storage model
4. large-scale package extraction
5. UI redesign in ops/playground

## 5. Success Criteria

The adoption is successful when all of the following are true:

1. `Kernel`, `Runtime Services`, and `Control & Extensions` are the default vocabulary across docs and PRs
2. `src/index.ts` is primarily a runtime host and registrar wire-up, not a mixed business-logic file
3. kernel modules do not directly depend on routes, apps, or control-plane packaging surfaces
4. control and extension features consume kernel contracts instead of redefining them
5. tests can be reasoned about by layer
6. the codebase continues to pass:
   - `npm run -s lint -- --no-cache`
   - `npm run -s build`
   - `npm run -s test:contract`
   - `npm run -s docs:check`

## 6. Phase Plan

### Phase A0: Architecture Adoption Freeze

Goal:

1. freeze the architecture model and stop vocabulary drift

Deliverables:

1. positioning doc accepted
2. engineering spec accepted
3. adoption plan accepted

Required actions:

1. link the spec in future architecture PRs
2. require layer classification in major refactor PR descriptions

Exit criteria:

1. no new architecture terms are introduced for the same concepts
2. core maintainers are aligned on the three-layer model

### Phase A1: Runtime Host Convergence

Goal:

1. converge the runtime host so `src/index.ts` acts mainly as bootstrap and wiring

Current status:

1. `completed`
2. `src/index.ts` has been converged to bootstrap/host wiring shape
3. runtime host concerns now live in dedicated `src/host/*`, `src/app/*`, and `src/routes/*` modules

Scope:

1. continue splitting remaining route-heavy blocks from `src/index.ts`
2. isolate runtime-only helpers from route handlers
3. keep environment and runtime assembly in app-layer modules

Recommended order:

1. archive / node activation
2. replay heavy routes (`repair/review`, `playbooks/run`)
3. recall / planning / context assemble

Exit criteria:

1. `src/index.ts` is primarily bootstrap + route registration + minimal host glue
2. most HTTP business flow is registered via dedicated route modules

### Phase A2: Dependency Direction Enforcement

Goal:

1. make the three-layer dependency direction real, not only documented

Current status:

1. `in_progress`
2. executable dependency-direction checks now cover `memory`, `app`, `routes`, `host`, and `control-plane`
3. host-facing modules were moved out of `src/app/*` into `src/host/*` to keep the rule set hard

Scope:

1. identify forbidden imports
2. move cross-layer helpers behind injected interfaces where needed
3. explicitly classify `src/control-plane.ts` as `Control & Extensions`

Required rules:

1. `src/memory/*` must not import route modules
2. `src/memory/*` must not import app UIs or `apps/*`
3. kernel logic must not gain admin/ops-specific object semantics

Exit criteria:

1. there are no known direct dependency violations against the spec
2. new PRs stop introducing reversed dependencies

### Phase A3: Kernel Contract Hardening

Goal:

1. make kernel boundaries testable and stable

Current status:

1. `in_progress`
2. a minimum kernel contract checklist now exists
3. executable smoke-presence guard now exists for the current minimum kernel surface set
4. replay lifecycle and replay playbook write flows are now part of the minimum contract set

Scope:

1. identify canonical object contracts
2. identify stable kernel entrypoints
3. map which APIs are kernel commitments versus extension packaging

Deliverables:

1. a short kernel contract checklist
2. contract-smoke coverage for the highest-value kernel surfaces

Exit criteria:

1. the team can answer which changes are breaking kernel behavior versus only changing extensions

### Phase A4: Test Layering

Goal:

1. align tests with the architecture model

Current status:

1. `in_progress`
2. executable layer entrypoints now exist in `package.json`
3. current test mapping is documented in `docs/internal/testing/AIONIS_TEST_LAYERING.md`
4. kernel layer now includes both `test:contract` and `test:kernel-contract`

Test buckets:

1. `Kernel correctness`
2. `Runtime host and adapter`
3. `Control & Extensions`

Scope:

1. tag or group existing tests by layer
2. require new complex changes to declare which layer they test
3. keep contract smoke focused on externally meaningful kernel paths

Exit criteria:

1. failure ownership becomes obvious from the failing test set

### Phase A5: Release Discipline Update

Goal:

1. make the architecture model part of normal engineering release flow

Current status:

1. `in_progress`
2. PR template now requires layer classification, boundary impact, verification, and rollback notes
3. architecture review checklist now exists for reviewer-side enforcement
4. PR metadata workflow now checks that exactly one primary architecture layer is selected

Required release checks for architecture-impacting work:

1. spec link present in PR when boundaries are touched
2. layer classification present
3. dependency direction reviewed
4. build, contract, docs green
5. rollback surface described if runtime host or kernel paths are touched

Operational artifacts:

1. [/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md](/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md)
3. [/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml](/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml)
4. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_DRILL.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_DRILL.md)
5. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md)

Exit criteria:

1. architecture changes follow the same operational discipline as feature rollouts

## 7. PR Strategy

This adoption must land as a sequence of small PRs.

### Required PR shape

Every architecture PR should contain:

1. target layer
2. dependency impact
3. verification commands
4. explicit statement of whether kernel semantics changed

### Recommended PR size

Prefer:

1. one route family
2. one runtime helper cluster
3. one dependency cleanup slice
4. one test-layering slice

Avoid:

1. mixed refactor + feature + policy changes
2. cross-cutting directory moves without behavior coverage
3. giant “kernel migration” PRs

## 8. Review Workflow

For architecture-impacting changes, use this review sequence:

1. author links the spec and adoption plan
2. author states layer placement and dependency direction
3. reviewer checks boundary correctness first
4. reviewer checks behavior preservation second
5. reviewer checks tests and docs last

Review questions must be answered explicitly:

1. does this belong in Kernel, Runtime Services, or Control & Extensions?
2. does this create a reversed dependency?
3. does this expand kernel contract or only extension surface?
4. what is the rollback plan if behavior drifts?

## 9. Verification Standard

Minimum verification for every adoption PR:

```bash
npm run -s lint -- --no-cache
npm run -s build
npm run -s test:contract
npm run -s docs:check
```

If a PR touches replay-heavy or automation-heavy paths, include the most relevant extra smoke or e2e command when available.

## 10. Rollback Rule

If a phase causes any of the following, stop and roll back that slice:

1. kernel behavior is unclear after refactor
2. route ownership becomes less obvious
3. tests no longer show which layer failed
4. the change requires broad unrelated edits to keep compiling

Rollback principle:

1. revert only the slice being landed
2. keep accepted docs and naming
3. re-cut the slice smaller

## 11. Risks

### Risk 1: Architecture theatre

Symptoms:

1. docs are updated
2. code placement stays inconsistent

Mitigation:

1. require PR-level layer declarations
2. make phase exit criteria behavior- and structure-based

### Risk 2: Over-abstraction

Symptoms:

1. many new interfaces
2. little actual boundary clarity

Mitigation:

1. prefer direct modularization first
2. only introduce interfaces when dependency direction requires them

### Risk 3: Refactor fatigue

Symptoms:

1. long-running branch
2. large rebases
3. merge hesitation

Mitigation:

1. ship in small vertical slices
2. keep every slice releasable

### Risk 4: Kernel boundary drift during feature delivery

Symptoms:

1. new beta/governance features bypass the model

Mitigation:

1. apply the review workflow to all architecture-impacting PRs

## 12. Recommended Immediate Next Steps

Do these next, in order:

1. adopt this plan as the default execution path
2. continue Phase A1 until `src/index.ts` is mostly host glue
3. open a dependency-cleanup pass for Phase A2 after the next route slices land
4. add PR template language requiring layer classification for architecture-touching changes

## 13. Final Recommendation

Yes, the right large-team workflow is:

1. write the architecture positioning
2. write the engineering spec
3. write the adoption plan
4. execute in phases with small PRs and hard exit criteria

That is the normal, disciplined path.

The current repository state is already past step 1 and step 2.  
This document makes step 3 explicit, so the team can now execute step 4 in a controlled way.
