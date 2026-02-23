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
4. `find`
5. `createSession`
6. `writeEvent`
7. `listSessionEvents`
8. `packExport`
9. `packImport`
10. `rulesEvaluate`
11. `toolsSelect`
12. `toolsFeedback`

## Error model

1. `AionisApiError`: API returned non-2xx response.
2. `AionisNetworkError`: request timeout/network failure.

## Smoke

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
npm run sdk:smoke
```

## Build (repo local)

```bash
cd /Users/lucio/Desktop/Aionis
npm run sdk:build
npm run sdk:pack-dry-run
npm run sdk:release-check
```
