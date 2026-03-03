import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function optText(v: string | null): string | null {
  if (!v) return null;
  const out = v.trim();
  return out.length > 0 ? out : null;
}

async function tableExists(table: string): Promise<boolean> {
  const out = await db.pool.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS ok
    `,
    [table],
  );
  return !!out.rows[0]?.ok;
}

async function countTelemetryOlderThan(cutoffIso: string, tenantId: string | null, scope: string | null): Promise<number> {
  const out = await db.pool.query<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM memory_sandbox_run_telemetry
    WHERE created_at < $1::timestamptz
      AND ($2::text IS NULL OR tenant_id = $2)
      AND ($3::text IS NULL OR scope = $3)
    `,
    [cutoffIso, tenantId, scope],
  );
  return Number(out.rows[0]?.n ?? "0");
}

async function countRunsOlderThan(cutoffIso: string, tenantId: string | null, scope: string | null): Promise<number> {
  const out = await db.pool.query<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM memory_sandbox_runs
    WHERE status IN ('succeeded', 'failed', 'canceled', 'timeout')
      AND COALESCE(finished_at, updated_at, created_at) < $1::timestamptz
      AND ($2::text IS NULL OR tenant_id = $2)
      AND ($3::text IS NULL OR scope = $3)
    `,
    [cutoffIso, tenantId, scope],
  );
  return Number(out.rows[0]?.n ?? "0");
}

async function countSessionsOlderThan(cutoffIso: string, tenantId: string | null, scope: string | null): Promise<number> {
  const out = await db.pool.query<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM memory_sandbox_sessions s
    WHERE COALESCE(s.expires_at, s.updated_at, s.created_at) < $1::timestamptz
      AND ($2::text IS NULL OR s.tenant_id = $2)
      AND ($3::text IS NULL OR s.scope = $3)
      AND NOT EXISTS (
        SELECT 1 FROM memory_sandbox_runs r WHERE r.session_id = s.id
      )
    `,
    [cutoffIso, tenantId, scope],
  );
  return Number(out.rows[0]?.n ?? "0");
}

async function deleteTelemetryBatch(cutoffIso: string, tenantId: string | null, scope: string | null, batchSize: number): Promise<number> {
  const out = await db.pool.query<{ n: number }>(
    `
    WITH picked AS (
      SELECT id
      FROM memory_sandbox_run_telemetry
      WHERE created_at < $1::timestamptz
        AND ($2::text IS NULL OR tenant_id = $2)
        AND ($3::text IS NULL OR scope = $3)
      ORDER BY id
      LIMIT $4
    ),
    deleted AS (
      DELETE FROM memory_sandbox_run_telemetry t
      USING picked p
      WHERE t.id = p.id
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM deleted
    `,
    [cutoffIso, tenantId, scope, batchSize],
  );
  return Number(out.rows[0]?.n ?? 0);
}

async function deleteRunsBatch(cutoffIso: string, tenantId: string | null, scope: string | null, batchSize: number): Promise<number> {
  const out = await db.pool.query<{ n: number }>(
    `
    WITH picked AS (
      SELECT id
      FROM memory_sandbox_runs
      WHERE status IN ('succeeded', 'failed', 'canceled', 'timeout')
        AND COALESCE(finished_at, updated_at, created_at) < $1::timestamptz
        AND ($2::text IS NULL OR tenant_id = $2)
        AND ($3::text IS NULL OR scope = $3)
      ORDER BY created_at
      LIMIT $4
    ),
    deleted AS (
      DELETE FROM memory_sandbox_runs r
      USING picked p
      WHERE r.id = p.id
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM deleted
    `,
    [cutoffIso, tenantId, scope, batchSize],
  );
  return Number(out.rows[0]?.n ?? 0);
}

