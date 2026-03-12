---
title: "快速开始"
---

# 快速开始

如果你第一次接入 Aionis，从这里开始。

这个入口同时覆盖两种路径：

1. `Lite Alpha`：单用户、本地 SQLite、无需 Docker
2. `Server`：面向团队和生产拓扑

## 1) 首次跑通路径

1. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
2. [Embedding 配置](/public/zh/getting-started/03-embedding-setup)
3. [Playground](/public/zh/guides/02-playground)

## 2) 运行时选择

| Profile | 适合谁 | 下一步 |
| --- | --- | --- |
| Lite Alpha | 单用户、本地 Agent、无 Docker 快速验证 | 用 `npm run start:lite` 跑通 5 分钟上手 |
| Local / Dev | 本地联调、仍使用完整服务拓扑 | 跑 5 分钟上手 |
| Service | 团队生产基线 | 先跑生产核心门禁 |
| HA | 高可用生产 | 跑上线门禁和故障演练 |

Lite Alpha 当前的明确边界：

1. `/v1/admin/control/*` 仍然是 server-only
2. `/v1/automations/*` 仍然是 server-only

这些路由会稳定返回 `501 server_only_in_lite`。

## 3) 必要概念（最小集）

1. [架构](/public/zh/concepts/02-architecture)
2. [Aionis 一页说明](/public/zh/about/02-aionis-onepage)

## 4) 生产可用入口

1. [生产核心门禁](/public/zh/operations/03-production-core-gate)
2. [生产上线门禁](/public/zh/operations/04-prod-go-live-gate)
3. [运维手册](/public/zh/operations/02-operator-runbook)

## 30 分钟目标

1. 跑通一次成功的 `write -> recall_text` 闭环。
2. 确认当前 Embedding 提供方生效（fake/OpenAI/MiniMax）。
3. 在 Playground 里跑通一次策略路径（`rules/evaluate` 或 `tools/select`）。
