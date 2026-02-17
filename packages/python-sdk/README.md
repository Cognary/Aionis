# aionis-sdk

Python SDK for Aionis Memory Graph API.

## Install

```bash
pip install aionis-sdk
```

## Usage

```python
import os
from aionis_sdk import AionisClient

client = AionisClient(
    base_url="http://localhost:3001",
    timeout_s=10.0,
    api_key=os.getenv("API_KEY"),           # optional: X-Api-Key
    auth_bearer=os.getenv("AUTH_BEARER"),   # optional: Authorization: Bearer <token>
    admin_token=os.getenv("ADMIN_TOKEN"),   # optional: X-Admin-Token
)

out = client.write(
    {
        "scope": "default",
        "input_text": "python sdk write",
        "auto_embed": False,
        "nodes": [{"client_id": "py_evt_1", "type": "event", "text_summary": "hello python sdk"}],
        "edges": [],
    }
)

print(out["status"], out["request_id"], out["data"]["commit_id"])
```

## Auth Options

1. `api_key`: sends `X-Api-Key`.
2. `auth_bearer`: sends `Authorization: Bearer <token>`.
3. `admin_token`: sends `X-Admin-Token` (debug/admin flows).

## Covered methods

1. `write`
2. `recall`
3. `recall_text`
4. `rules_evaluate`
5. `tools_select`
6. `tools_feedback`

## Error model

1. `AionisApiError`: API returned non-2xx response.
2. `AionisNetworkError`: request timeout/network failure.

## Smoke

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
npm run sdk:py:smoke
```

## Build check (repo local)

```bash
cd /Users/lucio/Desktop/Aionis
npm run sdk:py:compile
npm run sdk:py:release-check
```
