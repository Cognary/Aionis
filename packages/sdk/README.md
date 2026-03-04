# @aionis/sdk

TypeScript SDK for Aionis Memory Graph API.

## Install

```bash
npm i @aionis/sdk
```

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
7. `createSession`
8. `writeEvent`
9. `listSessionEvents`
10. `packExport`
11. `packImport`
12. `archiveRehydrate`
13. `nodesActivate`
14. `sandboxCreateSession`
15. `sandboxExecute`
16. `sandboxRunGet`
17. `sandboxRunLogs`
18. `sandboxRunArtifact`
19. `sandboxRunCancel`
20. `rulesEvaluate`
21. `rulesState`
22. `toolsSelect`
23. `toolsDecision`
24. `toolsRun`
25. `toolsFeedback`
26. `feedback`
27. `replayRunStart`
28. `replayStepBefore`
29. `replayStepAfter`
30. `replayRunEnd`
31. `replayRunGet`
32. `replayPlaybookCompileFromRun`
33. `replayPlaybookGet`
34. `replayPlaybookPromote`
35. `replayPlaybookRepair`
36. `replayPlaybookRepairReview`
37. `replayPlaybookRun`
38. `health`
39. `getCapabilityContract`

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
