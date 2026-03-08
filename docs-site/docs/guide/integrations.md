# Integrations

This page maps Aionis into common runtime and framework environments.

## How to use this page

1. Pick the runtime or toolchain you already use.
2. Keep the same Aionis execution pattern across every integration.
3. Validate the integration with one write, one recall, one policy check, and one replayable ID chain.

## Integration pattern

1. Retrieve context before planning.
2. Apply policy before action.
3. Persist outcomes and feedback after action.
4. Keep replay IDs across all steps.

## Choose the right path

1. Need a local control plane for tools and experimentation:
   use [MCP](#mcp) and [Playground](#playground)
2. Need a UI for operators:
   use [Ops Console](#ops-console)
3. Need agent framework orchestration:
   use [LangGraph and OpenWork](#langgraph-and-openwork)
4. Need CLI-driven memory workflows:
   use [OpenClaw](#openclaw)

## Minimum environment variables

```bash
export AIONIS_BASE_URL="http://localhost:3001"
export AIONIS_SCOPE="default"
export AIONIS_API_KEY="your_api_key"
# or
export AIONIS_AUTH_BEARER="Bearer <token>"
```

## MCP

```bash
npm run build
AIONIS_BASE_URL=http://localhost:${PORT:-3001} AIONIS_SCOPE=default node dist/mcp/aionis-mcp.js
npm run -s mcp:smoke
```

## Codex Local Profile

Use this when you want a productized local path for Codex instead of wiring MCP and local session scripts by hand.

The profile combines:

1. `Aionis Dev MCP` as the MCP tool surface
2. standalone Docker as the local runtime
3. `codex-aionis` as the tracked local launcher

Recommended flow:

```bash
npm run -s mcp:aionis:dev:standalone:oneclick
npm run -s aionis:setup:codex
npm run -s aionis:install:codex-launcher
codex-aionis-doctor
```

Then launch Codex through the tracked wrapper:

```bash
codex-aionis \
  --root /path/to/workspace \
  --title "Your task title" \
  --goal "Your concrete goal" \
  --query "Your natural language task description" \
  -- codex
```

Use [Codex Local Profile](codex-local-profile) for the complete setup and operating model.

## Playground

```bash
npm --prefix apps/playground install
npm run -s playground:dev
```

## Ops Console

```bash
npm --prefix apps/ops install
npm run -s ops:dev
```

## LangGraph and OpenWork

Recommended order:

1. `recall/context`
2. `rules/select`
3. action execution
4. `write/feedback`

LangGraph smoke:

```bash
npm run -s langgraph:smoke
```

## OpenClaw

```bash
openclaw plugins install @aionis/openclaw
openclaw aionis-memory bootstrap
```

## Integration checklist

1. Every request carries `tenant_id` and `scope`.
2. Every meaningful write persists at least one recallable node.
3. Policy-loop calls share the same `run_id`.
4. The runtime logs `request_id`, `decision_id`, and `commit_uri`.
5. At least one recent workflow can be replayed from stored identifiers.
