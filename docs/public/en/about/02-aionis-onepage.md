---
title: "Aionis Onepage"
---

# Aionis Onepage

Last updated: `2026-03-03`

## Category

Aionis is a **Memory Kernel** for AI products that require durable memory, controlled execution, and replayable operations.

## What It Solves

1. Long-lived memory across sessions and workflows.
2. Reliable context assembly for LLM generation and planning.
3. Policy-aware tool routing and decision control.
4. Production operation with measurable release gates.

## Product Loop

```mermaid
flowchart LR
  A["Write and Recall Memory"] --> B["Assemble Layered Context"]
  B --> C["Apply Rules and Select Tools"]
  C --> D["Record Decisions and Feedback"]
  D --> A
```

## Why Teams Choose It

1. Verifiable write lineage (`commit_id`, `commit_uri`).
2. Policy loop that can affect runtime behavior.
3. Replayable IDs and URI-based object resolution.
4. Production-ready runbooks and operations gates.

## Where to Read Next

1. [Overview](/public/en/overview/01-overview)
2. [Core Concepts](/public/en/core-concepts/00-core-concepts)
3. [Architecture](/public/en/architecture/01-architecture)
4. [Operate and Production](/public/en/operate-production/00-operate-production)
5. [Docs Navigation Map](/public/en/overview/02-docs-navigation)
