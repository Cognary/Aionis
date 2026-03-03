---
title: "Sandbox API (Experimental)"
---

# Sandbox API (Experimental)

Aionis Sandbox provides a controlled execution surface that can be linked to policy-loop provenance (`planner_run_id`, `decision_id`).

Current status: experimental, disabled by default.

## Enablement

Required environment toggles:

1. `SANDBOX_ENABLED=true`
2. `SANDBOX_EXECUTOR_MODE=mock|local_process`
3. `SANDBOX_ALLOWED_COMMANDS_JSON=["echo","python3", ...]`

Recommended for production:

1. Keep `SANDBOX_ADMIN_ONLY=true`.
2. Prefer a dedicated executor plane (container/VM isolation) before broad external exposure.
3. Keep command allowlists minimal and explicit.

## Endpoint Map

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/cancel`

## Minimal Flow

1. Create sandbox session.
2. Submit one execution request (`mode=sync` or `mode=async`).
3. Read run status.
4. Read run logs.
5. Cancel if needed (queued/running only).

## Request Notes

Execution payload shape:

```json
{
  "session_id": "<uuid>",
  "mode": "sync",
  "action": {
    "kind": "command",
    "argv": ["echo", "hello"]
  },
  "planner_run_id": "run_xxx",
  "decision_id": "<uuid>"
}
```

Constraints:

1. `action.kind` currently supports `command` only.
2. `argv[0]` must be in `SANDBOX_ALLOWED_COMMANDS_JSON` when using `local_process`.
3. `timeout_ms` is bounded server-side.

## Security Boundaries

1. This API does not replace host/container isolation strategy.
2. `local_process` mode is intended for controlled environments and staging validation.
3. Keep credentials out of `argv` and persist only required metadata.

## Related

1. [Planner Context](/public/en/reference/02-planner-context)
2. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
3. [API Reference](/public/en/api-reference/00-api-reference)
