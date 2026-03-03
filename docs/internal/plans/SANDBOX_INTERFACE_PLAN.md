# SANDBOX Interface Plan

## 1. Objective

Build a production-oriented Sandbox interface for Aionis so execution can be:

1. policy-linked (`planner_run_id`, `decision_id`)
2. tenant-scoped (`tenant_id`, `scope`)
3. observable (`status`, logs, result payloads)
4. governable (explicit enablement, command allowlist, cancellation)

This plan defines both product contract and engineering rollout.

## 2. Scope

### In Scope

1. API contract for sandbox sessions, execution, run inspection, logs, cancellation.
2. Persistent run/session model in Postgres.
3. Executor abstraction with initial modes:
   - `mock` (safe default)
   - `local_process` (restricted allowlist; controlled environments only)
4. SDK surfaces (TypeScript + Python).
5. Playground operations for end-to-end validation.
6. Public docs for external integration.

### Out of Scope (future phases)

1. Full container/VM isolation runtime (Firecracker/Kata/gVisor).
2. Multi-host distributed queue/lease orchestration.
3. Artifact filesystem/object-store management.
4. Billing/metering policy for sandbox compute.

## 3. Public API Contract

### Endpoints

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/cancel`

### Core Inputs

1. `tenant_id`
2. `scope`
3. `session_id`
4. `planner_run_id` (optional, policy-loop correlation)
5. `decision_id` (optional, policy-loop correlation)
6. `action.kind=command`, `action.argv[]`

### Core Outputs

1. `run_id`
2. `status` (`queued|running|succeeded|failed|canceled|timeout`)
3. `output.stdout`, `output.stderr`, `output.truncated`
4. `result` (executor metadata)
5. timestamps (`started_at`, `finished_at`, `created_at`)

## 4. Data Model

### Tables

1. `memory_sandbox_sessions`
2. `memory_sandbox_runs`

### Required Fields

1. tenancy keys (`tenant_id`, `scope`)
2. execution linkage (`planner_run_id`, `decision_id`)
3. action payload (`action_kind`, `action_json`)
4. lifecycle state (`status`, `cancel_requested`, `timeout_ms`)
5. execution outputs (`stdout_text`, `stderr_text`, `exit_code`, `result_json`)

## 5. Security Model

### Hard Controls

1. Disabled by default (`SANDBOX_ENABLED=false`).
2. Optional admin gate (`SANDBOX_ADMIN_ONLY=true` default).
3. Explicit command allowlist (`SANDBOX_ALLOWED_COMMANDS_JSON`).
4. Output bounds (`SANDBOX_STDIO_MAX_BYTES`).
5. Timeout bounds (`timeout_ms` capped server-side).

### Current Risk Note

`local_process` is not full isolation. It is suitable for controlled/staging environments, not final multi-tenant hostile workloads.

## 6. Runtime Controls

1. `SANDBOX_EXECUTOR_MODE=mock|local_process`
2. `SANDBOX_EXECUTOR_MAX_CONCURRENCY`
3. `SANDBOX_EXECUTOR_TIMEOUT_MS`
4. `SANDBOX_EXECUTOR_WORKDIR`
5. `SANDBOX_ALLOWED_COMMANDS_JSON`
6. `SANDBOX_LOCAL_PROCESS_ALLOW_IN_PROD`

## 7. Phased Rollout

### Phase 1: Contract + Persistence + MVP Executor

Status: `completed` (2026-03-03)

Delivered:

1. migration `0031_sandbox_interface.sql`
2. API routes + schemas
3. session/run persistence + status model
4. `mock` and restricted `local_process` executors
5. cancel + logs + sync/async path
6. TS/Python SDK surface
7. Playground and docs integration
8. `.env.example` sandbox runtime profile
9. CI template compatibility coverage for sandbox operations

### Phase 2: Operability and Governance Hardening

Status: `completed` (2026-03-03)

Delivered in this batch:

1. sandbox run telemetry table + writer path (`memory_sandbox_run_telemetry`)
2. tenant diagnostics sandbox rollup (`/v1/admin/control/diagnostics/tenant/:tenant_id`)
3. CI contract probe (`scripts/ci/sandbox-api-probes.mjs` + tests)
4. benchmark-style stress script (`scripts/bench/sandbox-stress.mjs`)
5. split sandbox rate-limit buckets (`sandbox_write` / `sandbox_read`)
6. failure classification in governance weekly report (`scope_snapshot.sandbox.top_errors`)
7. weekly evidence pack sandbox artifact (`raw/sandbox_api_probe.json`)

### Phase 3: Isolation-Grade Runtime

Status: `in_progress` (2026-03-03)

Delivered in current batch:

1. `http_remote` executor mode with remote adapter contract and `/health` surface.
2. sandbox retention cleanup job (`npm run job:sandbox-retention`) with dry-run/apply mode.
3. per-tenant sandbox budget policy gates (`SANDBOX_TENANT_BUDGET_POLICY_JSON` + execute-time enforcement).

Remaining:

1. network policy controls (egress allowlist)
2. file I/O isolation and artifact contract
3. admission controls by tenant/project policy

## 8. Acceptance Criteria

### Functional

1. Session creation succeeds and is tenant/scope isolated.
2. Execute supports `sync` and `async`.
3. Run status transitions are deterministic.
4. Cancel works for `queued` and `running`.
5. Logs are retrievable with tail limit.

### Contract

1. API docs include sandbox routes.
2. TS + Python SDK expose typed sandbox methods.
3. Playground templates validate against current schemas.

### Safety

1. Sandbox remains disabled unless explicitly enabled.
2. `local_process` command allowlist is enforced.
3. production guard blocks unsafe local_process unless explicitly overridden.

## 9. Rollback Plan

1. Set `SANDBOX_ENABLED=false` to disable runtime entrypoints.
2. Keep data tables for audit; no destructive rollback needed.
3. If executor instability occurs, switch to `SANDBOX_EXECUTOR_MODE=mock`.

## 10. Next Implementation Batch

1. Add remote executor heartbeat/lease protocol and dead-worker recovery semantics.
2. Introduce sandbox artifact export contract for stdout/stderr/file bundles.
3. Extend tenant budget policy to project-level overrides and admin control-plane API.
