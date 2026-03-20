# Aionis Lite Architecture And Completion

Last reviewed: 2026-03-20

This document describes the current architecture of the standalone `Aionis Lite` repository and records the present completion level of each major capability area.

For the endpoint-level public surface, see [docs/LITE_API_CAPABILITY_MATRIX.md](/Volumes/ziel/Aionisgo/docs/LITE_API_CAPABILITY_MATRIX.md).

## Executive Summary

`Aionis Lite` is now a real standalone local runtime, not a wrapper demo.

Current reality:

1. It boots through its own Lite wrapper and manifest contracts.
2. It runs as a single-user local runtime with SQLite-backed persistence.
3. It includes replay, playbook, sandbox, and a local playbook-driven automation kernel.
4. It intentionally excludes admin/control, multi-tenant governance, and server orchestration surfaces.
5. It is product-complete enough to use directly, but the copied `src/` tree still needs more slimming before the codebase reaches its clean final Lite-only shape.

As of this review, the Lite source tree contains:

1. `112` code files under `src/`
2. about `44,360` lines of code under `src/`

The largest remaining modules are:

1. `src/memory/replay.ts`
2. `src/store/lite-write-store.ts`
3. `src/memory/sandbox.ts`
4. `src/routes/memory-context-runtime.ts`

## Repository Shape

The standalone repository is structured around a thin app wrapper, a Lite-only runtime assembly path, and a SQLite-backed local kernel.

Top-level product seams:

1. `apps/lite/`
   Owns the product-facing Lite launcher and startup script.
2. `src/`
   Holds the runtime host, route layer, app assembly, memory kernel, and SQLite stores.
3. `packages/runtime-core/`
   Marks the extraction seam between shared core, Lite product surfaces, and server-only surfaces.
4. `docs/`
   Holds Lite boundary and operator-facing architecture material.

## Runtime Bootstrap

The startup chain is:

1. `apps/lite/scripts/start-lite-app.sh`
2. `apps/lite/src/index.js`
3. `src/index.ts`
4. `src/runtime-entry.ts`

Responsibilities:

1. `apps/lite/scripts/start-lite-app.sh`
   Sets the default Lite runtime environment:
   - `AIONIS_EDITION=lite`
   - `AIONIS_MODE=local`
   - `MEMORY_AUTH_MODE=off`
   - `TENANT_QUOTA_ENABLED=false`
   - `LITE_LOCAL_ACTOR_ID=local-user`
   - `SANDBOX_ENABLED=true`
   - `SANDBOX_ADMIN_ONLY=false`
2. `apps/lite/src/index.js`
   Launches the Lite runtime source entry through `tsx`.
3. `src/index.ts`
   Is a thin entry that delegates to `startAionisRuntime()`.
4. `src/runtime-entry.ts`
   Is the runtime truth for startup assembly, route registration, request guards, observability helpers, and bootstrap lifecycle.

## Runtime Assembly

The main assembly logic lives in `src/app/runtime-services.ts`.

This module is now explicitly Lite-only and wires:

1. Lite host store
2. Lite write store
3. Lite recall store
4. Lite replay store
5. Lite automation definition store
6. Lite automation run store
7. sandbox executor
8. local rate limiters, inflight gates, and embedding helpers

Important current constraints:

1. `AIONIS_EDITION` must be `lite`
2. auth mode is local-only
3. tenant quota wiring is disabled in Lite
4. the runtime uses SQLite-backed local stores rather than postgres-backed full-runtime constructors

## Host Layer

The HTTP host is defined by `src/host/http-host.ts` and `src/host/lite-edition.ts`.

The host layer does four things:

1. Registers the stable `/health` contract.
2. Registers all Lite-supported runtime routes.
3. Emits structured error envelopes.
4. Exposes unsupported full/server route groups as structured `501` responses.

The Lite route matrix currently classifies surfaces as:

Kernel-required routes:

1. `memory-write`
2. `memory-handoff`
3. `memory-recall`
4. `memory-context-runtime`
5. `memory-access-partial`
6. `memory-replay-core`
7. `memory-feedback-tools`

Optional routes:

1. `memory-sandbox`
2. `memory-replay-governed-partial`
3. `automations-lite-kernel`

Server-only route groups:

1. `/v1/admin/control/*`
2. `/v1/memory/archive/rehydrate*`
3. `/v1/memory/nodes/activate*`

## Identity And Guard Model

`src/app/request-guards.ts` is now a Lite-only guard module.

Its current model is:

