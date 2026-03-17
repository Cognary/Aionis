# aionis-sdk

Python SDK for Aionis Memory Graph API.

## Install

```bash
pip install aionis-sdk==0.2.20
```

## Local Lite Runtime

The Python SDK is a client package.

For local development, use the official Aionis CLI from the TypeScript package to start Lite:

```bash
npx @aionis/sdk@0.2.20 dev
```

Then point the Python client at the local base URL:

```python
from aionis_sdk import AionisClient

client = AionisClient(base_url="http://127.0.0.1:3321")
```

This is the recommended path for:

1. Python SDK evaluation
2. local write/recall/handoff/replay testing
3. single-machine developer setup without a separate local Aionis repo

## Usage

```python
import os
from aionis_sdk import AionisClient

client = AionisClient(
    base_url="http://127.0.0.1:3321",
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

For a complete Python + CLI first-run flow, see:

1. [Python SDK + Aionis CLI](https://doc.aionisos.com/public/en/getting-started/08-python-sdk-with-cli)

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
client.tools_run({"scope": "default", "run_id": "run_001"})
```

## Auth Options

1. `api_key`: sends `X-Api-Key`.
2. `auth_bearer`: sends `Authorization: Bearer <token>`.
3. `admin_token`: sends `X-Admin-Token` (debug/admin flows).

## Covered methods

1. `write`
2. `recall`
3. `recall_text`
4. `context_assemble`
5. `planning_context`
6. `find`
7. `list_sessions`
8. `create_session`
9. `write_event`
10. `list_session_events`
11. `pack_export`
12. `pack_import`
13. `archive_rehydrate`
14. `nodes_activate`
15. `handoff_store`
16. `handoff_recover`
17. `sandbox_create_session`
18. `sandbox_execute`
18. `sandbox_run_get`
19. `sandbox_run_logs`
20. `sandbox_run_artifact`
21. `sandbox_run_cancel`
22. `rules_evaluate`
23. `rules_state`
24. `tools_select`
25. `tools_decision`
26. `tools_run`
27. `tools_feedback`
28. `feedback`
29. `replay_run_start`
30. `replay_step_before`
31. `replay_step_after`
32. `replay_run_end`
33. `replay_run_get`
34. `replay_playbook_compile_from_run`
35. `replay_playbook_get`
36. `replay_playbook_candidate`
37. `replay_playbook_promote`
38. `replay_playbook_repair`
39. `replay_playbook_repair_review`
40. `replay_playbook_run`
41. `replay_playbook_dispatch`
42. `automation_create`
43. `automation_get`
44. `automation_list`
45. `automation_telemetry`
46. `automation_assign_reviewer`
47. `automation_promote`
48. `automation_validate`
49. `automation_graph_validate`
50. `automation_shadow_report`
51. `automation_shadow_review`
52. `automation_shadow_validate`
53. `automation_shadow_validate_dispatch`
54. `automation_compensation_policy_matrix`
55. `automation_run`
56. `automation_run_get`
57. `automation_run_list`
58. `automation_run_assign_reviewer`
59. `automation_run_cancel`
60. `automation_run_approve_repair`
61. `automation_run_compensation_retry`
62. `automation_run_compensation_assign`
63. `automation_run_compensation_record_action`
64. `automation_run_resume`
65. `automation_run_reject_repair`
66. `health`
67. `get_capability_contract`

Admin/control methods (require `admin_token`):

1. `control_upsert_tenant`, `control_list_tenants`, `control_upsert_project`
2. `control_create_api_key`, `control_list_api_keys`, `control_list_stale_api_keys`, `control_revoke_api_key`, `control_rotate_api_key`
3. `control_create_alert_route`, `control_list_alert_routes`, `control_update_alert_route_status`, `control_list_alert_deliveries`
4. `control_enqueue_incident_publish_job`, `control_list_incident_publish_jobs`, `control_replay_incident_publish_jobs`
5. `control_upsert_tenant_quota`, `control_get_tenant_quota`, `control_delete_tenant_quota`
6. `control_upsert_sandbox_budget`, `control_get_sandbox_budget`, `control_delete_sandbox_budget`, `control_list_sandbox_budgets`
7. `control_list_audit_events`, `control_get_tenant_dashboard`, `control_get_tenant_diagnostics`
8. `control_get_tenant_incident_publish_rollup`, `control_get_tenant_incident_publish_slo`, `control_get_tenant_timeseries`, `control_get_tenant_key_usage`

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
