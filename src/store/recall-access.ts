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

export type RecallEdgeRow = {
  id: string;
  scope: string;
  type: string;
  src_id: string;
  dst_id: string;
  weight: number;
  confidence: number;
  decay_rate: number;
  last_activated: string | null;
  created_at: string;
  commit_id: string | null;
};

export type RecallNodeRow = {
  id: string;
  scope: string;
  type: string;
  tier: string;
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  title: string | null;
  text_summary: string | null;
  slots: any;
  embedding_status: string;
  embedding_model: string | null;
  topic_state: string | null;
  member_count: number | null;
  raw_ref: string | null;
  evidence_ref: string | null;
  salience: number;
  importance: number;
  confidence: number;
  last_activated: string | null;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
};

export type RecallStage2EdgesParams = {
  seedIds: string[];
  scope: string;
  neighborhoodHops: 1 | 2;
  minEdgeWeight: number;
  minEdgeConfidence: number;
  hop1Budget: number;
  hop2Budget: number;
  edgeFetchBudget: number;
};

export type RecallStage2NodesParams = {
  scope: string;
  nodeIds: string[];
  consumerAgentId: string | null;
  consumerTeamId: string | null;
  includeSlots: boolean;
};

export interface RecallStoreAccess {
  stage1CandidatesAnn(params: RecallStage1Params): Promise<RecallCandidate[]>;
  stage1CandidatesExactFallback(params: RecallStage1Params): Promise<RecallCandidate[]>;
  stage2Edges(params: RecallStage2EdgesParams): Promise<RecallEdgeRow[]>;
  stage2Nodes(params: RecallStage2NodesParams): Promise<RecallNodeRow[]>;
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

    async stage2Edges(params: RecallStage2EdgesParams): Promise<RecallEdgeRow[]> {
      const out = await client.query<RecallEdgeRow>(
        params.neighborhoodHops === 1
          ? `
            WITH seed AS (
              SELECT unnest($1::uuid[]) AS id
            ),
            hop1 AS (
              (
                SELECT e.*
                FROM memory_edges e
                JOIN seed s ON s.id = e.src_id
                WHERE e.scope = $2
                  AND COALESCE(e.weight, 1) >= $3
                  AND COALESCE(e.confidence, 1) >= $4
                ORDER BY e.weight DESC, e.confidence DESC
                LIMIT $5
              )
              UNION
              (
                SELECT e.*
                FROM memory_edges e
                JOIN seed s ON s.id = e.dst_id
                WHERE e.scope = $2
                  AND COALESCE(e.weight, 1) >= $3
                  AND COALESCE(e.confidence, 1) >= $4
                ORDER BY e.weight DESC, e.confidence DESC
                LIMIT $5
              )
            )
            SELECT
              id,
              scope,
              type::text AS type,
              src_id,
              dst_id,
              weight,
              confidence,
              decay_rate,
              last_activated,
              created_at,
              commit_id
            FROM hop1
            ORDER BY weight DESC, confidence DESC
            LIMIT $6
          `
          : `
            WITH seed AS (
              SELECT unnest($1::uuid[]) AS id
            ),
            hop1 AS (
              (
                SELECT e.*
                FROM memory_edges e
                JOIN seed s ON s.id = e.src_id
                WHERE e.scope = $2
                  AND COALESCE(e.weight, 1) >= $3
                  AND COALESCE(e.confidence, 1) >= $4
                ORDER BY e.weight DESC, e.confidence DESC
                LIMIT $5
              )
              UNION
              (
                SELECT e.*
                FROM memory_edges e
                JOIN seed s ON s.id = e.dst_id
                WHERE e.scope = $2
                  AND COALESCE(e.weight, 1) >= $3
                  AND COALESCE(e.confidence, 1) >= $4
                ORDER BY e.weight DESC, e.confidence DESC
                LIMIT $5
              )
            ),
            nodes AS (
              SELECT src_id AS id FROM hop1
              UNION
              SELECT dst_id AS id FROM hop1
              UNION
              SELECT id FROM seed
            ),
            hop2 AS (
              (
                SELECT e.*
                FROM memory_edges e
                JOIN nodes n ON n.id = e.src_id
                WHERE e.scope = $2
                  AND COALESCE(e.weight, 1) >= $3
                  AND COALESCE(e.confidence, 1) >= $4
                ORDER BY e.weight DESC, e.confidence DESC
                LIMIT $7
              )
              UNION
              (
                SELECT e.*
                FROM memory_edges e
                JOIN nodes n ON n.id = e.dst_id
                WHERE e.scope = $2
                  AND COALESCE(e.weight, 1) >= $3
                  AND COALESCE(e.confidence, 1) >= $4
                ORDER BY e.weight DESC, e.confidence DESC
                LIMIT $7
              )
            )
            SELECT
              id,
              scope,
              type::text AS type,
              src_id,
              dst_id,
              weight,
              confidence,
              decay_rate,
              last_activated,
              created_at,
              commit_id
            FROM hop2
            ORDER BY weight DESC, confidence DESC
            LIMIT $6
          `,
        params.neighborhoodHops === 1
          ? [
              params.seedIds,
              params.scope,
              params.minEdgeWeight,
              params.minEdgeConfidence,
              params.hop1Budget,
              params.edgeFetchBudget,
            ]
          : [
              params.seedIds,
              params.scope,
              params.minEdgeWeight,
              params.minEdgeConfidence,
              params.hop1Budget,
              params.edgeFetchBudget,
              params.hop2Budget,
            ],
      );
      return out.rows;
    },

    async stage2Nodes(params: RecallStage2NodesParams): Promise<RecallNodeRow[]> {
      const out = await client.query<RecallNodeRow>(
        `
        SELECT
          id,
          scope,
          type::text AS type,
          tier::text AS tier,
          memory_lane::text AS memory_lane,
          producer_agent_id,
          owner_agent_id,
          owner_team_id,
          title,
          text_summary,
          ${params.includeSlots ? "slots," : "NULL::jsonb AS slots,"}
          embedding_status::text AS embedding_status,
          embedding_model,
          CASE WHEN type = 'topic' THEN COALESCE(slots->>'topic_state','active') ELSE NULL END AS topic_state,
          CASE WHEN type = 'topic' THEN NULLIF(slots->>'member_count','')::int ELSE NULL END AS member_count,
          raw_ref,
          evidence_ref,
          salience,
          importance,
          confidence,
          last_activated,
          created_at,
          updated_at,
          commit_id
        FROM memory_nodes
        WHERE scope = $1
          AND id = ANY($2::uuid[])
          AND (
            memory_lane = 'shared'::memory_lane
            OR (memory_lane = 'private'::memory_lane AND owner_agent_id = $3::text)
            OR ($4::text IS NOT NULL AND memory_lane = 'private'::memory_lane AND owner_team_id = $4::text)
          )
        `,
        [params.scope, params.nodeIds, params.consumerAgentId, params.consumerTeamId],
      );
      return out.rows;
    },
  };
}
