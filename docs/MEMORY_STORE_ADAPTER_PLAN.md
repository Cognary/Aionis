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
20. Added CI backend-matrix parity smoke workflow (`postgres` + `embedded`) with migration + contract + startup health + write/recall API parity checks.
21. Added embedded in-memory runtime (`in_memory_v1`) and switched embedded backend recall paths to local adapter with write-through mirror from API write flows.
22. Added embedded runtime snapshot persistence (startup load + write autosave) with contract smoke replay checks.
23. Added snapshot governance controls: backup rotation, max-bytes guard, and corrupt snapshot quarantine recovery.
24. Added snapshot compaction policy + operator-visible metrics (tiered payload trimming, edge/node pruning fallback, `/health` metrics exposure, contract smoke coverage).
25. Added backend parity CI observability for embedded snapshot compaction (health metrics presence checks, post-write metric delta assertions, and node-drop guardrail threshold).
26. Added write-side capability negotiation flag `shadow_mirror_v2` with backend-specific declaration, strict-mode env guardrails, `/health` exposure, and CI/contract assertions.
27. Extended capability negotiation to recall path with `debug_embeddings` declaration (backend toggle, runtime enforcement, `/health` exposure, and CI/contract coverage).
28. Extended recall capability negotiation with `audit_insert` declaration (backend toggle, runtime skip path when unavailable, `/health` exposure, and CI/contract coverage).
29. Added store feature capability negotiation for `sessions_graph`, `packs_export`, and `packs_import` with API route gate enforcement, `/health` exposure, and CI coverage.
30. Added capability-specific fallback contract details (`degraded_mode`, capability key, fallback flag) for feature-gated errors and shadow dual-write degraded path, with API-contract + contract-smoke coverage.
31. Centralized capability fallback contract registry (`hard_fail` vs `soft_degrade`) and exposed it via `/health` for client/runtime negotiation.
32. Wired capability fallback negotiation into TypeScript/Python SDKs (`health` + `getCapabilityContract` helpers, capability-unsupported error parsers, and README/SDK contract docs).
33. Added backend-parity SDK smoke coverage for capability negotiation (TS + Python): checks `/health` contract parity and validates `packs_export` success vs `backend_capability_unsupported` path by backend capability state.
34. Promoted SDK capability-negotiation checks into `sdk-ci.yml` (dedicated backend matrix smoke for TS + Python SDK outputs, including unsupported `packs_export` contract assertions on embedded backend).
35. Expanded `sdk-ci` unsupported-capability fixtures for embedded backend to include `sessions_graph` and `packs_import` (API-level `501 backend_capability_unsupported` + capability key + hard-fail contract assertions).
36. Added `shadow_mirror_v2` write-path soft-degrade fixture assertion in `sdk-ci` for embedded backend (`/v1/memory/write` returns `shadow_dual_write` with `soft_degrade`, `capability_unsupported`, and `fallback_applied=true` when mirror capability is unavailable).
37. Added strict-mode fail-fast fixture in `sdk-ci` for embedded backend (`MEMORY_SHADOW_DUAL_WRITE_STRICT=true` with unavailable mirror capability must fail startup with env validation error).
38. Added strict runtime mirror-failure fixture in `sdk-ci` for embedded backend (enable strict+mirror capability, induce mirror table failure, assert `/v1/memory/write` hard-fails with HTTP 500).
39. Upgraded strict runtime shadow mirror failure to typed API contract (`error=shadow_dual_write_strict_failure` + structured details), and added TS/Python SDK helper parsers/type guards.
40. Added explicit local/embedded integration examples for strict-failure SDK helper usage in `docs/SDK.md` and dev smoke reproduction steps in `docs/ONBOARDING_5MIN.md`.
41. Added one-command local strict-failure probe (`npm run -s smoke:strict-shadow-failure`) to automate mirror-failure injection, typed error assertion, and table recovery.
42. Expanded SDK capability-negotiation smoke to cover `sessions_graph` and `packs_import` via SDK methods (success path on capability-enabled backend, typed `backend_capability_unsupported` path on capability-disabled backend), and synchronized `src/sdk` methods/types with these endpoints.
43. Upgraded `sdk-ci` capability-negotiation matrix to include embedded feature-enabled profile and switched assertions from backend-hardcoded branches to capability-driven checks (`/health.memory_store_feature_capabilities`) for `packs_export`/`sessions_graph`/`packs_import`.
44. Extended SDK smoke health payloads with recall/write capabilities and gated soft-degrade probe execution on `write_capabilities.shadow_mirror_v2=false` (instead of backend-only branching), reducing false failures when embedded mirror capability is enabled.
45. Upgraded `backend-parity-smoke` matrix to capability profiles (`postgres`, `embedded_capability_off`, `embedded_feature_enabled`) and removed embedded runtime env overrides so parity checks always validate declared capability state directly.
46. Refactored `backend-parity-smoke` runtime assertions to be `/health`-driven (capability + contract + SDK smoke behavior consistency), removing backend/env-derived expectation branches and aligning embedded metrics guards with health-exposed runtime values.
47. Added direct API-level capability probes in `backend-parity-smoke` for `sessions_graph` / `packs_export` / `packs_import`, validating both enabled-success and disabled-typed-error paths against `/health.memory_store_capability_contract`.
48. Extracted shared API capability probe script (`scripts/ci/capability-api-probes.sh`) and reused it in both `sdk-ci` and `backend-parity-smoke` (including optional shadow soft-degrade probe), reducing duplicated inline workflow logic.

## Next Steps

1. Expand embedded local runtime beyond recall/write baseline (rules evaluate, planning context, packs/session parity).
2. Add runtime compaction telemetry export for long-run trend analysis (artifact timeline + alert thresholds), beyond smoke-level CI assertions.
3. Keep local smoke command and SDK helper snippets aligned with future strict-failure contract evolution (error/details schema).
