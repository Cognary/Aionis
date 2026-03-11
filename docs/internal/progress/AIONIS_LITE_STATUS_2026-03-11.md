# Aionis Lite Status

Last updated: `2026-03-11`  
Status: `in_progress`

Related docs:
- [LITE_SINGLE_USER_KERNEL_IMPLEMENTATION_SPEC.md](/Users/lucio/Desktop/Aionis/docs/LITE_SINGLE_USER_KERNEL_IMPLEMENTATION_SPEC.md)
- [AIONIS_LITE_VS_SERVER_ARCHITECTURE_ANALYSIS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_LITE_VS_SERVER_ARCHITECTURE_ANALYSIS_2026-03-11.md)

## 1. Executive Summary

Aionis Lite has moved past design-only status.

It is now accurate to describe Lite as:

1. a real `edition` profile
2. a real local SQLite-backed kernel path
3. a partially complete single-user runtime

It is not yet accurate to describe Lite as:

1. feature-complete
2. alpha-release ready
3. a full replacement for the current server edition

Current repository state reflects:

1. committed Lite host/runtime split already in `main`
2. committed SQLite-backed Lite write/recall/replay/session baseline already in `main`
3. additional local working-tree Lite progress on packs and graph inspection not yet committed at the time of this report

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

Current explicit limitation:

1. `resolve(decision)` remains unsupported in Lite and currently returns stable `501 decision_resolve_not_supported_in_lite`

This is an acceptable temporary boundary, but it keeps Lite below release-readiness.

## 4. What Is Not Finished Yet

### 4.1 Policy and Context Layer

The largest remaining product gap is not host wiring or basic persistence.

It is the upper kernel surfaces:

1. `rules/evaluate`
2. `tools/select`
3. `tools/feedback`
4. `planning/context`
5. `context/assemble`

These matter because Aionis is not just a graph store plus replay.

Its modern differentiation also depends on:

1. policy loop
2. tool loop
3. context assembly
4. cost-aware runtime behavior

Until these are carried into Lite coherently, Lite is structurally valid but still incomplete as a product edition.

### 4.2 Decision Surface Gap

The current unsupported Lite edge is:

1. decision object resolution

That is a symptom of a broader point:

1. replay/playbook data exists in Lite
2. some higher-level inspection and policy-facing surfaces are still uneven

This is not a blocker for continuing implementation, but it is a blocker for calling Lite complete.

### 4.3 Capability Matrix Completion

The implementation spec defines Lite in terms of a required capability contract.

That matrix is not yet fully satisfied.

Specifically, Lite still needs:

1. more complete policy/tool loop parity
2. more complete context/runtime parity
3. a cleaner statement of which surfaces are fully supported vs intentionally `501`

## 5. Current Readiness Judgment

### 5.1 What We Can Say Now

It is now reasonable to say:

1. Lite architecture is viable
2. SQLite is viable for Lite kernel persistence
3. replay can survive the edition split
4. multiple kernel-required paths already run locally without Postgres-shaped runtime assumptions

### 5.2 What We Cannot Say Yet

It is not yet reasonable to say:

1. Lite is alpha-ready
2. Lite has full kernel parity
3. Lite is the recommended default install path

### 5.3 Coarse Progress Estimate

Working estimate:

1. overall Lite line is roughly `50%` complete

Why it is already this high:

1. the hardest conceptual work was extracting edition boundaries and persistence boundaries
2. those boundaries are now materially implemented

Why it is not higher:

1. policy/context surfaces are still not done
2. capability matrix is still incomplete
3. release gates are not yet satisfied

## 6. Release Gates Still Missing

Lite should not be called release-ready until all of the following are true:

1. kernel-required capability matrix is satisfied or explicitly documented with approved temporary exceptions
2. route support matrix is machine-checked for Lite vs Server-only surfaces
3. core Lite runtime-host smoke suite is green in CI
4. pack promotion path remains stable
5. SQLite-backed local write/recall/replay/session/inspection paths remain green under contract smoke
6. upper policy/context surfaces are either implemented or intentionally excluded from the Lite alpha contract

## 7. Recommended Next Steps

Recommended order:

1. finish Lite policy/context surfaces
2. finish Lite rules/tools loop surfaces
3. close remaining inspection gaps such as decision-facing behavior
4. then write a formal Lite alpha gate memo

The highest-value next implementation targets are:

1. `rules/evaluate`
2. `tools/select`
3. `tools/feedback`
4. `planning/context`
5. `context/assemble`

## 8. Final Judgment

Lite is now beyond speculative architecture work.

The project has already demonstrated:

1. edition separation
2. local SQLite-backed kernel persistence
3. replay survival across the edition split
4. real runtime-host evidence for several kernel-required paths

So the right interpretation is:

> Lite is real and technically viable, but still in the middle of capability completion rather than at the point of public product readiness.
