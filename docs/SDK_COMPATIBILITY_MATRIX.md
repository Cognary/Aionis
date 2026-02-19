---
title: "SDK Compatibility Matrix"
---

# SDK Compatibility Matrix

Last updated: `2026-02-19`

## Versioning policy

1. SDK uses SemVer (`MAJOR.MINOR.PATCH`).
2. API contract-breaking change requires:
   - API major bump or compatibility shim.
   - SDK major bump.
3. New optional fields/endpoints:
   - API minor bump.
   - SDK minor bump when types/methods are added.
4. Internal fixes without API/type surface change:
   - SDK patch bump.

## Matrix

| SDK | SDK version | API contract baseline | Core methods | Error model | Retry + request_id | Status |
|---|---|---|---|---|---|---|
| `@aionis/sdk` (TypeScript) | `0.1.4` (`0.1.x`) | `/Users/lucio/Desktop/Aionis/docs/API_CONTRACT.md` (2026-02-19) | `write/recall/recallText/rulesEvaluate/toolsSelect/toolsFeedback` | `AionisApiError` + `AionisNetworkError` | yes | current |
| `aionis-sdk` (Python) | `0.1.4` (`0.1.x`) | `/Users/lucio/Desktop/Aionis/docs/API_CONTRACT.md` (2026-02-19) | `write/recall/recall_text/rules_evaluate/tools_select/tools_feedback` | `AionisApiError` + `AionisNetworkError` | yes | current |

## Backward compatibility notes

1. `0.1.x` expects the server to return structured error payload with `error/message/details` (and optional `issues`).
2. `0.1.x` assumes request correlation header `x-request-id` is returned by API.
3. `recall_text` can return `no_embedding_provider` (400); SDK preserves this as `AionisApiError.code`.

## Release checklist

1. `npm run sdk:build`
2. `npm run sdk:pack-dry-run`
3. `npm run sdk:release-check`
4. `npm run sdk:py:compile`
5. `npm run sdk:py:release-check`
6. `npm run sdk:smoke`
7. `npm run sdk:tools-feedback-smoke`
8. `npm run sdk:py:smoke`
9. Update:
   - `/Users/lucio/Desktop/Aionis/packages/sdk/CHANGELOG.md`
   - `/Users/lucio/Desktop/Aionis/packages/python-sdk/CHANGELOG.md`
   - `/Users/lucio/Desktop/Aionis/docs/SDK_COMPATIBILITY_MATRIX.md`
