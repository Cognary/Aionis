BEGIN;

ALTER TABLE memory_context_assembly_telemetry
  ADD COLUMN IF NOT EXISTS selection_policy_name TEXT NULL;

ALTER TABLE memory_context_assembly_telemetry
  ADD COLUMN IF NOT EXISTS selected_memory_layers_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE memory_context_assembly_telemetry
  ADD COLUMN IF NOT EXISTS trust_anchor_layers_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS memory_context_assembly_telemetry_tenant_selection_policy_created_idx
  ON memory_context_assembly_telemetry (tenant_id, selection_policy_name, created_at DESC)
  WHERE selection_policy_name IS NOT NULL;

COMMIT;
