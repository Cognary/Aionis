BEGIN;

CREATE TABLE IF NOT EXISTS memory_association_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  src_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  dst_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  relation_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  score REAL NOT NULL,
  confidence REAL NOT NULL,
  feature_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_commit_id UUID NULL REFERENCES memory_commits(id) ON DELETE SET NULL,
  worker_run_id TEXT NULL,
  promoted_edge_id UUID NULL REFERENCES memory_edges(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, src_id, dst_id, relation_kind)
);

CREATE INDEX IF NOT EXISTS memory_association_candidates_scope_src_score_idx
  ON memory_association_candidates (scope, src_id, score DESC, confidence DESC);

COMMIT;
