ALTER TABLE memory_context_assembly_telemetry
  ADD COLUMN IF NOT EXISTS selection_policy_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS requested_allowed_layers_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_memory_context_assembly_telemetry_policy_source_created
  ON memory_context_assembly_telemetry (tenant_id, selection_policy_source, created_at DESC)
  WHERE selection_policy_source IS NOT NULL;
