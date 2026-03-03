---
title: "SDK Compatibility Matrix"
---

# SDK Compatibility Matrix

Last updated: `2026-03-02`

## Versioning policy

1. SDK uses SemVer (`MAJOR.MINOR.PATCH`).
2. API contract-breaking change requires:
   - API major bump or compatibility shim.
   - SDK major bump.
3. New optional fields/endpoints:
   - API minor bump.
   - SDK minor bump when types/methods are added.
4. Implementation fixes without API/type surface change:
   - SDK patch bump.

## Matrix

| SDK | SDK version | API contract baseline | Core methods | Error model | Retry + request_id | Status |
|---|---|---|---|---|---|---|
| `@aionis/sdk` (TypeScript) | `0.2.3` (`0.2.x`) | `/public/en/api/01-api-contract` (2026-03-02) | `write/recall/recallText/contextAssemble/find/createSession/writeEvent/listSessionEvents/packExport/packImport/rulesEvaluate/toolsSelect/toolsDecision/toolsFeedback + control* admin APIs` | `AionisApiError` + `AionisNetworkError` | yes | current |
| `aionis-sdk` (Python) | `0.2.3` (`0.2.x`) | `/public/en/api/01-api-contract` (2026-03-02) | `write/recall/recall_text/context_assemble/find/create_session/write_event/list_session_events/pack_export/pack_import/rules_evaluate/tools_select/tools_decision/tools_feedback + control_* admin APIs` | `AionisApiError` + `AionisNetworkError` | yes | current |

## Backward compatibility notes

1. `0.2.x` expects the server to return structured error payload with `error/message/details` (and optional `issues`).
2. `0.2.x` assumes request correlation header `x-request-id` is returned by API.
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
   - `packages/sdk/CHANGELOG.md`
   - `packages/python-sdk/CHANGELOG.md`
   - `docs/public/en/reference/06-sdk-compatibility-matrix.md`
