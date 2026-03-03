---
title: "Build Memory"
---

# Build Memory

This section maps user tasks to the memory APIs.

## Adding Context

Purpose: write new memory signals into Aionis.

1. `POST /v1/memory/write`
2. Session-first ingestion: `create session / write event / list session events`
3. Source of truth: commits + node/edge lineage

Read:

1. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
2. [API Contract](/public/en/api/01-api-contract)

## Assembling Context

Purpose: retrieve LLM-ready context for reasoning and generation.

1. `POST /v1/memory/recall`
2. `POST /v1/memory/recall_text`
3. `POST /v1/memory/planning/context` (combined recall + policy path)

Read:

1. [API Contract](/public/en/api/01-api-contract)
2. [Planner Context](/public/en/reference/02-planner-context)

## Customizing Context

Purpose: control recall behavior for quality, latency, and token budget.

1. Recall strategy and profile knobs
2. Context compaction (`context_token_budget`, `context_char_budget`, profile)
3. Rule-aware recall context (`rules_context`, `rules_limit`, shadow visibility)

Read:

1. [API Contract](/public/en/api/01-api-contract)
2. [Recall Tail Latency Plan](/RECALL_TAIL_LATENCY_PLAN)
3. [Adaptive Compression Plan](/ADAPTIVE_COMPRESSION_PLAN)
4. [Context Orchestrator Plan](/CONTEXT_ORCHESTRATOR_PLAN)

## Working with Graphs

Purpose: operate directly on graph-level objects and relationships.

1. `find` via URI/id/client_id
2. Nodes + edges + commits model
3. Scope/tenant-aware graph access

Read:

1. [API Contract](/public/en/api/01-api-contract)
2. [Aionis Onepage](/AIONIS_ONEPAGE)
