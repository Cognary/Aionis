---
title: "OpenClaw 集成"
---

# OpenClaw 集成

Aionis 通过 OpenClaw 插件模式接入，作为记忆层与策略层。

## 推荐接入方式

使用已发布插件：

1. `@aionis/openclaw`
2. 安装命令：

```bash
openclaw plugins install @aionis/openclaw
```

3. 一键引导（本地）：

```bash
openclaw aionis-memory bootstrap
```

4. 配置项：
   `baseUrl`、`apiKey`、`tenantId`、`scopeMode`、`scopePrefix`、`preset`、`autoRecall`、`autoCapture`、`autoPolicyFeedback`

## 行为说明

1. 每轮前自动召回（`context/assemble`）。
2. 每轮成功后自动写入（`write`）。
3. 每轮成功后自动策略反馈（`tools/feedback`），并输出闭环信号日志。

## Scope 与隔离建议

1. 单用户场景可固定 `tenant_id=default`。
2. 推荐 `scopeMode=project`，按 workspace/repo 自动隔离项目记忆。
3. 在 `select -> feedback` 之间持久化 `run_id` 与 `decision_id`。

## 自检

```bash
openclaw aionis-memory selfcheck --scope clawbot:selfcheck
```

## 相关页面

1. [集成概览](/public/zh/integrations/00-overview)
2. [API 契约](/public/zh/api/01-api-contract)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
