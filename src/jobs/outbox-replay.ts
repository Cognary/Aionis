import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";

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

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const idStr = argValue("--id");
  const eventType = argValue("--event-type");
  const limit = Number(argValue("--limit") ?? "200");
  const dryRun = hasFlag("--dry-run");
  const includePublished = hasFlag("--include-published");

  if (!idStr && !eventType && !hasFlag("--all-failed")) {
    throw new Error("usage: --id <id> | --event-type <type> | --all-failed [--scope s] [--limit n] [--dry-run]");
  }

  const where: string[] = ["scope = $1"];
  const args: any[] = [scope];

  if (!includePublished) where.push("published_at IS NULL");

  if (idStr) {
    where.push("id = $2");
    args.push(Number(idStr));
  } else if (eventType) {
    where.push("event_type = $2");
    args.push(eventType);
    where.push("failed_at IS NOT NULL");
  } else if (hasFlag("--all-failed")) {
    where.push("failed_at IS NOT NULL");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const preview = await withTx(db, async (client) => {
    const r = await client.query(
      `
      SELECT id, event_type, attempts, failed_at, left(coalesce(last_error,''),120) AS last_error
      FROM memory_outbox
      ${whereSql}
      ORDER BY id ASC
      LIMIT ${Math.max(1, Math.min(1000, limit))}
      `,
      args,
    );
    return r.rows;
  });

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, dry_run: true, scope, matched: preview.length, sample: preview.slice(0, 20) }, null, 2));
    return;
  }

  const updated = await withTx(db, async (client) => {
    const r = await client.query(
      `
      WITH target AS (
        SELECT id
        FROM memory_outbox
        ${whereSql}
        ORDER BY id ASC
        LIMIT ${Math.max(1, Math.min(1000, limit))}
        FOR UPDATE
      )
      UPDATE memory_outbox o
      SET
        failed_at = NULL,
        failed_reason = NULL,
        claimed_at = NULL,
        attempts = 0,
        last_error = NULL
      FROM target t
      WHERE o.id = t.id
      RETURNING o.id
      `,
      args,
    );
    return r.rowCount;
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, scope, matched: preview.length, replayed: updated, sample: preview.slice(0, 20) }, null, 2));
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });

