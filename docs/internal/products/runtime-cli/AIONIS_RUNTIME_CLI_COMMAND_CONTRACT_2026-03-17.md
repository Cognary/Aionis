---
title: "Aionis Runtime CLI Command Contract"
---

# Aionis Runtime CLI Command Contract

Date: `2026-03-17`  
Status: `phase 1 command and output contract partially implemented`

Related:

1. [Runtime CLI Product Plan](./AIONIS_RUNTIME_CLI_PRODUCT_PLAN_2026-03-17.md)
2. [Runtime Architecture](../../architecture/AIONIS_RUNTIME_ARCHITECTURE_2026-03-17.md)
3. [Execution Eval Plan](../../plans/AIONIS_EXECUTION_EVAL_PLAN_2026-03-17.md)
4. [SDK CLI](/Users/lucio/Desktop/Aionis/docs/public/en/reference/09-sdk-cli.md)

## Purpose

This document turns the Runtime CLI product plan into an implementation contract.

It defines:

1. command groups
2. command naming rules
3. global flag rules
4. per-command argument contract
5. output contract
6. exit code contract
7. V1 implementation ordering

If implementation deviates from this contract, the contract must be updated first.

## Design Rules

The Runtime CLI should follow these rules:

1. commands must map to real operator jobs
2. every inspection command must support `--json`
3. default output must be readable in a terminal
4. machine-readable output must be stable and scriptable
5. mutation commands must be narrow and explicit
6. V1 should prefer inspection before broad mutation

The key rule is:

**V1 is an inspect/evaluate/reproduce CLI first, not a generic admin shell.**

## Top-Level Command Groups

The top-level command groups are:

1. `aionis runtime`
2. `aionis runs`
3. `aionis playbooks`
4. `aionis replay`
5. `aionis eval`
6. `aionis artifacts`

Compatibility aliases remain:

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

These are transitional aliases for:

1. `aionis runtime dev`
2. `aionis runtime stop`
3. `aionis runtime health`
4. `aionis runtime doctor`
5. `aionis runtime selfcheck`

## Global Flag Contract

The CLI should support these global flags where applicable:

1. `--json`
2. `--base-url <url>`
3. `--timeout-ms <int>`
4. `--no-color`

Rules:

1. `--json` must disable table-oriented text output and emit one stable JSON document
2. `--base-url` must override `AIONIS_BASE_URL`
3. `--timeout-ms` must override default network timeout
4. `--no-color` must suppress ANSI formatting in human-readable output

Global environment variables:

1. `AIONIS_BASE_URL`
2. `AIONIS_TIMEOUT_MS`

Runtime-specific env vars remain valid for `runtime` commands:

1. `AIONIS_DEV_HOST`
2. `AIONIS_DEV_PORT`
3. `AIONIS_RUNTIME_ROOT`
4. `AIONIS_RUNTIME_VERSION`
5. `AIONIS_RUNTIME_CACHE_DIR`

## Exit Code Contract

The CLI should use narrow, predictable exit codes.

V1 contract:

1. `0` = success
2. `1` = general CLI failure
3. `2` = usage / argument error
4. `3` = runtime unavailable / network failure
5. `4` = resource not found
6. `5` = evaluation gate failed

Rules:

1. `eval gate` must return `5` on a gate failure
2. missing run or playbook must return `4`
3. malformed flags or missing required args must return `2`

## Output Contract

Every command must support one of two output surfaces:

1. human-readable terminal output
2. machine-readable JSON

### Human-Readable Output Rules

Human-readable output should:

1. start with a one-line outcome summary when relevant
2. prefer compact sections over prose
3. use tables only for list/summary commands
4. avoid dumping raw nested JSON by default

### JSON Output Rules

JSON output must:

1. be a single JSON document
2. be stable across minor CLI revisions
3. include `command`
4. include `version`
5. include `generated_at`
6. include `data`

Canonical top-level shape:

```json
{
  "command": "aionis runs get",
  "version": "0.2.20",
  "generated_at": "2026-03-17T12:00:00.000Z",
  "data": {}
}
```

