---
title: "MCP 集成"
---

# MCP 集成

Aionis 现在提供两套 MCP 服务：

1. `aionis-mcp`：兼容型 memory MCP
2. `aionis-dev-mcp`：面向 coding agent 的原生 Dev MCP

## 兼容 MCP 工具

1. `memory_remember`：写入记忆条目
2. `memory_recall_text`：获取紧凑的 LLM 可读上下文

## Dev MCP 工具

原生 Dev MCP 额外提供：

1. memory 写入与召回
2. 工具选择 / 决策 / 反馈闭环
3. replay run 与 playbook 操作
4. sandbox 执行能力
5. 面向 Codex 的 planning context、quality gate、learn-from-run 工具

当前 Dev MCP 的输出策略也开始优先消费有界执行摘要，而不是原始大结果：

1. sandbox 工具会暴露 `result_summary`
2. replay 记录的命令步骤会写入 `result_summary`
3. `tools/select`、`tools/decision`、`tools/run` 这类 lifecycle surface 也会优先返回紧凑摘要
4. `tools/select` 的 API 响应现在会带 `selection_summary`，`tools/decision` 和 `tools/run` 会带 `lifecycle_summary`，MCP 直接复用同一套 summary-first surface
5. MCP 文本响应会优先返回这些摘要，只有需要时才回退到原始 JSON

## 快速开始

1. 构建项目：

```bash
npm run build
```

2. 启动兼容 MCP：

```bash
AIONIS_BASE_URL=http://localhost:${PORT:-3001} \
AIONIS_SCOPE=default \
node dist/mcp/aionis-mcp.js
```

3. 启动原生 Dev MCP：

```bash
AIONIS_BASE_URL=http://localhost:${PORT:-3001} \
AIONIS_SCOPE=default \
node dist/mcp/aionis-dev-mcp.js
```

4. 运行 smoke 检查：

```bash
set -a; source .env; set +a
bash examples/mcp_stdio_smoke.sh
bash examples/mcp_dev_stdio_smoke.sh
```

如果 standalone Docker 容器已经在运行，也可以直接验证最终 launcher 路径：

```bash
AIONIS_STANDALONE_CONTAINER=aionis-standalone \
bash examples/mcp_dev_standalone_smoke.sh
```

如果你想走最短本地路径，也可以一条命令完成 standalone Docker 启动和 launcher 验证：

```bash
npm run -s mcp:aionis:dev:standalone:oneclick
```

## 本地客户端配置示例

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

## Standalone Docker 客户端配置

如果你运行的是 Aionis standalone Docker，`Dev MCP` 会作为镜像内置能力随 `dist` 一起进入容器。推荐的宿主机 launcher 是：

```bash
bash /path/to/Aionis/scripts/mcp-aionis-dev-standalone.sh
```

如果你希望 Aionis 自动构建镜像、启动容器、等待健康并执行 launcher smoke：

```bash
bash /path/to/Aionis/scripts/mcp-aionis-dev-standalone-oneclick.sh
```

默认值是：

1. 容器名 `aionis-standalone`
2. `AIONIS_BASE_URL=http://127.0.0.1:3001`
3. `AIONIS_SCOPE=default`

需要时可以覆盖：

```bash
AIONIS_STANDALONE_CONTAINER=my-aionis \
AIONIS_SCOPE=workspace \
bash /path/to/Aionis/scripts/mcp-aionis-dev-standalone.sh
```

如果要对这条 launcher 路径本身做 smoke：

```bash
AIONIS_STANDALONE_CONTAINER=aionis-standalone \
bash /path/to/Aionis/examples/mcp_dev_standalone_smoke.sh
```

对于本地 MCP 客户端，优先直接配置这个 launcher：

```json
{
  "mcp": {
    "aionis-dev": {
      "type": "local",
      "command": ["bash", "/path/to/Aionis/scripts/mcp-aionis-dev-standalone.sh"],
      "enabled": true
    }
  }
}
```

如果你想看原始等价命令，这个 launcher 本质上就是对 standalone 容器执行 `docker exec -i ... node /app/dist/mcp/aionis-dev-mcp.js`。

## 本地 Agent 工作流编排

如果你想把 `Aionis Dev MCP` 作为产品化的 Codex 本地工作流来使用，优先走 [`Codex 本地 Profile`](/public/zh/integrations/05-codex-local)。

下面这些是更底层的编排入口，适合做调试、脚本化接入或高级集成。

先启动一个受跟踪的 session：

```bash
npm run -s devloop:session -- start \
  --root /path/to/Aionis \
  --title "Investigate MCP regression" \
  --goal "Diagnose and fix the regression without breaking stdio behavior." \
  --query "Investigate the MCP regression and keep the transport stable."
```

如果你想把一条 agent 命令整体包进 Aionis replay run：

```bash
bash /path/to/Aionis/scripts/run_agent_with_aionis.sh \
  --root /path/to/Aionis \
  --title "Investigate MCP regression" \
  --goal "Diagnose and fix the regression without breaking stdio behavior." \
  --query "Investigate the MCP regression and keep the transport stable." \
  -- codex
```

在一个进行中的 session 里，也可以直接记录常见命令步骤：

```bash
AIONIS_RUN_ID=<run-id> \
AIONIS_SESSION_ROOT=/path/to/Aionis \
bash /path/to/Aionis/scripts/aionis-build
```

本地 session 状态会写到 `.aionis/dev-runs`，而 `aionis-build`、`aionis-test`、`aionis-lint` 会在发 replay step 之前自动预留 `step_index`。

## 可选鉴权

1. `AIONIS_API_KEY` -> `X-Api-Key`
2. `AIONIS_AUTH_BEARER` -> `Authorization: Bearer ...`
3. `AIONIS_ADMIN_TOKEN` -> `X-Admin-Token`（仅管理接口）

## 版本一致性

1. MCP `initialize` 的 `serverInfo.version` 会跟随 Aionis 包版本自动同步。
2. Dev MCP 也支持通过 `AIONIS_DEV_MCP_VERSION` 单独覆盖版本标识。

## 相关页面

1. [OpenWork 集成](/public/zh/integrations/02-openwork)
2. [LangGraph 集成](/public/zh/integrations/03-langgraph)
3. [OpenClaw 集成](/public/zh/integrations/04-openclaw)
4. [Codex 本地 Profile](/public/zh/integrations/05-codex-local)
5. [API 契约](/public/zh/api/01-api-contract)
