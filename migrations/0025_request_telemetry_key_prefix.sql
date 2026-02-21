BEGIN;

ALTER TABLE memory_request_telemetry
  ADD COLUMN IF NOT EXISTS api_key_prefix TEXT NULL;

CREATE INDEX IF NOT EXISTS memory_request_telemetry_tenant_key_prefix_created_at_idx
  ON memory_request_telemetry (tenant_id, api_key_prefix, created_at DESC)
  WHERE api_key_prefix IS NOT NULL;

CREATE INDEX IF NOT EXISTS memory_request_telemetry_endpoint_created_at_idx
  ON memory_request_telemetry (endpoint, created_at DESC);

COMMIT;
