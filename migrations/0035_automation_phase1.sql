BEGIN;

CREATE TABLE IF NOT EXISTS automation_defs (
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'shadow', 'active', 'disabled')),
  latest_version INTEGER NOT NULL CHECK (latest_version > 0),
  input_contract_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_contract_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope, automation_id)
);

CREATE INDEX IF NOT EXISTS automation_defs_tenant_scope_updated_idx
  ON automation_defs (tenant_id, scope, updated_at DESC);

CREATE INDEX IF NOT EXISTS automation_defs_tenant_scope_status_updated_idx
  ON automation_defs (tenant_id, scope, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS automation_versions (
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'shadow', 'active', 'disabled')),
  graph_json JSONB NOT NULL,
  compile_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope, automation_id, version),
  FOREIGN KEY (tenant_id, scope, automation_id)
    REFERENCES automation_defs (tenant_id, scope, automation_id)
);

CREATE INDEX IF NOT EXISTS automation_versions_tenant_scope_version_idx
  ON automation_versions (tenant_id, scope, automation_id, version DESC);

CREATE INDEX IF NOT EXISTS automation_versions_tenant_scope_status_created_idx
  ON automation_versions (tenant_id, scope, status, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_runs (
  run_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  automation_version INTEGER NOT NULL CHECK (automation_version > 0),
  requested_by TEXT NULL,
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('queued', 'running', 'paused', 'compensating', 'terminal')),
  pause_reason TEXT NULL CHECK (
    pause_reason IS NULL
    OR pause_reason IN ('approval_required', 'repair_required', 'dependency_wait', 'operator_pause')
  ),
  terminal_outcome TEXT NULL CHECK (
    terminal_outcome IS NULL
    OR terminal_outcome IN ('succeeded', 'failed', 'cancelled', 'failed_compensated', 'cancelled_compensated')
  ),
  status_summary TEXT NOT NULL,
  root_cause_code TEXT NULL,
  root_cause_node_id TEXT NULL,
  root_cause_message TEXT NULL,
  params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  compensation_attempted BOOLEAN NOT NULL DEFAULT false,
  compensation_status TEXT NOT NULL DEFAULT 'not_needed' CHECK (
    compensation_status IN ('not_needed', 'pending', 'running', 'succeeded', 'failed')
  ),
  compensation_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NULL,
  paused_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, scope, automation_id, automation_version)
    REFERENCES automation_versions (tenant_id, scope, automation_id, version)
);

CREATE INDEX IF NOT EXISTS automation_runs_tenant_scope_created_idx
  ON automation_runs (tenant_id, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS automation_runs_tenant_scope_automation_created_idx
  ON automation_runs (tenant_id, scope, automation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS automation_runs_tenant_scope_lifecycle_created_idx
  ON automation_runs (tenant_id, scope, lifecycle_state, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_run_nodes (
  run_id UUID NOT NULL,
  node_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  node_kind TEXT NOT NULL CHECK (node_kind IN ('playbook', 'approval', 'condition', 'artifact_gate')),
  lifecycle_state TEXT NOT NULL CHECK (
    lifecycle_state IN ('pending', 'ready', 'running', 'paused', 'retrying', 'compensating', 'terminal')
  ),
  pause_reason TEXT NULL CHECK (pause_reason IS NULL OR pause_reason IN ('approval_required', 'repair_required')),
  terminal_outcome TEXT NULL CHECK (
    terminal_outcome IS NULL
    OR terminal_outcome IN ('succeeded', 'failed', 'rejected', 'skipped', 'compensated')
  ),
  status_summary TEXT NOT NULL,
  depends_on_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocking_node_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_code TEXT NULL,
  error_message TEXT NULL,
  playbook_id TEXT NULL,
  playbook_version INTEGER NULL,
  playbook_run_id UUID NULL,
  approval_id TEXT NULL,
  input_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  compensation_mode TEXT NOT NULL DEFAULT 'none' CHECK (compensation_mode IN ('none', 'best_effort', 'required')),
  compensation_ref_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  compensation_run_id UUID NULL,
  compensation_status TEXT NOT NULL DEFAULT 'not_needed' CHECK (
    compensation_status IN ('not_needed', 'pending', 'running', 'succeeded', 'failed')
  ),
  started_at TIMESTAMPTZ NULL,
  paused_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, node_id, attempt)
);

CREATE INDEX IF NOT EXISTS automation_run_nodes_run_lifecycle_idx
  ON automation_run_nodes (run_id, lifecycle_state);

CREATE INDEX IF NOT EXISTS automation_run_nodes_run_node_idx
  ON automation_run_nodes (run_id, node_id);

CREATE INDEX IF NOT EXISTS automation_run_nodes_playbook_run_idx
  ON automation_run_nodes (playbook_run_id);

DO $$ BEGIN
  CREATE TRIGGER automation_defs_set_updated_at
  BEFORE UPDATE ON automation_defs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER automation_runs_set_updated_at
  BEFORE UPDATE ON automation_runs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER automation_run_nodes_set_updated_at
  BEFORE UPDATE ON automation_run_nodes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
