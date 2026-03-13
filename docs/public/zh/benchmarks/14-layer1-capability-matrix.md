---
title: "Layer 1 能力矩阵"
---

# Layer 1 能力矩阵

最后更新：`2026-03-13`

Layer 1 是 Aionis 的受控公开 benchmark 层。

它只回答一个问题：

**相对非 Aionis 基线，Aionis 是否会在真实任务里实质性改变执行行为？**

这页刻意比系统级生产验证更窄。

它只覆盖当前已经构成公开产品证明的三条主线：

1. handoff
2. policy
3. replay

## 范围

Layer 1 使用：

1. 固定仓库快照
2. 固定任务切片
3. 明确的非 Aionis baseline
4. 可复现本地命令
5. 有边界的验收标准

当前默认仓库：

1. `pallets/click`
2. commit `cdab890e57a30a9f437b88ce9652f7bfce980c1f`

## Layer 1 矩阵

| 能力 | 仓库 / 任务 | Baseline | Treatment | 关键结果 | 页面 |
| --- | --- | --- | --- | --- | --- |
| Handoff | `pallets/click` 真实仓库 execution contract continuation | `file_export` | `aionis_handoff` | 成功率 `0% -> 100%`；完整 repo/test scope 被保住 | [真实 GitHub 仓库 Handoff A/B](/public/zh/benchmarks/10-real-repo-handoff-ab) |
| Policy | `pallets/click` 真实仓库 focused tool routing | 无 policy / broad tools（`grep`、`pytest-all`） | `aionis_policy`（`rg`、`pytest-focused`） | 成功率 `0% -> 100%`；工具路径收敛到 focused path | [真实 GitHub 仓库 Policy A/B](/public/zh/benchmarks/11-real-repo-policy-ab) |
| Replay | `pallets/click` baseline rerun vs compile + replay | 从头重跑 | compile + `replay1` + `replay2` | strict replay 保持 `100%` 正确，且 `0` 模型 token | [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay) |

## Layer 1 证明了什么

### 1. Handoff

问题：

- Aionis 能否比弱外部化基线更好地保住 execution contract？

当前答案：

1. 能，而且是在真实公开 GitHub 仓库上
2. 当前主要收益是 contract completeness，不是延迟领先
3. baseline 的失败来自多文件、多测试 scope 丢失，而不是仓库本身不可用

### 2. Policy

问题：

- Aionis 能否在真实仓库上以可测、可解释的方式改变工具路由？

当前答案：

1. 能，在 `pallets/click` 上已经测出来
2. policy 路径会收敛到 `rg` 和 `pytest-focused`
3. 非 policy 路径会漂到 broad tools，并在有边界的任务里失败

### 3. Replay

问题：

- Aionis 能否在真实工作流上 compile 并 replay，同时保住正确性并降低重复执行成本？

当前答案：

1. 能，至少在当前文档化的 strict replay 路径上已经成立
2. `compile_from_run` 会消耗模型 token
3. `strict/local_process replay1` 与 `replay2` 在当前公开配置下都是 `0` 模型 token
4. guided replay 是单独的 repair 路径，不是零 token

## Layer 1 不证明什么

Layer 1 **不**主张：

1. 在单一 runtime 内一定全面优于框架原生内存状态
2. 对所有 agent runtime、provider、硬件都最优
3. 在所有长周期生产环境下都已经证明 production-grade reliability
4. Aionis 的每一层优化都已经有正向公开结果

## 为什么这页重要

Layer 1 是 Aionis 最小的 benchmark-grade 产品证明。

它说明：

1. handoff 会改变 continuation 结果
2. policy 会改变真实工具路由
3. replay 会改变重复执行成本
4. 这些不是内部 capability smoke，而是真实任务上的公开证据

## 继续阅读

1. [Aionis 证据总览](/public/zh/benchmarks/13-aionis-evidence-overview)
2. [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay)
3. [真实 GitHub 仓库 Handoff A/B](/public/zh/benchmarks/10-real-repo-handoff-ab)
4. [真实 GitHub 仓库 Policy A/B](/public/zh/benchmarks/11-real-repo-policy-ab)
5. [L5 Serving-Side Compaction](/public/zh/benchmarks/12-l5-serving-compaction)
