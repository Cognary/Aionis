import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { toVectorLiteral } from "../util/pgvector.js";
import type {
  RecallAuditInsertParams,
  RecallCandidate,
  RecallDebugEmbeddingRow,
  RecallEdgeRow,
  RecallNodeRow,
  RecallRuleDefRow,
  RecallStage1Params,
  RecallStage2EdgesParams,
  RecallStage2NodesParams,
  RecallStoreAccess,
  RecallStoreCapabilities,
} from "./recall-access.js";
import { RECALL_STORE_ACCESS_CAPABILITY_VERSION } from "./recall-access.js";
import { createSqliteDatabase } from "./sqlite-compat.js";

type LiteRecallNodeRow = {
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
  slots_json: string;
  raw_ref: string | null;
  evidence_ref: string | null;
  embedding_vector_json: string | null;
  embedding_model: string | null;
  embedding_status: string;
  salience: number;
  importance: number;
  confidence: number;
  created_at: string;
  commit_id: string | null;
};

type LiteRecallEdgeSourceRow = {
  id: string;
  scope: string;
  type: string;
  src_id: string;
  dst_id: string;
  weight: number;
  confidence: number;
  decay_rate: number;
  created_at: string;
  commit_id: string | null;
};

type LiteRecallRuleRow = {
  rule_node_id: string;
  state: string;
  rule_scope: string;
  target_agent_id: string | null;
  target_team_id: string | null;
  if_json: string;
  then_json: string;
  exceptions_json: string;
};

type LiteRecallAuditRow = RecallAuditInsertParams & {
  created_at: string;
};

export type LiteRecallStore = {
  createRecallAccess(): RecallStoreAccess;
  close(): Promise<void>;
  healthSnapshot(): { path: string; mode: "sqlite_recall_v1" };
};

