---
title: "集成概览"
---

# 集成概览

Aionis 通过稳定 API 契约接入不同 Agent 运行时，而且它的接入模型很统一：

1. 写入持久记忆
2. 召回或装配有预算约束的上下文
3. 应用策略与工具路由
4. 记录可回放执行状态

## 选择你的接入路径

### 路径 A：MCP 与 Coding Agent

适合：

1. Codex 和本地编码工作流
2. 已经会说 MCP 的 agent 工具面
3. 想直接拿到 Aionis memory、replay、policy 能力的团队

从这里开始：

1. [MCP 集成](/public/zh/integrations/01-mcp)
2. [Codex 本地 Profile](/public/zh/integrations/05-codex-local)

### 路径 B：SDK 与 API 接入

适合：

1. 把 Aionis 接进已有应用或服务
2. service-to-service 集成
3. 想明确控制 HTTP / SDK 调用的团队

从这里开始：

1. [API 参考](/public/zh/api-reference/00-api-reference)
2. [SDK 指南](/public/zh/reference/05-sdk)

### 路径 C：框架适配

适合：

1. 已经采用编排框架的团队
2. 想把 Aionis 接进现有 agent stack 的场景

可选入口：

1. [MCP 集成](/public/zh/integrations/01-mcp)
2. [OpenWork 集成](/public/zh/integrations/02-openwork)
3. [LangGraph 集成](/public/zh/integrations/03-langgraph)
4. [OpenClaw 集成](/public/zh/integrations/04-openclaw)

## 推荐接入路径

1. 先接记忆检索（`recall_text` 或 `context/assemble`）。
2. 再接策略闭环（`rules/evaluate`、`tools/select`）。
3. 接入决策与运行生命周期（`tools/decision`、`tools/run`、`tools/feedback`）。
4. 通过 `resolve` + URI 对象完成回放与排障。

## 集成硬契约

生产接入建议持久化并透传：

1. `tenant_id`
2. `scope`
3. `request_id`
4. `run_id`
5. `decision_id`
6. `commit_uri`

## 从这里开始

1. 先选一条接入路径，不要同时铺太多。
2. 先验证 write + recall。
3. 检索稳定后再接 policy loop。
4. 需要可追踪和可复用时，再接 replay 面。

## 下一步

1. [MCP 集成](/public/zh/integrations/01-mcp)
2. [Codex 本地 Profile](/public/zh/integrations/05-codex-local)
3. [OpenClaw 集成](/public/zh/integrations/04-openclaw)
4. [API 参考](/public/zh/api-reference/00-api-reference)
5. [SDK 指南](/public/zh/reference/05-sdk)

## 相关页面

1. [API 参考](/public/zh/api-reference/00-api-reference)
2. [API 契约](/public/zh/api/01-api-contract)
3. [SDK 指南](/public/zh/reference/05-sdk)
4. [快速开始](/public/zh/getting-started/01-get-started)
