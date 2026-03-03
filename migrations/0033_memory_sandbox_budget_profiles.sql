BEGIN;

CREATE TABLE IF NOT EXISTS memory_sandbox_budget_profiles (
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '*',
  daily_run_cap INTEGER NULL CHECK (daily_run_cap IS NULL OR daily_run_cap >= 0),
  daily_timeout_cap INTEGER NULL CHECK (daily_timeout_cap IS NULL OR daily_timeout_cap >= 0),
  daily_failure_cap INTEGER NULL CHECK (daily_failure_cap IS NULL OR daily_failure_cap >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope)
);

CREATE INDEX IF NOT EXISTS memory_sandbox_budget_profiles_updated_idx
  ON memory_sandbox_budget_profiles (updated_at DESC);

COMMIT;
