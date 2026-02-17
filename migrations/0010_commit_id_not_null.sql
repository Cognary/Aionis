BEGIN;

-- Pre-flight: fail early with a clear message if existing data violates the new constraint.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM memory_nodes WHERE commit_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce memory_nodes.commit_id NOT NULL: found rows with commit_id IS NULL. Fix data first.';
  END IF;
  IF EXISTS (SELECT 1 FROM memory_edges WHERE commit_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce memory_edges.commit_id NOT NULL: found rows with commit_id IS NULL. Fix data first.';
  END IF;
END $$;

-- Use a validated CHECK constraint first, so SET NOT NULL can be fast and safe.
ALTER TABLE memory_nodes DROP CONSTRAINT IF EXISTS memory_nodes_commit_id_nn;
ALTER TABLE memory_nodes
  ADD CONSTRAINT memory_nodes_commit_id_nn CHECK (commit_id IS NOT NULL) NOT VALID;
ALTER TABLE memory_nodes VALIDATE CONSTRAINT memory_nodes_commit_id_nn;
ALTER TABLE memory_nodes ALTER COLUMN commit_id SET NOT NULL;

ALTER TABLE memory_edges DROP CONSTRAINT IF EXISTS memory_edges_commit_id_nn;
ALTER TABLE memory_edges
  ADD CONSTRAINT memory_edges_commit_id_nn CHECK (commit_id IS NOT NULL) NOT VALID;
ALTER TABLE memory_edges VALIDATE CONSTRAINT memory_edges_commit_id_nn;
ALTER TABLE memory_edges ALTER COLUMN commit_id SET NOT NULL;

COMMIT;

