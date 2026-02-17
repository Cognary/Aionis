import "dotenv/config";
import { execFileSync } from "node:child_process";
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

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function round(v: number, d = 3): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

async function outboxSnapshot(scope: string) {
  return withTx(db, async (client) => {
    const r = await client.query<{
      unpublished: string;
      failed: string;
      claimed: string;
    }>(
      `
      SELECT
        count(*) FILTER (WHERE published_at IS NULL)::text AS unpublished,
        count(*) FILTER (WHERE failed_at IS NOT NULL)::text AS failed,
        count(*) FILTER (WHERE published_at IS NULL AND failed_at IS NULL AND claimed_at IS NOT NULL)::text AS claimed
      FROM memory_outbox
      WHERE scope = $1
      `,
      [scope],
    );
    return {
      unpublished: Number(r.rows[0]?.unpublished ?? 0),
      failed: Number(r.rows[0]?.failed ?? 0),
      claimed: Number(r.rows[0]?.claimed ?? 0),
    };
  });
}

function runOnce(cmd: string[], scope: string) {
  const t0 = process.hrtime.bigint();
  const out = execFileSync(cmd[0], cmd.slice(1), {
    encoding: "utf-8",
    env: { ...process.env, MEMORY_SCOPE: scope },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
  const json = JSON.parse(out) as {
    ok?: boolean;
    claimed?: number;
    processed?: number;
    topic_cluster_runs?: number;
    embed_backfill_runs?: number;
    failed_marked?: number;
  };
  return {
    ms,
    ok: json.ok === true,
    claimed: Number(json.claimed ?? 0),
    processed: Number(json.processed ?? 0),
    topic_cluster_runs: Number(json.topic_cluster_runs ?? 0),
    embed_backfill_runs: Number(json.embed_backfill_runs ?? 0),
    failed_marked: Number(json.failed_marked ?? 0),
  };
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const iterations = clampInt(Number(argValue("--iterations") ?? "5"), 1, 200);
  const command = ["npm", "run", "-s", "job:outbox-worker", "--", "--once"];

  const before = await outboxSnapshot(scope);
  const startedAt = Date.now();
  const perIter = [];
  let processed = 0;
  let claimed = 0;
  let topicRuns = 0;
  let embedRuns = 0;
  let failedMarked = 0;
  let elapsedMs = 0;

  for (let i = 0; i < iterations; i += 1) {
    const r = runOnce(command, scope);
    perIter.push({
      iter: i + 1,
      elapsed_ms: round(r.ms),
      claimed: r.claimed,
      processed: r.processed,
      topic_cluster_runs: r.topic_cluster_runs,
      embed_backfill_runs: r.embed_backfill_runs,
      failed_marked: r.failed_marked,
    });
    processed += r.processed;
    claimed += r.claimed;
    topicRuns += r.topic_cluster_runs;
    embedRuns += r.embed_backfill_runs;
    failedMarked += r.failed_marked;
    elapsedMs += r.ms;
  }

  const after = await outboxSnapshot(scope);
  const wallMs = Date.now() - startedAt;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        scope,
        command: command.join(" "),
        iterations,
        totals: {
          claimed,
          processed,
          topic_cluster_runs: topicRuns,
          embed_backfill_runs: embedRuns,
          failed_marked: failedMarked,
          elapsed_ms_sum: round(elapsedMs),
          elapsed_ms_wall: wallMs,
          throughput_processed_per_sec: elapsedMs > 0 ? round(processed / (elapsedMs / 1000), 2) : 0,
        },
        outbox_before: before,
        outbox_after: after,
        per_iteration: perIter,
      },
      null,
      2,
    ),
  );
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
