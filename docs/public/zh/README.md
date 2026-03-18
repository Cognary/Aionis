---
title: "Aionis Public Docs (ZH)"
---

# Aionis 文档

Aionis 给 Coding Agent 提供执行记忆，让新会话可以直接继续工作，而不是重新读仓库、重新建立上下文、重新解释同样的推理过程。

当前仓库里已经有更大项目的真实证据：

1. input tokens 下降约 `30.03%`
2. output tokens 下降约 `77%`
3. total tokens 下降约 `33.24%`

这些数据来自 Aionis 支持的跨会话续做恢复实验。

当前 handoff 与 replay 的公开证据还包括：

1. cross-runtime handoff recovery 把成功率从 `33.33%` 提升到 `100%`
2. `pallets/click` 真实仓库上的 strict replay 可以做到 `0` 模型 token
3. guided replay 只在真正触发 repair 时消耗模型 token
4. `pallets/click` 真实仓库上的 policy A/B 把成功率从 `0%` 提升到 `100%`，并把工具路径收敛到 `rg` 与 `pytest-focused`

## Layer 1 快照

| 能力 | 基线 | 使用 Aionis | 结果 |
| --- | --- | --- | --- |
| Handoff | `file_export` | `aionis_handoff` | 在真实 `pallets/click` 仓库任务上 `0% -> 100%` |
| Policy | 无 policy / broad tools | `aionis_policy` | `0% -> 100%`，工具路径收敛到 `rg` + `pytest-focused` |
| Replay | 从头重跑 | compile + strict replay | replay 在 `0` 模型 token 下完成 |

完整对照见 [Layer 1 能力矩阵](/public/zh/benchmarks/14-layer1-capability-matrix)。

## SDK 与 CLI 快照

1. TypeScript SDK 和 Python SDK 现在都覆盖了审计过的开发者主线路由。
2. 在 `2026-03-14`，Aionis 对 `65` 条非 admin、非 control-plane 路由做了 SDK 审计，结果是两套 SDK 都 `no missing`。
3. TypeScript 包还内置了 Phase 1 本地开发 CLI：`aionis dev`、`stop`、`health`、`doctor`、`selfcheck`。

建议从这里开始：

1. [SDK 指南](/public/zh/reference/05-sdk)
2. [SDK 兼容矩阵](/public/zh/reference/06-sdk-compatibility-matrix)
3. [SDK CLI](/public/zh/reference/09-sdk-cli)
4. [Aionis Doc](/public/zh/reference/10-aionis-doc)
5. [Python SDK + Aionis CLI](/public/zh/getting-started/08-python-sdk-with-cli)

## 从这里开始

1. [先选 Lite 还是 Server](/public/zh/getting-started/07-choose-lite-vs-server)
2. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
3. [Python SDK + Aionis CLI](/public/zh/getting-started/08-python-sdk-with-cli)
4. [没有本地仓库也能 3 分钟起 Lite](/public/zh/getting-started/09-no-local-repo-lite)
5. [Embedding 配置](/public/zh/getting-started/03-embedding-setup)
5. [构建记忆工作流](/public/zh/guides/01-build-memory)
6. [Playground](/public/zh/guides/02-playground)
7. [文档导航图](/public/zh/overview/02-docs-navigation)

## 先选产品路径

1. **Lite**：本地单用户、SQLite-backed、受控 public beta
2. **Server**：自托管 open-core 生产运行时
3. **Cloud**：托管方向，不属于当前公开仓库运行时表面

## 为什么团队会选 Aionis

1. 它记录的是“任务如何做成”，而不是只保存文本或向量。
2. 它提供显式的上下文层、预算和压缩控制，避免上下文无限膨胀。
3. 它把 Replay、playbook、repair/review 串成复用闭环，让成功执行变成可重复资产。
4. 它内建治理、诊断、门禁和运维手册，适合真正上线后的 Agent 系统。
5. 它已经有连续性和 token 节省的真实证据，而不只是叙事。

## 证据入口

1. [基准测试](/public/zh/benchmarks/01-benchmarks)
2. [差异化证据](/public/zh/benchmarks/03-differentiation-evidence)
3. [性能基线](/public/zh/benchmarks/05-performance-baseline)
4. [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay)
5. [真实 GitHub 仓库 Policy A/B](/public/zh/benchmarks/11-real-repo-policy-ab)
6. [Aionis 证据总览](/public/zh/benchmarks/13-aionis-evidence-overview)
7. [Layer 1 能力矩阵](/public/zh/benchmarks/14-layer1-capability-matrix)
8. [L1 Distilled Facts](/public/zh/benchmarks/15-l1-distilled-facts)

## 继续阅读

1. [总览](/public/zh/overview/01-overview)
2. [核心概念](/public/zh/core-concepts/00-core-concepts)
3. [架构](/public/zh/architecture/01-architecture)
4. [集成概览](/public/zh/integrations/00-overview)
5. [API 参考](/public/zh/api-reference/00-api-reference)
6. [路线图](/public/zh/roadmap/00-roadmap)
