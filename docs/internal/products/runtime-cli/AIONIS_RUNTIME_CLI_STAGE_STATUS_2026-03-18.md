---
title: "Aionis Runtime CLI Stage Status"
---

# Aionis Runtime CLI Stage Status

Date: `2026-03-18`  
Status: `phase 1 inspection-first runtime cli established`

Related:

1. [Runtime CLI Product Plan](/Users/lucio/Desktop/Aionis/docs/internal/products/runtime-cli/AIONIS_RUNTIME_CLI_PRODUCT_PLAN_2026-03-17.md)
2. [Runtime CLI Command Contract](/Users/lucio/Desktop/Aionis/docs/internal/products/runtime-cli/AIONIS_RUNTIME_CLI_COMMAND_CONTRACT_2026-03-17.md)
3. [SDK CLI](/Users/lucio/Desktop/Aionis/docs/public/en/reference/09-sdk-cli.md)

## Executive Summary

The Runtime CLI is no longer just a local bootstrap helper.

It has now reached a usable Phase 1 shape:

1. runtime lifecycle commands exist
2. execution eval commands exist
3. run inspection commands exist
4. replay/playbook inspection commands exist
5. artifact inspection/export commands exist

The correct reading is:

**Aionis Runtime CLI is now an inspection-first runtime product surface.**

It is not yet a full hosted control-plane CLI, but it is already a real operator CLI for runtime inspection, diagnosis, and gating.

## What Exists Now

The implemented command groups are:

1. `aionis runtime ...`
2. `aionis eval ...`
3. `aionis runs ...`
4. `aionis playbooks ...`
5. `aionis replay ...`
6. `aionis artifacts ...`

### Runtime

Implemented:

1. `aionis runtime dev`
2. `aionis runtime stop`
3. `aionis runtime health`
4. `aionis runtime doctor`
5. `aionis runtime selfcheck`

Compatibility aliases remain:

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

### Eval

Implemented:

1. `aionis eval inspect`
2. `aionis eval compare`
3. `aionis eval gate`

This group is already aligned with real artifact-based execution evaluation and CI gate usage.

### Runs

Implemented:

1. `aionis runs list`
2. `aionis runs timeline`
3. `aionis runs get`
4. `aionis runs decisions`
5. `aionis runs feedback`

Current boundary:

1. `runs list` is an execution-decision rollup, not a generic host run list
2. `runs timeline` is a merged decision/feedback stream, not a universal event model

### Playbooks

Implemented:

1. `aionis playbooks get`
2. `aionis playbooks candidate`
3. `aionis playbooks dispatch`

### Replay

Implemented:

1. `aionis replay inspect-run`
2. `aionis replay inspect-playbook`
3. `aionis replay explain`

Current replay coverage is inspection-only and diagnosis-first.

### Artifacts

Implemented:

1. `aionis artifacts list`
2. `aionis artifacts show`
3. `aionis artifacts export`
4. `aionis artifacts pack`

## What The CLI Can Do Today

The CLI can already support a real runtime workflow:

1. start local Lite
2. verify runtime health
3. inspect execution eval outputs
4. enforce eval gate in CI
5. inspect recent runs
6. inspect run decisions and feedback
7. inspect replay runs and playbooks
8. explain whether a replay run is currently compile-ready
9. browse and export artifacts

This is enough to call the CLI a real runtime product surface.

## Stage Assessment

Current maturity:

**`~80% of V1 core CLI surface`**

That does not mean every planned command exists.

It means the core CLI skeleton is now real:

1. product plan exists
2. command contract exists
3. public documentation exists
4. real commands exist across all major groups
5. stable `--json` envelopes exist
6. CI coverage exists across implemented groups

## What Is Still Missing

The most important missing pieces are:

1. richer human-readable formatting for heavy inspection commands
2. a canonical end-to-end CLI happy-path demo
3. broader run filtering and pagination only after stronger backend support exists
4. true replay mutation flows only after stronger backend guardrails exist

These were not skipped accidentally.

The remaining missing pieces are deferred because the current backend still does not expose a broader generic runtime-run model that would justify larger commands.

## Current Boundaries

The CLI is still bounded in these ways:

1. runtime lifecycle is still local Lite oriented
2. it is not a hosted multi-tenant control-plane CLI
3. replay mutation flows are still intentionally deferred
4. some planned commands remain blocked on backend surface maturity

The current rule remains correct:

**do not invent broad CLI commands that are not backed by real runtime surfaces**

## Why This Stage Matters

This stage matters because it proves the right product direction:

1. Aionis does not need a management UI to become a real product
2. a CLI-first runtime surface is viable
3. the runtime can already be operated, inspected, explained, and gated from terminal and CI workflows
4. the CLI now matches Aionis's runtime-infra positioning better than a premature UI would

## Recommended Next Stage

The next stage should stay narrow.

Priority order:

1. expose real backend surfaces for `runs list` and `runs timeline`
2. add CLI commands on top of those real surfaces
3. keep replay mutation commands inspection-first unless backend mutation contracts become clearly stable
4. improve one canonical CLI workflow narrative:
   - start runtime
   - inspect run
   - inspect replay
   - evaluate artifacts
   - gate

## Bottom Line

The Runtime CLI is now beyond planning.

It is already:

1. a usable runtime operator surface
2. a usable eval/gate surface
3. a usable replay/playbook inspection surface

The remaining work is no longer “make the CLI real.”

It is:

**finish the missing real surfaces and harden the operator workflow.**
