---
title: "Aionis Runtime CLI Product Plan"
---

# Aionis Runtime CLI Product Plan

Date: `2026-03-17`  
Status: `phase 1 runtime cli product surface established`

Related:

1. [Runtime Architecture](../../architecture/AIONIS_RUNTIME_ARCHITECTURE_2026-03-17.md)
2. [Self-Learning Mechanism](../../architecture/AIONIS_SELF_LEARNING_MECHANISM_2026-03-17.md)
3. [Execution Eval Plan](../../plans/AIONIS_EXECUTION_EVAL_PLAN_2026-03-17.md)
4. [Ideal Customer Profile](../../strategy/AIONIS_IDEAL_CUSTOMER_PROFILE_2026-03-17.md)
5. [SDK CLI](/Users/lucio/Desktop/Aionis/docs/public/en/reference/09-sdk-cli.md)
6. [Runtime CLI Command Contract](./AIONIS_RUNTIME_CLI_COMMAND_CONTRACT_2026-03-17.md)

## Executive Summary

Aionis should not require a management UI to become a real product.

The correct next product surface is:

**Aionis Runtime CLI**

This is not just a developer bootstrap utility.

It should become the primary operator-facing product surface for:

1. starting and checking runtime
2. inspecting runs and playbooks
3. evaluating and comparing execution outcomes
4. replay and recovery inspection
5. exporting execution artifacts for CI, release, and debugging workflows

The CLI should make Aionis usable as a runtime infrastructure product even when no UI exists.

## Product Definition

The product definition is:

**Aionis Runtime CLI is the command-line surface for operating, inspecting, replaying, and evaluating coding-agent execution on the Aionis runtime.**

That means the CLI must cover two things at once:

1. runtime lifecycle
2. execution lifecycle

The CLI now covers runtime lifecycle plus the first real operator path for inspection, replay diagnosis, artifacts, and execution eval.

This plan now acts as the product-definition anchor for extending the CLI without losing the runtime-infra boundary.

## Current State

Current CLI entrypoint:

1. [packages/sdk/src/cli.ts](/Users/lucio/Desktop/Aionis/packages/sdk/src/cli.ts)

Current commands:

1. `aionis runtime dev|stop|health|doctor|selfcheck`
2. `aionis eval inspect|compare|gate`
3. `aionis runs list|get|timeline|decisions|feedback`
4. `aionis playbooks get|candidate|dispatch`
5. `aionis replay inspect-run|inspect-playbook|recover|explain`
6. `aionis artifacts list|show|export|pack`

Current boundary:

1. local Lite only
2. still inspection-first rather than mutation-heavy
3. not yet a hosted multi-tenant control-plane CLI

This is now a real Phase 1 runtime CLI surface.

It is not yet a complete hosted runtime product.

## Why CLI First Is The Right Move

CLI-first is the correct next surface because:

1. Aionis is runtime infrastructure, not an end-user chat app
2. real users already live in terminal, CI, and automation surfaces
3. execution inspection, replay, compare, and eval are naturally scriptable
4. CLI lets the product become real without prematurely forcing a UI/control-plane build

The key rule is:

**the CLI must become a user workflow surface, not just a local setup helper**

## Primary Users

The primary CLI users are:

1. AI engineer
2. platform engineer
3. developer tools engineer
4. internal agent runtime owner
5. release/nightly owner

They are not opening Aionis for casual browsing.

They are using it when:

1. a runtime must be started or checked
2. a run failed and needs inspection
3. a playbook needs review
4. a nightly/regression result must be gated
5. baseline and treatment need to be compared

## Core User Jobs

The CLI product exists to let users do these jobs:

### Job 1: Operate runtime

The user needs to:

1. start runtime
2. stop runtime
3. check health
4. diagnose environment issues
5. self-check the installation

### Job 2: Inspect execution

The user needs to:

1. list runs
2. inspect one run
3. inspect replay and recovery state
4. inspect one playbook
5. inspect execution decisions and feedback lineage

### Job 3: Evaluate execution quality

The user needs to:

1. inspect execution eval summaries
2. compare baseline and treatment
3. decide pass/fail
4. export machine-readable output for CI

