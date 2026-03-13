---
title: "Aionis 证据总览"
---

# Aionis 证据总览

最后更新：`2026-03-13`

这页用来回答一个更直接的问题：

**Aionis 到底已经证明了什么，还没有证明什么？**

## 状态说明

1. `public / proven`：已经有可复现实验并作为公开 benchmark 页面发布
2. `internal / positive`：内部 benchmark 已跑出正向结果，但还没有提升为公开主张
3. `internal / mixed`：内部 benchmark 已完成，但结果带明显 tradeoff
4. `internal / neutral`：内部 benchmark 已完成，但当前没有测出净收益

## 已公开且已成立

| 能力面 | 对照 | 结果 | 状态 | 页面 |
| --- | --- | --- | --- | --- |
| Cross-runtime handoff | `file_export` vs `aionis_handoff` | 成功率 `33.33% -> 100%` | `public / proven` | [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay) |
| 真实 GitHub 仓库 handoff | `pallets/click` 上 `file_export` vs `aionis_handoff` | 成功率 `0% -> 100%`，完整 repo/test scope 被保住 | `public / proven` | [真实 GitHub 仓库 Handoff A/B](/public/zh/benchmarks/10-real-repo-handoff-ab) |
| 真实 GitHub 仓库 policy | `pallets/click` 上 `without policy` vs `with Aionis policy` | 成功率 `0% -> 100%`，工具路径收敛到 `rg` 与 `pytest-focused` | `public / proven` | [真实 GitHub 仓库 Policy A/B](/public/zh/benchmarks/11-real-repo-policy-ab) |
| Strict replay | `baseline -> compile -> replay1 -> replay2` | `replay1 = 0 token`，`replay2 = 0 token` | `public / proven` | [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay) |
| Guided replay repair | guided replay smoke | 只有 repair 触发时才消耗模型 token，本次 smoke 为 `1063` total tokens | `public / proven` | [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay) |
| L5 serving compaction | `balanced_serving` vs `aggressive_serving` | benchmark facts 不掉，served payload chars 明显下降 | `public / proven` | [L5 Serving-Side Compaction](/public/zh/benchmarks/12-l5-serving-compaction) |

## Memory Compression Layers 当前内部状态

| 层级 | 当前判断 | 当前最强信号 | 状态 |
| --- | --- | --- | --- |
| `L1 distilled facts` | 第一版稳定正向 | code corpus 上 `planning/context` 估计 token `100 -> 45.33`，research corpus 上 `66 -> 34.67`，事实保留持平 | `internal / positive` |
| `L2 topic aggregation` | mixed，但已经可解释 | code corpus 上 `41.33 -> 36`；research corpus 上事实保留 `0.703704 -> 1.0`，但估计 token `34.89 -> 50.67` | `internal / mixed` |
| `L3 deterministic compression` | benchmark 有效，但结果中性 | 事实保留与 token estimate 基本持平，没有测出净收益 | `internal / neutral` |
| `L4 semantic abstraction` | opt-in 路径已打通，但当前无增益 | `L4` 已能进入 `selected_memory_layers`，但当前 fixture 下结果中性且略重 | `internal / neutral` |
| `L5 serving compaction` | 公开 exploratory 结果已成立 | 不丢 benchmark facts 的前提下，served payload chars 显著下降 | `public / proven` |

## Aionis 现在可以诚实主张什么

1. Aionis handoff 已经不是单 runtime 内的 continuation 小技巧，而是跨进程、跨 runtime 的外部化 execution contract。
2. Aionis policy 能在真实 GitHub 仓库上实际改变工具选择，并把执行收敛到更 focused 的路径。
3. Aionis strict replay 在当前文档化模式下已经是 `0 model token` 的 deterministic replay 路径。
4. Aionis guided replay 把 deterministic replay 和 model-assisted repair 明确分开，而且 repair 成本现在可观测。
5. Aionis 的 compression 证据目前最强的是 `L1` 与 `L5`，`L2-L4` 仍然需要更窄、更谨慎的公开口径。

## Aionis 现在不该过度主张什么

1. `L2` 还不能讲成普遍的 token-win layer。
2. `L3` 还不能讲成已证明正收益的 deterministic compression layer。
3. `L4` 还不能讲成已证明有 serving 收益的语义抽象层。
4. `L5` 现在只能讲成 served-payload reduction layer，不能讲成已证明的 `context_est_tokens` reduction layer。

## 继续阅读

1. [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay)
2. [Task Handoff 与 Recover 语义](/public/zh/benchmarks/08-task-handoff-and-recover)
3. [Policy 工具选择与反馈闭环](/public/zh/benchmarks/09-policy-tool-selection)
4. [真实 GitHub 仓库 Handoff A/B](/public/zh/benchmarks/10-real-repo-handoff-ab)
5. [真实 GitHub 仓库 Policy A/B](/public/zh/benchmarks/11-real-repo-policy-ab)
6. [L5 Serving-Side Compaction](/public/zh/benchmarks/12-l5-serving-compaction)
7. [Layer 1 能力矩阵](/public/zh/benchmarks/14-layer1-capability-matrix)
