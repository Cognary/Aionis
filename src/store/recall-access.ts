import type pg from "pg";
import { toVectorLiteral } from "../util/pgvector.js";

export type RecallCandidate = {
  id: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  tier: string;
  salience: number;
  confidence: number;
  similarity: number;
};

export type RecallStage1Params = {
  queryEmbedding: number[];
  scope: string;
  oversample: number;
  limit: number;
  consumerAgentId: string | null;
  consumerTeamId: string | null;
};

export interface RecallStoreAccess {
  stage1CandidatesAnn(params: RecallStage1Params): Promise<RecallCandidate[]>;
  stage1CandidatesExactFallback(params: RecallStage1Params): Promise<RecallCandidate[]>;
}

function stage1QueryParams(params: RecallStage1Params) {
  return [
    toVectorLiteral(params.queryEmbedding),
    params.scope,
    params.oversample,
    params.limit,
    params.consumerAgentId,
    params.consumerTeamId,
  ];
}

export function createPostgresRecallStoreAccess(client: pg.PoolClient): RecallStoreAccess {
  return {
    async stage1CandidatesAnn(params: RecallStage1Params): Promise<RecallCandidate[]> {
      const out = await client.query<RecallCandidate>(
        `
        WITH knn AS (
          -- Performance-first: do ANN kNN on the broadest safe subset to encourage HNSW usage,
          -- then apply additional type/state filters in the outer query.
          SELECT
            n.id,
            n.type::text AS type,
            n.title,
            n.text_summary,
            n.tier::text AS tier,
            n.salience,
            n.confidence,
            (n.embedding <=> $1::vector(1536)) AS distance
          FROM memory_nodes n
          WHERE n.scope = $2
            AND n.tier IN ('hot', 'warm')
            AND n.embedding IS NOT NULL
            AND n.embedding_status = 'ready'
            AND (
              n.memory_lane = 'shared'::memory_lane
              OR (n.memory_lane = 'private'::memory_lane AND n.owner_agent_id = $5::text)
              OR ($6::text IS NOT NULL AND n.memory_lane = 'private'::memory_lane AND n.owner_team_id = $6::text)
            )
          ORDER BY n.embedding <=> $1::vector(1536)
          LIMIT $3
        )
        SELECT
          k.id,
          k.type,
          k.title,
          k.text_summary,
          k.tier,
          k.salience,
          k.confidence,
          1.0 - k.distance AS similarity
        FROM knn k
        WHERE k.type IN ('event', 'topic', 'concept', 'entity', 'rule')
          AND (
            k.type <> 'topic'
            OR EXISTS (
              SELECT 1
              FROM memory_nodes t
              WHERE t.id = k.id
                AND COALESCE(t.slots->>'topic_state', 'active') = 'active'
            )
          )
          AND (
            k.type <> 'rule'
            OR EXISTS (
              SELECT 1
              FROM memory_rule_defs d
              WHERE d.scope = $2
                AND d.rule_node_id = k.id
                AND d.state IN ('shadow', 'active')
            )
          )
        ORDER BY k.distance ASC
        LIMIT $4
        `,
        stage1QueryParams(params),
      );
      return out.rows;
    },

    async stage1CandidatesExactFallback(params: RecallStage1Params): Promise<RecallCandidate[]> {
      const out = await client.query<RecallCandidate>(
        `
        WITH ranked AS (
          -- Exact fallback: compute distance first and order by derived scalar distance.
          -- This avoids ANN false-empty long-tail misses under strict filters.
          SELECT
            n.id,
            n.type::text AS type,
            n.title,
            n.text_summary,
            n.tier::text AS tier,
            n.salience,
            n.confidence,
            ((n.embedding <=> $1::vector(1536))::double precision + 0.0) AS distance
          FROM memory_nodes n
          WHERE n.scope = $2
            AND n.tier IN ('hot', 'warm')
            AND n.embedding IS NOT NULL
            AND n.embedding_status = 'ready'
            AND (
              n.memory_lane = 'shared'::memory_lane
              OR (n.memory_lane = 'private'::memory_lane AND n.owner_agent_id = $5::text)
              OR ($6::text IS NOT NULL AND n.memory_lane = 'private'::memory_lane AND n.owner_team_id = $6::text)
            )
        ),
        knn AS (
          SELECT *
          FROM ranked
          ORDER BY distance ASC
          LIMIT $3
        )
        SELECT
          k.id,
          k.type,
          k.title,
          k.text_summary,
          k.tier,
          k.salience,
          k.confidence,
          1.0 - k.distance AS similarity
        FROM knn k
        WHERE k.type IN ('event', 'topic', 'concept', 'entity', 'rule')
          AND (
            k.type <> 'topic'
            OR EXISTS (
              SELECT 1
              FROM memory_nodes t
              WHERE t.id = k.id
                AND COALESCE(t.slots->>'topic_state', 'active') = 'active'
            )
          )
          AND (
            k.type <> 'rule'
            OR EXISTS (
              SELECT 1
              FROM memory_rule_defs d
              WHERE d.scope = $2
                AND d.rule_node_id = k.id
                AND d.state IN ('shadow', 'active')
            )
          )
        ORDER BY k.distance ASC
        LIMIT $4
        `,
        stage1QueryParams(params),
      );
      return out.rows;
    },
  };
}