### Job 4: Reproduce and debug

The user needs to:

1. inspect replay candidates
2. inspect playbook versions
3. understand where a run diverged
4. reproduce or at least precisely inspect the evidence chain behind a result

If the CLI cannot support those jobs, it is not a real product CLI.

## Product Positioning

The CLI should be positioned as:

**the operational shell for Aionis Runtime**

It is not:

1. a generic shell for everything in the repo
2. a developer-only bootstrap script
3. an internal admin tool

Current reading:

1. it has already moved past bootstrap-only
2. it is already a usable runtime operator shell
3. the remaining work is hardening and backend-surface completion, not proving the product surface exists

The user-facing promise should be:

**Operate the runtime. Inspect the run. Evaluate the result.**

## Command Architecture

The CLI should move from a flat command set into command groups.

Recommended top-level structure:

1. `aionis runtime ...`
2. `aionis runs ...`
3. `aionis playbooks ...`
4. `aionis replay ...`
5. `aionis eval ...`
6. `aionis artifacts ...`

Current Phase 1 commands should remain available, but migrate under `runtime`.

### Group 1: `runtime`

Purpose:

1. lifecycle and environment

Commands:

1. `aionis runtime dev`
2. `aionis runtime stop`
3. `aionis runtime health`
4. `aionis runtime doctor`
5. `aionis runtime selfcheck`

Compatibility:

1. keep `aionis dev`, `stop`, `health`, `doctor`, `selfcheck` as transitional aliases

### Group 2: `runs`

Purpose:

1. inspect execution runs

Commands:

1. `aionis runs list`
2. `aionis runs get <run_id>`
3. `aionis runs timeline <run_id>`
4. `aionis runs decisions <run_id>`
5. `aionis runs feedback <run_id>`

Minimum output:

1. table mode for humans
2. `--json` mode for machines

### Group 3: `playbooks`

Purpose:

1. inspect compiled and promoted replay assets

Commands:

1. `aionis playbooks list`
2. `aionis playbooks get <playbook_id>`
3. `aionis playbooks versions <playbook_id>`
4. `aionis playbooks candidate <run_id|context>`
5. `aionis playbooks dispatch <playbook_id|candidate>`

Minimum outcome:

1. a user can inspect the exact reusable procedure behind a replay path

### Group 4: `replay`

Purpose:

1. replay/recovery inspection and debugging

Commands:

1. `aionis replay inspect-run <run_id>`
2. `aionis replay inspect-playbook <playbook_id>`
3. `aionis replay recover <handoff_id|run_id>`
4. `aionis replay explain <run_id>`

Important boundary:

V1 should prioritize inspection and explanation before adding broad mutation commands.

### Group 5: `eval`

Purpose:

1. execution-quality evaluation and gating

Commands:

1. `aionis eval inspect --artifact-dir <dir>`
2. `aionis eval compare --baseline <dir> --treatment <dir>`
3. `aionis eval gate --artifact-dir <dir>`

This should expose the already-built `Execution Eval` capability as a real product surface.

### Group 6: `artifacts`

Purpose:

1. packaging, export, and inspection of execution artifacts

Commands:

1. `aionis artifacts list --artifact-dir <dir>`
2. `aionis artifacts show <path>`
3. `aionis artifacts export --run-id <run_id>`
4. `aionis artifacts pack --artifact-dir <dir>`

This group matters because many users will meet Aionis through nightly artifacts before they meet it through a UI.

## User Flows

The CLI should be designed around real user flows, not isolated commands.

### Flow 1: Local runtime setup

1. `aionis runtime dev`
2. `aionis runtime health`
3. `aionis runtime selfcheck`

Outcome:

1. user knows the runtime is alive and usable

### Flow 2: Failed run diagnosis

1. `aionis runs list --status failed`
2. `aionis runs get <run_id>`
3. `aionis runs timeline <run_id>`
4. `aionis replay explain <run_id>`
5. `aionis eval inspect --artifact-dir <dir>`

Outcome:

1. user can explain failure and continuity state without reading raw JSON by hand

