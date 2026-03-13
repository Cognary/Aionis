---
title: "Real GitHub Repo Handoff A/B"
---

# Real GitHub Repo Handoff A/B

Last updated: `2026-03-13`

This page documents a same-repository A/B benchmark for externalized handoff quality.

The goal is simple:

1. keep the repository fixed,
2. keep the commit fixed,
3. keep the tasks fixed,
4. compare `without Aionis` and `with Aionis` on the same real codebase.

## Scope Statement

Repository:

1. URL: `https://github.com/pallets/click.git`
2. Commit: `cdab890e57a30a9f437b88ce9652f7bfce980c1f`

Cases:

1. `click_real_repo_001`
2. `click_real_repo_002`
3. `click_real_repo_003`

Comparison:

1. baseline transport: `file_export`
2. treatment transport: `aionis_handoff`

This benchmark is about externalized execution-contract quality, not replay.

## Public Claim

On the same real GitHub repository and the same fixed tasks:

1. lossy `file_export` preserved only partial repo/test scope,
2. `aionis_handoff` preserved the full execution contract,
3. the success-rate difference was structural, not prompt-only.

## Results

| Arm | Cases | Success rate | Avg duration ms | Avg focused files | Avg pytest targets |
| --- | --- | --- | --- | --- | --- |
| `file_export` | `3` | `0.0%` | `11841.0` | `1.0` | `1.0` |
| `aionis_handoff` | `3` | `100.0%` | `12033.0` | `4.0` | `2.0` |

Interpretation:

1. baseline stayed faster only because it did less work: it retained only one file and one test target on average.
2. Aionis handoff preserved the multi-file target set and the full test scope.
3. The important claim is not latency. The important claim is contract completeness.

## Case-Level Pattern

### `click_real_repo_001`

Baseline:

1. focused files: `1`
2. pytest targets: `1`
3. only `src/click/parser.py` evidence survived
4. `src/click/core.py`, `tests/test_parser.py`, and `tests/test_options.py` were lost

Treatment:

1. focused files: `4`
2. pytest targets: `2`
3. all expected file and test markers were preserved

The same loss pattern appears in:

1. `click_real_repo_002`
2. `click_real_repo_003`

## Why This Matters

This benchmark answers a narrower and more important question than "does memory help?".

It answers:

**Can an externalized contract preserve the real repository and test scope needed for the next agent stage?**

In this benchmark:

1. weak exported notes could not,
2. Aionis handoff could.

That is the actual value being measured.

## Reproduce

### Prerequisites

1. local Aionis Lite endpoint
2. companion experiment workspace:
   `/Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench`
3. Python `>=3.10`

If the machine default `python3` is older, set:

```bash
export REAL_REPO_PYTHON=/Users/lucio/.local/share/uv/python/cpython-3.10.19-macos-aarch64-none/bin/python3.10
```

### Run

```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench
source .venv/bin/activate

python -m cross_boundary_aionis_bench.cli real-repo-handoff-ab \
  --aionis-base-url http://127.0.0.1:3321 \
  --case-id click_real_repo_001 \
  --case-id click_real_repo_002 \
  --case-id click_real_repo_003
```

## Artifact Paths

Primary disclosure artifacts:

1. run directory:
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-handoff-ab-20260313-195606/`
2. manual summary:
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-handoff-ab-20260313-195606/manual-summary.json`
3. manual case details:
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-handoff-ab-20260313-195606/manual-cases.json`

## Result Boundary

This benchmark proves:

1. Aionis handoff preserves real-repo execution scope better than a lossy exported baseline.
2. The difference is visible on file coverage and test-target coverage.
3. Externalized execution contracts can materially change success on the same real repository task.

It does not prove:

1. replay performance,
2. policy-loop behavior,
3. universal superiority over every framework-native state system.
