# Changelog

All notable changes to `aionis-sdk` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer.

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
