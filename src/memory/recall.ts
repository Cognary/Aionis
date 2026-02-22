import type pg from "pg";
import { performance } from "node:perf_hooks";
import { assertDim, toVectorLiteral } from "../util/pgvector.js";
import { MemoryRecallRequest, type MemoryRecallInput } from "./schemas.js";
import { buildContext } from "./context.js";
import { sha256Hex } from "../util/crypto.js";
import { badRequest } from "../util/http.js";
import { resolveTenantScope } from "./tenant.js";

export type RecallAuth = {
  allow_debug_embeddings: boolean;
};

export type RecallTelemetry = {
  timing?: (stage: string, ms: number) => void;
};

type Candidate = {
  id: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  tier: string;
  salience: number;
  confidence: number;
  similarity: number;
};

type NodeRow = {
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

type EdgeRow = {
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

function edgeTypeWeight(t: string): number {
  if (t === "derived_from") return 1.0;
  if (t === "part_of") return 0.9;
  return 0.6; // related_to
}

function parseVectorText(v: string, maxPreviewDims: number): { dims: number; preview: number[] } {
  const s = v.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) throw new Error("unexpected vector text");
  const body = s.slice(1, -1).trim();
  if (!body) return { dims: 0, preview: [] };
  const parts = body.split(",");
  const preview: number[] = [];
  for (let i = 0; i < parts.length && i < maxPreviewDims; i++) {
    preview.push(Number(parts[i]));
  }
  return { dims: parts.length, preview };
}

function isDraftTopic(n: NodeRow): boolean {
  return n.type === "topic" && (n.topic_state ?? "active") === "draft";
}

function pickSlotsPreview(slots: unknown, maxKeys: number): Record<string, unknown> | null {
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return null;
  const obj = slots as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys.slice(0, maxKeys)) out[k] = obj[k];
  return out;
}

type NodeDTO = {
  id: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  topic_state?: string | null;
  member_count?: number | null;
  slots?: unknown;
  slots_preview?: Record<string, unknown> | null;
  raw_ref?: string | null;
  evidence_ref?: string | null;
  embedding_status?: string;
  embedding_model?: string | null;
  memory_lane?: "private" | "shared";
  producer_agent_id?: string | null;
  owner_agent_id?: string | null;
  owner_team_id?: string | null;
  created_at?: string;
  updated_at?: string;
  last_activated?: string | null;
  salience?: number;
  importance?: number;
  confidence?: number;
  commit_id?: string | null;
};

type EdgeDTO = {
  from_id: string;
  to_id: string;
  type: string;
  weight: number;
  commit_id?: string | null;
};

