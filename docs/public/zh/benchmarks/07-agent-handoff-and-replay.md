---
title: "Agent Handoff 与 Replay"
---

# Agent Handoff 与 Replay

最后更新：`2026-03-13`

这页是 Aionis handoff 与 replay 证据的公开 benchmark 披露页。

## 范围说明

当前披露覆盖三类已文档化结果：

1. 跨进程、跨 runtime 的 handoff 恢复
2. 真实 GitHub 仓库上的 `baseline -> compile -> replay1 -> replay2`
3. guided replay 在触发 repair 时的 token smoke 证据

不代表：

1. Aionis 在单一 runtime 内一定强于框架自己的原生内存状态
2. 这是覆盖所有 agent 框架、所有 provider、所有硬件的通用 benchmark
3. guided replay 是零 token；只有文档化的 strict replay 路径是零模型 token

## 可公开主张的结论

### 1. 跨 runtime handoff 比弱外部化 baseline 更能保住执行合同

环境：

1. `planner`：独立进程
2. `executor`：`LangGraph` LLM runtime
3. `reviewer`：独立进程
4. baseline transport：`file_export`
5. treatment transport：`aionis_handoff`

| Transport | Cases | Success rate | Avg total tokens | Avg store ms | Avg recover ms |
| --- | --- | --- | --- | --- | --- |
| `file_export + langgraph_llm` | `3` | `33.33%` | `2370.0` | `0` | `0` |
| `aionis_handoff + langgraph_llm` | `3` | `100%` | `2624.0` | `121.0` | `24.0` |

解读：

1. baseline 导出的 contract 是 lossy 的，在 `2/3` case 上丢了执行事实。
2. Aionis handoff 在跨进程、跨 runtime 边界上把 contract 保到了 `3/3`。
3. 这组结果要证明的是对齐质量，不是 token 一定更低。

### 2. 真实仓库 strict replay 是零模型 token 执行路径

仓库：

1. URL：`https://github.com/pallets/click.git`
2. Commit：`cdab890e57a30a9f437b88ce9652f7bfce980c1f`
3. Cases：`click_real_repo_001`、`click_real_repo_002`、`click_real_repo_003`
4. Replay mode：`strict`
5. Backend：`local_process`

| 指标 | 值 |
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

解读：

1. `compile_from_run` 会消耗模型 token。
2. 在当前 `strict/local_process` 路径上，`replay1` 和 `replay2` 的模型 token 都是 `0`。
3. 这说明 replay 不只是成立，而且在文档化模式下已经是 deterministic zero-token execution path。

### 3. Guided replay 只在需要 repair 时消耗模型 token

当前 guided 证据是同一 `click` 仓库上的单 case smoke，并且故意引入失败以强制走 guided repair。

| 指标 | 值 |
| --- | --- |
| Case | `click_real_repo_001` |
| Guided repair strategy | `builtin_llm` |
| Repair source | `builtin_llm` |
| Prompt tokens | `788` |
| Completion tokens | `275` |
| Total tokens | `1063` |
| Usage source | `builtin_llm` |

解读：

1. guided replay 不是零 token。
2. 只有在真正触发 repair 时，guided replay 才会消耗模型 token。
3. 这组结果当前属于 smoke 级证据，不是多 case benchmark。

## 如何复现

### 前置条件

1. 本地 Aionis Lite endpoint 可通过 `http://127.0.0.1:3321` 访问
2. 配套实验目录：
   `aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench`
3. Python `3.9+`
4. `uv`

### 实验环境准备

```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench
uv venv
source .venv/bin/activate
uv pip install -e .
```

### 跨 runtime handoff benchmark

Baseline：

```bash
cross-boundary-aionis-bench run \
  --transport file_export \
  --executor-runtime langgraph_llm \
  --case-id cb_click_contract_001 \
  --case-id cb_click_contract_002 \
  --case-id cb_click_contract_003
```

Treatment：

```bash
cross-boundary-aionis-bench run \
  --transport aionis_handoff \
  --executor-runtime langgraph_llm \
  --aionis-base-url http://127.0.0.1:3321 \
  --case-id cb_click_contract_001 \
  --case-id cb_click_contract_002 \
  --case-id cb_click_contract_003
```

### 真实 GitHub 仓库 strict replay benchmark

```bash
cross-boundary-aionis-bench real-repo-replay \
  --aionis-base-url http://127.0.0.1:3321 \
  --replay-mode strict \
  --case-id click_real_repo_001 \
  --case-id click_real_repo_002 \
  --case-id click_real_repo_003
```

### Guided replay repair smoke

guided repair 当前仍作为 smoke 披露。已验证的 smoke 使用了兼容 OpenAI 协议的 DeepSeek endpoint，环境变量如下：

1. `REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM=true`
2. `REPLAY_GUIDED_REPAIR_LLM_BASE_URL=<你的 OpenAI-compatible endpoint>`
3. `REPLAY_GUIDED_REPAIR_LLM_MODEL=<你的模型名>`
4. `REPLAY_GUIDED_REPAIR_LLM_API_KEY=<你的 API key>`

当前 guided smoke 的复现说明见：

1. `experiments/cross-boundary-aionis-bench/REPLAY_TOKEN_FINDINGS.md`
2. `experiments/cross-boundary-aionis-bench/DESIGN.md`

## Artifact 路径

这页公开数值对应的 disclosure artifacts 位于配套实验目录：

1. Cross-runtime baseline：
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-file_export-20260313-161731/`
2. Cross-runtime treatment：
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-aionis_handoff-20260313-161732/`
3. Real-repo strict replay：
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-20260313-180521/`
4. Replay token 对比：
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-20260313-180521/manual-replay-token-comparison.json`
5. Guided replay token 说明：
   `experiments/cross-boundary-aionis-bench/REPLAY_TOKEN_FINDINGS.md`

## 为什么这些结果重要

1. Aionis handoff 不再只是 runtime 内的 continuation 技巧，而是能在 runtime 外部保住 execution contract。
2. Aionis strict replay 把 deterministic execution reuse 和模型 token 支出分开了。
3. Aionis guided replay 把 repair 和 replay 分开，并把 repair 成本显式暴露出来。

## 相关页面

1. [Benchmark Snapshot（对外）](/public/zh/benchmarks/02-benchmark-snapshot-public)
2. [差异化证据](/public/zh/benchmarks/03-differentiation-evidence)
3. [AionisBench v0.1](/public/zh/benchmarks/06-aionis-bench-v01)
