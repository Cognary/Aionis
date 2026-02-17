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

function clampNum(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const minReadyRatio = clampNum(Number(argValue("--min-ready-ratio") ?? "0.8"), 0, 1);
  const maxAliasRate = clampNum(Number(argValue("--max-alias-rate") ?? "0.3"), 0, 1);
  const maxArchiveRatio = clampNum(Number(argValue("--max-archive-ratio") ?? "0.95"), 0, 1);
  const minFresh30dRatio = clampNum(Number(argValue("--min-fresh-30d-ratio") ?? "0.2"), 0, 1);
  const strict = hasFlag("--strict");

  const out = await withTx(db, async (client) => {
    const nodeRes = await client.query<{
      total: string;
      hot: string;
      warm: string;
      cold: string;
      archive: string;
      ready: string;
      fresh_30d: string;
    }>(
      `
      SELECT
        count(*)::text AS total,
        count(*) FILTER (WHERE tier = 'hot')::text AS hot,
        count(*) FILTER (WHERE tier = 'warm')::text AS warm,
        count(*) FILTER (WHERE tier = 'cold')::text AS cold,
        count(*) FILTER (WHERE tier = 'archive')::text AS archive,
        count(*) FILTER (WHERE embedding_status = 'ready')::text AS ready,
        count(*) FILTER (WHERE COALESCE(last_activated, created_at) >= now() - interval '30 days')::text AS fresh_30d
      FROM memory_nodes
      WHERE scope = $1
      `,
      [scope],
    );

    const aliasRes = await client.query<{ aliased: string; dedupe_total: string }>(
      `
      SELECT
        count(*) FILTER (WHERE slots ? 'alias_of')::text AS aliased,
        count(*)::text AS dedupe_total
      FROM memory_nodes
      WHERE scope = $1
        AND type IN ('topic', 'concept', 'entity')
      `,
      [scope],
    );

    const edgeRes = await client.query<{ edges: string }>(
      `SELECT count(*)::text AS edges FROM memory_edges WHERE scope = $1`,
      [scope],
    );

    const compressionRes = await client.query<{ summaries: string; avg_citations: string | null }>(
      `
      SELECT
        count(*)::text AS summaries,
        avg(jsonb_array_length(COALESCE(slots->'citations', '[]'::jsonb)))::text AS avg_citations
      FROM memory_nodes
      WHERE scope = $1
        AND type = 'concept'
        AND slots->>'summary_kind' = 'compression_rollup'
      `,
      [scope],
    );

    const clusterQualityRes = await client.query<{
      part_of_count: string;
      cohesion_avg_weight: string | null;
    }>(
      `
      SELECT
        count(*)::text AS part_of_count,
        avg(e.weight)::text AS cohesion_avg_weight
      FROM memory_edges e
      JOIN memory_nodes s ON s.id = e.src_id AND s.scope = e.scope
      JOIN memory_nodes d ON d.id = e.dst_id AND d.scope = e.scope
      WHERE e.scope = $1
        AND e.type = 'part_of'
        AND s.type = 'event'
        AND d.type = 'topic'
      `,
      [scope],
    );

    const orphanRes = await client.query<{ eligible_total: string; orphan_total: string }>(
      `
      WITH eligible AS (
        SELECT e.id
        FROM memory_nodes e
        WHERE e.scope = $1
          AND e.type = 'event'
          AND e.tier IN ('hot', 'warm')
          AND e.embedding IS NOT NULL
          AND e.embedding_status = 'ready'
      ),
      orphan AS (
        SELECT e.id
        FROM eligible e
        WHERE NOT EXISTS (
          SELECT 1
          FROM memory_edges x
          JOIN memory_nodes t ON t.id = x.dst_id
          WHERE x.scope = $1
            AND x.type = 'part_of'
            AND x.src_id = e.id
            AND t.type = 'topic'
        )
      )
      SELECT
        (SELECT count(*)::text FROM eligible) AS eligible_total,
        (SELECT count(*)::text FROM orphan) AS orphan_total
      `,
      [scope],
    );

    const merge30dRes = await client.query<{ dedupe_total: string; merged_30d: string }>(
      `
      SELECT
        count(*)::text AS dedupe_total,
        count(*) FILTER (
          WHERE (slots ? 'alias_of')
            AND updated_at >= now() - interval '30 days'
        )::text AS merged_30d
      FROM memory_nodes
      WHERE scope = $1
        AND type IN ('topic', 'concept', 'entity', 'procedure', 'self_model')
      `,
      [scope],
    );

    const n = nodeRes.rows[0] ?? { total: "0", hot: "0", warm: "0", cold: "0", archive: "0", ready: "0", fresh_30d: "0" };
    const a = aliasRes.rows[0] ?? { aliased: "0", dedupe_total: "0" };
    const e = edgeRes.rows[0] ?? { edges: "0" };
    const c = compressionRes.rows[0] ?? { summaries: "0", avg_citations: "0" };
    const cq = clusterQualityRes.rows[0] ?? { part_of_count: "0", cohesion_avg_weight: "0" };
    const o = orphanRes.rows[0] ?? { eligible_total: "0", orphan_total: "0" };
    const m30 = merge30dRes.rows[0] ?? { dedupe_total: "0", merged_30d: "0" };

    const total = Number(n.total ?? "0");
    const hot = Number(n.hot ?? "0");
    const warm = Number(n.warm ?? "0");
    const cold = Number(n.cold ?? "0");
    const archive = Number(n.archive ?? "0");
    const ready = Number(n.ready ?? "0");
    const fresh30d = Number(n.fresh_30d ?? "0");
    const aliased = Number(a.aliased ?? "0");
    const dedupeTotal = Number(a.dedupe_total ?? "0");
    const edges = Number(e.edges ?? "0");
    const summaries = Number(c.summaries ?? "0");
    const avgCitations = Number(c.avg_citations ?? "0");
    const partOfCount = Number(cq.part_of_count ?? "0");
    const cohesionAvg = Number(cq.cohesion_avg_weight ?? "0");
    const eligibleEvents = Number(o.eligible_total ?? "0");
    const orphanEvents = Number(o.orphan_total ?? "0");
    const dedupeTotal30d = Number(m30.dedupe_total ?? "0");
    const merged30d = Number(m30.merged_30d ?? "0");

    const readyRatio = total > 0 ? ready / total : 1;
    const aliasRate = dedupeTotal > 0 ? aliased / dedupeTotal : 0;
    const archiveRatio = total > 0 ? archive / total : 0;
    const fresh30dRatio = total > 0 ? fresh30d / total : 1;
    const edgesPerNode = total > 0 ? edges / total : 0;
    const orphanRate = eligibleEvents > 0 ? orphanEvents / eligibleEvents : 0;
    const mergeRate30d = dedupeTotal30d > 0 ? merged30d / dedupeTotal30d : 0;

    const checks = [
      {
        name: "embedding_ready_ratio",
        pass: readyRatio >= minReadyRatio,
        value: round(readyRatio),
        threshold: { op: ">=", value: minReadyRatio },
      },
      {
        name: "alias_rate",
        pass: aliasRate <= maxAliasRate,
        value: round(aliasRate),
        threshold: { op: "<=", value: maxAliasRate },
      },
      {
        name: "archive_ratio",
        pass: archiveRatio <= maxArchiveRatio,
        value: round(archiveRatio),
        threshold: { op: "<=", value: maxArchiveRatio },
      },
      {
        name: "fresh_30d_ratio",
        pass: fresh30dRatio >= minFresh30dRatio,
        value: round(fresh30dRatio),
        threshold: { op: ">=", value: minFresh30dRatio },
      },
    ];

    return {
      scope,
      thresholds: {
        min_ready_ratio: minReadyRatio,
        max_alias_rate: maxAliasRate,
        max_archive_ratio: maxArchiveRatio,
        min_fresh_30d_ratio: minFresh30dRatio,
      },
      metrics: {
        total_nodes: total,
        tier_counts: { hot, warm, cold, archive },
        embedding_ready_nodes: ready,
        embedding_ready_ratio: round(readyRatio),
        dedupe_candidates_total: dedupeTotal,
        aliased_nodes: aliased,
        alias_rate: round(aliasRate),
        archive_ratio: round(archiveRatio),
        fresh_30d_nodes: fresh30d,
        fresh_30d_ratio: round(fresh30dRatio),
        edge_count: edges,
        edges_per_node: round(edgesPerNode),
        compression_summaries: summaries,
        compression_avg_citations: round(avgCitations),
        clustering_quality: {
          cohesion: round(cohesionAvg),
          drift_orphan_rate: round(orphanRate),
          merge_rate_30d: round(mergeRate30d),
          part_of_edges: partOfCount,
          eligible_event_nodes: eligibleEvents,
          orphan_event_nodes: orphanEvents,
          merged_30d_nodes: merged30d,
        },
      },
      checks,
      summary: {
        pass: checks.every((x) => x.pass),
        failed: checks.filter((x) => !x.pass).map((x) => x.name),
      },
    };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...out }, null, 2));
  if (strict && !out.summary.pass) process.exitCode = 2;
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
