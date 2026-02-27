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

## Typed payloads

`0.1.5+` exports `TypedDict` API payloads from `aionis_sdk.types`:

```python
from aionis_sdk import AionisClient
from aionis_sdk.types import ToolsFeedbackInput, ToolsSelectInput

client = AionisClient(base_url="http://localhost:3001")

select_payload: ToolsSelectInput = {
    "scope": "default",
    "run_id": "run_001",
    "context": {"intent": "json", "provider": "minimax", "tool": {"name": "curl"}},
    "candidates": ["curl", "bash"],
    "strict": True,
}
select_out = client.tools_select(select_payload)
decision_id = (select_out.get("data") or {}).get("decision", {}).get("decision_id")

feedback_payload: ToolsFeedbackInput = {
    "scope": "default",
    "run_id": "run_001",
    "decision_id": decision_id,
    "outcome": "positive",
    "context": {"intent": "json", "provider": "minimax", "tool": {"name": "curl"}},
    "candidates": ["curl", "bash"],
    "selected_tool": "curl",
}
client.tools_feedback(feedback_payload)
```

## Auth Options

1. `api_key`: sends `X-Api-Key`.
2. `auth_bearer`: sends `Authorization: Bearer <token>`.
3. `admin_token`: sends `X-Admin-Token` (debug/admin flows).

## Covered methods

1. `write`
2. `recall`
3. `recall_text`
4. `find`
5. `create_session`
6. `write_event`
7. `list_session_events`
8. `pack_export`
9. `pack_import`
10. `rules_evaluate`
11. `tools_select`
12. `tools_feedback`
13. `health`
14. `get_capability_contract`

## Error model

1. `AionisApiError`: API returned non-2xx response.
2. `AionisNetworkError`: request timeout/network failure.

Capability-aware helpers:

1. `is_backend_capability_unsupported_error(err)`
2. `parse_backend_capability_error_details(err.details)`
3. `is_shadow_dual_write_strict_failure_error(err)`
4. `parse_shadow_dual_write_strict_failure_details(err.details)`

```python
from aionis_sdk import AionisApiError, is_backend_capability_unsupported_error

try:
    client.pack_export({"scope": "default"})
except Exception as err:
    if is_backend_capability_unsupported_error(err):
        print(err.details.get("capability"), err.details.get("failure_mode"))
    elif isinstance(err, AionisApiError):
        print(err.code, str(err))
```

## Smoke

```bash
set -a; source .env; set +a
npm run sdk:py:smoke
```

## Build check (repo local)

```bash
npm run sdk:py:compile
npm run sdk:py:release-check
```
