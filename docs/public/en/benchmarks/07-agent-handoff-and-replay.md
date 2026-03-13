---
title: "Agent Handoff and Replay"
---

# Agent Handoff and Replay

Last updated: `2026-03-13`

This page is the public benchmark disclosure for Aionis handoff and replay evidence.

The simplest way to read it is as a progression:

1. `without Aionis`: lossy externalized handoff,
2. `with Aionis handoff`: preserved execution contract,
3. `with Aionis replay`: preserved contract plus deterministic execution reuse.

## Scope Statement

This disclosure covers reproducible runs for:

1. Cross-process and cross-runtime handoff recovery
2. Real GitHub repository replay (`baseline -> compile -> replay1 -> replay2`)
3. Guided replay repair token usage in a documented smoke run

Non-claims:

1. Not a claim that Aionis outperforms a framework's in-memory state inside a single runtime
2. Not a universal benchmark across all agent frameworks, providers, or hardware
3. Not a claim that guided replay is zero-token; only strict replay under the documented mode is zero-token

## Public Claims

### 1. Cross-runtime handoff preserves execution contracts better than a lossy externalized baseline

Environment:

1. `planner`: separate process
2. `executor`: `LangGraph` LLM runtime
3. `reviewer`: separate process
4. baseline transport: `file_export`
5. treatment transport: `aionis_handoff`

| Transport | Cases | Success rate | Avg total tokens | Avg store ms | Avg recover ms |
| --- | --- | --- | --- | --- | --- |
| `file_export + langgraph_llm` | `3` | `33.33%` | `2370.0` | `0` | `0` |
| `aionis_handoff + langgraph_llm` | `3` | `100%` | `2624.0` | `121.0` | `24.0` |

Interpretation:

1. The baseline exported a lossy contract and dropped execution facts in `2/3` cases.
2. Aionis handoff preserved the contract across process and runtime boundaries in `3/3` cases.
3. The primary claim here is alignment quality, not token reduction.

### 1b. On the same real GitHub repository, Aionis handoff preserves the full repo and test scope

Repository:

1. URL: `https://github.com/pallets/click.git`
2. Commit: `cdab890e57a30a9f437b88ce9652f7bfce980c1f`
3. Cases: `click_real_repo_001`, `click_real_repo_002`, `click_real_repo_003`

| Arm | Cases | Success rate | Avg duration ms | Avg focused files | Avg pytest targets |
| --- | --- | --- | --- | --- | --- |
| `file_export` | `3` | `0.0%` | `11841.0` | `1.0` | `1.0` |
| `aionis_handoff` | `3` | `100.0%` | `12033.0` | `4.0` | `2.0` |

Interpretation:

1. The baseline did not fail because the repo was invalid. It failed because the externalized contract dropped most of the repo and test scope.
2. Aionis handoff preserved the full multi-file target set and the full test-target set.
3. The key claim is contract completeness on a real repository, not latency leadership.

### 2. Real-repo strict replay is a zero-model-token execution path

Repository:

1. URL: `https://github.com/pallets/click.git`
2. Commit: `cdab890e57a30a9f437b88ce9652f7bfce980c1f`
3. Cases: `click_real_repo_001`, `click_real_repo_002`, `click_real_repo_003`
4. Replay mode: `strict`
5. Backend: `local_process`

| Metric | Value |
| --- | --- |
| Cases | `3` |
| Baseline success rate | `100%` |
| Compile success rate | `100%` |
| Replay1 success rate | `100%` |
| Replay2 success rate | `100%` |
| Avg compile tokens | `4259.67` |
| Avg replay1 tokens | `0.0` |
| Avg replay2 tokens | `0.0` |
| Replay usage source | `no_model_call` |
| Avg baseline ms | `16237.67` |
| Avg replay1 ms | `7399.67` |
| Avg replay2 ms | `7183.67` |
| Replay2 vs replay1 speedup | `1.0301x` |

