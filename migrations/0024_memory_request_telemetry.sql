BEGIN;

CREATE TABLE IF NOT EXISTS memory_request_telemetry (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('write', 'recall', 'recall_text')),
  status_code INT NOT NULL,
  latency_ms DOUBLE PRECISION NOT NULL CHECK (latency_ms >= 0),
  request_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_request_telemetry_tenant_endpoint_created_at_idx
  ON memory_request_telemetry (tenant_id, endpoint, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_request_telemetry_tenant_created_at_idx
  ON memory_request_telemetry (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_request_telemetry_request_id_idx
  ON memory_request_telemetry (request_id)
  WHERE request_id IS NOT NULL;

COMMIT;
