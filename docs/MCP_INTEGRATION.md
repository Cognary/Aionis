---
title: "MCP Integration"
---

# MCP Integration

Aionis exposes an MCP server so MCP-capable clients can call memory operations as tools.

## Tools Exposed

1. `memory_remember`: write one memory node (default `type=event`)
2. `memory_recall_text`: return compact, LLM-ready context text

## Prerequisites

1. Aionis API running (default `http://localhost:3001`)
2. Node.js `>= 18`

## Run MCP Server

Build:

```bash
npm run build
```

Run:

```bash
AIONIS_BASE_URL=http://localhost:${PORT:-3001} AIONIS_SCOPE=default node dist/mcp/aionis-mcp.js
```

Stdio smoke:

```bash
set -a; source .env; set +a
bash examples/mcp_stdio_smoke.sh
```

## Client Configuration

Example local MCP config:

```jsonc
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

## Optional Auth Headers

1. `AIONIS_ADMIN_TOKEN` -> forwarded as `X-Admin-Token`
2. `AIONIS_API_KEY` -> forwarded as `X-Api-Key`
3. `AIONIS_AUTH_BEARER` -> forwarded as `Authorization: Bearer <jwt>`

## Recommended Usage Pattern

1. Call `memory_recall_text` before planning/execution for non-trivial tasks.
2. Call `memory_remember` after task completion to persist outcomes.

## Related Docs

1. [OpenWork (OpenCode Desktop) Integration](./OPENWORK_INTEGRATION.md)
2. [LangGraph Integration](./LANGGRAPH_INTEGRATION.md)
3. [API Contract](./API_CONTRACT.md)
