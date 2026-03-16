---
title: "Sandbox API (Experimental)"
---

# Sandbox API (Experimental)

Aionis Sandbox provides a controlled execution surface that can be linked to policy-loop provenance (`planner_run_id`, `decision_id`).

Current status: experimental, disabled by default.

## Enablement

Required environment toggles:

1. `SANDBOX_ENABLED=true`
2. `SANDBOX_EXECUTOR_MODE=mock|local_process|http_remote`
3. `SANDBOX_ALLOWED_COMMANDS_JSON='["echo","python3", ...]'`

Remote executor (when `SANDBOX_EXECUTOR_MODE=http_remote`):

1. `SANDBOX_REMOTE_EXECUTOR_URL`
2. `SANDBOX_REMOTE_EXECUTOR_AUTH_HEADER`
3. `SANDBOX_REMOTE_EXECUTOR_AUTH_TOKEN`
4. `SANDBOX_REMOTE_EXECUTOR_TIMEOUT_MS`
5. `SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON` (host allowlist)
6. `SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON` (resolved IP CIDR allowlist)
7. `SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS` (default `true`)
8. optional mTLS: `SANDBOX_REMOTE_EXECUTOR_MTLS_CERT_PEM`, `SANDBOX_REMOTE_EXECUTOR_MTLS_KEY_PEM`, `SANDBOX_REMOTE_EXECUTOR_MTLS_CA_PEM`, `SANDBOX_REMOTE_EXECUTOR_MTLS_SERVER_NAME`

Optional traffic shaping:

1. `SANDBOX_WRITE_RATE_LIMIT_RPS` / `SANDBOX_WRITE_RATE_LIMIT_BURST`
2. `SANDBOX_READ_RATE_LIMIT_RPS` / `SANDBOX_READ_RATE_LIMIT_BURST`

Recommended for production:

1. Keep `SANDBOX_ADMIN_ONLY=true`.
2. Prefer a dedicated executor plane (container/VM isolation) before broad external exposure.
3. Keep command allowlists minimal and explicit.

## Endpoint Map

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/artifact`
6. `POST /v1/memory/sandbox/runs/cancel`

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
2. `argv[0]` must be in `SANDBOX_ALLOWED_COMMANDS_JSON` when using `local_process` or `http_remote`.
3. `timeout_ms` is bounded server-side.
4. `http_remote` mode supports host allowlists via `SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON`.
5. `http_remote` mode resolves DNS and enforces egress controls (`SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON`, `SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS`).
6. `sandbox/execute` supports optional `project_id` for project-level budget policy matching.
7. executor heartbeat + stale recovery is controlled by:
   `SANDBOX_RUN_HEARTBEAT_INTERVAL_MS`, `SANDBOX_RUN_STALE_AFTER_MS`, `SANDBOX_RUN_RECOVERY_POLL_INTERVAL_MS`.

Artifact contract:

1. `POST /v1/memory/sandbox/runs/artifact` returns `artifact_version=sandbox_run_artifact_v2`.
2. Response includes `bundle.manifest_version=sandbox_artifact_bundle_manifest_v1`.
3. `bundle_inline=false` returns manifest/hash/uri metadata without inline payload bodies.
4. Optional object-store pointer base: `SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI`.
5. `sandbox/execute`, `sandbox/runs/get`, `sandbox/runs/logs`, and `sandbox/runs/artifact` return a bounded `result_summary` so callers can inspect a compact tool-output summary before reading raw `stdout` / `stderr` / `result`.
6. Artifact bundles now include `summary.json` alongside raw output/result objects.

## Budget and Retention

Optional tenant budget gates for `sandbox/execute`:

1. `SANDBOX_TENANT_BUDGET_WINDOW_HOURS`
2. `SANDBOX_TENANT_BUDGET_POLICY_JSON` (for example `{"*":{"daily_run_cap":1000,"daily_timeout_cap":100}}`)
3. Runtime profiles can also be managed via admin API:
   - `PUT /v1/admin/control/sandbox-budgets/:tenant_id`
   - `GET /v1/admin/control/sandbox-budgets/:tenant_id?scope=*`
   - `GET /v1/admin/control/sandbox-budgets`
   - `DELETE /v1/admin/control/sandbox-budgets/:tenant_id?scope=*`
   - list endpoints return `400 invalid_request` when `limit` or `offset` is not a finite number
4. Project-level overrides (higher priority than tenant-level profile):
   - `PUT /v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id`
   - `GET /v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id?scope=*`
   - `GET /v1/admin/control/sandbox-project-budgets`
   - `DELETE /v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id?scope=*`
   - list endpoints return `400 invalid_request` when `limit` or `offset` is not a finite number

Retention cleanup job:

1. `npm run job:sandbox-retention` (dry run)
2. `npm run job:sandbox-retention -- --apply --retention-days 30`

## Security Boundaries

1. This API does not replace host/container isolation strategy.
2. `local_process` mode is intended for controlled environments and staging validation.
3. Keep credentials out of `argv` and persist only required metadata.

## Operability Signals

Sandbox runs are aggregated into tenant diagnostics (`GET /v1/admin/control/diagnostics/tenant/:tenant_id`) under `diagnostics.sandbox`.

Current rollup fields include:

1. throughput and status distribution (`total`, `by_status`, `by_mode`)
2. latency distribution (`queue_wait_p50/p95`, `runtime_p50/p95`, `total_latency_p95`)
3. stability indicators (`timeout_rate`, `cancel_rate`, `output_truncated_rate`)
4. top error categories (`top_errors`)

## Stress Validation (Quick Command)

Run a queue/timeout smoke benchmark against your environment:

```bash
npm run -s bench:sandbox:stress
```

Tune with env vars when needed:

1. `SANDBOX_STRESS_RUNS`
2. `SANDBOX_STRESS_CONCURRENCY`
3. `SANDBOX_STRESS_POLL_INTERVAL_MS`
4. `SANDBOX_STRESS_POLL_TIMEOUT_MS`

## Related

1. [Planner Context](/public/en/reference/02-planner-context)
2. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
3. [API Reference](/public/en/api-reference/00-api-reference)
