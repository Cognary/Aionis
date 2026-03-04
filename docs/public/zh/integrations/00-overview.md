---
title: "集成概览"
---

# 集成概览

Aionis 通过稳定 API 契约接入不同 Agent 运行时与编排框架。

## 官方集成

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

1. 选择一个运行时（MCP、OpenWork、LangGraph 或 OpenClaw）。
2. 在目标鉴权模式下先验证 write + recall。
3. 检索稳定后再开启 policy loop 端点。

## 下一步

1. [MCP 集成](/public/zh/integrations/01-mcp)
2. [OpenClaw 集成](/public/zh/integrations/04-openclaw)
3. [API 参考](/public/zh/api-reference/00-api-reference)
4. [SDK 指南](/public/zh/reference/05-sdk)

## 相关页面

1. [API 参考](/public/zh/api-reference/00-api-reference)
2. [API 契约](/public/zh/api/01-api-contract)
3. [SDK 指南](/public/zh/reference/05-sdk)
