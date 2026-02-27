---
title: "Memory Store Adapter Plan"
---

# Memory Store Adapter Plan

Last updated: `2026-02-27`  
Status: `phase_p2_in_progress`

## Objective

Introduce a storage adapter boundary so Aionis can keep Postgres as reference backend while preparing for future embedded backends.

## Phase P0 Scope

In scope:

1. Add a `MemoryStore` interface for client/transaction lifecycle.
2. Add `PostgresMemoryStore` reference implementation.
3. Route API DB access through store methods with no behavior change.
4. Add env contract key for backend selection (currently `postgres` only).

Out of scope:

1. Changing schema/query semantics.
2. Introducing embedded backend runtime.
3. Rewriting memory recall/write data access contracts.

## Progress

Completed in this phase:

1. `src/store/memory-store.ts` added (`MemoryStore` + `PostgresMemoryStore` + factory).
2. `src/index.ts` switched from direct `withClient/withTx` calls to `store.withClient/withTx`.
3. `MEMORY_STORE_BACKEND=postgres` added to env schema and `.env.example`.
4. Health/config logs now expose `memory_store_backend`.
5. `src/store/recall-access.ts` added and covers Stage1 ANN + exact-fallback candidate queries for Postgres.
6. `memoryRecallParsed(...)` now supports injectable `recall_access` while preserving default Postgres behavior.
7. Recall call sites (`/v1/memory/recall`, `/v1/memory/recall_text`, `/v1/planning/context`) now pass store access explicitly.
8. Stage2 neighborhood fetches (`stage2_edges`, `stage2_nodes`) moved into `recall-access` Postgres adapter.
9. Recall access extraction completed for read path queries (`rule_defs`, `debug_embeddings`) and best-effort `audit_insert`.
10. `src/store/write-access.ts` added with initial write capabilities (`nodeScopesByIds`, `parentCommitHash`, `insertCommit`).
11. `applyMemoryWrite(...)` now supports injectable `write_access` and uses it for scope checks + commit-chain write.
12. Write entrypoints (`/v1/memory/write`, session create/event append, pack import) now pass Postgres write access explicitly.
13. Write access extraction now also covers core mutation queries (`insert_node`, `insert_rule_def`, `upsert_edge`).
14. Write access extraction now covers outbox-related helpers (`ready_embedding_lookup`, `embed_nodes/topic_cluster enqueue`, `embed_nodes payload update`).
15. Shadow dual-write mirror path (`memory_*_v2` copy) moved into `write-access` (`mirrorCommitArtifactsToShadowV2`).
16. Added adapter capability/version contract for recall/write access with startup fail-fast checks.
17. Added parity smoke checks in contract suite for adapter capability contracts.
18. Added `MEMORY_STORE_BACKEND=embedded` experimental route (postgres-delegated shim) behind explicit env gate.
19. Added query-level parity fixtures for Postgres recall/write adapters in contract smoke.

## Next Steps

1. Replace embedded shim internals with true local engine adapter implementation (while keeping contract stable).
2. Add optional capability negotiation flags for non-parity features per backend (e.g. shadow mirror).
3. Add backend-matrix parity smoke execution (`postgres` + `embedded`) in CI with comparable fixture assertions.
