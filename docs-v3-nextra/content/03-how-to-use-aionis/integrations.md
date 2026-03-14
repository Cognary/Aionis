---
title: "Integrations"
description: "Choose the integration path that fits your current stack, from Codex and MCP to LangGraph and direct SDK or HTTP usage."
---

# Integrations

Aionis meets developers where they already work.

The integration path needs to feel practical, not theoretical.

## Codex

Best for:

1. local coding agents
2. project-scoped continuation
3. replay-aware developer workflows

Recommended entry:

1. Lite for the local runtime
2. Dev MCP for the agent surface
3. tracked wrapper only when you want full replay lifecycle capture

What Aionis adds here:

1. session continuity across fresh Codex runs
2. recoverable handoff instead of transcript-only memory
3. replay-aware execution for repeated local work

## LangGraph

Best for:

1. multi-step agent workflows
2. planner and executor separation
3. systems that need policy before tool use

Recommended flow:

1. before planning: `recall_text` or `planning/context`
2. before action: `rules/evaluate` and `tools/select`
3. after execution: `write` and `tools/feedback`
4. when reuse matters: replay and playbooks

What Aionis adds here:

1. cross-runtime continuity
2. better tool governance
3. replayable execution assets

## MCP

Best for:

1. coding-agent clients that already speak MCP
2. teams that want low-friction local integration
3. workflows where bounded summaries matter more than raw payload dumps

There are two useful MCP surfaces:

1. compatibility MCP for basic remember and recall
2. dev MCP for memory, replay, policy, and coding-agent workflows

## Why This Section Matters

People adopt Aionis when they can see:

1. where it sits in the runtime
2. how little they need to change to start
3. what new capability appears after integration

## Recommended Sequence

The integration section works best in this order:

1. Codex
2. LangGraph
3. MCP

That order matches where the value is easiest to feel quickly.
