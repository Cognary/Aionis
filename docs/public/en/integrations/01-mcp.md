---
title: "MCP Integration"
---

# MCP Integration

Aionis provides an MCP server so MCP-capable clients can use memory operations as tools.

## Tools

1. `memory_remember`: write memory entries
2. `memory_recall_text`: fetch compact LLM-ready context

## Quick Start

1. Build the project:

```bash
npm run build
```

2. Run MCP server:

```bash
AIONIS_BASE_URL=http://localhost:${PORT:-3001} \
AIONIS_SCOPE=default \
node dist/mcp/aionis-mcp.js
```

3. Run smoke check:

```bash
set -a; source .env; set +a
bash examples/mcp_stdio_smoke.sh
```

## Client Config Example

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

## Optional Auth

1. `AIONIS_API_KEY` -> `X-Api-Key`
2. `AIONIS_AUTH_BEARER` -> `Authorization: Bearer ...`
3. `AIONIS_ADMIN_TOKEN` -> `X-Admin-Token` (admin routes)

## Related

1. [OpenWork Integration](/public/en/integrations/02-openwork)
2. [LangGraph Integration](/public/en/integrations/03-langgraph)
3. [API Contract](/public/en/api/01-api-contract)
