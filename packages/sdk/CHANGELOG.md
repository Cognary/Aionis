# Changelog

All notable changes to `@aionis/sdk` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer.

## [Unreleased]

## [0.2.8] - 2026-03-05

### Changed

1. Aligned TypeScript SDK release baseline from `0.2.7` to `0.2.8` for strict cross-channel version synchronization (core/npm/PyPI/Docker).
2. No TypeScript SDK API surface change in this patch release.

## [0.2.7] - 2026-03-05

### Changed

1. Added replay run typing support for top-level `project_id` in `ReplayPlaybookRunInput`.
2. Aligned TypeScript SDK release baseline with core `0.2.7` replay execution and sandbox policy expansion.

## [0.2.6] - 2026-03-05

### Changed

1. Added replay automation client coverage (`replayRunStart`, `replayStepBefore`, `replayStepAfter`, `replayRunEnd`, `replayRunGet`, and playbook compile/get/promote/repair/run/review methods).
2. Added missing memory-control methods (`planningContext`, `archiveRehydrate`, `nodesActivate`, `feedback`, `rulesState`) and exported corresponding request/response types.
3. Synced SDK method inventory docs to current API contract and fixed session/events endpoint shape drift.

## [0.2.5] - 2026-03-03

### Changed

1. Aligned coordinated release baseline from `0.2.4` to `0.2.5` across core, npm, PyPI, and Docker channels.
2. No SDK API surface break in this patch release.

## [0.2.4] - 2026-03-03

### Changed

1. Added `toolsRun(...)` client method for `POST /v1/memory/tools/run` lifecycle inspection (`run_id` decisions + feedback linkage).
2. Extended `toolsDecision(...)` request typing to support `run_id` lookup mode and response typing for `lookup_mode`.
3. Added sandbox client methods (`sandboxCreateSession`, `sandboxExecute`, `sandboxRunGet`, `sandboxRunLogs`, `sandboxRunCancel`) for experimental sandbox API surface.

## [0.2.3] - 2026-03-02

### Changed

1. Added complete context orchestration coverage for `POST /v1/memory/context/assemble` flow updates, including layered output and diagnostics-aligned types.
2. Updated Playground/API payload alignment support and release metadata for coordinated `0.2.3` channel rollout.

## [0.2.2] - 2026-03-02

### Changed

1. Aligned coordinated release baseline from `0.2.1` to `0.2.2` across core, npm, PyPI, and Docker channels.
2. Added `contextAssemble(...)` method and exported orchestration types (`ContextAssembleInput`, `ContextAssembleResponse`, `ContextLayerConfigInput`) for `POST /v1/memory/context/assemble`.

## [0.2.1] - 2026-03-01

### Changed

1. Added and stabilized admin/control API coverage in the TypeScript SDK (`control*` surfaces) to match current API contract and ops-panel usage.
2. Advanced coordinated release baseline from `0.2.0` to `0.2.1` across core, npm, PyPI, and Docker channels.

## [0.2.0] - 2026-02-28

### Changed

1. Aligned SDK release to the unified `0.2.0` baseline across core, npm, PyPI, and Docker channels.
2. No API surface break in this release; this is a coordinated version alignment release.

## [0.1.5] - 2026-02-23

### Added

1. Added `find(...)` for deterministic object lookup (`POST /v1/memory/find`) including URI-based addressing filters.
2. Added session/event APIs:
   - `createSession(...)` -> `POST /v1/memory/sessions`
   - `writeEvent(...)` -> `POST /v1/memory/events`
   - `listSessionEvents(...)` -> `GET /v1/memory/sessions/:session_id/events`
3. Added pack APIs:
   - `packExport(...)` -> `POST /v1/memory/packs/export`
   - `packImport(...)` -> `POST /v1/memory/packs/import`
4. Added typed request/response surfaces for `find`, `sessions/events`, and `packs`.

## [0.1.4] - 2026-02-19

### Changed

1. `toolsSelect` input adds optional `run_id` and response adds typed `decision` payload.
2. `toolsFeedback` input adds optional `decision_id` and response adds `decision_id`, `decision_link_mode`, `decision_policy_sha256`.
3. Aligns SDK surface with execution provenance APIs and feedback-decision linkage.

## [0.1.3] - 2026-02-18

### Changed

1. Aligned release version with production Docker rollout (`v0.1.3`) for consistent cross-channel distribution.
2. No SDK API surface break; release includes packaging and distribution hardening updates from core platform integration.

## [0.1.0] - 2026-02-16

### Added

1. Initial TypeScript SDK release (`AionisClient`).
2. Methods: `write`, `recall`, `recallText`, `rulesEvaluate`, `toolsSelect`, `toolsFeedback`.
3. Typed response wrapper (`AionisResponse<T>`).
4. Typed errors (`AionisApiError`, `AionisNetworkError`).
5. Built-in retry/backoff for `429` and `5xx`.
6. Automatic `x-request-id` generation and propagation.
