# Memory Graph Architecture (Phase 1)

## Core Idea

Postgres + pgvector is the system of record for:

- Nodes (Event/Entity/Topic/Rule/Evidence)
- Edges (part_of/related_to/derived_from)
- Commit chain (append-only, hash-chained)

Graph traversal / spreading activation is done in the application layer.

## Layering

- Raw / Evidence (immutable pointers):
  - stored as references in `memory_nodes.raw_ref` / `memory_nodes.evidence_ref`
- Normalized Nodes/Edges:
  - the stable substrate used for recall
- Derived artifacts:
  - Topics (from clustering), edge weights, summaries
  - should bump `derivation_version` so they can be recomputed

## Rule Lifecycle

Rules are proposal-first:

- `draft`: created from extraction/abstraction; not used by default recall
- `shadow`: evaluated silently (produces suggestions but doesn't enforce)
- `active`: can influence planner/policy/tool selection
- `disabled`: kept for audit, excluded from recall

Per-run ephemeral override should live in execution state (not persisted).

## Recall

1. Stage 1 (fast):
   - pgvector candidate retrieval from active tiers (`hot` + `warm`)
   - entity literal matches
   - rules in `shadow/active`
2. Stage 2 (smart):
   - fetch 1-2 hop neighborhood for seeds
   - spreading activation in app
   - output a bounded subgraph + citations (node/edge/commit/evidence refs)

## Jobs

- topic clustering:
  - groups recent events into stable clusters
  - creates/updates Topic nodes + `derived_from` edges
- salience decay:
  - applies salience decay to active tiers
  - transitions by policy: `hot -> warm -> cold -> archive`
  - protects pinned/legal-hold nodes and enforces mutation budget
