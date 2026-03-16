import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fromTenantScopeKey } from "../memory/tenant.js";
import type {
  ReplayNodeRow,
  ReplayPlaybookRow,
  ReplayRunNodeRow,
  ReplayStoreAccess,
  ReplayVisibilityArgs,
} from "./replay-access.js";
import { REPLAY_STORE_ACCESS_CAPABILITY_VERSION } from "./replay-access.js";
import type { ReplayMirrorNodeRecord, ReplayWriteMirror } from "../memory/replay-write.js";
import { createSqliteDatabase } from "./sqlite-compat.js";

type LiteReplayRow = {
  node_id: string;
  scope: string;
  replay_kind: string;
  run_id: string | null;
  step_id: string | null;
  step_index: number | null;
  playbook_id: string | null;
  version_num: number | null;
  playbook_status: string | null;
  node_type: string;
  title: string | null;
  text_summary: string | null;
  slots_json: string;
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
};

function parseSlots(slotsJson: string): any {
  try {
    return JSON.parse(slotsJson);
  } catch {
    return {};
  }
}

function replayNodeFromRow(row: LiteReplayRow): ReplayNodeRow {
  return {
    id: row.node_id,
    type: row.node_type as ReplayNodeRow["type"],
    title: row.title,
    text_summary: row.text_summary,
    slots: parseSlots(row.slots_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
    commit_id: row.commit_id,
    memory_lane: row.memory_lane,
    producer_agent_id: row.producer_agent_id,
    owner_agent_id: row.owner_agent_id,
    owner_team_id: row.owner_team_id,
  };
}

function replayPlaybookFromRow(row: LiteReplayRow): ReplayPlaybookRow {
  return {
    ...replayNodeFromRow(row),
    version_num: Number.isFinite(row.version_num ?? NaN) ? Number(row.version_num) : 1,
    playbook_status: row.playbook_status,
    playbook_id: row.playbook_id,
  };
}

function scopeVariants(scope: string): string[] {
  const variants = [scope];
  const raw = fromTenantScopeKey(scope, "default", "default");
  if (raw !== scope) variants.push(raw);
  const match = scope.match(/^tenant:([a-zA-Z0-9._-]+)::scope:(.+)$/);
  if (match) {
    const [, tenantId, rawScope] = match;
    const derivedRaw = fromTenantScopeKey(scope, tenantId, "default");
    if (derivedRaw && !variants.includes(derivedRaw)) variants.push(derivedRaw);
    if (rawScope && !variants.includes(rawScope)) variants.push(rawScope);
  }
  return variants;
}

function replayNodeVisible(row: LiteReplayRow, visibility: ReplayVisibilityArgs): boolean {
  return row.memory_lane === "shared"
    || (!!visibility.consumerAgentId && row.owner_agent_id === visibility.consumerAgentId)
    || (!!visibility.consumerTeamId && row.owner_team_id === visibility.consumerTeamId);
}

export type LiteReplayStore = ReplayWriteMirror & {
  createReplayAccess(): ReplayStoreAccess;
  close(): Promise<void>;
  healthSnapshot(): { path: string; mode: "sqlite_mirror_v1" };
};

export function createLiteReplayStore(path: string): LiteReplayStore {
  mkdirSync(dirname(path), { recursive: true });
  const db = createSqliteDatabase(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS lite_replay_nodes (
      node_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      replay_kind TEXT NOT NULL,
      run_id TEXT,
      step_id TEXT,
      step_index INTEGER,
      playbook_id TEXT,
      version_num INTEGER,
      playbook_status TEXT,
      node_type TEXT NOT NULL,
      title TEXT,
      text_summary TEXT,
      slots_json TEXT NOT NULL,
      memory_lane TEXT NOT NULL,
      producer_agent_id TEXT,
      owner_agent_id TEXT,
      owner_team_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      commit_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lite_replay_nodes_scope_run
      ON lite_replay_nodes(scope, run_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_lite_replay_nodes_scope_playbook
      ON lite_replay_nodes(scope, playbook_id, version_num, created_at);
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO lite_replay_nodes (
      node_id, scope, replay_kind, run_id, step_id, step_index, playbook_id, version_num, playbook_status,
      node_type, title, text_summary, slots_json, memory_lane, producer_agent_id, owner_agent_id, owner_team_id,
      created_at, updated_at, commit_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(node_id) DO UPDATE SET
      scope = excluded.scope,
      replay_kind = excluded.replay_kind,
      run_id = excluded.run_id,
      step_id = excluded.step_id,
      step_index = excluded.step_index,
      playbook_id = excluded.playbook_id,
      version_num = excluded.version_num,
      playbook_status = excluded.playbook_status,
      node_type = excluded.node_type,
      title = excluded.title,
      text_summary = excluded.text_summary,
      slots_json = excluded.slots_json,
      memory_lane = excluded.memory_lane,
      producer_agent_id = excluded.producer_agent_id,
      owner_agent_id = excluded.owner_agent_id,
      owner_team_id = excluded.owner_team_id,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      commit_id = excluded.commit_id
  `);
  const getRunStmt = db.prepare(`
    SELECT * FROM lite_replay_nodes
    WHERE scope = ? AND replay_kind = 'run' AND run_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const getStepStmt = db.prepare(`
    SELECT * FROM lite_replay_nodes
    WHERE scope = ? AND node_id = ? AND replay_kind = 'step'
    LIMIT 1
  `);
  const getStepByIndexStmt = db.prepare(`
    SELECT * FROM lite_replay_nodes
    WHERE scope = ? AND replay_kind = 'step' AND run_id = ? AND step_index = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const listRunNodesStmt = db.prepare(`
    SELECT * FROM lite_replay_nodes
    WHERE scope = ? AND run_id = ?
    ORDER BY created_at ASC
  `);
  const listPlaybookVersionsStmt = db.prepare(`
    SELECT * FROM lite_replay_nodes
    WHERE scope = ? AND replay_kind = 'playbook' AND playbook_id = ?
    ORDER BY version_num DESC, created_at DESC
  `);
  const getPlaybookVersionStmt = db.prepare(`
    SELECT * FROM lite_replay_nodes
    WHERE scope = ? AND replay_kind = 'playbook' AND playbook_id = ? AND version_num = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);

  return {
    async upsertReplayNodes(entries: ReplayMirrorNodeRecord[]): Promise<void> {
      if (entries.length === 0) return;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const row of entries) {
          upsertStmt.run(
            row.node_id,
            row.scope,
            row.replay_kind,
            row.run_id,
            row.step_id,
            row.step_index,
            row.playbook_id,
            row.version_num,
            row.playbook_status,
            row.node_type,
            row.title,
            row.text_summary,
            row.slots_json,
            row.memory_lane,
            row.producer_agent_id,
            row.owner_agent_id,
            row.owner_team_id,
            row.created_at,
            row.updated_at,
            row.commit_id,
          );
        }
        db.exec("COMMIT");
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
          void 0;
        }
        throw err;
      }
    },

    createReplayAccess(): ReplayStoreAccess {
      return {
        capability_version: REPLAY_STORE_ACCESS_CAPABILITY_VERSION,
        async findRunNodeByRunId(scope: string, runId: string, visibility: ReplayVisibilityArgs): Promise<ReplayRunNodeRow | null> {
          for (const variant of scopeVariants(scope)) {
            const row = getRunStmt.get(variant, runId) as LiteReplayRow | undefined;
            if (row && replayNodeVisible(row, visibility)) return replayNodeFromRow(row);
          }
          return null;
        },
        async findStepNodeById(scope: string, stepId: string, visibility: ReplayVisibilityArgs): Promise<ReplayNodeRow | null> {
          const row = getStepStmt.get(scope, stepId) as LiteReplayRow | undefined;
          return row && replayNodeVisible(row, visibility) ? replayNodeFromRow(row) : null;
        },
        async findLatestStepNodeByIndex(
          scope: string,
          runId: string,
          stepIndex: number,
          visibility: ReplayVisibilityArgs,
        ): Promise<ReplayNodeRow | null> {
          for (const variant of scopeVariants(scope)) {
            const row = getStepByIndexStmt.get(variant, runId, stepIndex) as LiteReplayRow | undefined;
            if (row && replayNodeVisible(row, visibility)) return replayNodeFromRow(row);
          }
          return null;
        },
        async listReplayNodesByRunId(scope: string, runId: string, visibility: ReplayVisibilityArgs): Promise<ReplayNodeRow[]> {
          for (const variant of scopeVariants(scope)) {
            const rows = listRunNodesStmt.all(variant, runId) as LiteReplayRow[];
            const visible = rows.filter((row) => replayNodeVisible(row, visibility));
            if (visible.length > 0) return visible.map(replayNodeFromRow);
          }
          return [];
        },
        async listReplayPlaybookVersions(
          scope: string,
          playbookId: string,
          visibility: ReplayVisibilityArgs,
        ): Promise<ReplayPlaybookRow[]> {
          for (const variant of scopeVariants(scope)) {
            const rows = listPlaybookVersionsStmt.all(variant, playbookId) as LiteReplayRow[];
            const visible = rows.filter((row) => replayNodeVisible(row, visibility));
            if (visible.length > 0) return visible.map(replayPlaybookFromRow);
          }
          return [];
        },
        async getReplayPlaybookVersion(
          scope: string,
          playbookId: string,
          version: number,
          visibility: ReplayVisibilityArgs,
        ): Promise<ReplayPlaybookRow | null> {
          for (const variant of scopeVariants(scope)) {
            const row = getPlaybookVersionStmt.get(variant, playbookId, version) as LiteReplayRow | undefined;
            if (row && replayNodeVisible(row, visibility)) return replayPlaybookFromRow(row);
          }
          return null;
        },
      };
    },

    async close(): Promise<void> {
      db.close();
    },

    healthSnapshot() {
      return { path, mode: "sqlite_mirror_v1" as const };
    },
  };
}