### Flow 3: Replay asset inspection

1. `aionis playbooks list`
2. `aionis playbooks get <playbook_id>`
3. `aionis playbooks versions <playbook_id>`
4. `aionis replay inspect-playbook <playbook_id>`

Outcome:

1. user can inspect the reusable procedure and its evolution history

### Flow 4: Nightly gate

1. nightly job produces artifacts
2. `aionis eval inspect --artifact-dir <dir>`
3. `aionis eval gate --artifact-dir <dir>`
4. optional `aionis eval compare --baseline <dir> --treatment <dir>`

Outcome:

1. CI or operator can decide pass/fail with a stable contract

## Output Design

The CLI should always support two output modes:

1. human-readable
2. machine-readable `--json`

Recommended output rules:

1. default output should be concise and scannable
2. `--json` must be stable enough for CI and scripts
3. every command that returns an identifier should also support `--uri`
4. tables should be used only for summary/list views

The CLI should not force users to parse prose for operational decisions.

## Design Constraints

The CLI must follow these constraints:

1. no command should require a UI to be useful
2. no command should require local source inspection to interpret results
3. every runtime-inspection command should support `--json`
4. every command group must map to a real user job
5. no command group should exist just because the internal architecture has a matching module

This last rule matters.

Internal runtime pillars are useful for architecture.
They are not automatically correct as top-level user-facing command groups.

## What V1 Should Not Do

The CLI should not become:

1. a kitchen-sink repo shell
2. a broad admin console replacement
3. a generic workflow builder
4. a debugging shell for every internal subsystem
5. a tool-selection experimentation surface first

The product must stay anchored in runtime operation and execution inspection.

## Recommended V1 Scope

The V1 product CLI should ship in three layers.

### Layer 1: Runtime lifecycle

Already partly present:

1. `dev`
2. `stop`
3. `health`
4. `doctor`
5. `selfcheck`

### Layer 2: Execution inspection

Must be added:

1. `runs list`
2. `runs get`
3. `playbooks list`
4. `playbooks get`
5. `replay explain`

### Layer 3: Evaluation

Must be added:

1. `eval inspect`
2. `eval compare`
3. `eval gate`

This is enough for a real first product CLI.

## Implementation Sequence

### Phase 1: CLI architecture refactor

Goals:

1. move from flat command enum to grouped command model
2. preserve backward compatibility aliases
3. centralize output formatting and `--json` handling

### Phase 2: Runtime group stabilization

Goals:

1. keep existing Lite workflow stable
2. move docs from “Phase 1 dev CLI” toward “runtime lifecycle CLI”

### Phase 3: Read-only execution inspection

Goals:

1. add `runs`
2. add `playbooks`
3. add `replay explain`

Read-only first is deliberate.

### Phase 4: Eval productization

Goals:

1. expose `Execution Eval` through CLI
2. make nightly/gate consumption first-class

### Phase 5: Artifact ergonomics

Goals:

1. export
2. pack
3. summarize
4. compare

## Success Criteria

The CLI plan succeeds if:

1. users can operate local runtime without reading shell scripts
2. users can inspect a failed run without manually opening raw artifact files
3. users can inspect a playbook and its versions from the CLI
4. users can gate nightly results through CLI output alone
5. the CLI feels like the operational shell of the runtime, not just a setup helper

## Failure Criteria

This plan fails if:

1. the CLI stays limited to `dev/health/doctor/selfcheck`
2. users still need raw files for ordinary inspection
3. command groups do not correspond to actual jobs
4. the CLI becomes a dumping ground for internal utilities
5. `Execution Eval` remains a hidden script instead of a real CLI product surface

## Immediate Next Step

The next step after this plan is:

**write the V1 command contract and output contract before touching implementation**

That means defining:

1. exact command tree
2. flags and aliases
3. output fields for each command
4. `--json` schemas for the first V1 command set

Without that contract, the CLI will drift into ad hoc commands instead of becoming a product surface.

That contract now lives in:

1. [Runtime CLI Command Contract](./AIONIS_RUNTIME_CLI_COMMAND_CONTRACT_2026-03-17.md)
