BEGIN;

-- Execution decision provenance for planner/tool selector integration.
CREATE TABLE IF NOT EXISTS memory_execution_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'default',
  decision_kind TEXT NOT NULL CHECK (decision_kind IN ('tools_select')),
  run_id TEXT NULL,
  selected_tool TEXT NULL,
  candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_sha256 TEXT NOT NULL,
  policy_sha256 TEXT NOT NULL,
  source_rule_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  commit_id UUID NULL REFERENCES memory_commits(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS memory_execution_decisions_scope_id_uniq
  ON memory_execution_decisions (scope, id);

CREATE INDEX IF NOT EXISTS memory_execution_decisions_scope_run_created_idx
  ON memory_execution_decisions (scope, run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_execution_decisions_scope_selected_created_idx
  ON memory_execution_decisions (scope, selected_tool, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_execution_decisions_scope_context_created_idx
  ON memory_execution_decisions (scope, context_sha256, created_at DESC);

-- Extend rule feedback rows so tool feedback can reference concrete execution decisions.
ALTER TABLE memory_rule_feedback
  ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE memory_rule_feedback
SET source = 'rule_feedback'
WHERE source IS NULL;

ALTER TABLE memory_rule_feedback
  ALTER COLUMN source SET DEFAULT 'rule_feedback';

ALTER TABLE memory_rule_feedback
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE memory_rule_feedback
  DROP CONSTRAINT IF EXISTS memory_rule_feedback_source_ck;

ALTER TABLE memory_rule_feedback
  ADD CONSTRAINT memory_rule_feedback_source_ck
  CHECK (source IN ('rule_feedback', 'tools_feedback'));

ALTER TABLE memory_rule_feedback
  ADD COLUMN IF NOT EXISTS decision_id UUID NULL;

CREATE INDEX IF NOT EXISTS memory_rule_feedback_scope_decision_created_at_idx
  ON memory_rule_feedback (scope, decision_id, created_at DESC)
  WHERE decision_id IS NOT NULL;

ALTER TABLE memory_rule_feedback
  DROP CONSTRAINT IF EXISTS memory_rule_feedback_scope_decision_fk;

ALTER TABLE memory_rule_feedback
  ADD CONSTRAINT memory_rule_feedback_scope_decision_fk
  FOREIGN KEY (scope, decision_id)
  REFERENCES memory_execution_decisions(scope, id)
  ON DELETE SET NULL
  NOT VALID;

COMMIT;
