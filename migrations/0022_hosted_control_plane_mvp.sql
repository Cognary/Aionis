BEGIN;

CREATE TABLE IF NOT EXISTS control_tenants (
  tenant_id TEXT PRIMARY KEY,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_projects (
  project_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES control_tenants(tenant_id) ON DELETE CASCADE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS control_projects_tenant_idx ON control_projects(tenant_id);

CREATE TABLE IF NOT EXISTS control_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES control_tenants(tenant_id) ON DELETE CASCADE,
  project_id TEXT REFERENCES control_projects(project_id) ON DELETE SET NULL,
  label TEXT,
  role TEXT,
  agent_id TEXT,
  team_id TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS control_api_keys_tenant_status_idx ON control_api_keys(tenant_id, status);
CREATE INDEX IF NOT EXISTS control_api_keys_project_status_idx ON control_api_keys(project_id, status);

CREATE TABLE IF NOT EXISTS control_tenant_quotas (
  tenant_id TEXT PRIMARY KEY REFERENCES control_tenants(tenant_id) ON DELETE CASCADE,
  recall_rps DOUBLE PRECISION NOT NULL CHECK (recall_rps > 0),
  recall_burst INTEGER NOT NULL CHECK (recall_burst > 0),
  write_rps DOUBLE PRECISION NOT NULL CHECK (write_rps > 0),
  write_burst INTEGER NOT NULL CHECK (write_burst > 0),
  write_max_wait_ms INTEGER NOT NULL CHECK (write_max_wait_ms >= 0),
  debug_embed_rps DOUBLE PRECISION NOT NULL CHECK (debug_embed_rps > 0),
  debug_embed_burst INTEGER NOT NULL CHECK (debug_embed_burst > 0),
  recall_text_embed_rps DOUBLE PRECISION NOT NULL CHECK (recall_text_embed_rps > 0),
  recall_text_embed_burst INTEGER NOT NULL CHECK (recall_text_embed_burst > 0),
  recall_text_embed_max_wait_ms INTEGER NOT NULL CHECK (recall_text_embed_max_wait_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TRIGGER control_tenants_set_updated_at
  BEFORE UPDATE ON control_tenants
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER control_projects_set_updated_at
  BEFORE UPDATE ON control_projects
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER control_tenant_quotas_set_updated_at
  BEFORE UPDATE ON control_tenant_quotas
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