Interpretation:

1. `compile_from_run` consumes model tokens.
2. `strict/local_process replay1` and `replay2` consume `0` model tokens in this setup.
3. Replay is not just valid; it is a deterministic zero-token execution path under the documented mode.

### 3. Guided replay spends tokens only when repair is needed

Current guided evidence is a documented single-case smoke on the same `click` repository, with an intentional failure inserted to force guided repair.

| Metric | Value |
| --- | --- |
| Case | `click_real_repo_001` |
| Guided repair strategy | `builtin_llm` |
| Repair source | `builtin_llm` |
| Prompt tokens | `788` |
| Completion tokens | `275` |
| Total tokens | `1063` |
| Usage source | `builtin_llm` |

Interpretation:

1. Guided replay is not zero-token.
2. Guided replay spends model tokens only when a repair path is invoked.
3. This is the current documented smoke-level evidence, not a multi-case benchmark.

## Reproduce

### Prerequisites

1. A local Aionis Lite endpoint reachable at `http://127.0.0.1:3321`
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

### Cross-runtime handoff benchmark

Baseline:

```bash
cross-boundary-aionis-bench run \
  --transport file_export \
  --executor-runtime langgraph_llm \
  --case-id cb_click_contract_001 \
  --case-id cb_click_contract_002 \
  --case-id cb_click_contract_003
```

Treatment:

```bash
cross-boundary-aionis-bench run \
  --transport aionis_handoff \
  --executor-runtime langgraph_llm \
  --aionis-base-url http://127.0.0.1:3321 \
  --case-id cb_click_contract_001 \
  --case-id cb_click_contract_002 \
  --case-id cb_click_contract_003
```

### Real GitHub repository strict replay benchmark

```bash
cross-boundary-aionis-bench real-repo-replay \
  --aionis-base-url http://127.0.0.1:3321 \
  --replay-mode strict \
  --case-id click_real_repo_001 \
  --case-id click_real_repo_002 \
  --case-id click_real_repo_003
```

### Guided replay repair smoke

Guided repair currently remains smoke-level in the disclosure set. The validated smoke used a DeepSeek-compatible OpenAI endpoint with:

1. `REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM=true`
2. `REPLAY_GUIDED_REPAIR_LLM_BASE_URL=<your OpenAI-compatible endpoint>`
3. `REPLAY_GUIDED_REPAIR_LLM_MODEL=<your model>`
4. `REPLAY_GUIDED_REPAIR_LLM_API_KEY=<your API key>`

Use the current guided repair harness described in:

1. `experiments/cross-boundary-aionis-bench/REPLAY_TOKEN_FINDINGS.md`
2. `experiments/cross-boundary-aionis-bench/DESIGN.md`

## Artifact Paths

The public values on this page come from the following disclosure artifacts in the companion experiment workspace:

1. Cross-runtime baseline:
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-file_export-20260313-161731/`
2. Cross-runtime treatment:
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-aionis_handoff-20260313-161732/`
3. Real-repo handoff A/B:
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-handoff-ab-20260313-195606/`
4. Real-repo strict replay:
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-20260313-180521/`
5. Replay token comparison:
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-20260313-180521/manual-replay-token-comparison.json`
6. Guided replay token notes:
   `experiments/cross-boundary-aionis-bench/REPLAY_TOKEN_FINDINGS.md`

## Why This Matters

1. Aionis handoff is no longer just an in-memory continuation trick; it preserves execution contracts outside a single runtime.
2. Aionis strict replay separates deterministic execution reuse from model-token spending.
3. Aionis guided replay separates repair from replay and makes that repair cost explicit.

## Related

1. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
2. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
3. [AionisBench v0.1](/public/en/benchmarks/06-aionis-bench-v01)
4. [Real GitHub Repo Handoff A/B](/public/en/benchmarks/10-real-repo-handoff-ab)
