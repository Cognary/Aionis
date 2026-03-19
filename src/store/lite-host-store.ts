import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MemoryStore } from "./memory-store.js";
import { createSqliteDatabase, type SqliteDatabase } from "./sqlite-compat.js";

type QueryResult<T = any> = {
  rows: T[];
  rowCount: number;
};

type SandboxSessionRecord = {
  id: string;
  tenant_id: string;
  scope: string;
  profile: string;
  metadata_json: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type SandboxRunRecord = {
  id: string;
  session_id: string;
  tenant_id: string;
  scope: string;
  project_id: string | null;
  planner_run_id: string | null;
  decision_id: string | null;
  action_kind: string;
  action_json: string;
  mode: string;
  status: string;
  timeout_ms: number;
  stdout_text: string;
  stderr_text: string;
  output_truncated: number;
  exit_code: number | null;
  error: string | null;
  cancel_requested: number;
  cancel_reason: string | null;
  metadata_json: string;
  result_json: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type QueryClient = {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed stored JSON and fall back to empty object
  }
  return {};
}

function toRunPayloadRow(record: SandboxRunRecord) {
  return {
    id: record.id,
    session_id: record.session_id,
    tenant_id: record.tenant_id,
    scope: record.scope,
    project_id: record.project_id,
    planner_run_id: record.planner_run_id,
    decision_id: record.decision_id,
    action_kind: record.action_kind,
    action_json: parseJsonObject(record.action_json),
    mode: record.mode,
    status: record.status,
    timeout_ms: record.timeout_ms,
    stdout_text: record.stdout_text ?? "",
    stderr_text: record.stderr_text ?? "",
    output_truncated: record.output_truncated === 1,
    exit_code: record.exit_code,
    error: record.error,
    cancel_requested: record.cancel_requested === 1,
    cancel_reason: record.cancel_reason,
    metadata: parseJsonObject(record.metadata_json),
    result_json: parseJsonObject(record.result_json),
    started_at: record.started_at,
    finished_at: record.finished_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function toSessionRow(record: SandboxSessionRecord) {
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    scope: record.scope,
    profile: record.profile,
    metadata: parseJsonObject(record.metadata_json),
    expires_at: record.expires_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function createQueryClient(db: SqliteDatabase): QueryClient {
  const insertSession = db.prepare(`
    INSERT INTO memory_sandbox_sessions (
      id, tenant_id, scope, profile, metadata_json, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getSession = db.prepare<SandboxSessionRecord>(`
    SELECT id, tenant_id, scope, profile, metadata_json, expires_at, created_at, updated_at
    FROM memory_sandbox_sessions
    WHERE id = ? AND tenant_id = ? AND scope = ?
    LIMIT 1
  `);

  const insertRun = db.prepare(`
    INSERT INTO memory_sandbox_runs (
      id,
      session_id,
      tenant_id,
      scope,
      project_id,
      planner_run_id,
      decision_id,
      action_kind,
      action_json,
      mode,
      status,
      timeout_ms,
      stdout_text,
      stderr_text,
      output_truncated,
      exit_code,
      error,
      cancel_requested,
      cancel_reason,
      metadata_json,
      result_json,
      started_at,
      finished_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 0, NULL, NULL, 0, NULL, ?, '{}', NULL, NULL, ?, ?)
  `);
  const getRunByIdTenantScope = db.prepare<SandboxRunRecord>(`
    SELECT *
    FROM memory_sandbox_runs
    WHERE id = ? AND tenant_id = ? AND scope = ?
    LIMIT 1
  `);
  const getRunLogs = db.prepare<Pick<SandboxRunRecord, "id" | "status" | "stdout_text" | "stderr_text" | "output_truncated">>(`
    SELECT id, status, stdout_text, stderr_text, output_truncated
    FROM memory_sandbox_runs
    WHERE id = ? AND tenant_id = ? AND scope = ?
    LIMIT 1
  `);
  const updateCancelRequested = db.prepare(`
    UPDATE memory_sandbox_runs
    SET cancel_requested = 1,
        cancel_reason = COALESCE(?, cancel_reason),
        updated_at = ?
    WHERE id = ? AND tenant_id = ? AND scope = ?
  `);
  const getRunStatusAndCancel = db.prepare<Pick<SandboxRunRecord, "id" | "status" | "cancel_requested" | "cancel_reason">>(`
    SELECT id, status, cancel_requested, cancel_reason
    FROM memory_sandbox_runs
    WHERE id = ? AND tenant_id = ? AND scope = ?
    LIMIT 1
  `);
  const cancelQueuedRun = db.prepare(`
    UPDATE memory_sandbox_runs
    SET status = 'canceled',
        finished_at = ?,
        error = COALESCE(error, 'canceled_before_execution'),
        result_json = ?,
        updated_at = ?
    WHERE id = ? AND status = 'queued'
  `);
  const claimQueuedRun = db.prepare(`
    UPDATE memory_sandbox_runs
    SET status = 'running',
        started_at = COALESCE(started_at, ?),
        updated_at = ?
    WHERE id = ? AND status = 'queued'
  `);
  const getRunningRun = db.prepare<SandboxRunRecord>(`
    SELECT *
    FROM memory_sandbox_runs
    WHERE id = ? AND status = 'running'
    LIMIT 1
  `);
  const finalizeRun = db.prepare(`
    UPDATE memory_sandbox_runs
    SET status = ?,
        stdout_text = ?,
        stderr_text = ?,
        output_truncated = ?,
        exit_code = ?,
        error = ?,
        result_json = ?,
        finished_at = ?,
        updated_at = ?
    WHERE id = ?
  `);
  const finalizeIfRunning = db.prepare(`
    UPDATE memory_sandbox_runs
    SET status = ?,
        stdout_text = ?,
        stderr_text = ?,
        output_truncated = ?,
        exit_code = ?,
        error = ?,
        result_json = ?,
        finished_at = ?,
        updated_at = ?
    WHERE id = ? AND status = 'running'
  `);
  const touchRunningRun = db.prepare(`
    UPDATE memory_sandbox_runs
    SET updated_at = ?
    WHERE id = ? AND status = 'running'
  `);
  const listStaleRunningRuns = db.prepare<SandboxRunRecord>(`
    SELECT *
    FROM memory_sandbox_runs
    WHERE status = 'running' AND updated_at < ?
    ORDER BY updated_at ASC
    LIMIT ?
  `);
  const insertTelemetry = db.prepare(`
    INSERT INTO memory_sandbox_run_telemetry (
      id, run_id, tenant_id, scope, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  return {
    async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
      const normalized = normalizeSql(sql);

      if (normalized.includes("INSERT INTO memory_sandbox_sessions")) {
        const id = randomUUID();
        const createdAt = nowIso();
        insertSession.run(
          id,
          String(params[0] ?? ""),
          String(params[1] ?? ""),
          String(params[2] ?? "default"),
          String(params[3] ?? "{}"),
          params[4] ? String(params[4]) : null,
          createdAt,
          createdAt,
        );
        const session = getSession.get(id, String(params[0] ?? ""), String(params[1] ?? "")) as SandboxSessionRecord | undefined;
        const row = session ? toSessionRow(session) : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (
        normalized.includes("FROM memory_sandbox_sessions")
        && normalized.includes("WHERE id = $1")
        && normalized.includes("tenant_id = $2")
        && normalized.includes("scope = $3")
      ) {
        const session = getSession.get(String(params[0] ?? ""), String(params[1] ?? ""), String(params[2] ?? "")) as SandboxSessionRecord | undefined;
        const row = session
          ? {
              id: session.id,
              expires_at: session.expires_at,
            }
          : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes("INSERT INTO memory_sandbox_runs")) {
        const createdAt = nowIso();
        insertRun.run(
          String(params[0] ?? ""),
          String(params[1] ?? ""),
          String(params[2] ?? ""),
          String(params[3] ?? ""),
          params[4] ? String(params[4]) : null,
          params[5] ? String(params[5]) : null,
          params[6] ? String(params[6]) : null,
          "command",
          String(params[7] ?? "{}"),
          String(params[8] ?? "async"),
          "queued",
          Number(params[9] ?? 0),
          String(params[10] ?? "{}"),
          createdAt,
          createdAt,
        );
        const run = getRunByIdTenantScope.get(String(params[0] ?? ""), String(params[2] ?? ""), String(params[3] ?? "")) as SandboxRunRecord | undefined;
        const row = run ? toRunPayloadRow(run) : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (
        normalized.includes("FROM memory_sandbox_runs")
        && normalized.includes("WHERE id = $1")
        && normalized.includes("tenant_id = $2")
        && normalized.includes("scope = $3")
        && normalized.includes("LIMIT 1")
        && normalized.includes("stdout_text")
        && normalized.includes("stderr_text")
        && !normalized.includes("AND status = 'running'")
      ) {
        const run = getRunByIdTenantScope.get(String(params[0] ?? ""), String(params[1] ?? ""), String(params[2] ?? "")) as SandboxRunRecord | undefined;
        if (normalized.includes("tail_bytes")) {
          const logs = run
            ? {
                id: run.id,
                status: run.status,
                stdout_text: run.stdout_text ?? "",
                stderr_text: run.stderr_text ?? "",
                output_truncated: run.output_truncated === 1,
              }
            : null;
          return { rows: logs ? [logs as T] : [], rowCount: logs ? 1 : 0 };
        }
        const row = run ? toRunPayloadRow(run) : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (
        normalized.includes("FROM memory_sandbox_runs")
        && normalized.includes("WHERE id = $1")
        && normalized.includes("tenant_id = $2")
        && normalized.includes("scope = $3")
        && normalized.includes("LIMIT 1")
        && normalized.includes("SELECT id::text, status::text")
      ) {
        const run = getRunLogs.get(String(params[0] ?? ""), String(params[1] ?? ""), String(params[2] ?? "")) as
          | Pick<SandboxRunRecord, "id" | "status" | "stdout_text" | "stderr_text" | "output_truncated">
          | undefined;
        const row = run
          ? {
              id: run.id,
              status: run.status,
              stdout_text: run.stdout_text ?? "",
              stderr_text: run.stderr_text ?? "",
              output_truncated: run.output_truncated === 1,
            }
          : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes("SET cancel_requested = true")) {
        const updatedAt = nowIso();
        updateCancelRequested.run(
          params[3] ? String(params[3]) : null,
          updatedAt,
          String(params[0] ?? ""),
          String(params[1] ?? ""),
          String(params[2] ?? ""),
        );
        const run = getRunStatusAndCancel.get(String(params[0] ?? ""), String(params[1] ?? ""), String(params[2] ?? "")) as
          | Pick<SandboxRunRecord, "id" | "status" | "cancel_requested" | "cancel_reason">
          | undefined;
        const row = run
          ? {
              id: run.id,
              status: run.status,
              cancel_requested: run.cancel_requested === 1,
              cancel_reason: run.cancel_reason,
            }
          : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes("WHERE id = $1") && normalized.includes("status = 'queued'") && normalized.includes("finished_at = now()")) {
        const finishedAt = nowIso();
        const existing = getRunningOrQueuedRunById(db, String(params[0] ?? ""));
        const nextResult = JSON.stringify({
          ...parseJsonObject(existing?.result_json),
          canceled: true,
        });
        cancelQueuedRun.run(finishedAt, nextResult, finishedAt, String(params[0] ?? ""));
        const run = getRunById(db, String(params[0] ?? ""));
        const row = run ? toRunPayloadRow(run) : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes("SET updated_at = now()") && normalized.includes("WHERE id = $1") && normalized.includes("status = 'running'") && !normalized.includes("RETURNING")) {
        touchRunningRun.run(nowIso(), String(params[0] ?? ""));
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes("updated_at < now() - make_interval(secs => $1::int)")) {
        const cutoff = new Date(Date.now() - Math.max(1, Number(params[0] ?? 0)) * 1000).toISOString();
        const limit = Math.max(1, Number(params[1] ?? 1));
        const rows = listStaleRunningRuns
          .all(cutoff, limit)
          .map((row) => toRunPayloadRow(row)) as T[];
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes("SET status = 'running'") && normalized.includes("WHERE id = $1") && normalized.includes("status = 'queued'")) {
        const startedAt = nowIso();
        claimQueuedRun.run(startedAt, startedAt, String(params[0] ?? ""));
        const run = getRunningRun.get(String(params[0] ?? "")) as SandboxRunRecord | undefined;
        const row = run ? toRunPayloadRow(run) : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes("FROM memory_sandbox_runs") && normalized.includes("AND status = 'running'") && normalized.includes("LIMIT 1")) {
        const run = getRunningRun.get(String(params[0] ?? "")) as SandboxRunRecord | undefined;
        const row = run ? toRunPayloadRow(run) : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes("SET status = $2") && normalized.includes("WHERE id = $1") && normalized.includes("RETURNING")) {
        const finishedAt = nowIso();
        const update = normalized.includes("AND status = 'running'") ? finalizeIfRunning : finalizeRun;
        update.run(
          String(params[1] ?? ""),
          String(params[2] ?? ""),
          String(params[3] ?? ""),
          params[4] ? 1 : 0,
          Number.isFinite(Number(params[5])) ? Number(params[5]) : null,
          params[6] ? String(params[6]) : null,
          String(params[7] ?? "{}"),
          finishedAt,
          finishedAt,
          String(params[0] ?? ""),
        );
        const run = getRunById(db, String(params[0] ?? ""));
        const row = run ? toRunPayloadRow(run) : null;
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes("INSERT INTO memory_sandbox_run_telemetry")) {
        insertTelemetry.run(
          randomUUID(),
          String(params[0] ?? ""),
          String(params[1] ?? ""),
          String(params[2] ?? ""),
          String(params[3] ?? ""),
          nowIso(),
        );
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

function getRunById(db: SqliteDatabase, runId: string): SandboxRunRecord | undefined {
  return db.prepare<SandboxRunRecord>(`
    SELECT *
    FROM memory_sandbox_runs
    WHERE id = ?
    LIMIT 1
  `).get(runId);
}

function getRunningOrQueuedRunById(db: SqliteDatabase, runId: string): SandboxRunRecord | undefined {
  return db.prepare<SandboxRunRecord>(`
    SELECT *
    FROM memory_sandbox_runs
    WHERE id = ? AND status IN ('queued', 'running')
    LIMIT 1
  `).get(runId);
}

function initialize(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_sandbox_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      profile TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_sandbox_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      project_id TEXT,
      planner_run_id TEXT,
      decision_id TEXT,
      action_kind TEXT NOT NULL,
      action_json TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      timeout_ms INTEGER NOT NULL,
      stdout_text TEXT NOT NULL DEFAULT '',
      stderr_text TEXT NOT NULL DEFAULT '',
      output_truncated INTEGER NOT NULL DEFAULT 0,
      exit_code INTEGER,
      error TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      cancel_reason TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_sandbox_runs_tenant_scope
      ON memory_sandbox_runs (tenant_id, scope, created_at);
    CREATE INDEX IF NOT EXISTS idx_memory_sandbox_runs_status_updated
      ON memory_sandbox_runs (status, updated_at);

    CREATE TABLE IF NOT EXISTS memory_sandbox_run_telemetry (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function createLiteHostStore(path: string): MemoryStore {
  mkdirSync(dirname(path), { recursive: true });
  const db = createSqliteDatabase(path);
  initialize(db);
  const client = createQueryClient(db);

  return {
    backend: "embedded",
    async withClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
      return fn(client);
    },
    async withTx<T>(fn: (client: any) => Promise<T>): Promise<T> {
      return fn(client);
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}