Error shape:

```json
{
  "command": "aionis runs get",
  "version": "0.2.20",
  "generated_at": "2026-03-17T12:00:00.000Z",
  "error": {
    "code": "run_not_found",
    "message": "Run not found",
    "details": {
      "run_id": "run_123"
    }
  }
}
```

## Group 1: `runtime`

Purpose:

1. start runtime
2. stop runtime
3. check runtime health
4. diagnose local environment
5. run self-check

### `aionis runtime dev`

Usage:

```bash
aionis runtime dev [--host <host>] [--port <port>] [--runtime-root <path>] [--runtime-version <version>] [--force-download] [--offline] [--foreground] [--json]
```

Human output:

1. runtime source
2. bound URL
3. pid
4. log path
5. sqlite paths when relevant

JSON `data` shape:

```json
{
  "mode": "dev",
  "base_url": "http://127.0.0.1:3321",
  "pid": 12345,
  "runtime_root": "/abs/path/Aionis",
  "runtime_source": "local_repo",
  "log_file": "/abs/path/.aionis/dev/lite-3321.log"
}
```

### `aionis runtime stop`

Usage:

```bash
aionis runtime stop [--port <port>] [--json]
```

JSON `data` shape:

```json
{
  "port": 3321,
  "stopped": true,
  "pid": 12345
}
```

### `aionis runtime health`

Usage:

```bash
aionis runtime health [--base-url <url>] [--timeout-ms <int>] [--json]
```

JSON `data` shape:

```json
{
  "base_url": "http://127.0.0.1:3321",
  "ok": true,
  "status": 200,
  "latency_ms": 32
}
```

### `aionis runtime doctor`

Usage:

```bash
aionis runtime doctor [--runtime-root <path>] [--runtime-version <version>] [--runtime-cache-dir <path>] [--base-url <url>] [--json]
```

JSON `data` shape:

```json
{
  "checks": [
    {
      "name": "runtime_root_detected",
      "ok": true,
      "detail": "/abs/path/Aionis"
    }
  ]
}
```

### `aionis runtime selfcheck`

Usage:

```bash
aionis runtime selfcheck [--base-url <url>] [--timeout-ms <int>] [--json]
```

JSON `data` shape:

```json
{
  "ok": true,
  "steps": [
    {
      "name": "health",
      "ok": true
    }
  ]
}
```

## Group 2: `runs`

Purpose:

1. inspect execution runs
2. inspect run state and outcome
3. inspect decisions and feedback lineage

### Shared Rules

All `runs` commands should accept:

1. `--base-url <url>`
2. `--json`

### `aionis runs list`

Usage:

```bash
aionis runs list [--scope <scope>] [--limit <int>] [--json]
```

Human output columns:

1. `RUN_ID`
2. `STATUS`
3. `DECISIONS`
4. `FEEDBACK`
5. `LATEST_DECISION_AT`

JSON `data` shape:

```json
{
  "scope": "default",
  "items": [
    {
      "run_id": "run_123",
      "status": "feedback_linked",
      "decision_count": 3,
      "feedback_total": 1,
      "latest_decision_at": "2026-03-17T12:10:00.000Z",
      "latest_feedback_at": "2026-03-17T12:11:00.000Z",
      "latest_selected_tool": "rg"
    }
  ]
}
```

Current V1 implementation note:

1. `runs list` is implemented as a real execution-decision rollup
2. it is scoped to tool-selection lifecycle runs, not a generic cross-runtime run model
3. it intentionally does not expose fake cursor or host-specific scenario filters

### `aionis runs get <run_id>`

Usage:

```bash
aionis runs get <run_id> [--json]
```

Human output sections:

1. summary
2. execution state
3. continuity summary
4. evaluation summary

JSON `data` shape:

```json
{
  "run_id": "run_123",
  "status": "completed",
  "scenario_id": "glm_dashboard_auth_drift_reviewer_ready_workflow",
  "execution_state": {},
  "continuity": {},
  "evaluation": {}
}
```

Current V1 implementation note:

