# Changelog

All notable changes to `@aionis/sdk` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer.

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
