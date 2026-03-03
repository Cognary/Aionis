BEGIN;

CREATE TABLE IF NOT EXISTS memory_sandbox_run_telemetry (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL UNIQUE,
  session_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('async', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'timeout')),
  executor TEXT NULL,
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms > 0 AND timeout_ms <= 600000),
  queue_wait_ms DOUBLE PRECISION NOT NULL CHECK (queue_wait_ms >= 0),
  runtime_ms DOUBLE PRECISION NOT NULL CHECK (runtime_ms >= 0),
  total_latency_ms DOUBLE PRECISION NOT NULL CHECK (total_latency_ms >= 0),
  cancel_requested BOOLEAN NOT NULL DEFAULT false,
  output_truncated BOOLEAN NOT NULL DEFAULT false,
  exit_code INTEGER NULL,
  error_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_sandbox_run_telemetry_tenant_created_idx
  ON memory_sandbox_run_telemetry (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_sandbox_run_telemetry_tenant_scope_created_idx
  ON memory_sandbox_run_telemetry (tenant_id, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_sandbox_run_telemetry_tenant_status_created_idx
  ON memory_sandbox_run_telemetry (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_sandbox_run_telemetry_tenant_mode_created_idx
  ON memory_sandbox_run_telemetry (tenant_id, mode, created_at DESC);

COMMIT;
