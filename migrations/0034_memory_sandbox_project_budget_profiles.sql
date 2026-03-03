BEGIN;

ALTER TABLE memory_sandbox_runs
  ADD COLUMN IF NOT EXISTS project_id TEXT NULL;

CREATE INDEX IF NOT EXISTS memory_sandbox_runs_tenant_project_scope_created_idx
  ON memory_sandbox_runs (tenant_id, project_id, scope, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_sandbox_project_budget_profiles (
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '*',
  daily_run_cap INTEGER NULL CHECK (daily_run_cap IS NULL OR daily_run_cap >= 0),
  daily_timeout_cap INTEGER NULL CHECK (daily_timeout_cap IS NULL OR daily_timeout_cap >= 0),
  daily_failure_cap INTEGER NULL CHECK (daily_failure_cap IS NULL OR daily_failure_cap >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, project_id, scope)
);

CREATE INDEX IF NOT EXISTS memory_sandbox_project_budget_profiles_updated_idx
  ON memory_sandbox_project_budget_profiles (updated_at DESC);

COMMIT;
