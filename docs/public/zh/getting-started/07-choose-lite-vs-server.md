---
title: "先选 Lite 还是 Server"
---

# 先选 Lite 还是 Server

如果你的目标是最快在本地跑起来，先选 Lite。  
如果你的目标是自托管生产运行时，选 Server。

## 什么时候选 Lite

Lite 适合这些场景：

1. 单用户、本地运行
2. SQLite-backed 的记忆与 replay
3. 不想先上 Docker 或外部 Postgres
4. 想先接入 Codex / MCP 做本地工作流
5. 评估 Aionis、做受控 beta 使用

入口：

1. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
2. [Lite 运维说明](/public/zh/getting-started/04-lite-operator-notes)
3. [Lite Public Beta 边界](/public/zh/getting-started/05-lite-public-beta-boundary)
4. [Lite 排障与反馈](/public/zh/getting-started/06-lite-troubleshooting-and-feedback)

## 什么时候选 Server

Server 适合这些场景：

1. 自托管生产运行时
2. 团队协作和运维责任
3. 需要 admin/control 和 automation beta 表面
4. Docker/Postgres 的服务化部署路径
5. 需要生产门禁和运维 runbook

入口：

1. [快速开始](/public/zh/getting-started/01-get-started)
2. [运维与生产](/public/zh/operate-production/00-operate-production)
3. [生产核心门禁](/public/zh/operations/03-production-core-gate)
4. [生产上线门禁](/public/zh/operations/04-prod-go-live-gate)

## 边界摘要

| 维度 | Lite | Server |
| --- | --- | --- |
| 启动方式 | 本地 `start:lite` | 服务化 / 自托管运行 |
| 存储 | 本地 SQLite-backed runtime | 面向 Postgres 的运行时 |
| `write / recall / replay` | 支持 | 支持 |
| `rules / tools / planning/context` | 支持 | 支持 |
| `/v1/admin/control/*` | server-only | 支持 |
| `/v1/automations/*` | server-only | 支持 |
| 当前姿态 | controlled public beta | open-core 生产路径 |

## 如果还不确定

如果你当前最想做的是：

1. 本地先证明工作流成立
2. 接入 Codex 或 MCP
3. 验证连续性、replay 和记忆能力

那先用 Lite。

如果你当前最想做的是：

1. 跑共享或生产负载
2. 用更强的治理和运维流程
3. 需要 admin/control 或 automation 表面

那先用 Server。

## 相关页面

1. [总览](/public/zh/overview/01-overview)
2. [API 参考](/public/zh/api-reference/00-api-reference)
3. [Codex Local Profile](/public/zh/integrations/05-codex-local)