1. single-user local runtime
2. `MEMORY_AUTH_MODE=off`
3. `TENANT_QUOTA_ENABLED=false`
4. loopback-friendly rate limiting
5. inflight gates for write and recall pressure

The default local identity is:

1. `LITE_LOCAL_ACTOR_ID=local-user`

That actor is reused across:

1. replay ownership
2. playbook execution
3. automation runs
4. default local write ownership
5. sandbox requests that do not carry a stronger explicit local identity

## Storage Architecture

Lite is a multi-store local runtime built on SQLite.

Primary stores:

1. `src/store/lite-write-store.ts`
   Primary write-side persistence for nodes, edges, commits, sessions, packs, rule state, and other local write-backed surfaces.
2. `src/store/lite-recall-store.ts`
   Local recall and retrieval access.
3. `src/store/lite-replay-store.ts`
   Replay mirror and replay-facing local persistence.
4. `src/store/lite-automation-store.ts`
   Automation definition storage.
5. `src/store/lite-automation-run-store.ts`
   Automation run and node execution storage.
6. `src/store/lite-host-store.ts`
   Local host-side sandbox session/run/log persistence for Lite.

Secondary compatibility seams still present:

1. `src/store/recall-access.ts`
2. `src/store/replay-access.ts`
3. `src/store/write-access.ts`
4. `src/store/embedded-memory-runtime.ts`

These still exist because Lite is a cut-down shared runtime tree, not yet a fully minimized dedicated source tree.

## Memory And Replay Kernel

The memory kernel remains the largest part of the Lite codebase.

Key modules:

1. `src/memory/write.ts`
   Write preparation and write application flow.
2. `src/memory/recall.ts`
   Recall execution and retrieval behavior.
3. `src/memory/context.ts`
   Context assembly behavior.
4. `src/memory/replay.ts`
   Replay, playbook, repair review, and governed execution machinery.
5. `src/memory/replay-write.ts`
   Replay mirror write behavior.
6. `src/memory/handoff.ts`
   Handoff store/recover flow.
7. `src/memory/feedback.ts`
   Feedback and rule-feedback persistence.
8. `src/memory/packs.ts`
   Pack import/export compatibility.

Current architectural reality:

1. replay remains the biggest subsystem in Lite
2. playbook execution is real, not stubbed
3. governed replay exists in Lite, but only through the Lite-local path
4. replay repair review policy in Lite is narrowed to global-plus-endpoint overlays only
5. stable workflow anchor production is now consistent for both newly promoted stable playbooks and already-stable latest playbooks

## Automation Kernel

Lite now includes a local automation kernel implemented by:

1. `src/routes/automations.ts`
2. `src/memory/automation-lite.ts`
3. `src/store/lite-automation-store.ts`
4. `src/store/lite-automation-run-store.ts`

Supported node kinds:

1. `playbook`
2. `approval`
3. `condition`
4. `artifact_gate`

Supported route surface:

1. `POST /v1/automations/create`
2. `POST /v1/automations/get`
3. `POST /v1/automations/list`
4. `POST /v1/automations/validate`
5. `POST /v1/automations/graph/validate`
6. `POST /v1/automations/run`
7. `POST /v1/automations/runs/get`
8. `POST /v1/automations/runs/list`
9. `POST /v1/automations/runs/cancel`
10. `POST /v1/automations/runs/resume`

Intentionally unsupported automation governance surfaces return structured `501` errors.

These remain out of Lite by design:

1. reviewer assignment
2. promotion/control-plane review
3. compensation tooling
4. telemetry orchestration
5. shadow review/report governance surfaces

## Sandbox

Lite now includes a real local sandbox path implemented by:

1. `src/routes/memory-sandbox.ts`
2. `src/memory/sandbox.ts`
3. `src/store/lite-host-store.ts`

Current sandbox behavior:

1. enabled by default in Lite
2. available to ordinary local users by default
3. still supports explicit relock through `SANDBOX_ADMIN_ONLY=true`
4. defaults to `SANDBOX_EXECUTOR_MODE=mock`
5. now exposes a convenience local-process preset through `LITE_SANDBOX_PROFILE=local_process_echo`

