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

function trimOrNull(v: string | null): string | null {
  if (!v) return null;
  const out = v.trim();
  return out.length > 0 ? out : null;
}

function chunked<T>(items: T[], batchSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) out.push(items.slice(i, i + batchSize));
  return out;
}

function inferEmbeddingModel(): string | null {
  try {
    return createEmbeddingProviderFromEnv(process.env)?.name ?? null;
  } catch {
    return null;
  }
}

type TargetRow = {
  id: string;
  embed_text: string;
};

async function run() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const limit = clampInt(Number(argValue("--limit") ?? "5000"), 1, 50_000);
  const batchSize = clampInt(Number(argValue("--batch-size") ?? "200"), 1, 2000);
  const sampleLimit = clampInt(Number(argValue("--sample") ?? "20"), 1, 200);
  const dryRun = hasFlag("--dry-run");
  const requestedModel = trimOrNull(argValue("--model"));
  const model = requestedModel ?? inferEmbeddingModel();
  const startedAt = new Date().toISOString();

  if (!dryRun && !model) {
    throw new Error("embedding-untracked-repair requires --model <provider:model> (or EMBEDDING_PROVIDER env configured)");
  }

  const out = await withTx(db, async (client) => {
    const totalsRes = await client.query<{ eligible_total: string; expected_total: string; untracked_total: string }>(
      `
      SELECT
        count(*) FILTER (
          WHERE tier IN ('hot', 'warm')
            AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
            AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
        )::text AS eligible_total,
        count(*) FILTER (
          WHERE tier IN ('hot', 'warm')
            AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
            AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
            AND (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
        )::text AS expected_total,
        count(*) FILTER (
          WHERE tier IN ('hot', 'warm')
            AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
            AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
            AND NOT (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
        )::text AS untracked_total
      FROM memory_nodes
      WHERE scope = $1
      `,
      [scope],
    );

    const statusRes = await client.query<{ status: string; n: string }>(
      `
      SELECT coalesce(embedding_status::text, '(null)') AS status, count(*)::text AS n
      FROM memory_nodes
      WHERE scope = $1
        AND tier IN ('hot', 'warm')
        AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
        AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
        AND NOT (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
      GROUP BY 1
      ORDER BY count(*) DESC, status ASC
      `,
      [scope],
    );

    const lastErrorRes = await client.query<{ last_error: string; n: string }>(
      `
      SELECT
        coalesce(nullif(btrim(embedding_last_error), ''), '(null)') AS last_error,
        count(*)::text AS n
      FROM memory_nodes
      WHERE scope = $1
        AND tier IN ('hot', 'warm')
        AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
        AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
        AND NOT (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
      GROUP BY 1
      ORDER BY count(*) DESC, last_error ASC
      LIMIT 10
      `,
      [scope],
    );

    const sampleRes = await client.query<{
      id: string;
      type: string;
      tier: string;
      embedding_status: string;
      embedding_last_error: string | null;
      text_preview: string;
      updated_at: string;
    }>(
      `
      SELECT
        id,
        type::text AS type,
        tier::text AS tier,
        embedding_status::text AS embedding_status,
        embedding_last_error,
        left(coalesce(text_summary, title, ''), 140) AS text_preview,
        updated_at::text AS updated_at
      FROM memory_nodes
      WHERE scope = $1
        AND tier IN ('hot', 'warm')
        AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
        AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
        AND NOT (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
      ORDER BY updated_at DESC
      LIMIT $2
      `,
      [scope, sampleLimit],
    );

    const eligibleTotal = Number(totalsRes.rows[0]?.eligible_total ?? 0);
    const expectedTotal = Number(totalsRes.rows[0]?.expected_total ?? 0);
    const untrackedTotal = Number(totalsRes.rows[0]?.untracked_total ?? 0);
    const selected = Math.min(untrackedTotal, limit);
    const planning = {
      eligible_total: eligibleTotal,
      expected_total: expectedTotal,
      untracked_total: untrackedTotal,
      selected,
      batch_size: batchSize,
      estimated_batches: selected > 0 ? Math.ceil(selected / batchSize) : 0,
      status_breakdown: statusRes.rows.map((r) => ({ status: r.status, count: Number(r.n) })),
      top_last_errors: lastErrorRes.rows.map((r) => ({ last_error: r.last_error, count: Number(r.n) })),
      sample: sampleRes.rows,
    };

    if (dryRun || selected === 0) {
      return {
        dry_run: dryRun,
        scope,
        limit,
        batch_size: batchSize,
        model,
        planning,
        apply: {
          updated_nodes: 0,
          enqueued_jobs: 0,
          enqueued_nodes: 0,
          duplicate_jobs: 0,
          remaining_untracked: untrackedTotal,
          commit_id: null as string | null,
          commit_hash: null as string | null,
        },
      };
    }

    const targetRes = await client.query<TargetRow>(
      `
      SELECT
        id,
        coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) AS embed_text
      FROM memory_nodes
      WHERE scope = $1
        AND tier IN ('hot', 'warm')
        AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
        AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
        AND NOT (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
      ORDER BY updated_at DESC
      LIMIT $2
      FOR UPDATE
      `,
      [scope, limit],
    );

    const targetRows = targetRes.rows.filter((r) => r.embed_text && r.embed_text.trim().length > 0);
    if (targetRows.length === 0) {
      return {
        dry_run: false,
        scope,
        limit,
        batch_size: batchSize,
        model,
        planning,
        apply: {
          updated_nodes: 0,
          enqueued_jobs: 0,
          enqueued_nodes: 0,
          duplicate_jobs: 0,
          remaining_untracked: untrackedTotal,
          commit_id: null as string | null,
          commit_hash: null as string | null,
        },
      };
    }

    const parentRes = await client.query<{ id: string; commit_hash: string }>(
      "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
      [scope],
    );
    const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
    const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;
    const inputSha = sha256Hex(`job:embedding_untracked_repair:${scope}:${startedAt}:${limit}:${batchSize}:${model}`);
    const diff = {
      job: "embedding_untracked_repair",
      params: { scope, limit, batch_size: batchSize, model },
      result: {
        untracked_before: untrackedTotal,
        selected_for_repair: targetRows.length,
        estimated_batches: Math.ceil(targetRows.length / batchSize),
      },
      started_at: startedAt,
    };
    const diffSha = sha256Hex(stableStringify(diff));
    const commitHash = sha256Hex(stableStringify({ parentHash, inputSha, diffSha, scope, actor: "job", kind: "embedding_untracked_repair" }));
    const commitRes = await client.query<{ id: string }>(
      `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
       VALUES ($1, $2, $3, $4::jsonb, 'job', $5)
       ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
       RETURNING id`,
      [scope, parentId, inputSha, JSON.stringify(diff), commitHash],
    );
    const commitId = commitRes.rows[0]?.id ?? null;
    if (!commitId) {
      throw new Error("failed to create repair commit");
    }

    const ids = targetRows.map((r) => r.id);
    const updRes = await client.query<{ id: string }>(
      `
      UPDATE memory_nodes
      SET
        embedding_status = 'pending',
        embedding_model = COALESCE(NULLIF(btrim(embedding_model), ''), $3),
        embedding_last_error = NULL
      WHERE scope = $1
        AND id = ANY($2::uuid[])
      RETURNING id
      `,
      [scope, ids, model],
    );
    const updatedNodes = updRes.rowCount ?? 0;

    let enqueuedJobs = 0;
    let enqueuedNodes = 0;
    let duplicateJobs = 0;
    for (const batch of chunked(targetRows, batchSize)) {
      const payload = { nodes: batch.map((x) => ({ id: x.id, text: x.embed_text })) };
      const payloadSha = sha256Hex(stableStringify(payload));
      const jobKey = sha256Hex(stableStringify({ v: 1, scope, commit_id: commitId, event_type: "embed_nodes", payloadSha }));
      const outboxRes = await client.query(
        `INSERT INTO memory_outbox (scope, commit_id, event_type, job_key, payload_sha256, payload)
         VALUES ($1, $2, 'embed_nodes', $3, $4, $5::jsonb)
         ON CONFLICT (scope, event_type, job_key) DO NOTHING`,
        [scope, commitId, jobKey, payloadSha, JSON.stringify(payload)],
      );
      if ((outboxRes.rowCount ?? 0) > 0) {
        enqueuedJobs += 1;
        enqueuedNodes += batch.length;
      } else {
        duplicateJobs += 1;
      }
    }

    const remainingRes = await client.query<{ n: string }>(
      `
      SELECT count(*)::text AS n
      FROM memory_nodes
      WHERE scope = $1
        AND tier IN ('hot', 'warm')
        AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
        AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
        AND NOT (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
      `,
      [scope],
    );

    return {
      dry_run: false,
      scope,
      limit,
      batch_size: batchSize,
      model,
      planning,
      apply: {
        updated_nodes: updatedNodes,
        enqueued_jobs: enqueuedJobs,
        enqueued_nodes: enqueuedNodes,
        duplicate_jobs: duplicateJobs,
        remaining_untracked: Number(remainingRes.rows[0]?.n ?? 0),
        commit_id: commitId,
        commit_hash: commitHash,
      },
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
