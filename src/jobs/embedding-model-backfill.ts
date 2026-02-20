import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { createEmbeddingProviderFromEnv } from "../embeddings/index.js";
import { sha256Hex } from "../util/crypto.js";

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

async function run() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const limit = clampInt(Number(argValue("--limit") ?? "5000"), 1, 50_000);
  const dryRun = hasFlag("--dry-run");

  const embedder = (() => {
    try {
      return createEmbeddingProviderFromEnv(process.env);
    } catch {
      return null;
    }
  })();

  const model = argValue("--model") ?? embedder?.name ?? null;
  if (!model) {
    throw new Error("embedding-model-backfill requires --model <string> (or configure EMBEDDING_PROVIDER env)");
  }

  const startedAt = new Date().toISOString();

  const out = await withTx(db, async (client) => {
    const countRes = await client.query<{ n: string }>(
      `
      SELECT count(*)::text AS n
      FROM memory_nodes
      WHERE scope = $1
        AND embedding_status = 'ready'
        AND embedding IS NOT NULL
        AND (
          embedding_model IS NULL
          OR btrim(embedding_model) = ''
          OR lower(btrim(embedding_model)) LIKE 'unknown:%'
          OR lower(btrim(embedding_model)) = 'fake'
        )
      `,
      [scope],
    );
    const missing = Number(countRes.rows[0]?.n ?? 0);

    if (dryRun) {
      return { dry_run: true, scope, model, missing, updated: 0, commit_id: null as string | null, commit_hash: null as string | null };
    }

    const upd = await client.query<{ id: string }>(
      `
      WITH target AS (
        SELECT id
        FROM memory_nodes
        WHERE scope = $1
          AND embedding_status = 'ready'
          AND embedding IS NOT NULL
          AND (
            embedding_model IS NULL
            OR btrim(embedding_model) = ''
            OR lower(btrim(embedding_model)) LIKE 'unknown:%'
            OR lower(btrim(embedding_model)) = 'fake'
          )
        ORDER BY updated_at DESC
        LIMIT $3
        FOR UPDATE
      )
      UPDATE memory_nodes n
      SET embedding_model = $2
      FROM target t
      WHERE n.id = t.id
      RETURNING n.id
      `,
      [scope, model, limit],
    );

    if ((upd.rowCount ?? 0) === 0) {
      return {
        dry_run: false,
        scope,
        model,
        missing,
        updated: 0,
        commit_id: null as string | null,
        commit_hash: null as string | null,
      };
    }

    // Compute commit chain (auditability) only when data changed.
    const parentRes = await client.query<{ id: string; commit_hash: string }>(
      "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
      [scope],
    );
    const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
    const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

    const inputSha = sha256Hex(`job:embedding_model_backfill:${scope}:${startedAt}:${model}:${limit}`);

    const diff = {
      job: "embedding_model_backfill",
      params: { model, limit },
      result: { missing_before: missing, updated: upd.rowCount ?? 0 },
      started_at: startedAt,
    };
    const diffSha = sha256Hex(stableStringify(diff));
    const commitHash = sha256Hex(stableStringify({ parentHash, inputSha, diffSha, scope, actor: "job", kind: "embedding_model_backfill" }));

    const commitRes = await client.query<{ id: string }>(
      `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
       VALUES ($1, $2, $3, $4::jsonb, 'job', $5)
       ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
       RETURNING id`,
      [scope, parentId, inputSha, JSON.stringify(diff), commitHash],
    );

    return {
      dry_run: false,
      scope,
      model,
      missing,
      updated: upd.rowCount ?? 0,
      commit_id: commitRes.rows[0].id,
      commit_hash: commitHash,
    };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...out }, null, 2));
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
