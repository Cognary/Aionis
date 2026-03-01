# Changelog

All notable changes to `@aionis/sdk` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer.

## [0.2.2] - 2026-03-02

### Changed

1. Aligned coordinated release baseline from `0.2.1` to `0.2.2` across core, npm, PyPI, and Docker channels.
2. No SDK API surface break in this release; this is a synchronized release-line update.

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
