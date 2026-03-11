import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { stableUuid } from "../util/uuid.js";
import type {
  WriteCommitInsertArgs,
  WriteEdgeUpsertArgs,
  WriteNodeInsertArgs,
  WriteOutboxInsertArgs,
  WriteRuleDefInsertArgs,
  WriteShadowMirrorCopied,
  WriteStoreAccess,
} from "./write-access.js";
import { WRITE_STORE_ACCESS_CAPABILITY_VERSION } from "./write-access.js";

type LiteSessionNodeView = {
  id: string;
  title: string | null;
  text_summary: string | null;
  memory_lane: "private" | "shared";
  owner_agent_id: string | null;
  owner_team_id: string | null;
};

type LiteSessionEventView = {
  id: string;
  client_id: string | null;
  type: string;
  title: string | null;
  text_summary: string | null;
  slots: Record<string, unknown>;
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  embedding_status: string;
  embedding_model: string | null;
  raw_ref: string | null;
  evidence_ref: string | null;
  salience: number;
  importance: number;
  confidence: number;
  last_activated: null;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
  edge_weight: number;
  edge_confidence: number;
};

export type LiteWriteStore = WriteStoreAccess & {
  withTx<T>(fn: () => Promise<T>): Promise<T>;
  findLatestNodeByClientId(
    scope: string,
    type: string,
    clientId: string,
  ): Promise<LiteSessionNodeView | null>;
  listSessionEvents(args: {
    scope: string;
    sessionClientId: string;
    consumerAgentId: string | null;
    consumerTeamId: string | null;
    limit: number;
    offset: number;
  }): Promise<{
    session: LiteSessionNodeView | null;
    events: LiteSessionEventView[];
    has_more: boolean;
  }>;
  close(): Promise<void>;
  healthSnapshot(): { path: string; mode: "sqlite_write_v1" };
};

