import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { writeFileSync } from "node:fs";
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

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const tenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;

  const runs = clampInt(Number(argValue("--runs") ?? "3"), 2, 20);
  const sleepMs = clampInt(Number(argValue("--sleep-ms") ?? "40"), 0, 10_000);
  const maxFingerprintVariants = clampInt(Number(argValue("--max-fingerprint-variants") ?? "1"), 1, 20);

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

      const compressionRes = await client.query<CompressionSnapshotRow>(
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
        ORDER BY n.id
        LIMIT 10000
        `,
        [scope],
      );
      const compressionFp = sha256Hex(stableStringify(compressionRes.rows));

      const topicRes = await client.query<TopicSnapshotRow>(
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
        GROUP BY t.id, t.slots
        ORDER BY t.id
        LIMIT 10000
        `,
        [scope],
      );
      const topicFp = sha256Hex(stableStringify(topicRes.rows));

      const aliasRes = await client.query<AliasSnapshotRow>(
        `
        SELECT
          n.id::text AS id,
          n.slots->>'alias_of' AS alias_of,
          n.slots->>'consolidation_pair_key' AS pair_key,
          n.commit_id::text AS commit_id
        FROM memory_nodes n
        WHERE n.scope = $1
          AND (n.slots ? 'alias_of')
        ORDER BY n.id
        LIMIT 10000
        `,
        [scope],
      );
      const aliasFp = sha256Hex(stableStringify(aliasRes.rows));

      const combinedFp = sha256Hex(
        stableStringify({
          consolidation: consolidationFp,
          abstraction_compression: compressionFp,
          abstraction_topics: topicFp,
          consolidation_aliases: aliasFp,
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
          compression_rollups: compressionRes.rows.length,
          topics: topicRes.rows.length,
          aliases: aliasRes.rows.length,
          compression_fingerprint_sha256: compressionFp,
          topic_fingerprint_sha256: topicFp,
          alias_fingerprint_sha256: aliasFp,
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
