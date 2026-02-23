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
12. `toolsFeedback`

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
