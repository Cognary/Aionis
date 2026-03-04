---
title: "OpenWork 集成"
---

# OpenWork 集成

在 OpenWork/OpenCode Desktop 中接入 Aionis MCP 服务，可为桌面 Agent 工作流增加记忆能力。

## 能力价值

1. 每次任务执行前补充记忆检索。
2. 每次任务结束后沉淀结果到记忆。
3. 所有记忆调用可回溯到 Aionis API 侧证据链。

## 配置步骤

1. 构建 Aionis MCP 服务：

```bash
npm run build
```

2. 在 OpenWork/OpenCode 的 MCP 配置中添加启动命令：

```bash
node /path/to/Aionis/dist/mcp/aionis-mcp.js
```

3. 配置环境变量：

1. `AIONIS_BASE_URL`
2. `AIONIS_SCOPE`
3. 可选鉴权变量（`AIONIS_API_KEY` 或 `AIONIS_AUTH_BEARER`）

## 推荐 Agent 行为

1. 在复杂任务规划前调用 `memory_recall_text`。
2. 在关键步骤结束后调用 `memory_remember`。
3. 在记忆文本或 `slots` 中写入 run 元数据，便于回放与审计。

## 相关页面

1. [MCP 集成](/public/zh/integrations/01-mcp)
2. [OpenClaw 集成](/public/zh/integrations/04-openclaw)
3. [API 参考](/public/zh/api-reference/00-api-reference)
