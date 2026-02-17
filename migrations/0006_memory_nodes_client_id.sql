BEGIN;

ALTER TABLE memory_nodes
  ADD COLUMN IF NOT EXISTS client_id TEXT NULL;

-- Idempotency + operability: allow querying by a stable external id.
-- Enforce uniqueness within a scope (only when client_id is present).
CREATE UNIQUE INDEX IF NOT EXISTS memory_nodes_scope_client_id_uniq
  ON memory_nodes (scope, client_id)
  WHERE client_id IS NOT NULL;

COMMIT;

