BEGIN;

CREATE INDEX IF NOT EXISTS control_alert_deliveries_route_dedupe_created_idx
  ON control_alert_deliveries (route_id, (metadata->>'dedupe_key'), created_at DESC)
  WHERE metadata ? 'dedupe_key';

COMMIT;
