BEGIN;

CREATE TABLE IF NOT EXISTS control_alert_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES control_tenants(tenant_id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('webhook', 'slack_webhook', 'pagerduty_events')),
  label TEXT NULL,
  events JSONB NOT NULL DEFAULT '["*"]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  target TEXT NULL,
  secret TEXT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS control_alert_routes_tenant_status_idx
  ON control_alert_routes(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS control_alert_routes_tenant_channel_idx
  ON control_alert_routes(tenant_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS control_alert_routes_events_gin_idx
  ON control_alert_routes USING gin(events);

DO $$ BEGIN
  CREATE TRIGGER control_alert_routes_set_updated_at
  BEFORE UPDATE ON control_alert_routes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS control_alert_deliveries (
  id BIGSERIAL PRIMARY KEY,
  delivery_id UUID NOT NULL DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES control_alert_routes(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  request_id TEXT NULL,
  response_code INT NULL,
  response_body TEXT NULL,
  error TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS control_alert_deliveries_delivery_id_uniq
  ON control_alert_deliveries(delivery_id);

CREATE INDEX IF NOT EXISTS control_alert_deliveries_tenant_event_created_idx
  ON control_alert_deliveries(tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS control_alert_deliveries_route_created_idx
  ON control_alert_deliveries(route_id, created_at DESC);

COMMIT;