1. `runs get` is currently backed by `tools/run`
2. this is a real run inspection surface for tool-selection lifecycle, not a generic cross-runtime run model

### `aionis runs timeline <run_id>`

Usage:

```bash
aionis runs timeline <run_id> [--scope <scope>] [--decision-limit <n>] [--feedback-limit <n>] [--json]
```

Human output:

1. ordered event stream

JSON `data` shape:

```json
{
  "run_id": "run_123",
  "events": [
    {
      "type": "feedback",
      "timestamp": "2026-03-17T12:01:00.000Z",
      "summary": "outcome=positive source=tools_feedback"
    },
    {
      "type": "decision",
      "timestamp": "2026-03-17T12:00:00.000Z",
      "summary": "selected_tool=rg"
    }
  ]
}
```

Current V1 implementation note:

1. `runs timeline` is implemented by composing real `tools/run` decisions and feedback
2. it is a tool-lifecycle event stream, not a universal runtime timeline

### `aionis runs decisions <run_id>`

Usage:

```bash
aionis runs decisions <run_id> [--json]
```

JSON `data` shape:

```json
{
  "run_id": "run_123",
  "decisions": [
    {
      "decision_id": "dec_123",
      "kind": "tools_select",
      "selected": "tool_a",
      "policy_match": "rule_123"
    }
  ]
}
```

Current V1 implementation note:

1. `runs decisions` is backed by `tools/run` decisions plus `tools/decision` latest-by-run lookup

### `aionis runs feedback <run_id>`

Usage:

```bash
aionis runs feedback <run_id> [--json]
```

JSON `data` shape:

```json
{
  "run_id": "run_123",
  "feedback": [
    {
      "feedback_id": "fb_123",
      "kind": "tool_feedback",
      "outcome": "positive",
      "rule_id": "rule_123"
    }
  ]
}
```

Current V1 implementation note:

1. `runs feedback` is backed by `tools/run` with `include_feedback=true`

## Group 3: `playbooks`

Purpose:

1. inspect reusable replay assets
2. inspect versions and state
3. inspect candidate playbooks for a run

### `aionis playbooks list`

Usage:

```bash
aionis playbooks list [--state <state>] [--limit <int>] [--cursor <cursor>] [--json]
```

Human output columns:

1. `PLAYBOOK_ID`
2. `STATE`
3. `VERSION`
4. `UPDATED`
5. `SOURCE`

### `aionis playbooks get <playbook_id>`

Usage:

```bash
aionis playbooks get <playbook_id> [--json]
```

JSON `data` shape:

```json
{
  "playbook_id": "pb_123",
  "state": "approved",
  "version": 3,
  "steps_template": [],
  "matcher": {},
  "review": {}
}
```

### `aionis playbooks versions <playbook_id>`

Usage:

```bash
aionis playbooks versions <playbook_id> [--json]
```

### `aionis playbooks candidate <run_id>`

Usage:

```bash
aionis playbooks candidate <run_id> [--json]
```

JSON `data` shape:

```json
{
  "run_id": "run_123",
  "candidates": [
    {
      "playbook_id": "pb_123",
      "score": 0.92,
      "reason": "High matcher overlap"
    }
  ]
}
```

### `aionis playbooks dispatch <playbook_id>`

Usage:

```bash
aionis playbooks dispatch <playbook_id> [--json]
```

V1 boundary:

1. inspection-first implementation may ship with this command as a stub or explicit `not_yet_supported`
2. if shipped, it must be narrow and explicit

## Group 4: `replay`

Purpose:

1. inspect replayability
2. inspect recovery surfaces
3. explain divergence

### `aionis replay inspect-run <run_id>`

Usage:

```bash
aionis replay inspect-run <run_id> [--json]
```

JSON `data` shape:

```json
{
  "run_id": "run_123",
  "replayable": true,
  "candidate_playbooks": [],
  "recovery_points": []
}
```

### `aionis replay inspect-playbook <playbook_id>`

Usage:

```bash
aionis replay inspect-playbook <playbook_id> [--json]
```

