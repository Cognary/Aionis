BEGIN;

-- Guardrail: keep scope-local relationships explicit so cross-scope writes are blocked
-- even if an application bug slips through.
CREATE UNIQUE INDEX IF NOT EXISTS memory_nodes_scope_id_uniq
  ON memory_nodes (scope, id);

ALTER TABLE memory_rule_defs
  DROP CONSTRAINT IF EXISTS memory_rule_defs_scope_rule_node_fk;

ALTER TABLE memory_rule_defs
  ADD CONSTRAINT memory_rule_defs_scope_rule_node_fk
  FOREIGN KEY (scope, rule_node_id)
  REFERENCES memory_nodes(scope, id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE memory_rule_feedback
  DROP CONSTRAINT IF EXISTS memory_rule_feedback_scope_rule_node_fk;

ALTER TABLE memory_rule_feedback
  ADD CONSTRAINT memory_rule_feedback_scope_rule_node_fk
  FOREIGN KEY (scope, rule_node_id)
  REFERENCES memory_nodes(scope, id)
  ON DELETE CASCADE
  NOT VALID;

COMMIT;
