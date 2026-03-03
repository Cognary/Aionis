---
title: "Integrations"
---

# Integrations

Aionis integrates with agent runtimes and orchestration frameworks through stable API contracts.

## Official Integrations

1. [MCP Integration](/public/en/integrations/01-mcp)
2. [OpenWork Integration](/public/en/integrations/02-openwork)
3. [LangGraph Integration](/public/en/integrations/03-langgraph)

## Recommended Rollout Path

1. Start with memory retrieval (`recall_text` or `context/assemble`).
2. Add policy loop (`rules/evaluate`, `tools/select`).
3. Add decision and feedback tracing (`tools/decision`, `tools/feedback`).
4. Enable replay/debug workflows using `resolve` and URI-linked objects.

## Integration Contract

For production integrations, persist and propagate:

1. `tenant_id`
2. `scope`
3. `request_id`
4. `run_id`
5. `decision_id`
6. `commit_uri`

## Related

1. [API Reference](/public/en/api-reference/00-api-reference)
2. [API Contract](/public/en/api/01-api-contract)
3. [SDK Guide](/public/en/reference/05-sdk)
