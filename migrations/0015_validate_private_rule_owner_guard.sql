BEGIN;

-- Phase 2 of hardening:
-- after backfill converges, validate the private-rule-owner constraint globally.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memory_nodes_private_rule_owner_ck'
  ) THEN
    RAISE EXCEPTION
      'Cannot validate memory_nodes_private_rule_owner_ck: constraint does not exist. Apply migration 0014 first.';
  END IF;
END $$;

ALTER TABLE memory_nodes
  VALIDATE CONSTRAINT memory_nodes_private_rule_owner_ck;

COMMIT;
