---
title: "MCP 集成"
---

# MCP 集成

Aionis 提供 MCP 服务器，使支持 MCP 的客户端可以把记忆能力作为工具调用。

## 工具列表

1. `memory_remember`：写入记忆条目
2. `memory_recall_text`：获取紧凑的 LLM 可读上下文

## 快速开始

1. 构建项目：

```bash
npm run build
```

2. 启动 MCP 服务：

```bash
AIONIS_BASE_URL=http://localhost:${PORT:-3001} \
AIONIS_SCOPE=default \
node dist/mcp/aionis-mcp.js
```

3. 运行 smoke 检查：

```bash
set -a; source .env; set +a
bash examples/mcp_stdio_smoke.sh
```

## 客户端配置示例

```json
{
  "mcp": {
    "aionis": {
      "type": "local",
      "command": ["node", "/path/to/Aionis/dist/mcp/aionis-mcp.js"],
      "enabled": true,
      "environment": {
        "AIONIS_BASE_URL": "http://localhost:3001",
        "AIONIS_SCOPE": "default"
      }
    }
  }
}
```

## 可选鉴权

1. `AIONIS_API_KEY` -> `X-Api-Key`
2. `AIONIS_AUTH_BEARER` -> `Authorization: Bearer ...`
3. `AIONIS_ADMIN_TOKEN` -> `X-Admin-Token`（仅管理接口）

## 版本一致性

1. MCP `initialize` 的 `serverInfo.version` 会跟随 Aionis 包版本自动同步。
2. 可通过 `AIONIS_VERSION` 显式覆盖（用于定制构建标识）。

## 相关页面

1. [OpenWork 集成](/public/zh/integrations/02-openwork)
2. [LangGraph 集成](/public/zh/integrations/03-langgraph)
3. [OpenClaw 集成](/public/zh/integrations/04-openclaw)
4. [API 契约](/public/zh/api/01-api-contract)
