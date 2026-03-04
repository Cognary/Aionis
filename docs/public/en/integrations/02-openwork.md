---
title: "OpenWork Integration"
---

# OpenWork Integration

Use the Aionis MCP server in OpenWork/OpenCode Desktop to add memory capabilities to desktop agent workflows.

## What This Enables

1. Add memory retrieval before each task execution.
2. Persist outcomes after each completed run.
3. Keep memory operations auditable through Aionis APIs.

## Setup

1. Build Aionis MCP server:

```bash
npm run build
```

2. Configure OpenWork/OpenCode MCP entry to launch:

```bash
node /path/to/Aionis/dist/mcp/aionis-mcp.js
```

3. Set environment values:

1. `AIONIS_BASE_URL`
2. `AIONIS_SCOPE`
3. Optional auth variables (`AIONIS_API_KEY` or `AIONIS_AUTH_BEARER`)

## Recommended Agent Behavior

1. Call `memory_recall_text` before planning complex actions.
2. Call `memory_remember` after finishing steps.
3. Include run metadata in memory text or slots for later replay.

## Related

1. [MCP Integration](/public/en/integrations/01-mcp)
2. [OpenClaw Integration](/public/en/integrations/04-openclaw)
3. [API Reference](/public/en/api-reference/00-api-reference)
