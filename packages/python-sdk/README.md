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

`0.2.0+` exports `TypedDict` API payloads from `aionis_sdk.types`:

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
12. `tools_decision`
13. `tools_feedback`
14. `health`
15. `get_capability_contract`

Admin/control methods (require `admin_token`):

1. `control_upsert_tenant`, `control_list_tenants`, `control_upsert_project`
2. `control_create_api_key`, `control_list_api_keys`, `control_list_stale_api_keys`, `control_revoke_api_key`, `control_rotate_api_key`
3. `control_create_alert_route`, `control_list_alert_routes`, `control_update_alert_route_status`, `control_list_alert_deliveries`
4. `control_enqueue_incident_publish_job`, `control_list_incident_publish_jobs`, `control_replay_incident_publish_jobs`
5. `control_upsert_tenant_quota`, `control_get_tenant_quota`, `control_delete_tenant_quota`
6. `control_list_audit_events`, `control_get_tenant_dashboard`, `control_get_tenant_diagnostics`
7. `control_get_tenant_incident_publish_rollup`, `control_get_tenant_incident_publish_slo`, `control_get_tenant_timeseries`, `control_get_tenant_key_usage`

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
