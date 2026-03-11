---
title: "MCP Integration"
---

# MCP Integration

Aionis provides two MCP servers:

1. `aionis-mcp`: the compatibility memory MCP
2. `aionis-dev-mcp`: the native dev-focused MCP for coding agents

## Compatibility MCP Tools

1. `memory_remember`: write memory entries
2. `memory_recall_text`: fetch compact LLM-ready context

## Dev MCP Tools

The native Dev MCP adds:

1. memory write and recall
2. tool selection / decision / feedback lifecycle
3. replay run and playbook operations
4. sandbox execution operations
5. Codex-oriented planning context, quality gate, and learning tools

The current Dev MCP output policy also prefers bounded execution summaries over raw tool payloads when available:

1. sandbox tools surface `result_summary`
2. replay-backed command steps record `result_summary`
3. tool lifecycle surfaces such as `tools/select`, `tools/decision`, and `tools/run` now also prefer compact lifecycle summaries over raw JSON blobs
4. `tools/select` API responses expose `selection_summary`, and `tools/decision` / `tools/run` expose `lifecycle_summary`, so MCP can reuse the same summary-first surface instead of recomputing it ad hoc
5. MCP text responses prefer those summaries first, then fall back to raw JSON only when needed

## Quick Start

1. Build the project:

```bash
npm run build
```

2. Run compatibility MCP server:

```bash
AIONIS_BASE_URL=http://localhost:${PORT:-3001} \
AIONIS_SCOPE=default \
node dist/mcp/aionis-mcp.js
```

3. Run native Dev MCP server:

```bash
AIONIS_BASE_URL=http://localhost:${PORT:-3001} \
AIONIS_SCOPE=default \
node dist/mcp/aionis-dev-mcp.js
```

4. Run smoke checks:

```bash
set -a; source .env; set +a
bash examples/mcp_stdio_smoke.sh
bash examples/mcp_dev_stdio_smoke.sh
```

If the standalone Docker container is already running, you can also verify the final launcher path:

```bash
AIONIS_STANDALONE_CONTAINER=aionis-standalone \
bash examples/mcp_dev_standalone_smoke.sh
```

For the shortest local path, bootstrap standalone Docker and verify the launcher in one command:

```bash
npm run -s mcp:aionis:dev:standalone:oneclick
```

## Local Client Config Example

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

## Standalone Docker Client Config

If you run Aionis as the standalone Docker image, the Dev MCP is already inside the container after `npm run build` and image build. The recommended host-side launcher is:

```bash
bash /path/to/Aionis/scripts/mcp-aionis-dev-standalone.sh
```

If you want Aionis to build the image, start the container, wait for health, and run the launcher smoke automatically:

```bash
bash /path/to/Aionis/scripts/mcp-aionis-dev-standalone-oneclick.sh
```

It defaults to:

1. container name `aionis-standalone`
2. `AIONIS_BASE_URL=http://127.0.0.1:3001`
3. `AIONIS_SCOPE=default`

Override them when needed:

```bash
AIONIS_STANDALONE_CONTAINER=my-aionis \
AIONIS_SCOPE=workspace \
bash /path/to/Aionis/scripts/mcp-aionis-dev-standalone.sh
```

To smoke-test that exact launcher path against a live standalone container:

```bash
AIONIS_STANDALONE_CONTAINER=aionis-standalone \
bash /path/to/Aionis/examples/mcp_dev_standalone_smoke.sh
```

For local MCP clients, prefer configuring that launcher directly:

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

If you want the raw equivalent, the launcher runs `docker exec -i` against the standalone container and starts `node /app/dist/mcp/aionis-dev-mcp.js` inside it.

## Local Agent Orchestration

If you want to use `Aionis Dev MCP` as a productized Codex local workflow, start with [Codex Local Profile](/public/en/integrations/05-codex-local).

The commands below are the lower-level orchestration entrypoints for debugging, scripting, and advanced integration.

Start a tracked session:

```bash
npm run -s devloop:session -- start \
  --root /path/to/Aionis \
  --title "Investigate MCP regression" \
  --goal "Diagnose and fix the regression without breaking stdio behavior." \
  --query "Investigate the MCP regression and keep the transport stable."
```

Wrap an agent command so Aionis opens and closes the replay run automatically:

```bash
bash /path/to/Aionis/scripts/run_agent_with_aionis.sh \
  --root /path/to/Aionis \
  --title "Investigate MCP regression" \
  --goal "Diagnose and fix the regression without breaking stdio behavior." \
  --query "Investigate the MCP regression and keep the transport stable." \
  -- codex
```

Record common command steps inside a live session:

```bash
AIONIS_RUN_ID=<run-id> \
AIONIS_SESSION_ROOT=/path/to/Aionis \
bash /path/to/Aionis/scripts/aionis-build
```

The local session state is stored under `.aionis/dev-runs`, and `aionis-build`, `aionis-test`, and `aionis-lint` automatically reserve step indexes before posting replay step events.

## Optional Auth

1. `AIONIS_API_KEY` -> `X-Api-Key`
2. `AIONIS_AUTH_BEARER` -> `Authorization: Bearer ...`
3. `AIONIS_ADMIN_TOKEN` -> `X-Admin-Token` (admin routes)

## Version Consistency

1. MCP `initialize` response `serverInfo.version` is auto-synced from Aionis package version.
2. Dev MCP also accepts `AIONIS_DEV_MCP_VERSION` if you want a separate build label.

## Related

1. [OpenWork Integration](/public/en/integrations/02-openwork)
2. [LangGraph Integration](/public/en/integrations/03-langgraph)
3. [OpenClaw Integration](/public/en/integrations/04-openclaw)
4. [Codex Local Profile](/public/en/integrations/05-codex-local)
5. [API Contract](/public/en/api/01-api-contract)
