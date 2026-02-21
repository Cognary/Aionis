BEGIN;

CREATE TABLE IF NOT EXISTS control_audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL DEFAULT 'admin_token',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NULL,
  tenant_id TEXT NULL,
  request_id TEXT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS control_audit_events_event_id_uniq
  ON control_audit_events(event_id);

CREATE INDEX IF NOT EXISTS control_audit_events_created_at_idx
  ON control_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS control_audit_events_tenant_created_at_idx
  ON control_audit_events(tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS control_audit_events_action_created_at_idx
  ON control_audit_events(action, created_at DESC);

COMMIT;
