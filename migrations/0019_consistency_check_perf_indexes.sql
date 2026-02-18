-- Performance indexes for consistency-check on large datasets.
-- Intentionally uses CONCURRENTLY and no explicit transaction block to reduce write locking.

-- Speed up scope-local sample queries that sort by recency.
CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_nodes_scope_updated_at_id_idx
  ON memory_nodes (scope, updated_at DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_edges_scope_created_at_id_idx
  ON memory_edges (scope, created_at DESC, id);

-- Cover id->scope lookups used by cross-tenant join checks.
CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_nodes_id_scope_cover_idx
  ON memory_nodes (id) INCLUDE (scope);

CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_commits_id_scope_cover_idx
  ON memory_commits (id) INCLUDE (scope);

-- Help global cross-tenant joins on commit/rule links.
CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_commits_parent_id_scope_idx
  ON memory_commits (parent_id) INCLUDE (id, scope)
  WHERE parent_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_outbox_commit_id_scope_idx
  ON memory_outbox (commit_id) INCLUDE (scope, id, event_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_rule_defs_rule_node_id_scope_idx
  ON memory_rule_defs (rule_node_id) INCLUDE (scope, state);

CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_rule_feedback_rule_node_id_scope_idx
  ON memory_rule_feedback (rule_node_id) INCLUDE (scope, outcome);