Current V1 implementation note:

1. `replay inspect-playbook` is implemented as an inspection composition over `playbooks/get` and `playbooks/candidate`
2. it must remain read-only

### `aionis replay recover <run_id>`

Usage:

```bash
aionis replay recover <run_id> [--scope <scope>] [--allow-partial] [--json]
```

V1 boundary:

1. `replay recover` is implemented as a read-only recovery planning surface over `replay/runs/get`
2. it must not mutate replay state or auto-compile anything
3. it returns a structured recovery plan:
   - `recoverable`
   - `recovery_path`
   - `blockers`
   - `next_action`
4. `--allow-partial` permits an inspection result for partially successful runs, but does not bypass mutation safeguards

### `aionis replay explain <run_id>`

Usage:

```bash
aionis replay explain <run_id> [--json]
```

Purpose:

1. explain why replay is or is not available
2. explain continuity breaks
3. explain missing state or evidence

Current V1 implementation note:

1. `replay explain` is implemented as a read-only inspection over `replay/runs/get`
2. it explains `compile_from_run` viability only
3. it must not mutate or auto-compile anything

## Group 5: `eval`

Purpose:

1. inspect execution evaluation
2. compare baseline and treatment
3. enforce gate decisions in CI

### `aionis eval inspect`

Usage:

```bash
aionis eval inspect --artifact-dir <path> [--json]
```

JSON `data` shape:

```json
{
  "artifact_dir": "/abs/path/artifacts/run",
  "summary": {
    "baseline": {
      "result": "pass"
    },
    "treatment": {
      "result": "pass"
    },
    "completion_gain": 0.3333,
    "reviewer_readiness_gain": 0.3333
  }
}
```

### `aionis eval compare`

Usage:

```bash
aionis eval compare --baseline <path> --treatment <path> [--json]
```

Purpose:

1. compare two eval payloads or artifact roots
2. support local regression analysis outside CI

### `aionis eval gate`

Usage:

```bash
aionis eval gate --artifact-dir <path> [--json]
```

Rules:

1. emits pass/fail verdict
2. exits `0` on pass
3. exits `5` on gate failure

JSON `data` shape:

```json
{
  "artifact_dir": "/abs/path/artifacts/run",
  "verdict": "pass",
  "reasons": []
}
```

## Group 6: `artifacts`

Purpose:

1. inspect produced execution artifacts
2. export portable packs
3. list available run evidence

### `aionis artifacts list`

Usage:

```bash
aionis artifacts list --artifact-dir <path> [--json]
```

### `aionis artifacts show`

Usage:

```bash
aionis artifacts show --artifact-dir <path> --name <file> [--json]
```

### `aionis artifacts export`

Usage:

```bash
aionis artifacts export --artifact-dir <path> --out <path> [--json]
```

### `aionis artifacts pack`

Usage:

```bash
aionis artifacts pack --artifact-dir <path> --out <path> [--json]
```

Purpose:

1. create a portable debugging/eval package

## V1 Implementation Order

The command groups should not be implemented all at once.

Recommended order:

1. `runtime`
2. `eval`
3. `runs`
4. `artifacts`
5. `playbooks`
6. `replay`

Reason:

1. `runtime` extends the current shipped CLI
2. `eval` already has a strong real artifact surface
3. `runs` is the next most important inspection job
4. `artifacts` supports CI/debug packaging
5. `playbooks` and `replay` should land after the basic inspection model is stable

## Implementation Discipline

When implementing each command:

1. define the underlying runtime/API dependency first
2. define JSON contract first
3. add human-readable formatter second
4. add public docs last

No command should ship if:

1. it has no stable `--json` output
2. it silently mutates state without explicit operator intent
3. its human-readable output is the only supported output surface

## Summary

The Aionis Runtime CLI should become:

1. the runtime operator shell
2. the execution inspection shell
3. the execution evaluation shell

V1 should prioritize:

1. reliable runtime lifecycle
2. stable eval inspection/gating
3. scriptable run inspection

That is the minimum command contract required for the CLI to become a real product surface.
