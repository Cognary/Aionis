# Aionis Lite Status

Last updated: `2026-03-11`  
Status: `in_progress`

Related docs:
- [LITE_SINGLE_USER_KERNEL_IMPLEMENTATION_SPEC.md](/Users/lucio/Desktop/Aionis/docs/LITE_SINGLE_USER_KERNEL_IMPLEMENTATION_SPEC.md)
- [AIONIS_LITE_VS_SERVER_ARCHITECTURE_ANALYSIS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_LITE_VS_SERVER_ARCHITECTURE_ANALYSIS_2026-03-11.md)
- [AIONIS_LITE_ALPHA_RELEASE_MEMO_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_ALPHA_RELEASE_MEMO_2026-03-12.md)
- [AIONIS_LITE_INTERNAL_ALPHA_DOGFOOD_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_INTERNAL_ALPHA_DOGFOOD_2026-03-12.md)
- [AIONIS_LITE_BETA_GATE_V1_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_BETA_GATE_V1_2026-03-12.md)
- [AIONIS_LITE_BETA_GATE_V2_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_BETA_GATE_V2_2026-03-12.md)
- [AIONIS_LITE_PUBLIC_BETA_READINESS_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_READINESS_2026-03-12.md)
- [AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md)
- [AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md)
- [Lite Operator Notes (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/04-lite-operator-notes.md)
- [Lite 运维说明 (ZH)](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/04-lite-operator-notes.md)
- [Lite Troubleshooting and Feedback (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md)
- [Lite 排障与反馈 (ZH)](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/06-lite-troubleshooting-and-feedback.md)

## 1. Executive Summary

Aionis Lite has moved past design-only status.

It is now accurate to describe Lite as:

1. a real `edition` profile
2. a real local SQLite-backed kernel path
3. a beta-candidate local single-user runtime

It is not yet accurate to describe Lite as:

1. feature-complete
2. GA-ready
3. a full replacement for the current server edition

Current repository state reflects:

1. committed Lite host/runtime split already in `main`
2. committed SQLite-backed Lite write/recall/replay/session baseline already in `main`
3. additional local working-tree Lite progress on policy/context and startup packaging was still in flight when this report was first created

## 2. Phase Assessment

Lite is currently in the transition from:

1. `architecture extraction`
2. to `kernel-required local path implementation`

This means the project has already proven the core architectural claim:

> Aionis Lite can preserve the same kernel semantics while swapping the outer topology and persistence backend.

The current phase is not "should Lite exist?"

The current phase is:

> how much of the kernel-required capability matrix has already been carried onto local SQLite-backed runtime paths.

## 3. What Is Already Working

### 3.1 Edition Split

Lite already exists as a runtime profile.

Established behavior:

1. `AIONIS_EDITION=lite` is supported
2. server-only route groups are rejected with stable `501`
3. `/health` exposes Lite capability state

This is the first proof that Lite is a real edition boundary, not a documentation-only concept.

### 3.2 SQLite-Backed Kernel Paths

The following kernel-required paths already have SQLite-backed implementation or route smoke coverage:

1. `memory/write`
2. `memory/recall`
3. replay lifecycle
4. replay playbooks
5. sessions/events
6. packs export/import
7. graph inspection via `find`
8. graph inspection via `resolve(node/edge/commit)`

This is the most important status change.

Lite is no longer just:

1. host wiring
2. feature flags
3. storage experiments

Lite is now a partially functioning local kernel runtime.

### 3.3 Replay Status

Replay is the key differentiator Aionis cannot lose in Lite.

Current status:

1. replay SQLite mirror exists
2. Lite replay route smoke covers lifecycle and governed playbook routes
3. `compile / promote / repair / repair_review / get / candidate / run / dispatch` are exercised in Lite smoke coverage

This is enough to say that replay is no longer hypothetical in Lite.

### 3.4 Session and Pack Bridge Status

Current status:

1. session create/append/list has local SQLite-backed route coverage
2. pack export/import now has a Lite route path
3. packs remain part of the intended Lite-to-Server upgrade bridge

This matters because Lite is not useful if it cannot accumulate local state and later promote that state outward.

### 3.5 Graph Inspection Status

Current status:

1. `find` has a Lite path
2. `resolve(node)` has a Lite path
3. `resolve(edge)` has a Lite path
4. `resolve(commit)` has a Lite path

Current status:

1. `resolve(decision)` now also has a Lite path
2. graph inspection is no longer missing the decision surface

## 4. What Is Not Finished Yet

### 4.1 Policy and Context Layer

The largest remaining product gap is no longer host wiring or the upper policy/context layer.

Those surfaces now also have Lite runtime evidence:

1. `rules/evaluate`
2. `tools/select`
3. `tools/decision`
4. `tools/run`
5. `tools/feedback`
6. `recall_text`
7. `planning/context`
8. `context/assemble`

This changes the phase judgment materially:

1. Lite is no longer missing its main policy/tool/context differentiation surfaces
2. the current remaining work is mostly packaging hardening and capability polishing
3. the edition has moved into alpha-readiness rather than basic capability bring-up

### 4.2 Decision Surface Gap

The previous unsupported Lite edge was:

1. decision object resolution

That gap is now closed as well:

1. `resolve(decision)` has a local SQLite-backed Lite path
2. tools feedback is part of the runtime-host Lite smoke suite

So the remaining gaps are no longer concentrated in graph inspection.

### 4.3 Capability Matrix Completion

The implementation spec defines Lite in terms of a required capability contract.

That matrix is not yet fully satisfied.

Specifically, Lite still needs:

1. a cleaner public statement of which surfaces are fully supported vs intentionally `501`
2. stronger startup/distribution ergonomics beyond internal scripts
3. additional post-beta hardening once real users start exercising the local path

## 5. Current Readiness Judgment

### 5.1 What We Can Say Now

It is now reasonable to say:

1. Lite architecture is viable
2. SQLite is viable for Lite kernel persistence
3. replay can survive the edition split
4. multiple kernel-required paths already run locally without Postgres-shaped runtime assumptions
5. internal alpha dogfooding now validates fresh-write recallability and replay lifecycle in a real Lite process
6. repeated real-process dogfooding now has a canonical green script path on `main`
7. Lite beta gate v1 now exists and passes on the current repository snapshot
8. Lite beta gate v2 now exists and passes on the current repository snapshot
9. a non-scripted public-beta-style manual operator pass is now green

### 5.2 What We Cannot Say Yet

It is now reasonable to say:

1. Lite is alpha-ready by the repository gate currently defined
2. Lite preserves the kernel-required local path for single-user execution
3. the major first-pass dogfood blockers have been closed
4. Lite is now a stronger beta-candidate by repository gates v1 and v2
5. Lite is now approved for a controlled public beta posture

It is still not yet reasonable to say:

1. Lite has full kernel parity
2. Lite is the recommended default install path
3. Lite has finished real-world hardening

### 5.3 Coarse Progress Estimate

Working estimate:

1. overall Lite line is roughly `80%` complete

Why it is already this high:

1. the hardest conceptual work was extracting edition boundaries and persistence boundaries
2. those boundaries are now materially implemented

Why it is not higher:

1. operator/runtime polish is still incomplete
2. capability matrix still needs clearer external product framing
3. release hardening beyond the current beta-candidate gate is not yet satisfied

## 6. Release Gates Still Missing

Lite should not be called broadly release-ready until all of the following are true:

1. kernel-required capability matrix is satisfied or explicitly documented with approved temporary exceptions
2. route support matrix is machine-checked for Lite vs Server-only surfaces
3. core Lite runtime-host smoke suite is green in CI
4. pack promotion path remains stable
5. SQLite-backed local write/recall/replay/session/inspection paths remain green under contract smoke
6. upper policy/context surfaces are either implemented or intentionally excluded from the Lite alpha contract
7. repeated real-process dogfood runs stay green through the same startup and replay workflow

Current implementation note:

1. repository-level Lite alpha gating now exists as `npm run -s job:lite-alpha-gate`
2. cross-edition pack compatibility now has explicit runtime-host evidence via [lite-pack-compatibility.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/lite-pack-compatibility.test.mjs)
3. current gate artifact: [LITE_ALPHA_GATE_V1_20260311.md](/Users/lucio/Desktop/Aionis/artifacts/lite/LITE_ALPHA_GATE_V1_20260311.md)
4. current gate now passes with no failing items
5. release-position summary now exists in [AIONIS_LITE_ALPHA_RELEASE_MEMO_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_ALPHA_RELEASE_MEMO_2026-03-12.md)
6. repeated internal operator validation now has a canonical script: `npm run -s lite:dogfood`
7. public operator guidance now exists in EN/ZH getting-started docs
8. beta-gate v1 now exists as `npm run -s job:lite-beta-gate`
9. current beta gate v1 artifact now passes
10. beta-gate v2 now exists as `npm run -s job:lite-beta-gate-v2`
11. current beta gate v2 artifact now passes

## 7. Recommended Next Steps

Recommended order:

1. keep Lite startup packaging stable and documented
2. harden alpha capability framing for external/operator use
3. collect real usage evidence before widening rollout
4. define the beta gate from repeated operator evidence, not repository bring-up alone

The highest-value next implementation targets are:

1. startup and troubleshooting polish beyond the current operator notes
2. memory-lane visibility guidance for local inspection examples
3. post-beta hardening gates
4. broader operator UX evidence beyond the canonical dogfood script

## 8. Final Judgment

Lite is now beyond speculative architecture work.

The project has already demonstrated:

1. edition separation
2. local SQLite-backed kernel persistence
3. replay survival across the edition split
4. real runtime-host evidence for several kernel-required paths

So the right interpretation is:

> Lite is real, technically viable, and now beyond alpha-only gating; the remaining work is no longer core capability bring-up, but packaging polish and post-beta hardening.
