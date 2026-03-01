---
title: "OpenWork (OpenCode Desktop) Integration"
---

# OpenWork (OpenCode Desktop) Integration

This project exposes an **MCP server** so OpenWork/OpenCode can call Aionis Memory Graph as tools.

For a client-agnostic MCP overview, see [MCP Integration](./MCP_INTEGRATION.md).

## What You Get

- `aionis_memory_remember`: write one memory node (default type=event)
- `aionis_memory_recall_text`: recall a compact, LLM-friendly text context

Embeddings are **derived artifacts**: the MCP tool will not block on embeddings, and it never returns embeddings.

## Prereqs

- Aionis API running (default from `.env.example`: `http://localhost:3001`)
- Node >= 18

## Run The MCP Server

Build:

```bash
npm run build
```

Run (manual smoke):

```bash
AIONIS_BASE_URL=http://localhost:${PORT:-3001} AIONIS_SCOPE=default node dist/mcp/aionis-mcp.js
```

Repo smoke (stdio MCP handshake + tool call):

```bash
set -a; source .env; set +a
bash examples/mcp_stdio_smoke.sh
```

## Configure OpenWork / OpenCode

OpenCode supports MCP servers via its config file. Add a local MCP server entry.

Example snippet (adjust path/env):

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

If your Aionis API requires admin-gated operations, you can also set:

- `AIONIS_ADMIN_TOKEN`: forwarded as `X-Admin-Token` header to the API
- `AIONIS_API_KEY`: forwarded as `X-Api-Key` (for `MEMORY_AUTH_MODE=api_key` / `api_key_or_jwt`)
- `AIONIS_AUTH_BEARER`: forwarded as `Authorization: Bearer <jwt>` (for `MEMORY_AUTH_MODE=jwt` / `api_key_or_jwt`)

## Recommended Agent Instruction

To get consistent behavior, tell your agent to:

- call `aionis_memory_recall_text` before planning/executing when the task is non-trivial
- call `aionis_memory_remember` after finishing a run to store outcomes/decisions
