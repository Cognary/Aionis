BEGIN;

CREATE TABLE IF NOT EXISTS memory_sandbox_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  scope TEXT NOT NULL DEFAULT 'default',
  profile TEXT NOT NULL DEFAULT 'default',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_sandbox_sessions_tenant_scope_created_idx
  ON memory_sandbox_sessions (tenant_id, scope, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_sandbox_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES memory_sandbox_sessions(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  scope TEXT NOT NULL DEFAULT 'default',
  planner_run_id TEXT NULL,
  decision_id UUID NULL,
  action_kind TEXT NOT NULL CHECK (action_kind IN ('command')),
  action_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  mode TEXT NOT NULL CHECK (mode IN ('async', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'timeout')),
  timeout_ms INTEGER NOT NULL DEFAULT 15000 CHECK (timeout_ms > 0 AND timeout_ms <= 600000),
  stdout_text TEXT NOT NULL DEFAULT '',
  stderr_text TEXT NOT NULL DEFAULT '',
  output_truncated BOOLEAN NOT NULL DEFAULT false,
  exit_code INTEGER NULL,
  error TEXT NULL,
  cancel_requested BOOLEAN NOT NULL DEFAULT false,
  cancel_reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_sandbox_runs_tenant_scope_created_idx
  ON memory_sandbox_runs (tenant_id, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_sandbox_runs_session_created_idx
  ON memory_sandbox_runs (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_sandbox_runs_scope_status_created_idx
  ON memory_sandbox_runs (scope, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_memory_sandbox_sessions_updated_at ON memory_sandbox_sessions;
CREATE TRIGGER trg_memory_sandbox_sessions_updated_at
BEFORE UPDATE ON memory_sandbox_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_memory_sandbox_runs_updated_at ON memory_sandbox_runs;
CREATE TRIGGER trg_memory_sandbox_runs_updated_at
BEFORE UPDATE ON memory_sandbox_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
