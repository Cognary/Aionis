import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { runTopicClusterForEventIds } from "./topicClusterLib.js";
import { createEmbeddingProviderFromEnv } from "../embeddings/index.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { runEmbedBackfill } from "./embedBackfillLib.js";
import { sha256Hex } from "../util/crypto.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
let embedder: EmbeddingProvider | null = null;
try {
  embedder = createEmbeddingProviderFromEnv(process.env);
} catch (e: any) {
  // Worker can still process non-embedding jobs even if embedding provider is misconfigured.
  // eslint-disable-next-line no-console
  console.error(`embedding provider disabled in worker: ${String(e?.message ?? e)}`);
  embedder = null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processBatch(): Promise<{
  scope: string;
  claimed: number;
  processed: number;
  topic_cluster_runs: number;
  embed_backfill_runs: number;
  failed_marked: number;
  topic_commit_hashes: string[];
}> {
  const scope = env.MEMORY_SCOPE;

  // 0) Mark outbox items as FAILED once they exceed max attempts (dead-letter).
  // This prevents silent limbo when attempts reach OUTBOX_MAX_ATTEMPTS and the claim query excludes them.
  const failedMarked = await withTx(db, async (client) => {
    const r = await client.query<{ n: number }>(
      `
      WITH to_fail AS (
        SELECT id
        FROM memory_outbox
        WHERE scope = $1
          AND published_at IS NULL
          AND failed_at IS NULL
          AND attempts >= $2
      )
      UPDATE memory_outbox o
      SET failed_at = now(), failed_reason = 'max_attempts_exceeded', claimed_at = NULL
      FROM to_fail f
      WHERE o.id = f.id
      RETURNING 1
      `,
      [scope, env.OUTBOX_MAX_ATTEMPTS],
    );
    return r.rowCount ?? 0;
  });

  // 1) Claim a batch in a short transaction.
  const claimed = await withTx(db, async (client) => {
    const rows = await client.query<{
      id: number;
      commit_id: string;
      event_type: string;
      payload: any;
      attempts: number;
      claimed_at: string;
    }>(
      `
      WITH eligible AS (
        SELECT id
        FROM memory_outbox
        WHERE scope = $1
          AND published_at IS NULL
          AND failed_at IS NULL
          AND attempts < $4
          AND (
            claimed_at IS NULL
            OR claimed_at < now() - ($3::int * interval '1 millisecond')
          )
        ORDER BY
          CASE WHEN event_type = 'embed_nodes' THEN 0 WHEN event_type = 'topic_cluster' THEN 1 ELSE 2 END,
          id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE memory_outbox o
      SET claimed_at = now(), attempts = attempts + 1
      FROM eligible e
      WHERE o.id = e.id
      RETURNING o.id, o.commit_id::text AS commit_id, o.event_type, o.payload, o.attempts, o.claimed_at::text
      `,
      [scope, env.OUTBOX_BATCH_SIZE, env.OUTBOX_CLAIM_TIMEOUT_MS, env.OUTBOX_MAX_ATTEMPTS],
    );
    return rows.rows;
  });

  let processed = 0;
  let clustered = 0;
  let embedded = 0;
  const clusterHashes: string[] = [];

  // Process embed backfill first to avoid consuming topic_cluster items before embeddings exist.
  claimed.sort((a, b) => {
    const pri = (t: string) => (t === "embed_nodes" ? 0 : t === "topic_cluster" ? 1 : 2);
    const d = pri(a.event_type) - pri(b.event_type);
    return d !== 0 ? d : a.id - b.id;
  });

  // 2) Process each item in its own transaction.
  for (const r of claimed) {
    processed += 1;
    await withTx(db, async (client) => {
      try {
        if (r.event_type === "embed_nodes") {
          const nodes = Array.isArray(r.payload?.nodes) ? r.payload.nodes : [];
          const parsedNodes = nodes
            .map((x: any) => ({ id: String(x?.id ?? ""), text: String(x?.text ?? "") }))
            .filter((x: any) => x.id && x.text);
          const forceReembed = r.payload?.force_reembed === true;

          const out = await runEmbedBackfill(
            client,
            { scope, nodes: parsedNodes, maxTextLen: env.MAX_TEXT_LEN, piiRedaction: env.PII_REDACTION },
            embedder,
            { force_reembed: forceReembed },
          );

          const afterEventIds = Array.isArray(r.payload?.after_topic_cluster_event_ids)
            ? (r.payload.after_topic_cluster_event_ids as string[])
            : [];
          const canEnqueueTopicCluster = out.status === "ok" && afterEventIds.length > 0;
          if (canEnqueueTopicCluster) {
            // Idempotent enqueue: job_key prevents duplicate topic_cluster rows for the same commit+payload.
            const payload = { event_ids: afterEventIds };
            const payloadSha = sha256Hex(stableStringify(payload));
            const jobKey = sha256Hex(stableStringify({ v: 1, scope, commit_id: r.commit_id, event_type: "topic_cluster", payloadSha }));

            await client.query(
              `INSERT INTO memory_outbox (scope, commit_id, event_type, job_key, payload_sha256, payload)
               VALUES ($1, $2, 'topic_cluster', $3, $4, $5::jsonb)
               ON CONFLICT (scope, event_type, job_key) DO NOTHING`,
              [scope, r.commit_id, jobKey, payloadSha, JSON.stringify(payload)],
            );
          }

          if (out.status === "retryable_error") {
            // Keep unpublished for retry; record error and keep detailed result in payload.
            await client.query(
              `UPDATE memory_outbox
               SET
                 payload = payload || $3::jsonb,
                 claimed_at = NULL,
                 last_error = $4
               WHERE id = $1 AND claimed_at::text = $2`,
              [
                r.id,
                r.claimed_at,
                JSON.stringify({ embed_backfill: out }),
                out.error_message ?? "retryable_error",
              ],
            );
            return;
          }

          // ok or fatal_error: publish.
          await client.query(
            `UPDATE memory_outbox
             SET
               payload = payload || $3::jsonb,
               last_error = NULL,
               published_at = now()
             WHERE id = $1 AND claimed_at::text = $2`,
            [
              r.id,
              r.claimed_at,
              JSON.stringify({
                embed_backfill: out,
                ...(canEnqueueTopicCluster ? { enqueued_topic_cluster: true, topic_cluster_event_ids: afterEventIds } : {}),
              }),
            ],
          );

          embedded += 1;
          return;
        }

        if (r.event_type === "topic_cluster") {
          const eventIds = Array.isArray(r.payload?.event_ids) ? (r.payload.event_ids as string[]) : [];
          let payloadPatch: Record<string, unknown> = {};

          if (eventIds.length > 0) {
            const out = await runTopicClusterForEventIds(client, {
              scope,
              eventIds,
              simThreshold: env.TOPIC_SIM_THRESHOLD,
              minEventsPerTopic: env.TOPIC_MIN_EVENTS_PER_TOPIC,
              maxCandidatesPerEvent: env.TOPIC_MAX_CANDIDATES_PER_EVENT,
              maxTextLen: env.MAX_TEXT_LEN,
              piiRedaction: env.PII_REDACTION,
              strategy: env.TOPIC_CLUSTER_STRATEGY,
            });

            payloadPatch = {
              ...payloadPatch,
              topic_cluster: {
                processed_events: out.processed_events,
                assigned: out.assigned,
                created_topics: out.created_topics,
                promoted: out.promoted,
                strategy_requested: out.strategy_requested,
                strategy_executed: out.strategy_executed,
                strategy_note: out.strategy_note,
                quality: out.quality,
              },
              topic_commit_hash: out.topic_commit_hash,
              topic_commit_id: out.topic_commit_id,
            };

            if (out.processed_events > 0) {
              clustered += 1;
              if (out.topic_commit_hash) clusterHashes.push(out.topic_commit_hash);
            }
          } else {
            payloadPatch = { ...payloadPatch, skipped: true, reason: "no_event_ids" };
          }

          await client.query(
            `UPDATE memory_outbox
             SET
               payload = payload || $3::jsonb,
               last_error = NULL,
               published_at = now()
             WHERE id = $1 AND claimed_at::text = $2`,
            [r.id, r.claimed_at, JSON.stringify(payloadPatch)],
          );
        } else {
          // Unknown event type: mark as processed to avoid poison-looping forever.
          await client.query(
            `UPDATE memory_outbox
             SET payload = payload || jsonb_build_object('skipped', true, 'reason', 'unknown_event_type'),
                 last_error = NULL,
                 published_at = now()
             WHERE id = $1 AND claimed_at::text = $2`,
            [r.id, r.claimed_at],
          );
        }
      } catch (err: any) {
        const msg = err && (err.stack || err.message) ? String(err.stack || err.message) : String(err);
        await client.query(
          `UPDATE memory_outbox
           SET claimed_at = NULL, last_error = $3
           WHERE id = $1 AND claimed_at::text = $2`,
          [r.id, r.claimed_at, msg],
        );
        throw err;
      }
    }).catch(() => {
      // Error is already recorded in outbox; keep loop going.
    });
  }

  return {
    scope,
    claimed: claimed.length,
    processed,
    topic_cluster_runs: clustered,
    embed_backfill_runs: embedded,
    failed_marked: failedMarked,
    topic_commit_hashes: clusterHashes,
  };
}

async function runLoop() {
  const once = process.argv.includes("--once");
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    const res = await processBatch();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, mode: once ? "once" : "loop", ...res }, null, 2));

    if (once) break;
    if (res.claimed === 0) await sleep(env.OUTBOX_POLL_INTERVAL_MS);
  }
}

runLoop()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
