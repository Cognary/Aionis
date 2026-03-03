---
title: "Architecture Deep Dive"
---

# Architecture Deep Dive

This page is the deep-dive companion to the primary architecture page:

1. [Architecture](/public/en/architecture/01-architecture)

## When to Use This Page

Use this page when you are planning scale, resilience, and replay behavior beyond first integration.

## Storage and Execution Model

1. Memory objects are persisted in a durable graph model with commit lineage.
2. Graph traversal and ranking are executed at the application layer.
3. Derived artifacts (embedding/topic/compression) are asynchronous and versioned.

## Lifecycle Layers

1. Raw and evidence references preserve source linkage.
2. Normalized nodes and edges are the retrieval substrate.
3. Derived artifacts enrich recall and planning context without blocking core writes.

## Policy Execution States

Rule lifecycle is explicit and reversible:

1. `draft`
2. `shadow`
3. `active`
4. `disabled`

## Recall Pipeline Notes

1. Candidate generation starts with vector and literal signals.
2. Neighborhood expansion adds graph context around top seeds.
3. Final context is bounded by orchestration budgets.

## Job Model

Common background jobs include:

1. Topic clustering.
2. Compression rollups.
3. Salience and quality maintenance checks.

## Related

1. [Architecture](/public/en/architecture/01-architecture)
2. [Operate and Production](/public/en/operate-production/00-operate-production)
3. [Consolidation Replay Runbook](/public/en/operations/10-consolidation-replay-runbook)
