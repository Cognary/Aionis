-- Throughput-focused indexes for high-concurrency recall paths.
-- Motivation:
-- 1) Stage-2 neighborhood query orders by (weight, confidence) on scope+src/dst filters.
-- 2) Stage-1 seed filters frequently constrain scope + lane owner + tier + ready embedding status.
-- 3) Rule-node guard in stage-1 benefits from scope-first lookup.

-- Stage-2 edges: optimize hot ordered edge fetches from both directions.
CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_edges_scope_src_weight_conf_idx
  ON memory_edges (scope, src_id, weight DESC, confidence DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_edges_scope_dst_weight_conf_idx
  ON memory_edges (scope, dst_id, weight DESC, confidence DESC);

-- Keep v2/index surface aligned with legacy tables for partition cutover parity.
CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_edges_v2_scope_src_weight_conf_idx
  ON memory_edges_v2 (scope, src_id, weight DESC, confidence DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_edges_v2_scope_dst_weight_conf_idx
  ON memory_edges_v2 (scope, dst_id, weight DESC, confidence DESC);

-- Stage-1 lane-owner guard with READY/hot+warm filter.
CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_nodes_scope_lane_owner_tier_ready_idx
  ON memory_nodes (scope, memory_lane, owner_agent_id, owner_team_id, tier)
  WHERE embedding IS NOT NULL
    AND embedding_status = 'ready'
    AND tier IN ('hot', 'warm');

CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_nodes_v2_scope_lane_owner_tier_ready_idx
  ON memory_nodes_v2 (scope, memory_lane, owner_agent_id, owner_team_id, tier)
  WHERE embedding IS NOT NULL
    AND embedding_status = 'ready'
    AND tier IN ('hot', 'warm');

-- Stage-1 rule-node check uses (scope, rule_node_id, state).
CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_rule_defs_scope_rule_node_state_idx
  ON memory_rule_defs (scope, rule_node_id, state);
