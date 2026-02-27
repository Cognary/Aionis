---
title: "Memory Store Adapter Plan"
---

# Memory Store Adapter Plan

Last updated: `2026-02-27`  
Status: `phase_p1_in_progress`

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

## Next Steps

1. Extend recall access beyond Stage1 (`stage2_edges`, `stage2_nodes`, `rule_defs`, `debug_embeddings`, `audit_insert`).
2. Start write-path extraction (`append_commit` + minimal node/edge fetch capabilities), keeping Postgres as reference.
3. Add `embedded` experimental adapter behind explicit feature flag after read/write capability seams are stable.
