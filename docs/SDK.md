---
title: "Aionis SDK (TypeScript + Python)"
---

# Aionis SDK (TypeScript + Python)

当前提供两个 SDK：

1. TypeScript: `packages/sdk`（`@aionis/sdk`）
2. Python: `packages/python-sdk`（`aionis-sdk`）

目标是替代直接手写 `curl` JSON，并保持同一错误语义与接口形态。

## 1. Capability

当前已覆盖核心方法：

1. `write`
2. `recall`
3. `recallText`
4. `find`
5. `createSession`
6. `writeEvent`
7. `listSessionEvents`
8. `packExport`
9. `packImport`
10. `rulesEvaluate`
11. `toolsSelect`
12. `toolsDecision`
13. `toolsFeedback`
14. `health`
15. `getCapabilityContract` / `get_capability_contract`

admin/control 方法（需 `admin_token`）：

1. tenant/project: `controlUpsertTenant`, `controlListTenants`, `controlUpsertProject`
2. api keys: `controlCreateApiKey`, `controlListApiKeys`, `controlListStaleApiKeys`, `controlRevokeApiKey`, `controlRotateApiKey`
3. alerts: `controlCreateAlertRoute`, `controlListAlertRoutes`, `controlUpdateAlertRouteStatus`, `controlListAlertDeliveries`
4. incident publish: `controlEnqueueIncidentPublishJob`, `controlListIncidentPublishJobs`, `controlReplayIncidentPublishJobs`
5. tenant quota: `controlUpsertTenantQuota`, `controlGetTenantQuota`, `controlDeleteTenantQuota`
6. observability: `controlListAuditEvents`, `controlGetTenantDashboard`, `controlGetTenantDiagnostics`
7. dashboard deep views: `controlGetTenantIncidentPublishRollup`, `controlGetTenantIncidentPublishSlo`, `controlGetTenantTimeseries`, `controlGetTenantKeyUsage`

并内置：

1. 统一错误模型（`AionisApiError` / `AionisNetworkError`）
2. 429/5xx 退避重试（可配置）
3. `x-request-id` 自动生成与透传

## 2. TypeScript Import

```ts
import { AionisClient, AionisApiError } from "@aionis/sdk";
```

## 3. TypeScript Quick Usage

```ts
const client = new AionisClient({
  base_url: "http://localhost:3001",
  timeout_ms: 10000,
  retry: { max_retries: 2 },
  api_key: process.env.API_KEY,          // optional
  auth_bearer: process.env.AUTH_BEARER,  // optional
});

const write = await client.write({
  tenant_id: "default",
  scope: "default",
  input_text: "sdk write",
  auto_embed: false,
  nodes: [{ client_id: "sdk_evt_1", type: "event", text_summary: "hello sdk" }],
  edges: [],
});

console.log(write.request_id, write.data.commit_id);
```

## 4. Python Quick Usage

```python
import os
from aionis_sdk import AionisApiError, AionisClient

client = AionisClient(
    base_url="http://localhost:3001",
    timeout_s=10.0,
    api_key=os.getenv("API_KEY"),           # optional
    auth_bearer=os.getenv("AUTH_BEARER"),   # optional
)
out = client.write({
    "scope": "default",
    "input_text": "python sdk write",
    "auto_embed": False,
    "nodes": [{"client_id": "py_evt_1", "type": "event", "text_summary": "hello python sdk"}],
    "edges": [],
})
print(out["status"], out["request_id"], out["data"]["commit_id"])
```

## 5. Error Semantics

API 4xx/5xx 会抛出 `AionisApiError`：

```ts
try {
  await client.recallText({ tenant_id: "default", scope: "default", query_text: "x", limit: 20 });
} catch (err) {
  if (err instanceof AionisApiError) {
    console.error(err.status, err.code, err.message, err.request_id, err.details);
  }
}
```

网络与超时会抛出 `AionisNetworkError`。

### 5.1 Backend capability negotiation

当后端返回 `backend_capability_unsupported`（HTTP 501）时，可用 SDK helper 判断并读取标准化字段（`capability`, `failure_mode`, `degraded_mode`, `fallback_applied`）：

TypeScript:

```ts
import { isBackendCapabilityUnsupportedError } from "@aionis/sdk";
```

Python:

```python
from aionis_sdk import is_backend_capability_unsupported_error
```

也可以通过 `health()` 或 `getCapabilityContract()`/`get_capability_contract()` 主动读取 `/health.memory_store_capability_contract` 做客户端行为协商。

对于严格模式 shadow dual-write 失败（`error="shadow_dual_write_strict_failure"`），SDK 也提供专用 helper：

- TypeScript: `isShadowDualWriteStrictFailureError`
- Python: `is_shadow_dual_write_strict_failure_error`

TypeScript example:

```ts
import { AionisApiError, isShadowDualWriteStrictFailureError } from "@aionis/sdk";

try {
  await client.write({
    scope: "default",
    input_text: "strict mirror write",
    auto_embed: false,
    nodes: [{ client_id: "strict_evt_1", type: "event", text_summary: "strict probe" }],
    edges: [],
  });
} catch (err) {
  if (isShadowDualWriteStrictFailureError(err)) {
    console.error("strict mirror failure", err.details.degraded_mode, err.details.failure_mode, err.details.error);
  } else if (err instanceof AionisApiError) {
    console.error("api error", err.code, err.message);
  } else {
    throw err;
  }
}
```

Python example:

```python
from aionis_sdk import (
    AionisApiError,
    is_shadow_dual_write_strict_failure_error,
)

try:
    client.write(
        {
            "scope": "default",
            "input_text": "strict mirror write",
            "auto_embed": False,
            "nodes": [{"client_id": "strict_evt_1", "type": "event", "text_summary": "strict probe"}],
            "edges": [],
        }
    )
except Exception as err:
    if is_shadow_dual_write_strict_failure_error(err):
        print("strict mirror failure", err.details.get("degraded_mode"), err.details.get("failure_mode"), err.details.get("error"))
    elif isinstance(err, AionisApiError):
        print("api error", err.code, str(err))
    else:
        raise
```

## 6. Tenant-aware Calls

- 所有 SDK 输入类型都支持 `tenant_id?: string`。
- 若上游网关已注入 `X-Tenant-Id`，请求体可不传 `tenant_id`。

## 6.1 Auth Header Strategy

1. `api_key` -> 自动注入 `X-Api-Key`
2. `auth_bearer` -> 自动注入 `Authorization: Bearer <jwt>`
3. `admin_token` 仍可用于 debug/admin 场景（`X-Admin-Token`）

## 7. Smoke Commands

```bash
npm run sdk:smoke
npm run sdk:tools-feedback-smoke
npm run sdk:py:smoke
```

这两个脚本分别覆盖：

1. `write + rulesEvaluate + toolsSelect (+ recallText 可选)`
2. `toolsSelect + toolsFeedback`

## 8. Build + Release Checks

```bash
npm run sdk:build
npm run sdk:pack-dry-run
npm run sdk:release-check
npm run sdk:py:compile
npm run sdk:py:release-check
```

Package files:

1. `packages/sdk/package.json`
2. `packages/sdk/README.md`
3. `packages/sdk/CHANGELOG.md`
4. `packages/python-sdk/pyproject.toml`
5. `packages/python-sdk/README.md`
6. `packages/python-sdk/CHANGELOG.md`

Compatibility matrix:

- `docs/SDK_COMPATIBILITY_MATRIX.md`
- `docs/SDK_RELEASE.md`
