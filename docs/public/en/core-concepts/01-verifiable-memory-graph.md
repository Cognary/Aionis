---
title: "Verifiable Memory Graph"
---

# Verifiable Memory Graph

Aionis stores memory as graph objects with audit-ready lineage.

## Objects

1. Nodes: `event/entity/topic/rule/evidence/concept/procedure/self_model`
2. Edges: typed relationships connecting nodes
3. Commits: immutable write anchors for state changes

## Why It Matters

1. Every write can be traced by `commit_id/commit_hash`.
2. Recall can reference stable object URIs.
3. Incidents can be replayed with deterministic references.

## Related

1. [API Contract](/public/en/api/01-api-contract)
2. [URI Expansion Plan](/public/en/reference/07-uri-expansion-plan)