function nowIso(): string {
  return new Date().toISOString();
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

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function nodeVisible(
  row: { memory_lane: "private" | "shared"; owner_agent_id: string | null; owner_team_id: string | null },
  consumerAgentId: string | null,
  consumerTeamId: string | null,
): boolean {
  return row.memory_lane === "shared"
    || (!!consumerAgentId && row.memory_lane === "private" && row.owner_agent_id === consumerAgentId)
    || (!!consumerTeamId && row.memory_lane === "private" && row.owner_team_id === consumerTeamId);
}

export function createLiteWriteStore(path: string): LiteWriteStore {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  let txDepth = 0;
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS lite_memory_commits (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      parent_commit_id TEXT,
      input_sha256 TEXT NOT NULL,
      diff_json TEXT NOT NULL,
      actor TEXT NOT NULL,
      model_version TEXT,
      prompt_version TEXT,
      commit_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lite_memory_nodes (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      client_id TEXT,
      type TEXT NOT NULL,
      tier TEXT NOT NULL,
      title TEXT,
      text_summary TEXT,
      slots_json TEXT NOT NULL,
      raw_ref TEXT,
      evidence_ref TEXT,
      embedding_vector_json TEXT,
      embedding_model TEXT,
      memory_lane TEXT NOT NULL,
      producer_agent_id TEXT,
      owner_agent_id TEXT,
      owner_team_id TEXT,
      embedding_status TEXT NOT NULL,
      embedding_last_error TEXT,
      salience REAL NOT NULL,
      importance REAL NOT NULL,
      confidence REAL NOT NULL,
      redaction_version INTEGER NOT NULL,
      commit_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lite_memory_nodes_scope ON lite_memory_nodes(scope);
    CREATE INDEX IF NOT EXISTS idx_lite_memory_nodes_scope_commit ON lite_memory_nodes(scope, commit_id);
    CREATE INDEX IF NOT EXISTS idx_lite_memory_nodes_scope_status ON lite_memory_nodes(scope, embedding_status);

    CREATE TABLE IF NOT EXISTS lite_memory_rule_defs (
      rule_node_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      state TEXT NOT NULL,
      if_json TEXT NOT NULL,
      then_json TEXT NOT NULL,
      exceptions_json TEXT NOT NULL,
      rule_scope TEXT NOT NULL,
      target_agent_id TEXT,
      target_team_id TEXT,
      commit_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lite_memory_edges (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      type TEXT NOT NULL,
      src_id TEXT NOT NULL,
      dst_id TEXT NOT NULL,
      weight REAL NOT NULL,
      confidence REAL NOT NULL,
      decay_rate REAL NOT NULL,
      commit_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(scope, type, src_id, dst_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lite_memory_edges_scope ON lite_memory_edges(scope);
    CREATE INDEX IF NOT EXISTS idx_lite_memory_edges_scope_commit ON lite_memory_edges(scope, commit_id);

    CREATE TABLE IF NOT EXISTS lite_memory_outbox (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      commit_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      job_key TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(scope, event_type, job_key)
    );
    CREATE INDEX IF NOT EXISTS idx_lite_memory_outbox_scope_commit ON lite_memory_outbox(scope, commit_id);
  `);

  return {
    capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
    capabilities: { shadow_mirror_v2: false },

    async withTx<T>(fn: () => Promise<T>): Promise<T> {
      if (txDepth > 0) {
        return await fn();
      }
      db.exec("BEGIN IMMEDIATE");
      txDepth += 1;
      try {
        const out = await fn();
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      } finally {
        txDepth -= 1;
      }
    },

    async findLatestNodeByClientId(scope: string, type: string, clientId: string): Promise<LiteSessionNodeView | null> {
      const row = db.prepare(
        `SELECT id, title, text_summary, memory_lane, owner_agent_id, owner_team_id
         FROM lite_memory_nodes
         WHERE scope = ? AND type = ? AND client_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      ).get(scope, type, clientId) as LiteSessionNodeView | undefined;
      return row ?? null;
    },

    async listSessionEvents(args): Promise<{ session: LiteSessionNodeView | null; events: LiteSessionEventView[]; has_more: boolean }> {
      const session = await this.findLatestNodeByClientId(args.scope, "topic", args.sessionClientId);
      if (!session || !nodeVisible(session, args.consumerAgentId, args.consumerTeamId)) {
        return { session: null, events: [], has_more: false };
      }

      const rows = db.prepare(
        `SELECT
           n.id,
           n.client_id,
           n.type,
           n.title,
           n.text_summary,
           n.slots_json,
           n.memory_lane,
           n.producer_agent_id,
           n.owner_agent_id,
           n.owner_team_id,
           n.embedding_status,
           n.embedding_model,
           n.raw_ref,
           n.evidence_ref,
           n.salience,
           n.importance,
           n.confidence,
           n.created_at,
           n.commit_id,
           e.weight AS edge_weight,
           e.confidence AS edge_confidence
         FROM lite_memory_edges e
         JOIN lite_memory_nodes n ON n.id = e.src_id AND n.scope = e.scope
         WHERE e.scope = ?
           AND e.type = 'part_of'
           AND e.dst_id = ?
         ORDER BY n.created_at DESC, n.id DESC`,
      ).all(args.scope, session.id) as Array<{
        id: string;
        client_id: string | null;
        type: string;
        title: string | null;
        text_summary: string | null;
        slots_json: string;
        memory_lane: "private" | "shared";
        producer_agent_id: string | null;
        owner_agent_id: string | null;
        owner_team_id: string | null;
        embedding_status: string;
        embedding_model: string | null;
        raw_ref: string | null;
        evidence_ref: string | null;
        salience: number;
        importance: number;
        confidence: number;
        created_at: string;
        commit_id: string | null;
        edge_weight: number;
        edge_confidence: number;
      }>;
      const visible = rows.filter((row) => nodeVisible(row, args.consumerAgentId, args.consumerTeamId));
      const slice = visible.slice(args.offset, args.offset + args.limit + 1);
      const hasMore = slice.length > args.limit;
      const chosen = hasMore ? slice.slice(0, args.limit) : slice;
      return {
        session,
        events: chosen.map((row) => ({
          id: row.id,
          client_id: row.client_id,
          type: row.type,
          title: row.title,
          text_summary: row.text_summary,
          slots: parseJsonObject(row.slots_json),
          memory_lane: row.memory_lane,
          producer_agent_id: row.producer_agent_id,
          owner_agent_id: row.owner_agent_id,
          owner_team_id: row.owner_team_id,
          embedding_status: row.embedding_status,
          embedding_model: row.embedding_model,
          raw_ref: row.raw_ref,
          evidence_ref: row.evidence_ref,
          salience: row.salience,
          importance: row.importance,
          confidence: row.confidence,
          last_activated: null,
          created_at: row.created_at,
          updated_at: row.created_at,
          commit_id: row.commit_id,
          edge_weight: row.edge_weight,
          edge_confidence: row.edge_confidence,
        })),
        has_more: hasMore,
      };
    },

    async nodeScopesByIds(ids: string[]): Promise<Map<string, string>> {
      if (ids.length === 0) return new Map();
      const sql = `SELECT id, scope FROM lite_memory_nodes WHERE id IN (${ids.map(() => "?").join(",")})`;
      const rows = db.prepare(sql).all(...ids) as Array<{ id: string; scope: string }>;
      return new Map(rows.map((row) => [row.id, row.scope]));
    },

    async parentCommitHash(scope: string, parentCommitId: string): Promise<string | null> {
      const row = db.prepare(
        `SELECT commit_hash FROM lite_memory_commits WHERE scope = ? AND id = ? LIMIT 1`,
      ).get(scope, parentCommitId) as { commit_hash: string } | undefined;
      return row?.commit_hash ?? null;
    },

    async insertCommit(args: WriteCommitInsertArgs): Promise<string> {
      const existing = db.prepare(
        `SELECT id FROM lite_memory_commits WHERE commit_hash = ? LIMIT 1`,
      ).get(args.commitHash) as { id: string } | undefined;
      if (existing?.id) return existing.id;
      const id = stableUuid(`lite:commit:${args.commitHash}`);
      db.prepare(
        `INSERT OR IGNORE INTO lite_memory_commits
          (id, scope, parent_commit_id, input_sha256, diff_json, actor, model_version, prompt_version, commit_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        args.scope,
        args.parentCommitId,
        args.inputSha256,
        args.diffJson,
        args.actor,
        args.modelVersion,
        args.promptVersion,
        args.commitHash,
        nowIso(),
      );
      return id;
    },

    async insertNode(args: WriteNodeInsertArgs): Promise<void> {
      db.prepare(
        `INSERT OR IGNORE INTO lite_memory_nodes
          (id, scope, client_id, type, tier, title, text_summary, slots_json, raw_ref, evidence_ref,
           embedding_vector_json, embedding_model, memory_lane, producer_agent_id, owner_agent_id, owner_team_id,
           embedding_status, embedding_last_error, salience, importance, confidence, redaction_version, commit_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        args.id,
        args.scope,
        args.clientId,
        args.type,
        args.tier,
        args.title,
        args.textSummary,
        args.slotsJson,
        args.rawRef,
        args.evidenceRef,
        args.embeddingVector,
        args.embeddingModel,
        args.memoryLane,
        args.producerAgentId,
        args.ownerAgentId,
        args.ownerTeamId,
        args.embeddingStatus,
        args.embeddingLastError,
        args.salience,
        args.importance,
        args.confidence,
        args.redactionVersion,
        args.commitId,
        nowIso(),
      );
    },

    async insertRuleDef(args: WriteRuleDefInsertArgs): Promise<void> {
      db.prepare(
        `INSERT OR IGNORE INTO lite_memory_rule_defs
          (rule_node_id, scope, state, if_json, then_json, exceptions_json, rule_scope, target_agent_id, target_team_id, commit_id, created_at)
         VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        args.ruleNodeId,
        args.scope,
        args.ifJson,
        args.thenJson,
        args.exceptionsJson,
        args.ruleScope,
        args.targetAgentId,
        args.targetTeamId,
        args.commitId,
        nowIso(),
      );
    },

    async upsertEdge(args: WriteEdgeUpsertArgs): Promise<void> {
      db.prepare(
        `INSERT INTO lite_memory_edges
          (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope, type, src_id, dst_id) DO UPDATE SET
           weight = MAX(lite_memory_edges.weight, excluded.weight),
           confidence = MAX(lite_memory_edges.confidence, excluded.confidence),
           commit_id = excluded.commit_id`,
      ).run(
        args.id,
        args.scope,
        args.type,
        args.srcId,
        args.dstId,
        args.weight,
        args.confidence,
        args.decayRate,
        args.commitId,
        nowIso(),
      );
    },

    async readyEmbeddingNodeIds(scope: string, ids: string[]): Promise<Set<string>> {
      if (ids.length === 0) return new Set();
      const sql = `
        SELECT id
        FROM lite_memory_nodes
        WHERE scope = ?
          AND id IN (${ids.map(() => "?").join(",")})
          AND embedding_status = 'ready'
          AND embedding_vector_json IS NOT NULL
      `;
      const rows = db.prepare(sql).all(scope, ...ids) as Array<{ id: string }>;
      return new Set(rows.map((row) => row.id));
    },

    async insertOutboxEvent(args: WriteOutboxInsertArgs): Promise<void> {
      db.prepare(
        `INSERT OR IGNORE INTO lite_memory_outbox
          (scope, commit_id, event_type, job_key, payload_sha256, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        args.scope,
        args.commitId,
        args.eventType,
        args.jobKey,
        args.payloadSha256,
        args.payloadJson,
        nowIso(),
      );
    },

    async appendAfterTopicClusterEventIds(scope: string, commitId: string, eventIdsJson: string): Promise<void> {
      let nextIds: unknown[] = [];
      try {
        const parsed = JSON.parse(eventIdsJson);
        nextIds = Array.isArray(parsed) ? parsed : [];
      } catch {
        nextIds = [];
      }
      const rows = db.prepare(
        `SELECT row_id, payload_json
         FROM lite_memory_outbox
         WHERE scope = ? AND commit_id = ? AND event_type = 'embed_nodes'`,
      ).all(scope, commitId) as Array<{ row_id: number; payload_json: string }>;
      for (const row of rows) {
        const payload = parseJsonObject(row.payload_json);
        const current = Array.isArray(payload.after_topic_cluster_event_ids) ? payload.after_topic_cluster_event_ids : [];
        const merged = [...new Set([...current, ...nextIds])];
        payload.after_topic_cluster_event_ids = merged;
        db.prepare(
          `UPDATE lite_memory_outbox SET payload_json = ? WHERE row_id = ?`,
        ).run(stringifyJson(payload), row.row_id);
      }
    },

    async mirrorCommitArtifactsToShadowV2(_scope: string, _commitId: string): Promise<WriteShadowMirrorCopied> {
      throw new Error("write capability unsupported: shadow_mirror_v2");
    },

    async close(): Promise<void> {
      db.close();
    },

    healthSnapshot() {
      return { path, mode: "sqlite_write_v1" as const };
    },
  };
}
