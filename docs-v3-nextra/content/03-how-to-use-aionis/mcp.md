---
title: "MCP"
description: "Use the Aionis MCP surfaces for memory, policy, replay, and coding-agent workflows with a protocol-native integration path."
---

# MCP

MCP is the easiest integration story when the client already speaks the protocol.

## Two MCP Surfaces

The repository currently exposes:

1. `aionis-mcp`
2. `aionis-dev-mcp`

Use the compatibility MCP when you only need basic memory interactions.

Use the dev MCP when you want the broader coding-agent surface around:

1. memory
2. policy
3. replay
4. sandbox-aware workflows

## Quick Start

Build once:

```bash
npm run build
```

Run compatibility MCP:

```bash
AIONIS_BASE_URL=http://localhost:3001 \
AIONIS_SCOPE=default \
node dist/mcp/aionis-mcp.js
```

Run dev MCP:

```bash
AIONIS_BASE_URL=http://localhost:3001 \
AIONIS_SCOPE=default \
node dist/mcp/aionis-dev-mcp.js
```

## Smoke Validation

The repository already includes smoke scripts:

```bash
bash examples/mcp_stdio_smoke.sh
bash examples/mcp_dev_stdio_smoke.sh
```

Those are better references than prose alone because they test the real protocol path.

## Standalone Docker Launcher Path

If you want the host-side launcher path into a standalone container:

```bash
bash scripts/mcp-aionis-dev-standalone-oneclick.sh
```

That script can:

1. build the standalone image if needed
2. start the container
3. wait for health
4. run the launcher smoke

## Why MCP Matters Externally

MCP makes Aionis easy to try without asking users to redesign their whole runtime.

That is a strong adoption surface.
