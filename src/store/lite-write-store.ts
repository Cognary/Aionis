import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AssociationCandidateRecord,
  ListAssociationCandidatesForSourceArgs,
  MarkAssociationCandidatePromotedArgs,
  UpdateAssociationCandidateStatusArgs,
  UpsertAssociationCandidateArgs,
} from "../memory/associative-candidate-store.js";
import { stableUuid } from "../util/uuid.js";
import { assertDim } from "../util/pgvector.js";
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
import { createSqliteDatabase, type SqliteDatabase } from "./sqlite-compat.js";

type LiteSessionNodeView = {
  id: string;
  client_id: string | null;
  title: string | null;
  text_summary: string | null;
  memory_lane: "private" | "shared";
  owner_agent_id: string | null;
  owner_team_id: string | null;
  created_at: string;
  updated_at: string;
};

type LiteSessionListView = LiteSessionNodeView & {
  last_event_at: string | null;
  event_count: number;
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

type LitePackSnapshotNodeView = {
  id: string;
  client_id: string | null;
  type: string;
  tier: string;
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  title: string | null;
  text_summary: string | null;
  slots: Record<string, unknown>;
  raw_ref: string | null;
  evidence_ref: string | null;
  salience: number;
  importance: number;
  confidence: number;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
};

type LitePackSnapshotEdgeView = {
  id: string;
  type: string;
  src_id: string;
  dst_id: string;
  src_client_id: string | null;
  dst_client_id: string | null;
  weight: number;
  confidence: number;
  decay_rate: number;
  created_at: string;
  commit_id: string | null;
};

type LitePackSnapshotCommitView = {
  id: string;
  parent_id: string | null;
  input_sha256: string;
  actor: string;
  model_version: string | null;
  prompt_version: string | null;
  created_at: string;
  commit_hash: string;
};

export type LiteFindNodeRow = {
  id: string;
  type: string;
  client_id: string | null;
  title: string | null;
  text_summary: string | null;
  slots: Record<string, unknown>;
  tier: string;
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  embedding_status: string | null;
  embedding_model: string | null;
  raw_ref: string | null;
  evidence_ref: string | null;
  salience: number;
  importance: number;
  confidence: number;
  last_activated: string | null;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
  topic_state: string | null;
  member_count: number | null;
};

export type LiteResolveNodeRow = LiteFindNodeRow & {
  commit_scope: string | null;
};

export type LiteResolveEdgeRow = {
  id: string;
  type: string;
  src_id: string;
  src_type: string;
  dst_id: string;
  dst_type: string;
  weight: number;
  confidence: number;
  decay_rate: number;
  last_activated: string | null;
  created_at: string;
  commit_id: string | null;
  commit_scope: string | null;
};

export type LiteResolveCommitRow = {
  id: string;
  parent_id: string | null;
  input_sha256: string;
  diff_json: unknown;
  actor: string;
  model_version: string | null;
  prompt_version: string | null;
  commit_hash: string;
  created_at: string;
  node_count: number;
  edge_count: number;
  decision_count: number;
};

export type LiteRuleCandidateRow = {
  rule_node_id: string;
  state: "draft" | "shadow" | "active" | "disabled";
  rule_scope: "global" | "team" | "agent";
  target_agent_id: string | null;
  target_team_id: string | null;
  rule_memory_lane: "private" | "shared";
  rule_owner_agent_id: string | null;
  rule_owner_team_id: string | null;
  if_json: Record<string, unknown>;
  then_json: Record<string, unknown>;
  exceptions_json: unknown[];
  positive_count: number;
  negative_count: number;
  rule_commit_id: string;
  rule_summary: string | null;
  rule_slots: Record<string, unknown>;
  updated_at: string;
};

export type LiteRuleDefSyncRow = {
  scope: string;
  rule_node_id: string;
  state: "draft" | "shadow" | "active" | "disabled";
  rule_scope: "global" | "team" | "agent";
  target_agent_id: string | null;
  target_team_id: string | null;
  if_json: Record<string, unknown>;
  then_json: Record<string, unknown>;
  exceptions_json: unknown[];
  positive_count: number;
  negative_count: number;
  commit_id: string | null;
  updated_at: string;
};

export type LiteExecutionDecisionRow = {
  id: string;
  scope: string;
  decision_kind: "tools_select";
  run_id: string | null;
  selected_tool: string | null;
  candidates_json: unknown[];
  context_sha256: string;
  policy_sha256: string;
  source_rule_ids: string[];
  metadata_json: Record<string, unknown>;
  created_at: string;
  commit_id: string | null;
};

export type LiteResolveDecisionRow = LiteExecutionDecisionRow & {
  commit_scope: string | null;
};

export type LiteRuleFeedbackRow = {
  id: string;
  scope: string;
  rule_node_id: string;
  run_id: string | null;
  outcome: "positive" | "negative" | "neutral";
  note: string | null;
  source: "rule_feedback" | "tools_feedback";
  decision_id: string | null;
  commit_id: string | null;
  created_at: string;
};

export type LiteWriteStore = WriteStoreAccess & {
  withTx<T>(fn: () => Promise<T>): Promise<T>;
  findNodes(args: {
    scope: string;
    id?: string | null;
    type?: string | null;
    clientId?: string | null;
    titleContains?: string | null;
    textContains?: string | null;
    memoryLane?: "private" | "shared" | null;
    slotsContains?: Record<string, unknown> | null;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: LiteFindNodeRow[]; has_more: boolean }>;
  findLatestNodeByClientId(
    scope: string,
    type: string,
    clientId: string,
  ): Promise<LiteSessionNodeView | null>;
  resolveNode(args: {
    scope: string;
    id: string;
    type: string;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
  }): Promise<LiteResolveNodeRow | null>;
  resolveEdge(args: {
    scope: string;
    id: string;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
  }): Promise<LiteResolveEdgeRow | null>;
  resolveCommit(args: {
    scope: string;
    id: string;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
  }): Promise<LiteResolveCommitRow | null>;
  resolveDecision(args: {
    scope: string;
    id: string;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
  }): Promise<LiteResolveDecisionRow | null>;
  listRuleCandidates(args: {
    scope: string;
    limit: number;
    states?: Array<"shadow" | "active">;
  }): Promise<LiteRuleCandidateRow[]>;
  getRuleDef(scope: string, ruleNodeId: string): Promise<LiteRuleDefSyncRow | null>;
  upsertRuleState(args: {
    scope: string;
    ruleNodeId: string;
    state: "draft" | "shadow" | "active" | "disabled";
    ifJson: Record<string, unknown>;
    thenJson: Record<string, unknown>;
    exceptionsJson: unknown[];
    ruleScope: "global" | "team" | "agent";
    targetAgentId: string | null;
    targetTeamId: string | null;
    positiveCount: number;
    negativeCount: number;
    commitId: string | null;
  }): Promise<LiteRuleDefSyncRow>;
  insertExecutionDecision(args: {
    id: string;
    scope: string;
    decisionKind: "tools_select";
    runId: string | null;
    selectedTool: string | null;
    candidatesJson: unknown[];
    contextSha256: string;
    policySha256: string;
    sourceRuleIds: string[];
    metadataJson: Record<string, unknown>;
    commitId: string | null;
  }): Promise<{ id: string; created_at: string }>;
  getExecutionDecision(args: {
    scope: string;
    id?: string | null;
    runId?: string | null;
  }): Promise<LiteExecutionDecisionRow | null>;
  listExecutionDecisionsByRun(args: {
    scope: string;
    runId: string;
    limit: number;
  }): Promise<{
    count: number;
    latest_created_at: string | null;
    rows: LiteExecutionDecisionRow[];
  }>;
  listExecutionRuns(args: {
    scope: string;
    limit: number;
  }): Promise<Array<{
    run_id: string;
    decision_count: number;
    latest_decision_at: string;
    latest_selected_tool: string | null;
    feedback_total: number;
    latest_feedback_at: string | null;
  }>>;
  findExecutionDecisionForFeedback(args: {
    scope: string;
    runId: string | null;
    selectedTool: string;
    candidatesJson: unknown[];
    contextSha256: string;
  }): Promise<LiteExecutionDecisionRow | null>;
  updateExecutionDecisionLink(args: {
    scope: string;
    id: string;
    runId?: string | null;
    commitId?: string | null;
  }): Promise<LiteExecutionDecisionRow | null>;
  latestCommit(scope: string): Promise<{ id: string; commit_hash: string } | null>;
  insertRuleFeedback(args: {
    id: string;
    scope: string;
    ruleNodeId: string;
    runId: string | null;
    outcome: "positive" | "negative" | "neutral";
    note: string | null;
    source: "rule_feedback" | "tools_feedback";
    decisionId: string | null;
    commitId: string | null;
    createdAt?: string | null;
  }): Promise<void>;
  listRuleFeedbackByRun(args: {
    scope: string;
    runId: string;
    limit: number;
  }): Promise<{
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    linked_decision_count: number;
    tools_feedback_count: number;
    latest_feedback_at: string | null;
    rows: LiteRuleFeedbackRow[];
  }>;
  updateRuleFeedbackAggregates(args: {
    scope: string;
    outcome: "positive" | "negative" | "neutral";
    ruleNodeIds: string[];
  }): Promise<LiteRuleCandidateRow[]>;
  setNodeEmbeddingReady(args: {
    scope: string;
    id: string;
    embedding: number[];
    embeddingModel: string;
  }): Promise<void>;
  setNodeEmbeddingFailed(args: {
    scope: string;
    id: string;
    error: string;
  }): Promise<void>;
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
  listSessions(args: {
    scope: string;
    consumerAgentId: string | null;
    consumerTeamId: string | null;
    ownerAgentId: string | null;
    ownerTeamId: string | null;
    limit: number;
    offset: number;
  }): Promise<{
    sessions: LiteSessionListView[];
    has_more: boolean;
  }>;
  exportPackSnapshot(args: {
    scope: string;
    includeNodes: boolean;
    includeEdges: boolean;
    includeCommits: boolean;
    includeDecisions: boolean;
    maxRows: number;
  }): Promise<{
    nodes: LitePackSnapshotNodeView[];
    edges: LitePackSnapshotEdgeView[];
    commits: LitePackSnapshotCommitView[];
    decisions: never[];
    truncated: {
      nodes: boolean;
      edges: boolean;
      commits: boolean;
      decisions: boolean;
    };
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

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

function commitVisible(
  db: SqliteDatabase,
  scope: string,
  commitId: string,
  consumerAgentId: string | null,
  consumerTeamId: string | null,
): boolean {
  const hiddenCount = Number(
    (
      db.prepare(
        `SELECT count(*) AS count
         FROM lite_memory_nodes
         WHERE scope = ?
           AND commit_id = ?
           AND NOT (
             memory_lane = 'shared'
             OR (? IS NOT NULL AND memory_lane = 'private' AND owner_agent_id = ?)
             OR (? IS NOT NULL AND memory_lane = 'private' AND owner_team_id = ?)
           )`,
      ).get(scope, commitId, consumerAgentId, consumerAgentId, consumerTeamId, consumerTeamId) as { count: number } | undefined
    )?.count ?? 0,
  );
  return hiddenCount === 0;
}

function decisionSourceRulesVisible(
  db: SqliteDatabase,
  scope: string,
  sourceRuleIds: string[],
  consumerAgentId: string | null,
  consumerTeamId: string | null,
): boolean {
  if (sourceRuleIds.length === 0) return true;
  for (const ruleId of sourceRuleIds) {
    const row = db.prepare(
      `SELECT memory_lane, owner_agent_id, owner_team_id
       FROM lite_memory_nodes
       WHERE scope = ? AND id = ?
       LIMIT 1`,
    ).get(scope, ruleId) as { memory_lane: "private" | "shared"; owner_agent_id: string | null; owner_team_id: string | null } | undefined;
    if (row && !nodeVisible(row, consumerAgentId, consumerTeamId)) return false;
  }
  return true;
}

function jsonContains(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return Object.is(actual, expected);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((value, index) => jsonContains(actual[index], value));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected as Record<string, unknown>)
    .every(([key, value]) => jsonContains((actual as Record<string, unknown>)[key], value));
}

export function createLiteWriteStore(path: string): LiteWriteStore {
  mkdirSync(dirname(path), { recursive: true });
  const db = createSqliteDatabase(path);
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
      positive_count INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      commit_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS lite_memory_association_candidates (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      src_id TEXT NOT NULL,
      dst_id TEXT NOT NULL,
      relation_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      score REAL NOT NULL,
      confidence REAL NOT NULL,
      feature_summary_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      source_commit_id TEXT,
      worker_run_id TEXT,
      promoted_edge_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(scope, src_id, dst_id, relation_kind)
    );
    CREATE INDEX IF NOT EXISTS idx_lite_memory_association_candidates_scope_src_score
      ON lite_memory_association_candidates(scope, src_id, score DESC, confidence DESC);

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

    CREATE TABLE IF NOT EXISTS lite_memory_execution_decisions (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      decision_kind TEXT NOT NULL,
      run_id TEXT,
      selected_tool TEXT,
      candidates_json TEXT NOT NULL,
      context_sha256 TEXT NOT NULL,
      policy_sha256 TEXT NOT NULL,
      source_rule_ids_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      commit_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lite_memory_execution_decisions_scope_created
      ON lite_memory_execution_decisions(scope, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_lite_memory_execution_decisions_scope_run_created
      ON lite_memory_execution_decisions(scope, run_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS lite_memory_rule_feedback (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      rule_node_id TEXT NOT NULL,
      run_id TEXT,
      outcome TEXT NOT NULL,
      note TEXT,
      source TEXT NOT NULL,
      decision_id TEXT,
      commit_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lite_memory_rule_feedback_scope_run_created
      ON lite_memory_rule_feedback(scope, run_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_lite_memory_rule_feedback_scope_rule_created
      ON lite_memory_rule_feedback(scope, rule_node_id, created_at DESC, id DESC);
  `);
  try {
    db.exec("ALTER TABLE lite_memory_rule_defs ADD COLUMN positive_count INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists in initialized databases.
  }
  try {
    db.exec("ALTER TABLE lite_memory_rule_defs ADD COLUMN negative_count INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists in initialized databases.
  }
  try {
    db.exec(`ALTER TABLE lite_memory_rule_defs ADD COLUMN updated_at TEXT NOT NULL DEFAULT '${nowIso()}'`);
  } catch {
    // Column already exists in initialized databases.
  }

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

    async findNodes(args): Promise<{ rows: LiteFindNodeRow[]; has_more: boolean }> {
      const rows = db.prepare(
        `SELECT
           id,
           type,
           client_id,
           title,
           text_summary,
           slots_json,
           tier,
           memory_lane,
           producer_agent_id,
           owner_agent_id,
           owner_team_id,
           embedding_status,
           embedding_model,
           raw_ref,
           evidence_ref,
           salience,
           importance,
           confidence,
           created_at,
           commit_id
         FROM lite_memory_nodes
         WHERE scope = ?
         ORDER BY created_at DESC, id DESC`,
      ).all(args.scope) as Array<{
        id: string;
        type: string;
        client_id: string | null;
        title: string | null;
        text_summary: string | null;
        slots_json: string;
        tier: string;
        memory_lane: "private" | "shared";
        producer_agent_id: string | null;
        owner_agent_id: string | null;
        owner_team_id: string | null;
        embedding_status: string | null;
        embedding_model: string | null;
        raw_ref: string | null;
        evidence_ref: string | null;
        salience: number;
        importance: number;
        confidence: number;
        created_at: string;
        commit_id: string | null;
      }>;
      const filtered = rows
        .map((row) => {
          const slots = parseJsonObject(row.slots_json);
          return {
            id: row.id,
            type: row.type,
            client_id: row.client_id,
            title: row.title,
            text_summary: row.text_summary,
            slots,
            tier: row.tier,
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
            topic_state: row.type === "topic" ? String(slots.topic_state ?? "active") : null,
            member_count: row.type === "topic" && Number.isFinite(Number(slots.member_count))
              ? Number(slots.member_count)
              : null,
          } satisfies LiteFindNodeRow;
        })
        .filter((row) => !args.id || row.id === args.id)
        .filter((row) => !args.type || row.type === args.type)
        .filter((row) => !args.clientId || row.client_id === args.clientId)
        .filter((row) => !args.titleContains || (row.title ?? "").toLowerCase().includes(args.titleContains.toLowerCase()))
        .filter((row) => !args.textContains || (row.text_summary ?? "").toLowerCase().includes(args.textContains.toLowerCase()))
        .filter((row) => !args.memoryLane || row.memory_lane === args.memoryLane)
        .filter((row) => !args.slotsContains || jsonContains(row.slots, args.slotsContains))
        .filter((row) => nodeVisible(row, args.consumerAgentId ?? null, args.consumerTeamId ?? null));
      const slice = filtered.slice(args.offset, args.offset + args.limit + 1);
      const hasMore = slice.length > args.limit;
      return {
        rows: hasMore ? slice.slice(0, args.limit) : slice,
        has_more: hasMore,
      };
    },

    async findLatestNodeByClientId(scope: string, type: string, clientId: string): Promise<LiteSessionNodeView | null> {
      const row = db.prepare(
        `SELECT id, client_id, title, text_summary, memory_lane, owner_agent_id, owner_team_id, created_at
         FROM lite_memory_nodes
         WHERE scope = ? AND type = ? AND client_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      ).get(scope, type, clientId) as LiteSessionNodeView | undefined;
      return row ? { ...row, updated_at: row.created_at } : null;
    },

    async resolveNode(args): Promise<LiteResolveNodeRow | null> {
      const { rows } = await this.findNodes({
        scope: args.scope,
        id: args.id,
        type: args.type,
        consumerAgentId: args.consumerAgentId ?? null,
        consumerTeamId: args.consumerTeamId ?? null,
        limit: 1,
        offset: 0,
      });
      const row = rows[0];
      return row ? { ...row, commit_scope: args.scope } : null;
    },

    async resolveEdge(args): Promise<LiteResolveEdgeRow | null> {
      const row = db.prepare(
        `SELECT
           e.id,
           e.type,
           e.src_id,
           s.type AS src_type,
           s.memory_lane AS src_memory_lane,
           s.owner_agent_id AS src_owner_agent_id,
           s.owner_team_id AS src_owner_team_id,
           e.dst_id,
           d.type AS dst_type,
           d.memory_lane AS dst_memory_lane,
           d.owner_agent_id AS dst_owner_agent_id,
           d.owner_team_id AS dst_owner_team_id,
           e.weight,
           e.confidence,
           e.decay_rate,
           e.created_at,
           e.commit_id
         FROM lite_memory_edges e
         JOIN lite_memory_nodes s ON s.id = e.src_id AND s.scope = e.scope
         JOIN lite_memory_nodes d ON d.id = e.dst_id AND d.scope = e.scope
         WHERE e.scope = ? AND e.id = ?
         LIMIT 1`,
      ).get(args.scope, args.id) as (
        Omit<LiteResolveEdgeRow, "last_activated" | "commit_scope">
        & {
          src_memory_lane: "private" | "shared";
          src_owner_agent_id: string | null;
          src_owner_team_id: string | null;
          dst_memory_lane: "private" | "shared";
          dst_owner_agent_id: string | null;
          dst_owner_team_id: string | null;
        }
      ) | undefined;
      if (!row) return null;
      if (
        !nodeVisible(
          {
            memory_lane: row.src_memory_lane,
            owner_agent_id: row.src_owner_agent_id,
            owner_team_id: row.src_owner_team_id,
          },
          args.consumerAgentId ?? null,
          args.consumerTeamId ?? null,
        )
        || !nodeVisible(
          {
            memory_lane: row.dst_memory_lane,
            owner_agent_id: row.dst_owner_agent_id,
            owner_team_id: row.dst_owner_team_id,
          },
          args.consumerAgentId ?? null,
          args.consumerTeamId ?? null,
        )
      ) {
        return null;
      }
      return {
        ...row,
        last_activated: null,
        commit_scope: args.scope,
      };
    },

    async resolveCommit(args): Promise<LiteResolveCommitRow | null> {
      const row = db.prepare(
        `SELECT
           c.id,
           c.parent_commit_id AS parent_id,
           c.input_sha256,
           c.diff_json,
           c.actor,
           c.model_version,
           c.prompt_version,
           c.commit_hash,
           c.created_at,
           (SELECT count(*) FROM lite_memory_nodes n WHERE n.scope = c.scope AND n.commit_id = c.id) AS node_count,
           (SELECT count(*) FROM lite_memory_edges e WHERE e.scope = c.scope AND e.commit_id = c.id) AS edge_count
         FROM lite_memory_commits c
         WHERE c.scope = ? AND c.id = ?
         LIMIT 1`,
      ).get(args.scope, args.id) as {
        id: string;
        parent_id: string | null;
        input_sha256: string;
        diff_json: string;
        actor: string;
        model_version: string | null;
        prompt_version: string | null;
        commit_hash: string;
        created_at: string;
        node_count: number;
        edge_count: number;
      } | undefined;
      if (!row) return null;
      if (!commitVisible(db, args.scope, row.id, args.consumerAgentId ?? null, args.consumerTeamId ?? null)) return null;
      let diffJson: unknown = {};
      try {
        diffJson = JSON.parse(row.diff_json);
      } catch {
        diffJson = {};
      }
      return {
        id: row.id,
        parent_id: row.parent_id,
        input_sha256: row.input_sha256,
        diff_json: diffJson,
        actor: row.actor,
        model_version: row.model_version,
        prompt_version: row.prompt_version,
        commit_hash: row.commit_hash,
        created_at: row.created_at,
        node_count: Number(row.node_count ?? 0),
        edge_count: Number(row.edge_count ?? 0),
        decision_count: Number(
          (
            db.prepare(
              `SELECT count(*) AS count
               FROM lite_memory_execution_decisions
               WHERE scope = ?
                 AND commit_id = ?`,
            ).get(args.scope, row.id) as { count: number } | undefined
          )?.count ?? 0,
        ),
      };
    },

    async resolveDecision(args): Promise<LiteResolveDecisionRow | null> {
      const row = db.prepare(
        `SELECT
           id,
           scope,
           decision_kind,
           run_id,
           selected_tool,
           candidates_json,
           context_sha256,
           policy_sha256,
           source_rule_ids_json,
           metadata_json,
           commit_id,
           created_at
         FROM lite_memory_execution_decisions
         WHERE scope = ?
           AND id = ?
         LIMIT 1`,
      ).get(args.scope, args.id) as {
        id: string;
        scope: string;
        decision_kind: "tools_select";
        run_id: string | null;
        selected_tool: string | null;
        candidates_json: string;
        context_sha256: string;
        policy_sha256: string;
        source_rule_ids_json: string;
        metadata_json: string;
        commit_id: string | null;
        created_at: string;
      } | undefined;
      if (!row) return null;
      const sourceRuleIds = parseJsonArray(row.source_rule_ids_json).map((v) => String(v));
      if (
        (row.commit_id && !commitVisible(db, args.scope, row.commit_id, args.consumerAgentId ?? null, args.consumerTeamId ?? null))
        || !decisionSourceRulesVisible(
          db,
          args.scope,
          sourceRuleIds,
          args.consumerAgentId ?? null,
          args.consumerTeamId ?? null,
        )
      ) {
        return null;
      }
      return {
        id: row.id,
        scope: row.scope,
        decision_kind: row.decision_kind,
        run_id: row.run_id,
        selected_tool: row.selected_tool,
        candidates_json: parseJsonArray(row.candidates_json),
        context_sha256: row.context_sha256,
        policy_sha256: row.policy_sha256,
        source_rule_ids: sourceRuleIds,
        metadata_json: parseJsonObject(row.metadata_json),
        commit_id: row.commit_id,
        created_at: row.created_at,
        commit_scope: row.commit_id ? args.scope : null,
      };
    },

    async listRuleCandidates(args): Promise<LiteRuleCandidateRow[]> {
      const allowedStates = new Set((args.states && args.states.length > 0 ? args.states : ["shadow", "active"]).map(String));
      const rows = db.prepare(
        `SELECT
           d.rule_node_id,
           d.state,
           d.rule_scope,
           d.target_agent_id,
         d.target_team_id,
         d.if_json,
         d.then_json,
         d.exceptions_json,
         d.positive_count,
         d.negative_count,
          d.commit_id,
          d.updated_at,
          n.memory_lane,
          n.owner_agent_id,
          n.owner_team_id,
           n.text_summary,
           n.slots_json
         FROM lite_memory_rule_defs d
         JOIN lite_memory_nodes n ON n.id = d.rule_node_id AND n.scope = d.scope
         WHERE d.scope = ?
         ORDER BY d.created_at DESC, d.rule_node_id ASC`,
      ).all(args.scope) as Array<{
        rule_node_id: string;
        state: "draft" | "shadow" | "active" | "disabled";
        rule_scope: "global" | "team" | "agent";
        target_agent_id: string | null;
        target_team_id: string | null;
        if_json: string;
        then_json: string;
        exceptions_json: string;
        positive_count: number;
        negative_count: number;
        commit_id: string;
        updated_at: string;
        memory_lane: "private" | "shared";
        owner_agent_id: string | null;
        owner_team_id: string | null;
        text_summary: string | null;
        slots_json: string;
      }>;
      return rows
        .filter((row) => allowedStates.has(row.state) && (row.state === "shadow" || row.state === "active"))
        .slice(0, Math.max(0, args.limit))
        .map((row) => ({
          rule_node_id: row.rule_node_id,
          state: row.state,
          rule_scope: row.rule_scope,
          target_agent_id: row.target_agent_id,
          target_team_id: row.target_team_id,
          rule_memory_lane: row.memory_lane,
          rule_owner_agent_id: row.owner_agent_id,
          rule_owner_team_id: row.owner_team_id,
          if_json: parseJsonObject(row.if_json),
          then_json: parseJsonObject(row.then_json),
          exceptions_json: parseJsonArray(row.exceptions_json),
          positive_count: Number(row.positive_count ?? 0),
          negative_count: Number(row.negative_count ?? 0),
          rule_commit_id: row.commit_id,
          rule_summary: row.text_summary,
          rule_slots: parseJsonObject(row.slots_json),
          updated_at: row.updated_at,
        }));
    },

    async getRuleDef(scope: string, ruleNodeId: string): Promise<LiteRuleDefSyncRow | null> {
      const row = db.prepare(
        `SELECT
           scope,
           rule_node_id,
           state,
           rule_scope,
           target_agent_id,
           target_team_id,
           if_json,
           then_json,
           exceptions_json,
           positive_count,
           negative_count,
           commit_id,
           updated_at
         FROM lite_memory_rule_defs
         WHERE scope = ?
           AND rule_node_id = ?
         LIMIT 1`,
      ).get(scope, ruleNodeId) as {
        scope: string;
        rule_node_id: string;
        state: "draft" | "shadow" | "active" | "disabled";
        rule_scope: "global" | "team" | "agent";
        target_agent_id: string | null;
        target_team_id: string | null;
        if_json: string;
        then_json: string;
        exceptions_json: string;
        positive_count: number;
        negative_count: number;
        commit_id: string | null;
        updated_at: string;
      } | undefined;
      if (!row) return null;
      return {
        scope: row.scope,
        rule_node_id: row.rule_node_id,
        state: row.state,
        rule_scope: row.rule_scope,
        target_agent_id: row.target_agent_id,
        target_team_id: row.target_team_id,
        if_json: parseJsonObject(row.if_json),
        then_json: parseJsonObject(row.then_json),
        exceptions_json: parseJsonArray(row.exceptions_json),
        positive_count: Number(row.positive_count ?? 0),
        negative_count: Number(row.negative_count ?? 0),
        commit_id: row.commit_id,
        updated_at: row.updated_at,
      };
    },

    async upsertRuleState(args): Promise<LiteRuleDefSyncRow> {
      const createdAt = nowIso();
      const updatedAt = createdAt;
      db.prepare(
        `INSERT INTO lite_memory_rule_defs
          (rule_node_id, scope, state, if_json, then_json, exceptions_json, rule_scope, target_agent_id, target_team_id, positive_count, negative_count, commit_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(rule_node_id) DO UPDATE SET
           state = excluded.state,
           if_json = excluded.if_json,
           then_json = excluded.then_json,
           exceptions_json = excluded.exceptions_json,
           rule_scope = excluded.rule_scope,
           target_agent_id = excluded.target_agent_id,
           target_team_id = excluded.target_team_id,
           commit_id = excluded.commit_id,
           updated_at = excluded.updated_at
         WHERE lite_memory_rule_defs.scope = excluded.scope`,
      ).run(
        args.ruleNodeId,
        args.scope,
        args.state,
        stringifyJson(args.ifJson),
        stringifyJson(args.thenJson),
        stringifyJson(args.exceptionsJson),
        args.ruleScope,
        args.targetAgentId,
        args.targetTeamId,
        args.positiveCount,
        args.negativeCount,
        args.commitId,
        createdAt,
        updatedAt,
      );
      const row = await this.getRuleDef(args.scope, args.ruleNodeId);
      if (!row) {
        throw new Error("lite_rule_def_upsert_failed");
      }
      return row;
    },

    async insertExecutionDecision(args): Promise<{ id: string; created_at: string }> {
      const createdAt = nowIso();
      db.prepare(
        `INSERT OR REPLACE INTO lite_memory_execution_decisions
          (id, scope, decision_kind, run_id, selected_tool, candidates_json, context_sha256, policy_sha256,
           source_rule_ids_json, metadata_json, commit_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        args.id,
        args.scope,
        args.decisionKind,
        args.runId,
        args.selectedTool,
        stringifyJson(args.candidatesJson),
        args.contextSha256,
        args.policySha256,
        stringifyJson(args.sourceRuleIds),
        stringifyJson(args.metadataJson),
        args.commitId,
        createdAt,
      );
      return { id: args.id, created_at: createdAt };
    },

    async getExecutionDecision(args): Promise<LiteExecutionDecisionRow | null> {
      const row = args.id
        ? db.prepare(
            `SELECT
               id,
               scope,
               decision_kind,
               run_id,
               selected_tool,
               candidates_json,
               context_sha256,
               policy_sha256,
               source_rule_ids_json,
               metadata_json,
               commit_id,
               created_at
             FROM lite_memory_execution_decisions
             WHERE scope = ?
               AND id = ?
             LIMIT 1`,
          ).get(args.scope, args.id)
        : db.prepare(
            `SELECT
               id,
               scope,
               decision_kind,
               run_id,
               selected_tool,
               candidates_json,
               context_sha256,
               policy_sha256,
               source_rule_ids_json,
               metadata_json,
               commit_id,
               created_at
             FROM lite_memory_execution_decisions
             WHERE scope = ?
               AND run_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
          ).get(args.scope, args.runId ?? null);
      if (!row) return null;
      const typed = row as {
        id: string;
        scope: string;
        decision_kind: "tools_select";
        run_id: string | null;
        selected_tool: string | null;
        candidates_json: string;
        context_sha256: string;
        policy_sha256: string;
        source_rule_ids_json: string;
        metadata_json: string;
        commit_id: string | null;
        created_at: string;
      };
      return {
        id: typed.id,
        scope: typed.scope,
        decision_kind: typed.decision_kind,
        run_id: typed.run_id,
        selected_tool: typed.selected_tool,
        candidates_json: parseJsonArray(typed.candidates_json),
        context_sha256: typed.context_sha256,
        policy_sha256: typed.policy_sha256,
        source_rule_ids: parseJsonArray(typed.source_rule_ids_json).map((v) => String(v)),
        metadata_json: parseJsonObject(typed.metadata_json),
        commit_id: typed.commit_id,
        created_at: typed.created_at,
      };
    },

    async listExecutionDecisionsByRun(args): Promise<{
      count: number;
      latest_created_at: string | null;
      rows: LiteExecutionDecisionRow[];
    }> {
      const stats = db.prepare(
        `SELECT
           COUNT(*) AS count,
           MAX(created_at) AS latest_created_at
         FROM lite_memory_execution_decisions
         WHERE scope = ?
           AND run_id = ?`,
      ).get(args.scope, args.runId) as {
        count: number;
        latest_created_at: string | null;
      };
      const rows = db.prepare(
        `SELECT
           id,
           scope,
           decision_kind,
           run_id,
           selected_tool,
           candidates_json,
           context_sha256,
           policy_sha256,
           source_rule_ids_json,
           metadata_json,
           commit_id,
           created_at
         FROM lite_memory_execution_decisions
         WHERE scope = ?
           AND run_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      ).all(args.scope, args.runId, Math.max(1, args.limit)) as Array<{
        id: string;
        scope: string;
        decision_kind: "tools_select";
        run_id: string | null;
        selected_tool: string | null;
        candidates_json: string;
        context_sha256: string;
        policy_sha256: string;
        source_rule_ids_json: string;
        metadata_json: string;
        commit_id: string | null;
        created_at: string;
      }>;
      return {
        count: Number(stats?.count ?? 0),
        latest_created_at: stats?.latest_created_at ?? null,
        rows: rows.map((row) => ({
          id: row.id,
          scope: row.scope,
          decision_kind: row.decision_kind,
          run_id: row.run_id,
          selected_tool: row.selected_tool,
          candidates_json: parseJsonArray(row.candidates_json),
          context_sha256: row.context_sha256,
          policy_sha256: row.policy_sha256,
          source_rule_ids: parseJsonArray(row.source_rule_ids_json).map((v) => String(v)),
          metadata_json: parseJsonObject(row.metadata_json),
          commit_id: row.commit_id,
          created_at: row.created_at,
        })),
      };
    },

    async listExecutionRuns(args): Promise<Array<{
      run_id: string;
      decision_count: number;
      latest_decision_at: string;
      latest_selected_tool: string | null;
      feedback_total: number;
      latest_feedback_at: string | null;
    }>> {
      const rows = db.prepare(
        `SELECT
           d.run_id AS run_id,
           COUNT(*) AS decision_count,
           MAX(d.created_at) AS latest_decision_at,
           (
             SELECT d2.selected_tool
             FROM lite_memory_execution_decisions d2
             WHERE d2.scope = d.scope
               AND d2.run_id = d.run_id
             ORDER BY d2.created_at DESC, d2.id DESC
             LIMIT 1
           ) AS latest_selected_tool,
           COALESCE((
             SELECT COUNT(*)
             FROM lite_memory_rule_feedback f
             WHERE f.scope = d.scope
               AND f.run_id = d.run_id
           ), 0) AS feedback_total,
           (
             SELECT MAX(f.created_at)
             FROM lite_memory_rule_feedback f
             WHERE f.scope = d.scope
               AND f.run_id = d.run_id
           ) AS latest_feedback_at
         FROM lite_memory_execution_decisions d
         WHERE d.scope = ?
           AND d.run_id IS NOT NULL
         GROUP BY d.run_id
         ORDER BY latest_decision_at DESC, d.run_id DESC
         LIMIT ?`,
      ).all(args.scope, Math.max(1, args.limit)) as Array<{
        run_id: string;
        decision_count: number;
        latest_decision_at: string;
        latest_selected_tool: string | null;
        feedback_total: number;
        latest_feedback_at: string | null;
      }>;
      return rows.map((row) => ({
        run_id: row.run_id,
        decision_count: Number(row.decision_count ?? 0),
        latest_decision_at: row.latest_decision_at,
        latest_selected_tool: row.latest_selected_tool ?? null,
        feedback_total: Number(row.feedback_total ?? 0),
        latest_feedback_at: row.latest_feedback_at ?? null,
      }));
    },

    async findExecutionDecisionForFeedback(args): Promise<LiteExecutionDecisionRow | null> {
      const rows = db.prepare(
        `SELECT
           id,
           scope,
           decision_kind,
           run_id,
           selected_tool,
           candidates_json,
           context_sha256,
           policy_sha256,
           source_rule_ids_json,
           metadata_json,
           commit_id,
           created_at
         FROM lite_memory_execution_decisions
         WHERE scope = ?
           AND selected_tool = ?
           AND context_sha256 = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
      ).all(args.scope, args.selectedTool, args.contextSha256) as Array<{
        id: string;
        scope: string;
        decision_kind: "tools_select";
        run_id: string | null;
        selected_tool: string | null;
        candidates_json: string;
        context_sha256: string;
        policy_sha256: string;
        source_rule_ids_json: string;
        metadata_json: string;
        commit_id: string | null;
        created_at: string;
      }>;
      const wanted = stringifyJson(args.candidatesJson);
      const matched = rows
        .filter((row) => (args.runId ? row.run_id === args.runId : true))
        .find((row) => row.candidates_json === wanted);
      if (!matched) return null;
      return {
        id: matched.id,
        scope: matched.scope,
        decision_kind: matched.decision_kind,
        run_id: matched.run_id,
        selected_tool: matched.selected_tool,
        candidates_json: parseJsonArray(matched.candidates_json),
        context_sha256: matched.context_sha256,
        policy_sha256: matched.policy_sha256,
        source_rule_ids: parseJsonArray(matched.source_rule_ids_json).map((v) => String(v)),
        metadata_json: parseJsonObject(matched.metadata_json),
        commit_id: matched.commit_id,
        created_at: matched.created_at,
      };
    },

    async updateExecutionDecisionLink(args): Promise<LiteExecutionDecisionRow | null> {
      const updates: string[] = [];
      const params: Array<string | null> = [];
      if (args.runId !== undefined) {
        updates.push("run_id = ?");
        params.push(args.runId);
      }
      if (args.commitId !== undefined) {
        updates.push("commit_id = ?");
        params.push(args.commitId);
      }
      if (updates.length === 0) {
        return await this.getExecutionDecision({ scope: args.scope, id: args.id });
      }
      params.push(args.scope, args.id);
      db.prepare(
        `UPDATE lite_memory_execution_decisions
         SET ${updates.join(", ")}
         WHERE scope = ?
           AND id = ?`,
      ).run(...params);
      return await this.getExecutionDecision({ scope: args.scope, id: args.id });
    },

    async latestCommit(scope: string): Promise<{ id: string; commit_hash: string } | null> {
      const row = db.prepare(
        `SELECT id, commit_hash
         FROM lite_memory_commits
         WHERE scope = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      ).get(scope) as { id: string; commit_hash: string } | undefined;
      return row ?? null;
    },

    async insertRuleFeedback(args): Promise<void> {
      db.prepare(
        `INSERT OR REPLACE INTO lite_memory_rule_feedback
          (id, scope, rule_node_id, run_id, outcome, note, source, decision_id, commit_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        args.id,
        args.scope,
        args.ruleNodeId,
        args.runId,
        args.outcome,
        args.note,
        args.source,
        args.decisionId,
        args.commitId,
        args.createdAt ?? nowIso(),
      );
    },

    async listRuleFeedbackByRun(args): Promise<{
      total: number;
      positive: number;
      negative: number;
      neutral: number;
      linked_decision_count: number;
      tools_feedback_count: number;
      latest_feedback_at: string | null;
      rows: LiteRuleFeedbackRow[];
    }> {
      const stats = db.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN outcome = 'positive' THEN 1 ELSE 0 END) AS positive,
           SUM(CASE WHEN outcome = 'negative' THEN 1 ELSE 0 END) AS negative,
           SUM(CASE WHEN outcome = 'neutral' THEN 1 ELSE 0 END) AS neutral,
           SUM(CASE WHEN decision_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_decision_count,
           SUM(CASE WHEN source = 'tools_feedback' THEN 1 ELSE 0 END) AS tools_feedback_count,
           MAX(created_at) AS latest_feedback_at
         FROM lite_memory_rule_feedback
         WHERE scope = ?
           AND run_id = ?`,
      ).get(args.scope, args.runId) as {
        total: number;
        positive: number | null;
        negative: number | null;
        neutral: number | null;
        linked_decision_count: number | null;
        tools_feedback_count: number | null;
        latest_feedback_at: string | null;
      };
      const rows = db.prepare(
        `SELECT
           id,
           scope,
           rule_node_id,
           run_id,
           outcome,
           note,
           source,
           decision_id,
           commit_id,
           created_at
         FROM lite_memory_rule_feedback
         WHERE scope = ?
           AND run_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      ).all(args.scope, args.runId, Math.max(1, args.limit)) as LiteRuleFeedbackRow[];
      return {
        total: Number(stats?.total ?? 0),
        positive: Number(stats?.positive ?? 0),
        negative: Number(stats?.negative ?? 0),
        neutral: Number(stats?.neutral ?? 0),
        linked_decision_count: Number(stats?.linked_decision_count ?? 0),
        tools_feedback_count: Number(stats?.tools_feedback_count ?? 0),
        latest_feedback_at: stats?.latest_feedback_at ?? null,
        rows,
      };
    },

    async updateRuleFeedbackAggregates(args): Promise<LiteRuleCandidateRow[]> {
      const nextUpdatedAt = nowIso();
      for (const ruleNodeId of args.ruleNodeIds) {
        db.prepare(
          `UPDATE lite_memory_rule_defs
           SET
             positive_count = positive_count + ?,
             negative_count = negative_count + ?,
             updated_at = ?
           WHERE scope = ?
             AND rule_node_id = ?`,
        ).run(
          args.outcome === "positive" ? 1 : 0,
          args.outcome === "negative" ? 1 : 0,
          nextUpdatedAt,
          args.scope,
          ruleNodeId,
        );
      }
      return await this.listRuleCandidates({
        scope: args.scope,
        limit: Math.max(1, args.ruleNodeIds.length),
        states: ["shadow", "active"],
      }).then((rows) => rows.filter((row) => args.ruleNodeIds.includes(row.rule_node_id)));
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

    async listSessions(args): Promise<{ sessions: LiteSessionListView[]; has_more: boolean }> {
      const rows = db.prepare(
        `SELECT
           s.id,
           s.client_id,
           s.title,
           s.text_summary,
           s.memory_lane,
           s.owner_agent_id,
           s.owner_team_id,
           s.created_at,
           MAX(e.created_at) AS last_event_at,
           COUNT(e.id) AS event_count
         FROM lite_memory_nodes s
         LEFT JOIN lite_memory_edges me
           ON me.scope = s.scope
          AND me.type = 'part_of'
          AND me.dst_id = s.id
         LEFT JOIN lite_memory_nodes e
           ON e.id = me.src_id
          AND e.scope = s.scope
          AND e.type = 'event'
         WHERE s.scope = ?
           AND s.type = 'topic'
           AND s.client_id LIKE 'session:%'
         GROUP BY
           s.id,
           s.client_id,
           s.title,
           s.text_summary,
           s.memory_lane,
           s.owner_agent_id,
           s.owner_team_id,
           s.created_at
         ORDER BY COALESCE(MAX(e.created_at), s.created_at) DESC, s.id DESC`,
      ).all(args.scope) as Array<{
        id: string;
        client_id: string | null;
        title: string | null;
        text_summary: string | null;
        memory_lane: "private" | "shared";
        owner_agent_id: string | null;
        owner_team_id: string | null;
        created_at: string;
        last_event_at: string | null;
        event_count: number;
      }>;
      const visible = rows.filter((row) => {
        if (!nodeVisible(row, args.consumerAgentId, args.consumerTeamId)) return false;
        if (args.ownerAgentId && row.owner_agent_id !== args.ownerAgentId) return false;
        if (args.ownerTeamId && row.owner_team_id !== args.ownerTeamId) return false;
        return true;
      });
      const slice = visible.slice(args.offset, args.offset + args.limit + 1);
      const hasMore = slice.length > args.limit;
      const chosen = hasMore ? slice.slice(0, args.limit) : slice;
      return {
        sessions: chosen.map((row) => ({
          id: row.id,
          client_id: row.client_id,
          title: row.title,
          text_summary: row.text_summary,
          memory_lane: row.memory_lane,
          owner_agent_id: row.owner_agent_id,
          owner_team_id: row.owner_team_id,
          created_at: row.created_at,
          updated_at: row.created_at,
          last_event_at: row.last_event_at,
          event_count: Number(row.event_count ?? 0),
        })),
        has_more: hasMore,
      };
    },

    async exportPackSnapshot(args) {
      let nodes: LitePackSnapshotNodeView[] = [];
      let edges: LitePackSnapshotEdgeView[] = [];
      let commits: LitePackSnapshotCommitView[] = [];
      let nodesHasMore = false;
      let edgesHasMore = false;
      let commitsHasMore = false;

      if (args.includeNodes) {
        const rows = db.prepare(
          `SELECT
             id, client_id, type, tier, memory_lane, producer_agent_id, owner_agent_id, owner_team_id,
             title, text_summary, slots_json, raw_ref, evidence_ref, salience, importance, confidence,
             created_at, commit_id
           FROM lite_memory_nodes
           WHERE scope = ?
           ORDER BY created_at ASC, id ASC
           LIMIT ?`,
        ).all(args.scope, args.maxRows + 1) as Array<{
          id: string;
          client_id: string | null;
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
          salience: number;
          importance: number;
          confidence: number;
          created_at: string;
          commit_id: string | null;
        }>;
        nodesHasMore = rows.length > args.maxRows;
        nodes = (nodesHasMore ? rows.slice(0, args.maxRows) : rows).map((row) => ({
          id: row.id,
          client_id: row.client_id,
          type: row.type,
          tier: row.tier,
          memory_lane: row.memory_lane,
          producer_agent_id: row.producer_agent_id,
          owner_agent_id: row.owner_agent_id,
          owner_team_id: row.owner_team_id,
          title: row.title,
          text_summary: row.text_summary,
          slots: parseJsonObject(row.slots_json),
          raw_ref: row.raw_ref,
          evidence_ref: row.evidence_ref,
          salience: row.salience,
          importance: row.importance,
          confidence: row.confidence,
          created_at: row.created_at,
          updated_at: row.created_at,
          commit_id: row.commit_id,
        }));
      }

      if (args.includeEdges) {
        const rows = db.prepare(
          `SELECT
             e.id, e.type, e.src_id, e.dst_id, s.client_id AS src_client_id, d.client_id AS dst_client_id,
             e.weight, e.confidence, e.decay_rate, e.created_at, e.commit_id
           FROM lite_memory_edges e
           LEFT JOIN lite_memory_nodes s ON s.id = e.src_id AND s.scope = e.scope
           LEFT JOIN lite_memory_nodes d ON d.id = e.dst_id AND d.scope = e.scope
           WHERE e.scope = ?
           ORDER BY e.created_at ASC, e.id ASC
           LIMIT ?`,
        ).all(args.scope, args.maxRows + 1) as LitePackSnapshotEdgeView[];
        edgesHasMore = rows.length > args.maxRows;
        edges = edgesHasMore ? rows.slice(0, args.maxRows) : rows;
      }

      if (args.includeCommits) {
        const rows = db.prepare(
          `SELECT
             id, parent_commit_id AS parent_id, input_sha256, actor, model_version, prompt_version, created_at, commit_hash
           FROM lite_memory_commits
           WHERE scope = ?
           ORDER BY created_at ASC, id ASC
           LIMIT ?`,
        ).all(args.scope, args.maxRows + 1) as LitePackSnapshotCommitView[];
        commitsHasMore = rows.length > args.maxRows;
        commits = commitsHasMore ? rows.slice(0, args.maxRows) : rows;
      }

      return {
        nodes,
        edges,
        commits,
        decisions: [],
        truncated: {
          nodes: nodesHasMore,
          edges: edgesHasMore,
          commits: commitsHasMore,
          decisions: false,
        },
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
      const ts = nowIso();
      db.prepare(
        `INSERT OR IGNORE INTO lite_memory_rule_defs
          (rule_node_id, scope, state, if_json, then_json, exceptions_json, rule_scope, target_agent_id, target_team_id, positive_count, negative_count, commit_id, created_at, updated_at)
         VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
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
        ts,
        ts,
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

    async upsertAssociationCandidates(args: UpsertAssociationCandidateArgs[]): Promise<void> {
      if (args.length === 0) return;
      const stmt = db.prepare(
        `INSERT INTO lite_memory_association_candidates
          (id, scope, src_id, dst_id, relation_kind, status, score, confidence,
           feature_summary_json, evidence_json, source_commit_id, worker_run_id, promoted_edge_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope, src_id, dst_id, relation_kind) DO UPDATE SET
           status = CASE
             WHEN lite_memory_association_candidates.status = 'promoted' AND excluded.status = 'shadow'
               THEN lite_memory_association_candidates.status
             ELSE excluded.status
           END,
           score = excluded.score,
           confidence = excluded.confidence,
           feature_summary_json = excluded.feature_summary_json,
           evidence_json = excluded.evidence_json,
           source_commit_id = excluded.source_commit_id,
           worker_run_id = excluded.worker_run_id,
           promoted_edge_id = CASE
             WHEN lite_memory_association_candidates.status = 'promoted' AND excluded.status = 'shadow'
               THEN lite_memory_association_candidates.promoted_edge_id
             ELSE excluded.promoted_edge_id
           END,
           updated_at = excluded.updated_at`,
      );
      for (const candidate of args) {
        const ts = nowIso();
        stmt.run(
          stableUuid(`${candidate.scope}:assoc:${candidate.src_id}:${candidate.dst_id}:${candidate.relation_kind}`),
          candidate.scope,
          candidate.src_id,
          candidate.dst_id,
          candidate.relation_kind,
          candidate.status,
          candidate.score,
          candidate.confidence,
          stringifyJson(candidate.feature_summary_json),
          stringifyJson(candidate.evidence_json),
          candidate.source_commit_id,
          candidate.worker_run_id,
          candidate.promoted_edge_id,
          ts,
          ts,
        );
      }
    },

    async listAssociationCandidatesForSource(
      args: ListAssociationCandidatesForSourceArgs,
    ): Promise<AssociationCandidateRecord[]> {
      const limit = Math.max(1, Math.min(200, Math.trunc(args.limit ?? 50)));
      const statuses = Array.isArray(args.statuses) ? args.statuses : [];
      const statusFilter = statuses.length > 0;
      const params: unknown[] = [args.scope, args.src_id];
      let sql = `
        SELECT
          id,
          scope,
          src_id,
          dst_id,
          relation_kind,
          status,
          score,
          confidence,
          feature_summary_json,
          evidence_json,
          source_commit_id,
          worker_run_id,
          promoted_edge_id,
          created_at,
          updated_at
        FROM lite_memory_association_candidates
        WHERE scope = ?
          AND src_id = ?
      `;
      if (statusFilter) {
        sql += ` AND status IN (${statuses.map(() => "?").join(",")})`;
        params.push(...statuses);
      }
      params.push(limit);
      sql += ` ORDER BY score DESC, confidence DESC, updated_at DESC LIMIT ?`;
      const rows = db.prepare(sql).all(...params) as Array<{
        id: string;
        scope: string;
        src_id: string;
        dst_id: string;
        relation_kind: AssociationCandidateRecord["relation_kind"];
        status: AssociationCandidateRecord["status"];
        score: number;
        confidence: number;
        feature_summary_json: string;
        evidence_json: string;
        source_commit_id: string | null;
        worker_run_id: string | null;
        promoted_edge_id: string | null;
        created_at: string;
        updated_at: string;
      }>;
      return rows.map((row) => ({
        ...row,
        feature_summary_json: parseJsonObject(row.feature_summary_json),
        evidence_json: parseJsonObject(row.evidence_json),
      }));
    },

    async markAssociationCandidatePromoted(args: MarkAssociationCandidatePromotedArgs): Promise<void> {
      db.prepare(
        `UPDATE lite_memory_association_candidates
         SET status = 'promoted',
             promoted_edge_id = ?,
             updated_at = ?
         WHERE scope = ?
           AND src_id = ?
           AND dst_id = ?
           AND relation_kind = ?`,
      ).run(
        args.promoted_edge_id,
        nowIso(),
        args.scope,
        args.src_id,
        args.dst_id,
        args.relation_kind,
      );
    },

    async updateAssociationCandidateStatus(args: UpdateAssociationCandidateStatusArgs): Promise<void> {
      db.prepare(
        `UPDATE lite_memory_association_candidates
         SET status = ?,
             promoted_edge_id = COALESCE(?, promoted_edge_id),
             updated_at = ?
         WHERE scope = ?
           AND src_id = ?
           AND dst_id = ?
           AND relation_kind = ?`,
      ).run(
        args.status,
        args.promoted_edge_id ?? null,
        nowIso(),
        args.scope,
        args.src_id,
        args.dst_id,
        args.relation_kind,
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

    async setNodeEmbeddingReady(args): Promise<void> {
      assertDim(args.embedding, 1536);
      db.prepare(
        `UPDATE lite_memory_nodes
         SET embedding_vector_json = ?,
             embedding_model = ?,
             embedding_status = 'ready',
             embedding_last_error = NULL
         WHERE scope = ?
           AND id = ?`,
      ).run(
        stringifyJson(args.embedding),
        args.embeddingModel,
        args.scope,
        args.id,
      );
    },

    async setNodeEmbeddingFailed(args): Promise<void> {
      db.prepare(
        `UPDATE lite_memory_nodes
         SET embedding_status = 'failed',
             embedding_last_error = ?
         WHERE scope = ?
           AND id = ?`,
      ).run(
        args.error,
        args.scope,
        args.id,
      );
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