Supported sandbox routes:

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/artifact`
6. `POST /v1/memory/sandbox/runs/cancel`

Current caveat:

1. the default executor is intentionally `mock`
2. the route surface is real and persistent, but default sandbox execution is still optimized for local validation rather than hardened production execution
3. the current local-process preset is intentionally narrow and only allows `echo` by default

## Execution Memory Runtime Notes

Two runtime semantics are now important enough to treat as architectural behavior rather than implementation detail.

### 1. Rehydration Identity

`rehydrate_payload` follows the Lite single-user identity model.

In practical terms:

1. the normal Lite path inherits `LITE_LOCAL_ACTOR_ID`
2. private local anchors remain rehydratable through the standard route and tool surfaces
3. runtime hints do not need to restate actor to remain correct in the default local case

### 2. Policy Reuse Precedence

The `Execution Policy Learning Loop` does not override explicit operator or rule policy.

In practical terms:

1. recalled trusted patterns may shape tool ordering
2. explicit `tool.prefer` remains higher priority
3. selector reuse is memory-guided policy learning, not silent policy replacement

## Shared-Core Boundary

`packages/runtime-core/src/index.ts` records the current intended split:

Shared core:

1. `memory-kernel`
2. `runtime-bootstrap`
3. `automation-kernel-local`

Lite product:

1. `lite-wrapper`

Server-only:

1. `admin-control`
2. `automation-orchestration`

This boundary is already useful, but it is still metadata over a copied tree rather than a fully extracted package graph.

## Stable Contracts

Lite now has stable external contracts in three important areas:

1. Health contract
   `runtime / storage / lite / sandbox`
2. Error contract
   `status / error / message / details`
3. Automation runtime contract
   `runtime.edition = "lite"`
   `runtime.automation_kernel = "local_playbook_v1"`

These contracts are guarded by tests and should now be treated as product-facing.

## Verification Surface

Lite validation is split across:

1. startup contract tests
2. source-boundary tests
3. release-baseline tests
4. automation kernel tests
5. health contract tests
6. error contract tests
7. replay repair policy tests
8. live smoke

Current commands:

```bash
npm run -s test:lite
npm run -s smoke:lite
```

Current smoke coverage:

1. `/health`
2. sandbox session -> execute -> logs
3. approval-only automation run/resume
4. replay run -> compile playbook -> promote -> automation playbook node run

## Completion By Capability

The percentages below are engineering judgment based on the current code, boundaries, and real validation status.

| Capability Area | Completion | Notes |
|---|---:|---|
| Standalone repo, wrapper, manifest, startup | 95% | Fully independent startup chain exists and is validated. |
| Lite-only runtime assembly | 90% | Main runtime wiring is Lite-only; major full/store fallback has been removed. |
| Local identity and request guards | 95% | Single-user local actor model is stable and consistently wired. |
| SQLite write/recall/access/packs kernel | 90% | Core local persistence surface is present and used by the product. |
| Context runtime, planning, and tools feedback | 85% | Product-complete enough to use, but still fairly large and shared-history heavy. |
| Replay and playbook kernel | 85% | Real replay and playbook path works and is covered by smoke. |
| Local automation kernel | 88% | Definition, run, pause/resume, and playbook-driven execution are real and persistent. |
| Sandbox | 82% | Real route and persistence path exists; default direct use works; default executor still favors local validation. |
| Health, error, and response contracts | 92% | Stable envelopes are in place and tested. |
| Repo baseline, CI, and release skeleton | 88% | Strong enough for standalone repo operation. |
| Public/operator docs | 82% | Good enough to operate the product, but still not fully polished. |
| Source-tree slimming and final purity | 65% | Still the biggest unfinished area. |

## What Is Finished Enough To Trust

These parts are now product-grade in practical terms:

1. startup and wrapper ownership
2. local SQLite-backed runtime boot
3. health and error contracts
4. write/recall/context core path
5. replay and playbook flow
6. local automation kernel
7. local sandbox route surface

## What Is Still Incomplete

The biggest remaining work is not “make Lite usable.” Lite is already usable.

The biggest remaining work is:

1. continue shrinking the copied `src/` tree
2. isolate shared-core code more aggressively
3. reduce large multi-purpose modules
4. keep tightening boundaries between Lite-local kernel and Pro/server orchestration

The most visible evidence of this unfinished work is module size concentration:

1. `src/memory/replay.ts`
2. `src/store/lite-write-store.ts`
3. `src/memory/sandbox.ts`
4. `src/routes/memory-context-runtime.ts`

## Final Assessment

`Aionis Lite` is now a complete local product line, not an experiment hidden inside the full repository.

The current state is best described as:

1. product-complete enough to use directly
2. architecturally coherent
3. contract-stable on the main operator-facing surfaces
4. still carrying extra source-tree mass from the original shared runtime extraction

In short:

1. Lite is already real
2. Lite is already the most complete usable Lite version
3. Lite is not yet the cleanest possible final Lite codebase
