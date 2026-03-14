---
title: "快速开始"
---

# 快速开始

用这页选择最短的 Aionis 上手路径。

## 什么叫成功上手

第一次接触 Aionis，至少完成下面一件事：

1. 本地启动 Lite，并跑通一条 `write -> recall_text` 链路。
2. 把应用或 Agent 接到 Aionis，并跑通一条 `write -> recall_text -> planning/context` 链路。
3. 明确自己当前应该走 Lite、自托管 Server，还是后续再看 Cloud。

## 选择你的路径

### 路径 A：本地 Lite

适合：

1. 单用户本地评估
2. Codex / MCP 工作流
3. 低摩擦验证 continuity、replay 和 context assembly

从这里开始：

1. [选择 Lite 还是 Server](/public/zh/getting-started/07-choose-lite-vs-server)
2. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
3. [Lite 运维说明](/public/zh/getting-started/04-lite-operator-notes)
4. [Lite Public Beta 边界](/public/zh/getting-started/05-lite-public-beta-boundary)
5. [Lite 排障与反馈](/public/zh/getting-started/06-lite-troubleshooting-and-feedback)

### 路径 B：把 Aionis 接进 Agent

适合：

1. API / SDK 接入
2. Codex / MCP 集成
3. 在真实 runtime 里验证 memory、replay 和 policy loop

从这里开始：

1. [构建记忆工作流](/public/zh/guides/01-build-memory)
2. [API 参考](/public/zh/api-reference/00-api-reference)
3. [SDK 指南](/public/zh/reference/05-sdk)
4. [Python SDK + Aionis CLI](/public/zh/getting-started/08-python-sdk-with-cli)
5. [集成总览](/public/zh/integrations/00-overview)
6. [Codex 本地集成](/public/zh/integrations/05-codex-local)

### 路径 C：自托管 Server

适合：

1. 生产自托管
2. 需要完整 Server 拓扑的团队
3. 超出 Lite 边界的运行场景

从这里开始：

1. [选择 Lite 还是 Server](/public/zh/getting-started/07-choose-lite-vs-server)
2. [运维与生产](/public/zh/operate-production/00-operate-production)
3. [运维手册](/public/zh/operations/02-operator-runbook)
4. [生产核心门禁](/public/zh/operations/03-production-core-gate)
5. [Standalone 到 HA 手册](/public/zh/operations/06-standalone-to-ha-runbook)

## 最小运行检查表

不管选哪条路径，先确认这些：

1. `/health` 返回 `ok`
2. embedding provider 已配置
3. 一次 `write` 返回 `request_id`
4. 一次 `recall_text` 返回可用 seeds 或 context
5. 如果你跑的是 Lite，`/health.aionis_edition = "lite"` 且 `/health.memory_store_backend = "lite_sqlite"`

## 下一步阅读

跑通第一条链路之后，继续看：

1. [文档导航图](/public/zh/overview/02-docs-navigation)
2. [按角色阅读路径](/public/zh/overview/03-role-based-paths)
3. [架构](/public/zh/architecture/01-architecture)
4. [上下文编排](/public/zh/context-orchestration/00-context-orchestration)
