---
title: "Real GitHub Repo Policy A/B"
---

# Real GitHub Repo Policy A/B

This page documents a real-repository policy benchmark on the Click codebase.

The question is not whether an agent can eventually finish a task. The question is whether Aionis policy changes tool routing on a real repository and keeps execution on the intended focused path.

## Repository

1. repo: `pallets/click`
2. commit: `cdab890e57a30a9f437b88ce9652f7bfce980c1f`

## Benchmark Design

Each case runs the same real repository task under two conditions:

1. `without Aionis policy`
   - search uses `grep`
   - test execution uses `pytest-all`
2. `with Aionis policy`
   - ACTIVE rule prefers `rg`
   - ACTIVE rule prefers `pytest-focused`

All cases use the same repository snapshot and the same acceptance targets.

## Cases

1. parser/options scope
2. parser/shell completion scope
3. testing/termui scope

## Results

Artifacts:

1. summary:
   - `/Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-policy-ab-20260313-201800/summary.json`
2. per-case rows:
   - `/Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-policy-ab-20260313-201800/cases.jsonl`

Baseline:

1. success rate: `0.0`
2. avg duration: `6720.0 ms`
3. expected search tool rate: `0.0`
4. expected test tool rate: `0.0`

Treatment:

1. success rate: `1.0`
2. avg duration: `2136.0 ms`
3. expected search tool rate: `1.0`
4. expected test tool rate: `1.0`
5. avg rule write: `64.67 ms`
6. avg rule activate: `11.33 ms`
7. avg search select: `21.0 ms`
8. avg test select: `8.33 ms`

## What This Proves

This benchmark shows:

1. Aionis policy changes tool choice on a real GitHub repository.
2. The policy path keeps execution on focused tooling:
   - `rg`
   - `pytest-focused`
3. A non-policy baseline drifts onto broad tooling:
   - `grep`
   - `pytest-all`
4. The difference is visible both in selected tools and in end-to-end task success.

## Why This Matters

This is stronger than a synthetic selector demo.

It shows that Aionis policy is not only an abstract rule layer. It can constrain tool routing in a real repository workflow and keep the agent on a narrower, cheaper, and more task-relevant execution path.

## Reproduce

Start Lite:

```bash
cd /Users/lucio/Desktop/Aionis

PORT=3338 \
AIONIS_EDITION=lite \
AIONIS_MODE=local \
MEMORY_AUTH_MODE=off \
TENANT_QUOTA_ENABLED=false \
RATE_LIMIT_BYPASS_LOOPBACK=true \
LITE_WRITE_SQLITE_PATH=/tmp/aionis-policy-realrepo-3338/write.sqlite \
LITE_REPLAY_SQLITE_PATH=/tmp/aionis-policy-realrepo-3338/replay.sqlite \
bash scripts/start-lite.sh
```

Run the benchmark:

```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench
. .venv/bin/activate

export REAL_REPO_PYTHON=/Users/lucio/.local/share/uv/python/cpython-3.10.19-macos-aarch64-none/bin/python3.10

python -m cross_boundary_aionis_bench.cli real-repo-policy-ab \
  --aionis-base-url http://127.0.0.1:3338
```

## Boundary

This benchmark proves:

1. real-repo tool routing changes under ACTIVE policy
2. focused search and focused pytest routing can be enforced
3. policy affects real execution outcomes on GitHub code

It does not prove:

1. global optimal policy for all repositories
2. token reduction for every task shape
3. replay behavior
