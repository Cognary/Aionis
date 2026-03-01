# Changelog

All notable changes to `aionis-sdk` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer.

## [0.2.1] - 2026-03-01

### Changed

1. Added and stabilized admin/control API coverage in the Python SDK (`control_*` surfaces) to match current API contract and ops-panel workflows.
2. Advanced coordinated release baseline from `0.2.0` to `0.2.1` across core, npm, PyPI, and Docker channels.

## [0.2.0] - 2026-02-28

### Changed

1. Aligned SDK release to the unified `0.2.0` baseline across core, npm, PyPI, and Docker channels.
2. No API surface break in this release; this is a coordinated version alignment release.

## [0.1.5] - 2026-02-23

### Added

1. Added `find(...)` for deterministic object lookup (`POST /v1/memory/find`) including URI-based addressing filters.
2. Added session/event APIs:
   - `create_session(...)` -> `POST /v1/memory/sessions`
   - `write_event(...)` -> `POST /v1/memory/events`
   - `list_session_events(...)` -> `GET /v1/memory/sessions/:session_id/events`
3. Added pack APIs:
   - `pack_export(...)` -> `POST /v1/memory/packs/export`
   - `pack_import(...)` -> `POST /v1/memory/packs/import`
4. Added exported `TypedDict` surfaces:
   - `MemoryFindInput`
   - `MemorySessionCreateInput`, `MemoryEventWriteInput`, `MemorySessionEventsListInput`
   - `MemoryPackExportInput`, `MemoryPackImportInput`, `MemoryPackV1`

## [0.1.4] - 2026-02-19

### Changed

1. Added exported `TypedDict` request/response types in `aionis_sdk.types` for API parity with TypeScript SDK.
2. Added `tools_select` request support for `run_id` and response support for `decision` payload typing.
3. Added `tools_feedback` request support for `decision_id` and response support for `decision_link_mode` / `decision_policy_sha256` typing.
4. `AionisClient` method signatures now accept typed payloads (`MemoryWriteInput`, `MemoryRecallInput`, `ToolsSelectInput`, `ToolsFeedbackInput`).

## [0.1.3] - 2026-02-18

### Changed

1. Aligned release version with production Docker rollout (`v0.1.3`) for consistent cross-channel distribution.
2. No SDK API surface break; release includes packaging and distribution hardening updates from core platform integration.

## [0.1.0] - 2026-02-17

### Added

1. Initial Python SDK release (`AionisClient`).
2. Methods: `write`, `recall`, `recall_text`, `rules_evaluate`, `tools_select`, `tools_feedback`.
3. Typed errors (`AionisApiError`, `AionisNetworkError`).
4. Built-in retry/backoff for `429` and `5xx`.
5. Automatic `x-request-id` generation and propagation.