// Very small spreading-activation MVP: 1-2 iterations, bounded by the neighborhood we fetched.
function spreadActivation(seeds: Candidate[], nodes: Map<string, NodeRow>, edges: EdgeRow[], hops: number) {
  const act = new Map<string, number>();
  for (const s of seeds) {
    // similarity in [0,1], salience in [0,1]
    const a = Math.max(0, Math.min(1, 0.75 * s.similarity + 0.25 * s.salience));
    act.set(s.id, a);
  }

  const adj = new Map<string, EdgeRow[]>();
  for (const e of edges) {
    if (!adj.has(e.src_id)) adj.set(e.src_id, []);
    if (!adj.has(e.dst_id)) adj.set(e.dst_id, []);
    adj.get(e.src_id)!.push(e);
    adj.get(e.dst_id)!.push(e);
  }

  for (let iter = 0; iter < hops; iter++) {
    const next = new Map(act);
    for (const [nid, a] of act.entries()) {
      const es = adj.get(nid) ?? [];
      for (const e of es) {
        const other = e.src_id === nid ? e.dst_id : e.src_id;
        const w = edgeTypeWeight(e.type) * e.weight * e.confidence;
        const add = a * w * 0.5; // conservative
        next.set(other, Math.max(next.get(other) ?? 0, add));
      }
    }
    for (const [k, v] of next.entries()) act.set(k, Math.max(act.get(k) ?? 0, v));
  }

  const scored = Array.from(act.entries())
    .map(([id, activation]) => {
      const n = nodes.get(id);
      const conf = n?.confidence ?? 0.5;
      const sal = n?.salience ?? 0.5;
      // Blend activation with node confidence/salience to stabilize ranking.
      const score = 0.7 * activation + 0.15 * conf + 0.15 * sal;
      return { id, activation, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored;
}

function enforceHardContract(parsed: MemoryRecallInput, auth: RecallAuth) {
  // A: Debug embeddings are a privileged, bounded debug channel. Never allow as a default.
  if (parsed.include_embeddings) {
    if (!parsed.return_debug) badRequest("debug_embeddings_requires_return_debug", "include_embeddings requires return_debug=true");
    if (!auth.allow_debug_embeddings) {
      badRequest("debug_embeddings_not_allowed", "include_embeddings requires X-Admin-Token (or localhost in dev)");
    }
    if (parsed.limit > 20) badRequest("debug_embeddings_limit_too_high", "debug embeddings mode requires limit <= 20");
  }
}

export async function memoryRecallParsed(
  client: pg.PoolClient,
  parsed: MemoryRecallInput,
  defaultScope: string,
  defaultTenantId: string,
  auth: RecallAuth,
  telemetry?: RecallTelemetry,
  endpoint: "recall" | "recall_text" = "recall",
) {
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  const consumerAgentId = parsed.consumer_agent_id?.trim() || null;
  const consumerTeamId = parsed.consumer_team_id?.trim() || null;
  assertDim(parsed.query_embedding, 1536);

  enforceHardContract(parsed, auth);

  async function timed<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      const ms = performance.now() - t0;
      telemetry?.timing?.(stage, ms);
    }
  }

  // Stage 1: pgvector candidates (excluding draft/disabled rules).
  const stage1 = await timed("stage1_candidates", () =>
    client.query<Candidate>(
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
      (() => {
        const oversample = Math.max(parsed.limit, Math.min(1000, parsed.limit * 5));
        return [toVectorLiteral(parsed.query_embedding), scope, oversample, parsed.limit, consumerAgentId, consumerTeamId];
      })(),
    ),
  );

  const seeds = stage1.rows;
  const seedIds = seeds.map((s) => s.id);

  if (seedIds.length === 0) {
    return {
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
      seeds: [],
      subgraph: { nodes: [], edges: [] },
      ranked: [],
      context: { text: "", items: [], citations: [] },
      ...(parsed.return_debug ? { debug: { neighborhood_counts: { nodes: 0, edges: 0 }, embeddings: undefined } } : {}),
    };
  }

  // Stage 2: fetch 1-2 hop neighborhood edges/nodes.
  // Contract/perf rules (B/C):
  // - never select/return embedding here
  // - explicit column list only
  // Hard bound on how much neighborhood data we even consider.
  // Note: request max_edges is already hard-capped to 100 by schema. We still budget stage-2 fetch work.
  const EDGE_FETCH_BUDGET = Math.min(1000, Math.max(parsed.max_edges * 5, parsed.max_edges));
  const HOP1_BUDGET = Math.max(50, Math.min(500, EDGE_FETCH_BUDGET));
  const HOP2_BUDGET = Math.max(50, Math.min(500, EDGE_FETCH_BUDGET));
  const minEdgeWeight = Math.max(0, Math.min(1, parsed.min_edge_weight ?? 0));
  const minEdgeConf = Math.max(0, Math.min(1, parsed.min_edge_confidence ?? 0));

  const neighborhoodEdges = await timed("stage2_edges", () =>
    client.query<EdgeRow>(
      parsed.neighborhood_hops === 1
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
      parsed.neighborhood_hops === 1
        ? [seedIds, scope, minEdgeWeight, minEdgeConf, HOP1_BUDGET, EDGE_FETCH_BUDGET]
        : [seedIds, scope, minEdgeWeight, minEdgeConf, HOP1_BUDGET, EDGE_FETCH_BUDGET, HOP2_BUDGET],
    ),
  );

  // Derive node ids directly from the edge rows to avoid repeating the neighborhood CTE in a second query.
  const nodeScore = new Map<string, number>();
  const nodeIdSet = new Set<string>(seedIds);
  for (const e of neighborhoodEdges.rows) {
    nodeIdSet.add(e.src_id);
    nodeIdSet.add(e.dst_id);
    const s = e.weight * e.confidence;
    nodeScore.set(e.src_id, (nodeScore.get(e.src_id) ?? 0) + s);
    nodeScore.set(e.dst_id, (nodeScore.get(e.dst_id) ?? 0) + s);
  }

  // Budget node fetch work too; keep seeds, then highest-incident nodes.
  const NODE_FETCH_BUDGET = Math.min(800, Math.max(parsed.max_nodes * 4, parsed.max_nodes));
  let nodeIds = Array.from(nodeIdSet);
  if (nodeIds.length > NODE_FETCH_BUDGET) {
    const scored = nodeIds
      .filter((id) => !seedIds.includes(id))
      .map((id) => ({ id, s: nodeScore.get(id) ?? 0 }))
      .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))
      .map((x) => x.id);
    nodeIds = seedIds.concat(scored.slice(0, Math.max(0, NODE_FETCH_BUDGET - seedIds.length)));
  }

  const wantSlots = parsed.include_slots || parsed.include_slots_preview;
  const neighborhoodNodes = await timed("stage2_nodes", () =>
    client.query<NodeRow>(
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
        ${wantSlots ? "slots," : "NULL::jsonb AS slots,"}
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
      [scope, nodeIds, consumerAgentId, consumerTeamId],
    ),
  );

  const nodeMapAll = new Map<string, NodeRow>();
  for (const n of neighborhoodNodes.rows) nodeMapAll.set(n.id, n);
  // Filter edges to only those with both endpoints present in our node fetch budget.
  const edgesAll: EdgeRow[] = neighborhoodEdges.rows.filter((e) => nodeMapAll.has(e.src_id) && nodeMapAll.has(e.dst_id));

  // Scoring excludes draft topics (they shouldn't influence activation/ranking),
  // but draft topics may still appear in the returned subgraph for explainability.
  const draftTopicIds = new Set(Array.from(nodeMapAll.values()).filter(isDraftTopic).map((n) => n.id));
  const notReadyIds = new Set(Array.from(nodeMapAll.values()).filter((n) => n.embedding_status !== "ready").map((n) => n.id));
  const nodeMapForScoring = new Map(nodeMapAll);
  for (const id of draftTopicIds) nodeMapForScoring.delete(id);
  for (const id of notReadyIds) nodeMapForScoring.delete(id);
  const edgesForScoring = edgesAll.filter((e) => !draftTopicIds.has(e.src_id) && !draftTopicIds.has(e.dst_id));
  const edgesForScoringReady = edgesForScoring.filter((e) => !notReadyIds.has(e.src_id) && !notReadyIds.has(e.dst_id));

  // Score via spreading activation.
  const rankedAll = spreadActivation(seeds, nodeMapForScoring, edgesForScoringReady, parsed.neighborhood_hops);
  const ranked = rankedAll.slice(0, parsed.ranked_limit);

  // Build the returned subgraph under hard caps (contract):
  // - nodes: max_nodes (always)
  // - edges: max_edges (always; schema already caps to 100)
  // Explainability: draft topics never affect scoring, but we may swap a few in so edges aren't "mysteriously missing".
  const seedSet = new Set(seedIds);
  const coreIds: string[] = [];
  for (const id of seedIds) {
    if (coreIds.length >= parsed.max_nodes) break;
    const n = nodeMapAll.get(id);
    if (!n || n.embedding_status !== "ready") continue;
    if (!coreIds.includes(id)) coreIds.push(id);
  }
  for (const r of rankedAll) {
    if (coreIds.length >= parsed.max_nodes) break;
    const n = nodeMapAll.get(r.id);
    if (!n || n.embedding_status !== "ready") continue;
    if (!coreIds.includes(r.id)) coreIds.push(r.id);
  }

  // Score connected draft topics (only via strong edge types) and swap them in for the lowest-priority non-seed nodes.
  const draftScore = new Map<string, number>();
  const coreSet = new Set(coreIds);
  for (const e of edgesAll) {
    if (e.type !== "part_of" && e.type !== "derived_from") continue;
    const aIn = coreSet.has(e.src_id);
    const bIn = coreSet.has(e.dst_id);
    if (!aIn && !bIn) continue;
    const other = aIn ? e.dst_id : e.src_id;
    if (!draftTopicIds.has(other)) continue;
    draftScore.set(other, (draftScore.get(other) ?? 0) + e.weight * e.confidence);
  }

  const DRAFT_BUDGET = Math.min(10, Math.max(0, Math.floor(parsed.max_nodes / 5)));
  const removable: string[] = [];
  for (let i = coreIds.length - 1; i >= 0; i--) {
    const id = coreIds[i];
    if (!seedSet.has(id)) removable.push(id);
  }

  const draftCandidates = Array.from(draftScore.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => {
      if (coreSet.has(id)) return false;
      const n = nodeMapAll.get(id);
      return !!n && n.embedding_status === "ready";
    });

  // Prefer appending draft topics if we have room; otherwise replace the lowest-priority non-seed nodes.
  let draftsToAdd: string[] = [];
  let outIdsOrdered: string[] = [];
  if (coreIds.length < parsed.max_nodes) {
    const room = parsed.max_nodes - coreIds.length;
    draftsToAdd = draftCandidates.slice(0, Math.min(DRAFT_BUDGET, room));
    outIdsOrdered = coreIds.concat(draftsToAdd);
  } else {
    const maxDrafts = Math.min(DRAFT_BUDGET, removable.length);
    draftsToAdd = draftCandidates.slice(0, maxDrafts);
    const toRemove = new Set(removable.slice(0, draftsToAdd.length));
    outIdsOrdered = coreIds.filter((id) => !toRemove.has(id)).concat(draftsToAdd);
  }
  const outIdSet = new Set(outIdsOrdered);

  const outNodeRows = outIdsOrdered.map((id) => nodeMapAll.get(id)).filter(Boolean) as NodeRow[];
  const outEdgeRows = edgesAll
    .filter((e) => outIdSet.has(e.src_id) && outIdSet.has(e.dst_id))
    .sort((a, b) => (b.weight * b.confidence) - (a.weight * a.confidence))
    .slice(0, parsed.max_edges);

  // Fetch rule defs for context building.
  const ruleIds = outNodeRows.filter((n) => n.type === "rule").map((n) => n.id);
  const ruleDefMap = new Map<string, any>();
  if (ruleIds.length) {
    const rr = await timed("rule_defs", () =>
      client.query(
        `SELECT rule_node_id, state::text AS state, rule_scope::text AS rule_scope, target_agent_id, target_team_id, if_json, then_json, exceptions_json, positive_count, negative_count
         FROM memory_rule_defs
         WHERE scope = $1 AND rule_node_id = ANY($2::uuid[])`,
        [scope, ruleIds],
      ),
    );
    for (const row of rr.rows) ruleDefMap.set(row.rule_node_id, row);
  }

  const { text: context_text, items: context_items, citations } = buildContext(rankedAll, nodeMapAll, ruleDefMap, {
    context_token_budget: parsed.context_token_budget,
    context_char_budget: parsed.context_char_budget,
  });

  // DTO serialization (B): stable, minimal by default.
  const outNodes: NodeDTO[] = outNodeRows.map((n) => {
    const dto: NodeDTO = {
      id: n.id,
      type: n.type,
      title: n.title,
      text_summary: n.text_summary,
    };

    if (n.type === "topic") {
      dto.topic_state = n.topic_state;
      dto.member_count = n.member_count;
    }

    if (parsed.include_slots) {
      dto.slots = n.slots ?? null;
    } else if (parsed.include_slots_preview) {
      dto.slots_preview = pickSlotsPreview(n.slots, parsed.slots_preview_keys);
    }

    if (parsed.include_meta) {
      dto.raw_ref = n.raw_ref;
      dto.evidence_ref = n.evidence_ref;
      dto.embedding_status = n.embedding_status;
      dto.embedding_model = n.embedding_model;
      dto.memory_lane = n.memory_lane;
      dto.producer_agent_id = n.producer_agent_id;
      dto.owner_agent_id = n.owner_agent_id;
      dto.owner_team_id = n.owner_team_id;
      dto.created_at = n.created_at;
      dto.updated_at = n.updated_at;
      dto.last_activated = n.last_activated;
      dto.salience = n.salience;
      dto.importance = n.importance;
      dto.confidence = n.confidence;
      dto.commit_id = n.commit_id;
    }

    return dto;
  });

  const outEdges: EdgeDTO[] = outEdgeRows.map((e) => {
    const dto: EdgeDTO = {
      from_id: e.src_id,
      to_id: e.dst_id,
      type: e.type,
      weight: e.weight,
    };
    if (parsed.include_meta) {
      dto.commit_id = e.commit_id;
    }
    return dto;
  });

  // Debug-only: include a *bounded* embedding preview for seed nodes.
  // Hard constraints:
  // - max 5 nodes
  // - preview first 16 dims only
  // - include sha256 of full vector string for integrity checks
  let embedding_debug: any = undefined;
  if (parsed.return_debug && parsed.include_embeddings) {
    const MAX_EMBED_NODES = 5;
    const PREVIEW_DIMS = 16;
    const ids = seedIds.slice(0, MAX_EMBED_NODES);
    const er = await timed("debug_embeddings", () =>
      client.query<{ id: string; embedding_text: string }>(
        `SELECT id, embedding::text AS embedding_text
         FROM memory_nodes
         WHERE scope = $1 AND id = ANY($2::uuid[]) AND embedding IS NOT NULL`,
        [scope, ids],
      ),
    );
    embedding_debug = er.rows.map((row) => {
      let parsedVec: { dims: number; preview: number[] };
      try {
        parsedVec = parseVectorText(row.embedding_text, PREVIEW_DIMS);
      } catch (e: any) {
        badRequest("debug_embeddings_parse_error", "failed to parse embedding vector text", {
          node_id: row.id,
          message: String(e?.message ?? e),
        });
      }
      return {
        node_id: row.id,
        dims: parsedVec.dims,
        sha256: sha256Hex(row.embedding_text),
        preview: parsedVec.preview,
      };
    });

    const MAX_DEBUG_BYTES = 64 * 1024;
    const debugBytes = Buffer.byteLength(JSON.stringify(embedding_debug), "utf8");
    if (debugBytes > MAX_DEBUG_BYTES) {
      badRequest("debug_embeddings_too_large", `debug embeddings exceed max_debug_bytes (${MAX_DEBUG_BYTES})`);
    }
  }

  await timed("audit_insert", async () => {
    try {
      await client.query(
        `
        INSERT INTO memory_recall_audit
          (scope, endpoint, consumer_agent_id, consumer_team_id, query_sha256, seed_count, node_count, edge_count)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          scope,
          endpoint,
          consumerAgentId,
          consumerTeamId,
          sha256Hex(toVectorLiteral(parsed.query_embedding)),
          seeds.length,
          outNodes.length,
          outEdges.length,
        ],
      );
    } catch {
      // Best-effort audit; do not block recall path.
    }
  });

  return {
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    seeds,
    subgraph: { nodes: outNodes, edges: outEdges },
    ranked,
    context: { text: context_text, items: context_items, citations },
    ...(parsed.return_debug
      ? { debug: { neighborhood_counts: { nodes: nodeMapAll.size, edges: edgesAll.length }, embeddings: embedding_debug } }
      : {}),
  };
}

export async function memoryRecall(
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  auth: RecallAuth,
) {
  const parsed = MemoryRecallRequest.parse(body);
  return memoryRecallParsed(client, parsed, defaultScope, defaultTenantId, auth);
}
