# Changelog

All notable changes to `@aionis/sdk` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer.

## [0.1.0] - 2026-02-16

### Added

1. Initial TypeScript SDK release (`AionisClient`).
2. Methods: `write`, `recall`, `recallText`, `rulesEvaluate`, `toolsSelect`, `toolsFeedback`.
3. Typed response wrapper (`AionisResponse<T>`).
4. Typed errors (`AionisApiError`, `AionisNetworkError`).
5. Built-in retry/backoff for `429` and `5xx`.
6. Automatic `x-request-id` generation and propagation.