async function deleteSessionsBatch(cutoffIso: string, tenantId: string | null, scope: string | null, batchSize: number): Promise<number> {
  const out = await db.pool.query<{ n: number }>(
    `
    WITH picked AS (
      SELECT s.id
      FROM memory_sandbox_sessions s
      WHERE COALESCE(s.expires_at, s.updated_at, s.created_at) < $1::timestamptz
        AND ($2::text IS NULL OR s.tenant_id = $2)
        AND ($3::text IS NULL OR s.scope = $3)
        AND NOT EXISTS (
          SELECT 1 FROM memory_sandbox_runs r WHERE r.session_id = s.id
        )
      ORDER BY s.created_at
      LIMIT $4
    ),
    deleted AS (
      DELETE FROM memory_sandbox_sessions s
      USING picked p
      WHERE s.id = p.id
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM deleted
    `,
    [cutoffIso, tenantId, scope, batchSize],
  );
  return Number(out.rows[0]?.n ?? 0);
}

async function deleteInBatches(fn: () => Promise<number>): Promise<{ deleted: number; batches: number }> {
  let deleted = 0;
  let batches = 0;
  for (;;) {
    const n = await fn();
    if (n <= 0) break;
    deleted += n;
    batches += 1;
  }
  return { deleted, batches };
}

async function main() {
  const retentionDays = clampInt(Number(argValue("--retention-days") ?? String(env.SANDBOX_RETENTION_DAYS)), 1, 3650);
  const batchSize = clampInt(Number(argValue("--batch-size") ?? String(env.SANDBOX_RETENTION_BATCH_SIZE)), 100, 200_000);
  const tenantId = optText(argValue("--tenant-id"));
  const scope = optText(argValue("--scope"));
  const apply = hasFlag("--apply");
  const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const hasTelemetryTable = await tableExists("memory_sandbox_run_telemetry");
  const out: any = {
    ok: true,
    apply,
    retention_days: retentionDays,
    batch_size: batchSize,
    tenant_id: tenantId,
    scope,
    cutoff_iso: cutoffIso,
    tables: {
      telemetry: { exists: hasTelemetryTable, candidates: 0, deleted: 0, batches: 0 },
      runs: { exists: true, candidates: 0, deleted: 0, batches: 0 },
      sessions: { exists: true, candidates: 0, deleted: 0, batches: 0 },
    },
    warnings: [] as string[],
  };

  if (hasTelemetryTable) {
    out.tables.telemetry.candidates = await countTelemetryOlderThan(cutoffIso, tenantId, scope);
  } else {
    out.warnings.push("memory_sandbox_run_telemetry table is missing; telemetry retention skipped.");
  }
  out.tables.runs.candidates = await countRunsOlderThan(cutoffIso, tenantId, scope);
  out.tables.sessions.candidates = await countSessionsOlderThan(cutoffIso, tenantId, scope);

  if (apply) {
    if (hasTelemetryTable) {
      const telemetryResult = await deleteInBatches(async () => await deleteTelemetryBatch(cutoffIso, tenantId, scope, batchSize));
      out.tables.telemetry.deleted = telemetryResult.deleted;
      out.tables.telemetry.batches = telemetryResult.batches;
    }

    const runsResult = await deleteInBatches(async () => await deleteRunsBatch(cutoffIso, tenantId, scope, batchSize));
    out.tables.runs.deleted = runsResult.deleted;
    out.tables.runs.batches = runsResult.batches;

    const sessionsResult = await deleteInBatches(async () => await deleteSessionsBatch(cutoffIso, tenantId, scope, batchSize));
    out.tables.sessions.deleted = sessionsResult.deleted;
    out.tables.sessions.batches = sessionsResult.batches;
  }

  out.totals = {
    candidates: out.tables.telemetry.candidates + out.tables.runs.candidates + out.tables.sessions.candidates,
    deleted: out.tables.telemetry.deleted + out.tables.runs.deleted + out.tables.sessions.deleted,
    batches: out.tables.telemetry.batches + out.tables.runs.batches + out.tables.sessions.batches,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
