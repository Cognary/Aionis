import pg from "pg";

export type Db = {
  pool: pg.Pool;
};

export type DbPoolOptions = {
  max?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

export function createDb(databaseUrl: string, opts: DbPoolOptions = {}): Db {
  const max = opts.max ?? envInt("DB_POOL_MAX", 30);
  const idleTimeoutMs = opts.idleTimeoutMs ?? envInt("DB_POOL_IDLE_TIMEOUT_MS", 30_000);
  const connectionTimeoutMs = opts.connectionTimeoutMs ?? envInt("DB_POOL_CONNECTION_TIMEOUT_MS", 5_000);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    idleTimeoutMillis: idleTimeoutMs,
    connectionTimeoutMillis: connectionTimeoutMs,
  });
  return { pool };
}

export async function withClient<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTx<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDb(db: Db): Promise<void> {
  await db.pool.end();
}
