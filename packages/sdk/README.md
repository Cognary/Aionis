# @aionis/sdk

TypeScript SDK for Aionis Memory Graph API.

## Install

```bash
npm i @aionis/sdk@0.2.20
```

The package also exposes the local developer CLI:

```bash
npx @aionis/sdk@0.2.20 --help
```

If you do not have a local Aionis repository, `aionis dev` can now bootstrap Lite by:

1. checking the local runtime cache
2. trying a versioned runtime bundle
3. falling back to a GitHub source archive bootstrap path

## Usage

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: "http://localhost:3001",
  timeout_ms: 10000,
  retry: { max_retries: 2 },
  api_key: process.env.API_KEY,          // optional: X-Api-Key
  auth_bearer: process.env.AUTH_BEARER,  // optional: Authorization: Bearer <token>
  admin_token: process.env.ADMIN_TOKEN,  // optional: X-Admin-Token (debug/admin routes)
});

const out = await client.write({
  scope: "default",
  input_text: "sdk write",
  auto_embed: false,
  nodes: [{ client_id: "sdk_evt_1", type: "event", text_summary: "hello sdk" }],
  edges: [],
});

console.log(out.status, out.request_id, out.data.commit_id);
```

## Auth Options

1. `api_key`: sends `X-Api-Key`.
2. `auth_bearer`: sends `Authorization: Bearer <token>`.
3. `admin_token`: sends `X-Admin-Token` (mainly for debug/admin flows).

If you set custom headers manually, the SDK will not override existing auth headers.

## Covered methods

1. `write`
2. `recall`
3. `recallText`
4. `contextAssemble`
5. `planningContext`
6. `find`
7. `listSessions`
8. `createSession`
9. `writeEvent`
10. `listSessionEvents`
11. `packExport`
12. `packImport`
13. `archiveRehydrate`
14. `nodesActivate`
15. `handoffStore`
16. `handoffRecover`
17. `sandboxCreateSession`
18. `sandboxExecute`
18. `sandboxRunGet`
19. `sandboxRunLogs`
20. `sandboxRunArtifact`
21. `sandboxRunCancel`
22. `rulesEvaluate`
23. `rulesState`
24. `toolsSelect`
25. `toolsDecision`
26. `toolsRun`
27. `toolsFeedback`
28. `feedback`
29. `replayRunStart`
30. `replayStepBefore`
31. `replayStepAfter`
32. `replayRunEnd`
33. `replayRunGet`
34. `replayPlaybookCompileFromRun`
35. `replayPlaybookGet`
36. `replayPlaybookCandidate`
37. `replayPlaybookPromote`
38. `replayPlaybookRepair`
39. `replayPlaybookRepairReview`
40. `replayPlaybookRun`
41. `replayPlaybookDispatch`
42. `automationCreate`
43. `automationGet`
44. `automationList`
45. `automationTelemetry`
46. `automationAssignReviewer`
47. `automationPromote`
48. `automationValidate`
49. `automationGraphValidate`
50. `automationShadowReport`
51. `automationShadowReview`
52. `automationShadowValidate`
53. `automationShadowValidateDispatch`
54. `automationCompensationPolicyMatrix`
55. `automationRun`
56. `automationRunGet`
57. `automationRunList`
58. `automationRunAssignReviewer`
59. `automationRunCancel`
60. `automationRunApproveRepair`
61. `automationRunCompensationRetry`
62. `automationRunCompensationAssign`
63. `automationRunCompensationRecordAction`
64. `automationRunResume`
65. `automationRunRejectRepair`
66. `health`
67. `getCapabilityContract`

## CLI Commands

The bundled Phase 1 developer CLI supports:

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

Useful `aionis dev` flags:

1. `--runtime-root /path/to/Aionis`
2. `--runtime-version 0.2.20`
3. `--runtime-cache-dir ~/.aionis/runtime`
4. `--force-download`
5. `--offline`

Admin/control methods (require `admin_token`):

1. `controlUpsertTenant`, `controlListTenants`, `controlUpsertProject`
2. `controlCreateApiKey`, `controlListApiKeys`, `controlListStaleApiKeys`, `controlRevokeApiKey`, `controlRotateApiKey`
3. `controlCreateAlertRoute`, `controlListAlertRoutes`, `controlUpdateAlertRouteStatus`, `controlListAlertDeliveries`
4. `controlEnqueueIncidentPublishJob`, `controlListIncidentPublishJobs`, `controlReplayIncidentPublishJobs`
5. `controlUpsertTenantQuota`, `controlGetTenantQuota`, `controlDeleteTenantQuota`
6. `controlUpsertSandboxBudget`, `controlGetSandboxBudget`, `controlDeleteSandboxBudget`, `controlListSandboxBudgets`
7. `controlListAuditEvents`, `controlGetTenantDashboard`, `controlGetTenantDiagnostics`
8. `controlGetTenantIncidentPublishRollup`, `controlGetTenantIncidentPublishSlo`, `controlGetTenantTimeseries`, `controlGetTenantKeyUsage`

## Error model

1. `AionisApiError`: API returned non-2xx response.
2. `AionisNetworkError`: request timeout/network failure.

Capability-aware helpers:

1. `isBackendCapabilityUnsupportedError(err)`
2. `parseBackendCapabilityErrorDetails(err.details)`
3. `isShadowDualWriteStrictFailureError(err)`
4. `parseShadowDualWriteStrictFailureDetails(err.details)`

Example:

```ts
import { AionisApiError, isBackendCapabilityUnsupportedError } from "@aionis/sdk";

try {
  await client.packExport({ scope: "default" });
} catch (err) {
  if (isBackendCapabilityUnsupportedError(err)) {
    // err.details now carries capability contract fields
    console.log(err.details.capability, err.details.failure_mode, err.details.degraded_mode);
  } else if (err instanceof AionisApiError) {
    console.error(err.code, err.message);
  }
}
```

## Smoke

```bash
set -a; source .env; set +a
npm run sdk:smoke
```

## Build (repo local)

```bash
npm run sdk:build
npm run sdk:pack-dry-run
npm run sdk:release-check
```
