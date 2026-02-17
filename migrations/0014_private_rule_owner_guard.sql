BEGIN;

-- Hard guardrail for new writes:
-- private rule nodes must always declare an owner (agent or team).
--
-- Keep as NOT VALID so historical rows can be repaired online by
-- job:private-rule-owner-backfill without blocking migration rollout.
ALTER TABLE memory_nodes
  DROP CONSTRAINT IF EXISTS memory_nodes_private_rule_owner_ck;

ALTER TABLE memory_nodes
  ADD CONSTRAINT memory_nodes_private_rule_owner_ck
  CHECK (
    type <> 'rule'::memory_node_type
    OR memory_lane <> 'private'::memory_lane
    OR owner_agent_id IS NOT NULL
    OR owner_team_id IS NOT NULL
  ) NOT VALID;

COMMIT;
