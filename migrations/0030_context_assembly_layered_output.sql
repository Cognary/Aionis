BEGIN;

ALTER TABLE memory_context_assembly_telemetry
  ADD COLUMN IF NOT EXISTS layered_output BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS memory_context_assembly_telemetry_tenant_layered_created_idx
  ON memory_context_assembly_telemetry (tenant_id, layered_output, created_at DESC);

COMMIT;
