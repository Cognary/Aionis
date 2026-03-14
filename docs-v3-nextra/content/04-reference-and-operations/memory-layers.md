---
title: "Memory Layers"
description: "Understand the Aionis L0-L5 layered memory and compaction model, including the difference between stored, derived, and injected context."
---

# Memory Layers

This page is the advanced reference for Aionis layered memory and compression.

It belongs after a developer already understands the product loop.

## The L0-L5 Model

### L0 Raw Evidence Layer

The original execution evidence:

1. events
2. evidence
3. source-of-record details that should remain auditable

### L1 Distilled Fact Layer

Structured facts extracted from raw evidence at write time.

### L2 Structural Aggregation Layer

Grouped or clustered structure, such as topic-level organization.

### L3 Deterministic Compression Layer

Deterministic rollups that shorten memory without breaking traceability.

### L4 Semantic Abstraction Layer

Higher-level summaries, constraints, risks, lessons, or patterns that sit above deterministic rollups.

This layer needs careful handling:

1. as an advanced model
2. with provenance expectations
3. without pretending every abstraction path is equivalent to raw evidence

### L5 Runtime Context Compaction Layer

Serving-time compaction.

This is not a storage layer. It controls what the model actually sees under budget.

## Why The Distinction Matters

Without a layered model, people confuse three different things:

1. what Aionis stores
2. what Aionis derives
3. what Aionis injects into runtime context

The layered model makes those boundaries easier to explain.

## Why This Lives Here

New users usually need continuity, handoff, replay, and policy first.

This page matters once a team needs to understand how Aionis decides which layer of memory to trust, serve, compress, and replay.
