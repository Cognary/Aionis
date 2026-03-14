---
title: "SDK Compatibility Matrix"
---

# SDK Compatibility Matrix

Last updated: `2026-03-14`

## Versioning Policy

1. SDK versions follow SemVer.
2. Contract-breaking API changes require major-version alignment.
3. New optional API fields or methods use minor-version updates.
4. Implementation-only fixes use patch updates.

## Matrix

| SDK | Current line | API contract baseline | Coverage | Error model | Status |
| --- | --- | --- | --- | --- | --- |
| `@aionis/sdk` (TypeScript) | `0.2.x` | `/public/en/api/01-api-contract` | memory, context, handoff, policy loop, replay, sandbox, automations, Phase 1 CLI | typed API/network errors | current |
| `aionis-sdk` (Python) | `0.2.x` | `/public/en/api/01-api-contract` | memory, context, handoff, policy loop, replay, sandbox, automations | typed API/network errors | current |

## Compatibility Notes

1. SDK `0.2.x` expects structured API errors: `error/message/details`.
2. SDK `0.2.x` expects request correlation header `x-request-id`.
3. `recall_text` may return `no_embedding_provider` when embeddings are disabled.
4. On `2026-03-14`, Aionis ran a route-to-SDK audit over `65` non-admin, non-control-plane routes and found `no missing` surface in either SDK.
5. The TypeScript package additionally exposes the local Lite developer CLI: `aionis dev`, `stop`, `health`, `doctor`, and `selfcheck`.

## Release Alignment Checklist

1. Build and package checks pass for both SDKs.
2. SDK smoke tests pass against current server baseline.
3. Changelogs are updated before publish.
4. This matrix is updated with the release line.

## Related

1. [SDK Guide](/public/en/reference/05-sdk)
2. [API Contract](/public/en/api/01-api-contract)
