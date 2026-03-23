# Public Repo Retention Plan

This document defines what the public `Cognary/Aionis` repository should keep while Aionis moves toward an SDK-open, runtime-layered model.

## Goal

Turn the public repository into:

1. the SDK entrypoint
2. the docs/examples repository
3. a lightweight demo runtime shell

without keeping the full private runtime development surface public indefinitely.

## Keep In Public

### Product entry

1. `README.md`
2. `docs/SDK_QUICKSTART.md`
3. `docs/SDK_PUBLISHING.md`
4. `docs/OPEN_CORE_BOUNDARY.md`
5. public release notes and public-facing product docs

### SDK

1. `packages/sdk`
2. SDK package tests
3. SDK examples under `examples/sdk`

### Shared boundary

1. `packages/runtime-core`
2. any stable public contract references that the SDK or demo runtime needs

### Demo shell

1. `apps/lite`
2. the minimal root startup/build scripts required by that shell
3. the minimal route/runtime implementation needed for SDK quickstart

## Move To Private Mainline Ownership

1. deep governance internals
2. deeper learning/maintenance internals
3. benchmark and regression-gate internals
4. private shadow/eval/model-provider orchestration
5. runtime implementation that is not required for public quickstart/demo use

## Practical Problem

Right now, the public demo shell still depends on the full root runtime tree.

That means:

1. `src/` is currently still public by dependency, not by ideal boundary
2. a safe public shrink needs a replacement demo/runtime layer first

## Recommended Next Execution Slice

The next real implementation slice should be:

1. define the minimum route/runtime subset needed by SDK quickstart
2. extract or replace that subset with a smaller public demo shell
3. only then remove the rest of the deep runtime tree from the public repository
