---
title: "Memory Store Adapter Plan"
---

# Memory Store Adapter Plan

Last updated: `2026-02-28`  
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
49. Fixed `core-production-gate` CI admin token wiring by injecting `ADMIN_TOKEN=ci-admin-token` in prepared `.env`, restoring pack roundtrip gate (`/v1/memory/packs/export|import`) stability after admin-only enforcement.
50. Added shared capability API probes to `core-production-gate` so production gate CI also validates `/health`-declared capability contracts and API behavior consistency (including optional shadow soft-degrade path).
51. Added shared policy/planner API probes (`scripts/ci/policy-planner-api-probes.sh`) and wired them into `backend-parity-smoke` + `core-production-gate` to validate `/v1/memory/rules/evaluate`, `/v1/memory/tools/select`, and `/v1/memory/planning/context` contract shape plus cross-endpoint consistency.
52. Extended `sdk-ci` capability-negotiation smoke to also run shared policy/planner API probes, so SDK CI now covers capability + policy/planner contract checks together (and exposes probe output in failure diagnostics).
53. Refactored CI probe implementation to shared Node modules (`scripts/ci/probe-common.mjs` + dedicated `*.mjs` entrypoints) while keeping `.sh` wrappers stable, reducing duplicated assertion code and simplifying future probe expansion.
54. Added mock-based probe unit tests (`scripts/ci/probes.test.mjs`) and wired them into `sdk-ci` validate stage (`npm run test:ci-probes`) to catch probe-contract regressions before full backend matrix execution.
55. Added pure-function unit tests for shared probe helpers (`scripts/ci/probe-common.test.mjs`) covering env normalization, auth header composition, and strict admin-token guard behavior.
56. Unified probe success/failure JSON output via shared helpers (`writeJson`, `toProbeFailure`) and added output-shape tests (`scripts/ci/probe-output.test.mjs`) to stabilize diagnostics payload format.
57. Extended shared probe-helper tests to cover HTTP utility behavior (`getJson` / `postJson` success + non-JSON failure branches), ensuring labeled error contracts stay stable across probe callers.
58. Added `capability-api-probes` shadow soft-degrade mock coverage (auto mode on embedded without mirror capability), asserting probe execution and typed `shadow_dual_write` degraded contract fields.
59. Added negative coverage for shadow soft-degrade probing: when `CAPABILITY_PROBE_INCLUDE_SHADOW_SOFT_DEGRADE=false`, capability probe must skip `/v1/memory/write` even under embedded+no-mirror conditions.
60. Added forced shadow probe coverage: when `CAPABILITY_PROBE_INCLUDE_SHADOW_SOFT_DEGRADE=true`, capability probe must execute `/v1/memory/write` regardless of backend kind, while preserving typed soft-degrade contract assertions.
61. Extracted shadow soft-degrade execution decision into shared helper (`shouldRunShadowSoftDegradeProbe`) and added matrix-style unit coverage for `true|false|auto` modes across backend/capability combinations.
62. Added embedded snapshot telemetry export (`scripts/ci/embedded-snapshot-telemetry.mjs`) with threshold guards (persist delta, compaction non-growth, rounds, dropped nodes, failure/quarantine deltas), wired into `backend-parity-smoke` with per-profile artifact upload for timeline tracking.
63. Added backend-parity telemetry rollup job (`telemetry-rollup`) plus rollup script (`embedded-snapshot-telemetry-rollup.mjs`) to aggregate per-profile telemetry artifacts into a run-level summary + artifact (`backend-parity-rollup`) for easier trend consumption.
64. Added backend-parity cross-run telemetry history aggregation (`embedded-snapshot-telemetry-history.mjs`) in `telemetry-rollup`, downloading recent successful `backend-parity-rollup` artifacts to publish history stats (`runs_total`, failure trend, latest-run summary) into step summary + artifacts.
65. Integrated backend-parity telemetry history checks into `core-production-gate` (summary ingestion + thresholded warn/fail control via workflow inputs), and surfaced check/history payloads in gate summaries/artifacts.
66. Added drift-oriented backend-parity history gates in `core-production-gate` (`persist_total_avg` delta and `dropped_nodes_max` delta between latest and previous run), with configurable workflow inputs and explicit observed/threshold fields in check output.
67. Extended embedded local runtime beyond recall/write baseline for `sessions` + `packs`: added runtime-native `session events` read path and pack snapshot export path, wired API routes to prefer runtime when `MEMORY_STORE_BACKEND=embedded`, and fixed `packs/import` embedded runtime mirror propagation.
68. Extended embedded runtime integration for policy/planner rule reads: `evaluateRules`/`evaluateRulesAppliedOnly` now support embedded rule candidate sources, and `tools/select` + `tools/feedback` + `planning/context`/`rules/evaluate` routes now pass embedded runtime through rule-evaluation paths.
69. Added embedded rule write-side sync for policy/planner parity: `rules/state`, `feedback`, and `tools/feedback` now return updated `memory_rule_defs` rows and mirror them into embedded runtime (`state`, commit pointer, counters, timestamps), with contract-smoke coverage for active→feedback→disabled transitions.
70. Extended embedded parity for execution-decision provenance: embedded runtime now mirrors `memory_execution_decisions` and `memory_rule_feedback` writes (including tools-select decision snapshots, tools-feedback linkage updates, and direct feedback rows), with runtime infer/get helpers and contract-smoke coverage.
71. Added execution-decision provenance API probe coverage to shared `policy-planner-api-probes` (rule bootstrap + active promotion + tools/select decision capture + tools/feedback `provided/inferred/created_from_feedback` link-mode assertions), and covered probe behavior in `scripts/ci/probes.test.mjs`; this is now enforced by backend-parity/core-gate/sdk-ci workflows that already invoke the shared probe.

## Next Steps

1. Calibrate drift thresholds from observed baseline windows (for example, p95 delta bands over last N runs) and promote selected warns to enforce mode.
2. Keep local smoke command and SDK helper snippets aligned with future strict-failure contract evolution (error/details schema).
3. Add dedicated API readback endpoint/probe for execution decisions if operator workflows require explicit query-by-id outside tools-feedback inference paths.
