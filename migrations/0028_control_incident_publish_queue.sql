BEGIN;

CREATE TABLE IF NOT EXISTS control_incident_publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES control_tenants(tenant_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  source_dir TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INT NOT NULL DEFAULT 5 CHECK (max_attempts >= 1 AND max_attempts <= 100),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  published_uri TEXT NULL,
  last_error TEXT NULL,
  last_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS control_incident_publish_jobs_status_next_attempt_idx
  ON control_incident_publish_jobs(status, next_attempt_at ASC, created_at ASC)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS control_incident_publish_jobs_tenant_created_idx
  ON control_incident_publish_jobs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS control_incident_publish_jobs_run_id_idx
  ON control_incident_publish_jobs(run_id, created_at DESC);

DO $$ BEGIN
  CREATE TRIGGER control_incident_publish_jobs_set_updated_at
  BEFORE UPDATE ON control_incident_publish_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
