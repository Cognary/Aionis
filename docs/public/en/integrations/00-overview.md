---
title: "Integrations"
---

# Integrations

Aionis integrates with agent runtimes through stable API contracts and one core model:

1. write durable memory
2. recall or assemble bounded context
3. apply policy and tool routing
4. record replayable execution state

## Choose Your Integration Path

### Path A: MCP and Coding Agents

Best for:

1. Codex and local coding workflows
2. agent tooling that already speaks MCP
3. teams that want Aionis memory, replay, and policy surfaces without writing a full SDK wrapper

Start here:

1. [MCP Integration](/public/en/integrations/01-mcp)
2. [Codex Local Profile](/public/en/integrations/05-codex-local)

### Path B: SDK and API Integration

Best for:

1. application teams embedding Aionis into existing products
2. service-to-service integrations
3. teams that want explicit control over HTTP and SDK calls

Start here:

1. [API Reference](/public/en/api-reference/00-api-reference)
2. [SDK Guide](/public/en/reference/05-sdk)

### Path C: Framework Adapters

Best for:

1. users already committed to orchestration frameworks
2. teams validating Aionis inside existing agent stacks

Use one of these:

1. [MCP Integration](/public/en/integrations/01-mcp)
2. [OpenWork Integration](/public/en/integrations/02-openwork)
3. [LangGraph Integration](/public/en/integrations/03-langgraph)
4. [OpenClaw Integration](/public/en/integrations/04-openclaw)

## Recommended Rollout Path

1. Start with memory retrieval (`recall_text` or `context/assemble`).
2. Add policy loop (`rules/evaluate`, `tools/select`).
3. Add decision and run lifecycle tracing (`tools/decision`, `tools/run`, `tools/feedback`).
4. Enable replay/debug workflows using `resolve` and URI-linked objects.

## Integration Contract

For production integrations, persist and propagate:

1. `tenant_id`
2. `scope`
3. `request_id`
4. `run_id`
5. `decision_id`
6. `commit_uri`

## Start Here

1. Choose one integration path, not all of them.
2. Validate write and recall first.
3. Add policy loop after retrieval is stable.
4. Add replay surfaces when you want traceability and reuse.

## Next Steps

1. [MCP Integration](/public/en/integrations/01-mcp)
2. [Codex Local Profile](/public/en/integrations/05-codex-local)
3. [OpenClaw Integration](/public/en/integrations/04-openclaw)
4. [API Reference](/public/en/api-reference/00-api-reference)
5. [SDK Guide](/public/en/reference/05-sdk)

## Related

1. [API Reference](/public/en/api-reference/00-api-reference)
2. [API Contract](/public/en/api/01-api-contract)
3. [SDK Guide](/public/en/reference/05-sdk)
4. [Get Started](/public/en/getting-started/01-get-started)