function resolveRecallCapabilities(partial?: Partial<RecallStoreCapabilities>): RecallStoreCapabilities {
  return {
    debug_embeddings: partial?.debug_embeddings ?? true,
    audit_insert: partial?.audit_insert ?? true,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseEmbedding(raw: string | null | undefined): number[] | null {
  const parsed = parseJsonArray(raw);
  if (parsed.length === 0) return null;
  const numbers = parsed.map((v) => Number(v));
  if (numbers.some((v) => !Number.isFinite(v))) return null;
  return numbers;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 1;
  const similarity = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return 1 - similarity;
}

function candidateVisible(
  n: Pick<LiteRecallNodeRow, "memory_lane" | "owner_agent_id" | "owner_team_id">,
  consumerAgentId: string | null,
  consumerTeamId: string | null,
): boolean {
  return n.memory_lane === "shared"
    || (n.memory_lane === "private" && n.owner_agent_id === consumerAgentId)
    || (!!consumerTeamId && n.memory_lane === "private" && n.owner_team_id === consumerTeamId);
}

function edgeSortDesc(a: LiteRecallEdgeSourceRow, b: LiteRecallEdgeSourceRow): number {
  return (b.weight - a.weight)
    || (b.confidence - a.confidence)
    || a.id.localeCompare(b.id);
}

function edgeToRecallRow(e: LiteRecallEdgeSourceRow): RecallEdgeRow {
  return {
    id: e.id,
    scope: e.scope,
    type: e.type,
    src_id: e.src_id,
    dst_id: e.dst_id,
    weight: e.weight,
    confidence: e.confidence,
    decay_rate: e.decay_rate,
    last_activated: null,
    created_at: e.created_at,
    commit_id: e.commit_id,
  };
}

function nodeToRecallRow(row: LiteRecallNodeRow, includeSlots: boolean): RecallNodeRow {
  const slots = parseJsonObject(row.slots_json);
  const topicState = row.type === "topic" ? String(slots.topic_state ?? "active") : null;
  const memberCountRaw = row.type === "topic" ? Number(slots.member_count ?? Number.NaN) : Number.NaN;
  return {
    id: row.id,
    scope: row.scope,
    type: row.type,
    tier: row.tier,
    memory_lane: row.memory_lane,
    producer_agent_id: row.producer_agent_id,
    owner_agent_id: row.owner_agent_id,
    owner_team_id: row.owner_team_id,
    title: row.title,
    text_summary: row.text_summary,
    slots: includeSlots ? slots : null,
    embedding_status: row.embedding_status,
    embedding_model: row.embedding_model,
    topic_state: topicState,
    member_count: Number.isFinite(memberCountRaw) ? memberCountRaw : null,
    raw_ref: row.raw_ref,
    evidence_ref: row.evidence_ref,
    salience: row.salience,
    importance: row.importance,
    confidence: row.confidence,
    last_activated: null,
    created_at: row.created_at,
    updated_at: row.created_at,
    commit_id: row.commit_id,
  };
}

export function createLiteRecallStore(
  path: string,
  opts: { capabilities?: Partial<RecallStoreCapabilities> } = {},
): LiteRecallStore {
  mkdirSync(dirname(path), { recursive: true });
  const db = createSqliteDatabase(path);
  const capabilities = resolveRecallCapabilities(opts.capabilities);

  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS lite_memory_recall_audit (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      consumer_agent_id TEXT,
      consumer_team_id TEXT,
      query_sha256 TEXT NOT NULL,
      seed_count INTEGER NOT NULL,
      node_count INTEGER NOT NULL,
      edge_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lite_memory_recall_audit_scope_created
      ON lite_memory_recall_audit(scope, created_at);
  `);

  const stage1Candidates = async (params: RecallStage1Params): Promise<RecallCandidate[]> => {
    const rows = db.prepare(`
      SELECT
        id,
        scope,
        type,
        tier,
        memory_lane,
        producer_agent_id,
        owner_agent_id,
        owner_team_id,
        title,
        text_summary,
        slots_json,
        raw_ref,
        evidence_ref,
        embedding_vector_json,
        embedding_model,
        embedding_status,
        salience,
        importance,
        confidence,
        created_at,
        commit_id
      FROM lite_memory_nodes
      WHERE scope = ?
        AND tier IN ('hot', 'warm')
        AND embedding_status = 'ready'
        AND embedding_vector_json IS NOT NULL
    `).all(params.scope) as LiteRecallNodeRow[];

    const ranked: Array<{ row: LiteRecallNodeRow; distance: number }> = [];
    for (const row of rows) {
      const embedding = parseEmbedding(row.embedding_vector_json);
      if (!embedding) continue;
      if (!candidateVisible(row, params.consumerAgentId, params.consumerTeamId)) continue;
      ranked.push({ row, distance: cosineDistance(embedding, params.queryEmbedding) });
    }

    ranked.sort((a, b) => a.distance - b.distance || a.row.id.localeCompare(b.row.id));
    const knn = ranked.slice(0, Math.max(0, params.oversample));
    const out: RecallCandidate[] = [];
    for (const item of knn) {
      const row = item.row;
      if (!["event", "topic", "concept", "entity", "rule"].includes(row.type)) continue;
      const slots = parseJsonObject(row.slots_json);
      if ((row.type === "event" || row.type === "evidence")
        && String(slots.replay_learning_episode ?? "false") === "true"
        && String(slots.lifecycle_state ?? "active") === "archived") {
        continue;
      }
      if (row.type === "topic" && String(slots.topic_state ?? "active") !== "active") {
        continue;
      }
      if (row.type === "rule") {
        const def = db.prepare(`
          SELECT state
          FROM lite_memory_rule_defs
          WHERE scope = ? AND rule_node_id = ?
          LIMIT 1
        `).get(params.scope, row.id) as { state: string } | undefined;
        if (!def || (def.state !== "shadow" && def.state !== "active")) continue;
      }
      out.push({
        id: row.id,
        type: row.type,
        title: row.title,
        text_summary: row.text_summary,
        tier: row.tier,
        salience: row.salience,
        confidence: row.confidence,
        similarity: 1 - item.distance,
      });
      if (out.length >= params.limit) break;
    }
    return out;
  };

  return {
    createRecallAccess(): RecallStoreAccess {
      return {
        capability_version: RECALL_STORE_ACCESS_CAPABILITY_VERSION,
        capabilities,
        stage1CandidatesAnn: stage1Candidates,
        stage1CandidatesExactFallback: stage1Candidates,
        async stage2Edges(params: RecallStage2EdgesParams): Promise<RecallEdgeRow[]> {
          const rows = db.prepare(`
            SELECT id, scope, type, src_id, dst_id, weight, confidence, decay_rate, created_at, commit_id
            FROM lite_memory_edges
            WHERE scope = ?
              AND weight >= ?
              AND confidence >= ?
          `).all(params.scope, params.minEdgeWeight, params.minEdgeConfidence) as LiteRecallEdgeSourceRow[];

          const selectHop = (ids: Set<string>, budget: number): LiteRecallEdgeSourceRow[] => {
            const fromSrc = rows.filter((e) => ids.has(e.src_id)).sort(edgeSortDesc).slice(0, budget);
            const fromDst = rows.filter((e) => ids.has(e.dst_id)).sort(edgeSortDesc).slice(0, budget);
            const merged = new Map<string, LiteRecallEdgeSourceRow>();
            for (const edge of fromSrc.concat(fromDst)) merged.set(edge.id, edge);
            return Array.from(merged.values()).sort(edgeSortDesc);
          };

          const seedSet = new Set(params.seedIds);
          if (params.neighborhoodHops === 1) {
            return selectHop(seedSet, params.hop1Budget).slice(0, params.edgeFetchBudget).map(edgeToRecallRow);
          }

          const hop1 = selectHop(seedSet, params.hop1Budget);
          const hopNodes = new Set<string>(params.seedIds);
          for (const edge of hop1) {
            hopNodes.add(edge.src_id);
            hopNodes.add(edge.dst_id);
          }
          return selectHop(hopNodes, params.hop2Budget).slice(0, params.edgeFetchBudget).map(edgeToRecallRow);
        },
        async stage2Nodes(params: RecallStage2NodesParams): Promise<RecallNodeRow[]> {
          if (params.nodeIds.length === 0) return [];
          const rows = db.prepare(`
            SELECT
              id,
              scope,
              type,
              tier,
              memory_lane,
              producer_agent_id,
              owner_agent_id,
              owner_team_id,
              title,
              text_summary,
              slots_json,
              raw_ref,
              evidence_ref,
              embedding_vector_json,
              embedding_model,
              embedding_status,
              salience,
              importance,
              confidence,
              created_at,
              commit_id
            FROM lite_memory_nodes
            WHERE scope = ?
              AND id IN (${placeholders(params.nodeIds.length)})
          `).all(params.scope, ...params.nodeIds) as LiteRecallNodeRow[];
          return rows
            .filter((row) => candidateVisible(row, params.consumerAgentId, params.consumerTeamId))
            .map((row) => nodeToRecallRow(row, params.includeSlots));
        },
        async ruleDefs(scope: string, ruleIds: string[]): Promise<RecallRuleDefRow[]> {
          if (ruleIds.length === 0) return [];
          const rows = db.prepare(`
            SELECT rule_node_id, state, rule_scope, target_agent_id, target_team_id, if_json, then_json, exceptions_json
            FROM lite_memory_rule_defs
            WHERE scope = ?
              AND rule_node_id IN (${placeholders(ruleIds.length)})
          `).all(scope, ...ruleIds) as LiteRecallRuleRow[];
          return rows.map((row) => ({
            rule_node_id: row.rule_node_id,
            state: row.state,
            rule_scope: row.rule_scope,
            target_agent_id: row.target_agent_id,
            target_team_id: row.target_team_id,
            if_json: parseJsonObject(row.if_json),
            then_json: parseJsonObject(row.then_json),
            exceptions_json: parseJsonArray(row.exceptions_json),
            positive_count: 0,
            negative_count: 0,
          }));
        },
        async debugEmbeddings(scope: string, ids: string[]): Promise<RecallDebugEmbeddingRow[]> {
          if (!capabilities.debug_embeddings) {
            throw new Error("recall capability unsupported: debug_embeddings");
          }
          if (ids.length === 0) return [];
          const rows = db.prepare(`
            SELECT id, embedding_vector_json
            FROM lite_memory_nodes
            WHERE scope = ?
              AND id IN (${placeholders(ids.length)})
              AND embedding_vector_json IS NOT NULL
          `).all(scope, ...ids) as Array<{ id: string; embedding_vector_json: string | null }>;
          return rows
            .map((row) => ({ id: row.id, embedding: parseEmbedding(row.embedding_vector_json) }))
            .filter((row) => !!row.embedding)
            .map((row) => ({
              id: row.id,
              embedding_text: toVectorLiteral(row.embedding as number[]),
            }));
        },
        async insertRecallAudit(params: RecallAuditInsertParams): Promise<void> {
          if (!capabilities.audit_insert) {
            throw new Error("recall capability unsupported: audit_insert");
          }
          const row: LiteRecallAuditRow = { ...params, created_at: nowIso() };
          db.prepare(`
            INSERT INTO lite_memory_recall_audit
              (scope, endpoint, consumer_agent_id, consumer_team_id, query_sha256, seed_count, node_count, edge_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            row.scope,
            row.endpoint,
            row.consumerAgentId,
            row.consumerTeamId,
            row.querySha256,
            row.seedCount,
            row.nodeCount,
            row.edgeCount,
            row.created_at,
          );
        },
      };
    },

    async close(): Promise<void> {
      db.close();
    },

    healthSnapshot() {
      return { path, mode: "sqlite_recall_v1" as const };
    },
  };
}
