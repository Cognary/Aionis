# Aionis Lite

A standalone `Aionis Lite` repository for the single-user local runtime.

Repository split:

1. `Cognary/Aionis` = standalone Lite repository
2. `Cognary/AionisPro` = full repository with Server, SDKs, docs, playground, ops surfaces, and shared-core split scaffolding

This repository carries the Lite runtime, SQLite-backed stores, Lite operator docs, and the local automation kernel.

Current scope:

1. local Lite runtime packaging
2. Lite startup contracts and smoke validation
3. Lite public-beta operator docs
4. shared runtime-core boundary package

Current limitations:

1. some shared runtime implementation still lives in the copied `src/` tree
2. replay/playbook and automation still share one local-user identity model rather than a multi-user control plane
3. release packaging is intentionally source-first
4. Lite keeps a narrower capability surface than Server by design

## Automation API Contract

Lite automation responses now expose a stable `runtime` envelope instead of transitional `lite_kernel` flags.

Current runtime contract:

1. `runtime.edition = "lite"`
2. `runtime.automation_kernel = "local_playbook_v1"`
3. `supported_node_kinds` and `supported_routes` are returned on validation responses

Lite error responses now follow one stable envelope:

1. `status`
2. `error`
3. `message`
4. `details`

## Quick Start

```bash
nvm use
npm install
npm run start:lite
```

`npm run build` is still available as a packaging/contract check, but Lite startup no longer depends on a prebuilt wrapper artifact.

## Local Identity

Lite now defaults replay, playbook, and automation flows to a single local actor.

By default:

1. `LITE_LOCAL_ACTOR_ID=local-user`
2. replay writes default to private local ownership
3. automation playbook nodes reuse the same local actor when no explicit actor is provided

Override it when you want a stable local identity:

```bash
LITE_LOCAL_ACTOR_ID=lucio npm run start:lite
```

## Sandbox

Lite now starts with the local sandbox enabled for ordinary local users.

By default:

1. `SANDBOX_ENABLED=true`
2. `SANDBOX_ADMIN_ONLY=false`
3. the default executor stays on `mock`, so `smoke:lite` can validate the path without extra system setup

If you want the old lock-back behavior:

```bash
SANDBOX_ADMIN_ONLY=true npm run start:lite
```

## Validation

```bash
npm run test:lite
npm run smoke:lite
```

`smoke:lite` now verifies:

1. Lite health and startup
2. approval-only automation run/resume
3. replay compile -> playbook promote -> playbook-driven automation run
4. local sandbox session -> command execute -> logs

## Repository Operations

Repository maintenance files:

1. [CONTRIBUTING.md](/Volumes/ziel/Aionisgo/CONTRIBUTING.md)
2. [SECURITY.md](/Volumes/ziel/Aionisgo/SECURITY.md)
3. [NOTICE](/Volumes/ziel/Aionisgo/NOTICE)

Release-baseline checks are part of the standard Lite test suite.

## Provenance

Derived from the `Aionis` mainline runtime and now maintained as the standalone Lite baseline that occupies the public `Cognary/Aionis` repository.
