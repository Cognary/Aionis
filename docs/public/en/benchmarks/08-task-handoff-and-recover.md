---
title: "Task Handoff and Recover Semantics"
---

# Task Handoff and Recover Semantics

Last updated: `2026-03-13`

This page documents two additive handoff upgrades in Aionis:

1. `repo_root` is now a first-class recover discriminator.
2. `task_handoff` no longer requires `file_path`.

These changes matter because Aionis is not only for code-file patch handoffs. It is also meant to externalize execution contracts for approvals, browser tasks, incident workflows, and other non-file-centered agent work.

## Public Claims

### 1. `repo_root` is now part of recover matching

Aionis `handoff/recover` can now disambiguate contracts by `repo_root`, instead of relying only on:

1. `anchor`
2. `file_path`
3. `symbol`

This closes a correctness gap in shared scopes where multiple repos or workspaces could otherwise produce competing handoffs with the same anchor and file path.

### 2. `task_handoff` is now valid without `file_path`

Aionis now allows non-file-centered handoff contracts through the native handoff route and the MCP/dev tool surface.

This means the same handoff model can be used for:

1. deployment approvals
2. browser checkout continuation
3. incident escalation
4. other execution contracts that are not rooted in a single code file

## Controlled Cross-Process Task Handoff Benchmark

Environment:

1. `planner`: separate process
2. `executor`: separate process
3. `reviewer`: separate process
4. baseline transport: lossy `file_export`
5. treatment transport: `aionis_handoff`
6. case family: non-file-centered `task_handoff`

Cases:

1. deployment approval continuation
2. browser checkout confirmation
3. incident escalation continuation

Results:

| Transport | Cases | Success rate | Avg quality score | Avg store ms | Avg recover ms |
| --- | --- | --- | --- | --- | --- |
| `file_export` | `3` | `0%` | `0.3730` | `0` | `0` |
| `aionis_handoff` | `3` | `100%` | `1.0000` | `28.33` | `10.0` |

Interpretation:

1. The lossy baseline retained summary text but dropped execution-critical fields like `next_action` and `must_keep`.
2. Native `task_handoff` preserved those fields across the process boundary.
3. This is evidence that Aionis handoff is not only a code-file patch artifact; it is an external execution contract.

## Reproduce

### Prerequisites

1. A local Aionis Lite endpoint
2. The companion experiment workspace:
   `aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench`
3. Python `3.9+`
4. `uv`

### Experiment Setup

```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench
uv venv
source .venv/bin/activate
uv pip install -e .
```

### Run the baseline

```bash
python -m cross_boundary_aionis_bench.task_handoff_bench run \
  --transport file_export
```

### Run the Aionis treatment

```bash
python -m cross_boundary_aionis_bench.task_handoff_bench run \
  --transport aionis_handoff \
  --aionis-base-url http://127.0.0.1:3321
```

## Artifact Paths

The public values on this page come from these experiment outputs:

1. baseline:
   `experiments/cross-boundary-aionis-bench/artifacts/task-handoff-file_export-20260313-191019/`
2. treatment:
   `experiments/cross-boundary-aionis-bench/artifacts/task-handoff-aionis_handoff-20260313-191021/`

## Why This Matters

1. `repo_root` makes handoff recovery safer in shared scopes.
2. `task_handoff` expands Aionis beyond file-centered patch continuation.
3. Aionis can now externalize non-file execution contracts without forcing them into a code-file schema.

## Related

1. [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay)
2. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
