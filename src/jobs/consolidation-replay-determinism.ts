import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { writeFileSync } from "node:fs";
import type pg from "pg";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { sha256Hex } from "../util/crypto.js";
import { collectConsolidationCandidates, parseTypes, toMergeCandidateV1 } from "./consolidation-core.js";

type CompressionSnapshotRow = {
  id: string;
  source_topic_id: string | null;
  source_event_hash: string | null;
  commit_id: string | null;
};

type TopicSnapshotRow = {
  id: string;
  topic_state: string;
  member_count: string;
  linked_events: string;
};

type AliasSnapshotRow = {
  id: string;
  alias_of: string | null;
  pair_key: string | null;
  commit_id: string | null;
};

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

function clampNum(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateRollingHash(current: string, row: unknown): string {
  return sha256Hex(`${current}\n${stableStringify(row)}`);
}

async function hashCompressionSnapshot(
  client: pg.PoolClient,
  scope: string,
  batchSize: number,
): Promise<{ count: number; fingerprint_sha256: string }> {
  let cursor: string | null = null;
  let count = 0;
  let fp = sha256Hex("snapshot:compression:seed");
  for (;;) {
    const res: { rows: CompressionSnapshotRow[] } = await client.query<CompressionSnapshotRow>(
      `
      SELECT
        n.id::text AS id,
        n.slots->>'source_topic_id' AS source_topic_id,
        n.slots->>'source_event_hash' AS source_event_hash,
        n.commit_id::text AS commit_id
      FROM memory_nodes n
      WHERE n.scope = $1
        AND n.type = 'concept'
        AND n.slots->>'summary_kind' = 'compression_rollup'
        AND ($2::uuid IS NULL OR n.id > $2::uuid)
      ORDER BY n.id
      LIMIT $3
      `,
      [scope, cursor, batchSize],
    );
    if (res.rows.length === 0) break;
    for (const row of res.rows) {
      fp = updateRollingHash(fp, row);
      count += 1;
    }
    cursor = res.rows[res.rows.length - 1].id;
  }
  return { count, fingerprint_sha256: fp };
}

async function hashTopicSnapshot(
  client: pg.PoolClient,
  scope: string,
  batchSize: number,
): Promise<{ count: number; fingerprint_sha256: string }> {
  let cursor: string | null = null;
  let count = 0;
  let fp = sha256Hex("snapshot:topic:seed");
  for (;;) {
    const res: { rows: TopicSnapshotRow[] } = await client.query<TopicSnapshotRow>(
      `
      SELECT
        t.id::text AS id,
        coalesce(t.slots->>'topic_state', 'active') AS topic_state,
        coalesce(t.slots->>'member_count', '0') AS member_count,
        count(e.id)::text AS linked_events
      FROM memory_nodes t
      LEFT JOIN memory_edges e
        ON e.scope = t.scope
       AND e.type = 'part_of'
       AND e.dst_id = t.id
      WHERE t.scope = $1
        AND t.type = 'topic'
        AND ($2::uuid IS NULL OR t.id > $2::uuid)
      GROUP BY t.id, t.slots
      ORDER BY t.id
      LIMIT $3
      `,
      [scope, cursor, batchSize],
    );
    if (res.rows.length === 0) break;
    for (const row of res.rows) {
      fp = updateRollingHash(fp, row);
      count += 1;
    }
    cursor = res.rows[res.rows.length - 1].id;
  }
  return { count, fingerprint_sha256: fp };
}

async function hashAliasSnapshot(
  client: pg.PoolClient,
  scope: string,
  batchSize: number,
): Promise<{ count: number; fingerprint_sha256: string }> {
  let cursor: string | null = null;
  let count = 0;
  let fp = sha256Hex("snapshot:alias:seed");
  for (;;) {
    const res: { rows: AliasSnapshotRow[] } = await client.query<AliasSnapshotRow>(
      `
      SELECT
        n.id::text AS id,
        n.slots->>'alias_of' AS alias_of,
        n.slots->>'consolidation_pair_key' AS pair_key,
        n.commit_id::text AS commit_id
      FROM memory_nodes n
      WHERE n.scope = $1
        AND (n.slots ? 'alias_of')
        AND ($2::uuid IS NULL OR n.id > $2::uuid)
      ORDER BY n.id
      LIMIT $3
      `,
      [scope, cursor, batchSize],
    );
    if (res.rows.length === 0) break;
    for (const row of res.rows) {
      fp = updateRollingHash(fp, row);
      count += 1;
    }
    cursor = res.rows[res.rows.length - 1].id;
  }
  return { count, fingerprint_sha256: fp };
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const tenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;

  const runs = clampInt(Number(argValue("--runs") ?? "3"), 2, 20);
  const sleepMs = clampInt(Number(argValue("--sleep-ms") ?? "40"), 0, 10_000);
  const maxFingerprintVariants = clampInt(Number(argValue("--max-fingerprint-variants") ?? "1"), 1, 20);
  const snapshotBatchSize = clampInt(Number(argValue("--snapshot-batch-size") ?? "5000"), 100, 50000);

  const types = parseTypes(argValue("--types"));
  const maxAnchors = clampInt(Number(argValue("--max-anchors") ?? String(env.MEMORY_CONSOLIDATION_MAX_ANCHORS)), 1, 2000);
  const neighborsPerNode = clampInt(
    Number(argValue("--neighbors-per-node") ?? String(env.MEMORY_CONSOLIDATION_NEIGHBORS_PER_NODE)),
    1,
    50,
  );
  const minVector = clampNum(Number(argValue("--min-vector") ?? String(env.MEMORY_CONSOLIDATION_MIN_VECTOR_SIM)), 0, 1);
  const minScore = clampNum(Number(argValue("--min-score") ?? String(env.MEMORY_CONSOLIDATION_MIN_SCORE)), 0, 1);
  const maxPairs = clampInt(Number(argValue("--max-pairs") ?? String(env.MEMORY_CONSOLIDATION_MAX_PAIRS)), 1, 5000);

  const snapshots: Array<{
    run: number;
    consolidation: {
      anchors_scanned: number;
      neighbors_examined: number;
      pair_candidates: number;
      suggestions: number;
      fingerprint_sha256: string;
    };
    abstraction: {
      compression_rollups: number;
      topics: number;
      aliases: number;
      compression_fingerprint_sha256: string;
      topic_fingerprint_sha256: string;
      alias_fingerprint_sha256: string;
    };
    combined_fingerprint_sha256: string;
  }> = [];

  for (let i = 0; i < runs; i += 1) {
    const snap = await withTx(db, async (client) => {
      const consolidation = await collectConsolidationCandidates(client, {
        scope,
        types,
        max_anchors: maxAnchors,
        neighbors_per_node: neighborsPerNode,
        min_vector_similarity: minVector,
        min_score: minScore,
        max_pairs: maxPairs,
        include_summary: false,
        conflict_min_shared_tokens: env.MEMORY_CONSOLIDATION_CONFLICT_MIN_SHARED_TOKENS,
        conflict_negation_lexical_min: env.MEMORY_CONSOLIDATION_CONFLICT_NEGATION_LEXICAL_MIN,
      });
      const mergeCandidatesV1 = consolidation.suggestions.map((s) => toMergeCandidateV1(s));
      const consolidationFp = sha256Hex(stableStringify(mergeCandidatesV1));

      const compressionSnapshot = await hashCompressionSnapshot(client, scope, snapshotBatchSize);
      const topicSnapshot = await hashTopicSnapshot(client, scope, snapshotBatchSize);
      const aliasSnapshot = await hashAliasSnapshot(client, scope, snapshotBatchSize);

      const combinedFp = sha256Hex(
        stableStringify({
          consolidation: consolidationFp,
          abstraction_compression: compressionSnapshot.fingerprint_sha256,
          abstraction_topics: topicSnapshot.fingerprint_sha256,
          consolidation_aliases: aliasSnapshot.fingerprint_sha256,
        }),
      );

      return {
        consolidation: {
          anchors_scanned: consolidation.anchors_scanned,
          neighbors_examined: consolidation.neighbors_examined,
          pair_candidates: consolidation.pair_candidates,
          suggestions: consolidation.suggestions.length,
          fingerprint_sha256: consolidationFp,
        },
        abstraction: {
          compression_rollups: compressionSnapshot.count,
          topics: topicSnapshot.count,
          aliases: aliasSnapshot.count,
          compression_fingerprint_sha256: compressionSnapshot.fingerprint_sha256,
          topic_fingerprint_sha256: topicSnapshot.fingerprint_sha256,
          alias_fingerprint_sha256: aliasSnapshot.fingerprint_sha256,
        },
        combined_fingerprint_sha256: combinedFp,
      };
    });

    snapshots.push({ run: i + 1, ...snap });

    if (i < runs - 1 && sleepMs > 0) {
      await sleep(sleepMs);
    }
  }

  const combinedFingerprints = Array.from(new Set(snapshots.map((x) => x.combined_fingerprint_sha256)));
  const consolidationFingerprints = Array.from(new Set(snapshots.map((x) => x.consolidation.fingerprint_sha256)));
  const compressionFingerprints = Array.from(new Set(snapshots.map((x) => x.abstraction.compression_fingerprint_sha256)));
  const topicFingerprints = Array.from(new Set(snapshots.map((x) => x.abstraction.topic_fingerprint_sha256)));
  const aliasFingerprints = Array.from(new Set(snapshots.map((x) => x.abstraction.alias_fingerprint_sha256)));

  const summary = {
    pass: combinedFingerprints.length <= maxFingerprintVariants,
    combined_fingerprint_variants: combinedFingerprints.length,
    consolidation_fingerprint_variants: consolidationFingerprints.length,
    compression_fingerprint_variants: compressionFingerprints.length,
    topic_fingerprint_variants: topicFingerprints.length,
    alias_fingerprint_variants: aliasFingerprints.length,
    fingerprint_sha256: combinedFingerprints[0] ?? null,
  };

  const out = {
    ok: summary.pass,
    scope,
    tenant_id: tenantId,
    mode: "consolidation_replay_determinism",
    thresholds: {
      runs,
      max_fingerprint_variants: maxFingerprintVariants,
      sleep_ms: sleepMs,
      snapshot_batch_size: snapshotBatchSize,
      scan: {
        types,
        max_anchors: maxAnchors,
        neighbors_per_node: neighborsPerNode,
        min_vector_similarity: minVector,
        min_score: minScore,
        max_pairs: maxPairs,
      },
    },
    summary,
    snapshots,
  };

  const outPath = argValue("--out");
  const outText = JSON.stringify(out, null, 2);
  if (outPath) writeFileSync(outPath, `${outText}\n`, "utf8");

  // eslint-disable-next-line no-console
  console.log(outText);

  if (hasFlag("--strict") && !summary.pass) {
    process.exitCode = 2;
  }
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
