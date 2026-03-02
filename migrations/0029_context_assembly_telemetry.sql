BEGIN;

ALTER TABLE memory_request_telemetry
  DROP CONSTRAINT IF EXISTS memory_request_telemetry_endpoint_check;

ALTER TABLE memory_request_telemetry
  ADD CONSTRAINT memory_request_telemetry_endpoint_check
  CHECK (endpoint IN ('write', 'recall', 'recall_text', 'planning_context', 'context_assemble'));

CREATE TABLE IF NOT EXISTS memory_context_assembly_telemetry (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('planning_context', 'context_assemble')),
  request_id TEXT NULL,
  total_budget_chars INT NOT NULL CHECK (total_budget_chars >= 0),
  used_chars INT NOT NULL CHECK (used_chars >= 0),
  remaining_chars INT NOT NULL CHECK (remaining_chars >= 0),
  source_items INT NOT NULL CHECK (source_items >= 0),
  kept_items INT NOT NULL CHECK (kept_items >= 0),
  dropped_items INT NOT NULL CHECK (dropped_items >= 0),
  layers_with_content INT NOT NULL CHECK (layers_with_content >= 0),
  merge_trace_included BOOLEAN NOT NULL DEFAULT false,
  latency_ms DOUBLE PRECISION NOT NULL CHECK (latency_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_context_assembly_telemetry_tenant_endpoint_created_at_idx
  ON memory_context_assembly_telemetry (tenant_id, endpoint, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_context_assembly_telemetry_tenant_created_at_idx
  ON memory_context_assembly_telemetry (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_context_assembly_telemetry_request_id_idx
  ON memory_context_assembly_telemetry (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS memory_context_assembly_layer_telemetry (
  id BIGSERIAL PRIMARY KEY,
  telemetry_id BIGINT NOT NULL REFERENCES memory_context_assembly_telemetry(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('planning_context', 'context_assemble')),
  layer_name TEXT NOT NULL CHECK (layer_name IN ('facts', 'episodes', 'rules', 'decisions', 'tools', 'citations')),
  source_count INT NOT NULL CHECK (source_count >= 0),
  kept_count INT NOT NULL CHECK (kept_count >= 0),
  dropped_count INT NOT NULL CHECK (dropped_count >= 0),
  budget_chars INT NOT NULL CHECK (budget_chars >= 0),
  used_chars INT NOT NULL CHECK (used_chars >= 0),
  max_items INT NOT NULL CHECK (max_items >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_context_assembly_layer_telemetry_id_idx
  ON memory_context_assembly_layer_telemetry (telemetry_id);

CREATE INDEX IF NOT EXISTS memory_context_assembly_layer_telemetry_tenant_layer_created_at_idx
  ON memory_context_assembly_layer_telemetry (tenant_id, layer_name, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_context_assembly_layer_telemetry_tenant_endpoint_created_at_idx
  ON memory_context_assembly_layer_telemetry (tenant_id, endpoint, created_at DESC);

COMMIT;
