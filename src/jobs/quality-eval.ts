import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

const SEMANTIC_COMPARE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "after",
  "before",
  "across",
  "there",
  "this",
  "that",
  "topic",
  "pattern",
  "decision",
  "path",
  "risk",
  "surface",
  "constraint",
  "lesson",
  "learned",
]);

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

function tokenizeContent(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !SEMANTIC_COMPARE_STOPWORDS.has(token));
}

function hasNegation(text: string): boolean {
  return /\b(no|not|never|without|none|cannot|can't|didn't|won't|isn't|aren't|wasn't|weren't)\b/i.test(text);
}

function evaluateSemanticAbstractionSample(abstractionText: string, sourceSummaryText: string) {
  const abstractionTokens = new Set(tokenizeContent(abstractionText));
  const sourceTokens = new Set(tokenizeContent(sourceSummaryText));
  const shared = Array.from(abstractionTokens).filter((token) => sourceTokens.has(token));
  const overlapBase = Math.max(abstractionTokens.size, sourceTokens.size, 1);
  const lexicalOverlap = shared.length / overlapBase;
  const negationMismatch = hasNegation(abstractionText) !== hasNegation(sourceSummaryText);
  const contradictionDetected = negationMismatch && lexicalOverlap >= 0.25;
  const sparseSourceSummary = !sourceSummaryText.includes("- ") && sourceTokens.size < 12;
  return {
    lexical_overlap: round(lexicalOverlap),
    negation_mismatch: negationMismatch,
    contradiction_detected: contradictionDetected,
    sparse_source_summary: sparseSourceSummary,
  };
}

function lexicalOverlapRatio(a: string, b: string): number {
  const aTokens = new Set(tokenizeContent(a));
  const bTokens = new Set(tokenizeContent(b));
  const shared = Array.from(aTokens).filter((token) => bTokens.has(token));
  return shared.length / Math.max(aTokens.size, bTokens.size, 1);
}

function buildSemanticShadowCompareSample(
  sourceSummaryId: string,
  sourceSummaryTitle: string | null,
  sourceSummaryText: string,
  abstractions: Array<{ abstraction_kind: string | null; abstraction_text: string | null }>,
) {
  const l3Tokens = new Set(tokenizeContent(sourceSummaryText));
  const l4Texts = abstractions.map((row) => String(row.abstraction_text ?? "")).filter(Boolean);
  const l4CombinedText = l4Texts.join(" ");
  const l4Tokens = new Set(tokenizeContent(l4CombinedText));
  const novelL4Tokens = Array.from(l4Tokens).filter((token) => !l3Tokens.has(token));
  const avgOverlap =
    l4Texts.length > 0
      ? l4Texts.reduce((sum, text) => sum + lexicalOverlapRatio(text, sourceSummaryText), 0) / l4Texts.length
      : 0;
  const abstractionKinds = Array.from(
    new Set(abstractions.map((row) => String(row.abstraction_kind ?? "unknown")).filter(Boolean)),
  ).sort();
  return {
    source_summary_id: sourceSummaryId,
    source_summary_title: sourceSummaryTitle,
    abstraction_count: abstractions.length,
    abstraction_kinds: abstractionKinds,
    l3_chars: sourceSummaryText.length,
    l4_chars_total: l4CombinedText.length,
    avg_l4_to_l3_lexical_overlap: round(avgOverlap),
    unique_term_gain_ratio: round(novelL4Tokens.length / Math.max(l3Tokens.size, 1)),
    novel_l4_terms_preview: novelL4Tokens.slice(0, 8),
  };
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const minReadyRatio = clampNum(Number(argValue("--min-ready-ratio") ?? "0.8"), 0, 1);
  const maxAliasRate = clampNum(Number(argValue("--max-alias-rate") ?? "0.3"), 0, 1);
  const maxArchiveRatio = clampNum(Number(argValue("--max-archive-ratio") ?? "0.95"), 0, 1);
  const minFresh30dRatio = clampNum(Number(argValue("--min-fresh-30d-ratio") ?? "0.2"), 0, 1);
  const minSemanticFaithfulness = clampNum(Number(argValue("--min-semantic-faithfulness") ?? "0.9"), 0, 1);
  const minSemanticCitationCoverage = clampNum(Number(argValue("--min-semantic-citation-coverage") ?? "0.8"), 0, 1);
  const maxSemanticContradictionRisk = clampNum(Number(argValue("--max-semantic-contradiction-risk") ?? "0.2"), 0, 1);
  const strict = hasFlag("--strict");

  const out = await withTx(db, async (client) => {
    const nodeRes = await client.query<{
      total: string;
      hot: string;
      warm: string;
      cold: string;
      archive: string;
      ready_total: string;
      embedding_eligible_total: string;
      embedding_expected_total: string;
      embedding_expected_ready: string;
      fresh_30d: string;
    }>(
      `
      SELECT
        count(*)::text AS total,
        count(*) FILTER (WHERE tier = 'hot')::text AS hot,
        count(*) FILTER (WHERE tier = 'warm')::text AS warm,
        count(*) FILTER (WHERE tier = 'cold')::text AS cold,
        count(*) FILTER (WHERE tier = 'archive')::text AS archive,
        count(*) FILTER (WHERE embedding_status = 'ready')::text AS ready_total,
        count(*) FILTER (
          WHERE tier IN ('hot', 'warm')
            AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
            AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
        )::text AS embedding_eligible_total,
        count(*) FILTER (
          WHERE tier IN ('hot', 'warm')
            AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
            AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
            AND (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
        )::text AS embedding_expected_total,
        count(*) FILTER (
          WHERE tier IN ('hot', 'warm')
            AND type IN ('event', 'entity', 'topic', 'concept', 'procedure', 'self_model')
            AND coalesce(nullif(btrim(text_summary), ''), nullif(btrim(title), '')) IS NOT NULL
            AND (embedding_model IS NOT NULL OR embedding IS NOT NULL OR embedding_status = 'ready')
            AND embedding_status = 'ready'
            AND embedding IS NOT NULL
        )::text AS embedding_expected_ready,
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

    const semanticAbstractionRes = await client.query<{
      abstractions: string;
      avg_faithfulness: string | null;
      avg_coverage: string | null;
      avg_contradiction_risk: string | null;
      avg_citation_coverage: string | null;
    }>(
      `
      WITH semantic AS (
        SELECT
          slots,
          jsonb_array_length(COALESCE(slots->'citations', '[]'::jsonb)) AS citations_count,
          jsonb_array_length(COALESCE(slots->'source_event_ids', '[]'::jsonb)) AS source_event_count
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'concept'
          AND slots->>'summary_kind' = 'semantic_abstraction'
      )
      SELECT
        count(*)::text AS abstractions,
        avg((slots->'quality'->>'faithfulness')::numeric)::text AS avg_faithfulness,
        avg((slots->'quality'->>'coverage')::numeric)::text AS avg_coverage,
        avg((slots->'quality'->>'contradiction_risk')::numeric)::text AS avg_contradiction_risk,
        avg(
          CASE
            WHEN source_event_count > 0 THEN citations_count::numeric / source_event_count::numeric
            ELSE 1
          END
        )::text AS avg_citation_coverage
      FROM semantic
      `,
      [scope],
    );

    const semanticByKindRes = await client.query<{ abstraction_kind: string | null; n: string }>(
      `
      SELECT
        NULLIF(slots->>'abstraction_kind', '') AS abstraction_kind,
        count(*)::text AS n
      FROM memory_nodes
      WHERE scope = $1
        AND type = 'concept'
        AND slots->>'summary_kind' = 'semantic_abstraction'
      GROUP BY 1
      ORDER BY 1
      `,
      [scope],
    );

    const semanticSampleRes = await client.query<{
      id: string;
      title: string | null;
      abstraction_kind: string | null;
      abstraction_text: string | null;
      faithfulness: string | null;
      coverage: string | null;
      contradiction_risk: string | null;
      citations_count: string;
      source_event_count: string;
      source_summary_id: string | null;
      source_summary_text: string | null;
    }>(
      `
      SELECT
        n.id::text AS id,
        n.title,
        n.slots->>'abstraction_kind' AS abstraction_kind,
        n.text_summary AS abstraction_text,
        n.slots->'quality'->>'faithfulness' AS faithfulness,
        n.slots->'quality'->>'coverage' AS coverage,
        n.slots->'quality'->>'contradiction_risk' AS contradiction_risk,
        jsonb_array_length(COALESCE(n.slots->'citations', '[]'::jsonb))::text AS citations_count,
        jsonb_array_length(COALESCE(n.slots->'source_event_ids', '[]'::jsonb))::text AS source_event_count,
        n.slots->>'source_summary_id' AS source_summary_id,
        s.text_summary AS source_summary_text
      FROM memory_nodes n
      LEFT JOIN memory_nodes s ON s.scope = n.scope
        AND s.id = CASE
          WHEN (n.slots->>'source_summary_id') ~* '^[0-9a-f-]{36}$' THEN (n.slots->>'source_summary_id')::uuid
          ELSE NULL
        END
      WHERE n.scope = $1
        AND n.type = 'concept'
        AND n.slots->>'summary_kind' = 'semantic_abstraction'
      ORDER BY n.updated_at DESC, n.id
      LIMIT 20
      `,
      [scope],
    );

    const semanticShadowCompareRes = await client.query<{
      source_summary_id: string;
      source_summary_title: string | null;
      source_summary_text: string | null;
      abstraction_kind: string | null;
      abstraction_text: string | null;
    }>(
      `
      SELECT
        s.id::text AS source_summary_id,
        s.title AS source_summary_title,
        s.text_summary AS source_summary_text,
        a.slots->>'abstraction_kind' AS abstraction_kind,
        a.text_summary AS abstraction_text
      FROM memory_nodes s
      LEFT JOIN memory_nodes a
        ON a.scope = s.scope
       AND a.type = 'concept'
       AND a.slots->>'summary_kind' = 'semantic_abstraction'
       AND a.slots->>'source_summary_id' = s.id::text
      WHERE s.scope = $1
        AND s.type = 'concept'
        AND s.slots->>'summary_kind' = 'compression_rollup'
      ORDER BY s.updated_at DESC, s.id, a.title
      LIMIT 100
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

    const n = nodeRes.rows[0] ?? {
      total: "0",
      hot: "0",
      warm: "0",
      cold: "0",
      archive: "0",
      ready_total: "0",
      embedding_eligible_total: "0",
      embedding_expected_total: "0",
      embedding_expected_ready: "0",
      fresh_30d: "0",
    };
    const a = aliasRes.rows[0] ?? { aliased: "0", dedupe_total: "0" };
    const e = edgeRes.rows[0] ?? { edges: "0" };
    const c = compressionRes.rows[0] ?? { summaries: "0", avg_citations: "0" };
    const cq = clusterQualityRes.rows[0] ?? { part_of_count: "0", cohesion_avg_weight: "0" };
    const sa = semanticAbstractionRes.rows[0] ?? {
      abstractions: "0",
      avg_faithfulness: "0",
      avg_coverage: "0",
      avg_contradiction_risk: "0",
      avg_citation_coverage: "0",
    };
    const o = orphanRes.rows[0] ?? { eligible_total: "0", orphan_total: "0" };
    const m30 = merge30dRes.rows[0] ?? { dedupe_total: "0", merged_30d: "0" };

    const total = Number(n.total ?? "0");
    const hot = Number(n.hot ?? "0");
    const warm = Number(n.warm ?? "0");
    const cold = Number(n.cold ?? "0");
    const archive = Number(n.archive ?? "0");
    const readyTotal = Number(n.ready_total ?? "0");
    const embeddingEligibleTotal = Number(n.embedding_eligible_total ?? "0");
    const embeddingExpectedTotal = Number(n.embedding_expected_total ?? "0");
    const embeddingExpectedReady = Number(n.embedding_expected_ready ?? "0");
    const fresh30d = Number(n.fresh_30d ?? "0");
    const aliased = Number(a.aliased ?? "0");
    const dedupeTotal = Number(a.dedupe_total ?? "0");
    const edges = Number(e.edges ?? "0");
    const summaries = Number(c.summaries ?? "0");
    const avgCitations = Number(c.avg_citations ?? "0");
    const partOfCount = Number(cq.part_of_count ?? "0");
    const cohesionAvg = Number(cq.cohesion_avg_weight ?? "0");
    const semanticAbstractions = Number(sa.abstractions ?? "0");
    const semanticFaithfulness = Number(sa.avg_faithfulness ?? "0");
    const semanticCoverage = Number(sa.avg_coverage ?? "0");
    const semanticContradictionRisk = Number(sa.avg_contradiction_risk ?? "0");
    const semanticCitationCoverage = Number(sa.avg_citation_coverage ?? "0");
    const eligibleEvents = Number(o.eligible_total ?? "0");
    const orphanEvents = Number(o.orphan_total ?? "0");
    const dedupeTotal30d = Number(m30.dedupe_total ?? "0");
    const merged30d = Number(m30.merged_30d ?? "0");

    const semanticByKind = Object.fromEntries(
      semanticByKindRes.rows.map((row) => [String(row.abstraction_kind ?? "unknown"), Number(row.n ?? "0")]),
    );
    const semanticSamples = semanticSampleRes.rows.map((row) => {
      const sourceSummaryText = String(row.source_summary_text ?? "");
      const abstractionText = String(row.abstraction_text ?? "");
      const evalSummary = evaluateSemanticAbstractionSample(abstractionText, sourceSummaryText);
      const citationsCount = Number(row.citations_count ?? "0");
      const sourceEventCount = Number(row.source_event_count ?? "0");
      return {
        id: row.id,
        title: row.title,
        abstraction_kind: row.abstraction_kind,
        source_summary_id: row.source_summary_id,
        faithfulness: round(Number(row.faithfulness ?? "0")),
        coverage: round(Number(row.coverage ?? "0")),
        contradiction_risk: round(Number(row.contradiction_risk ?? "0")),
        citation_coverage: round(sourceEventCount > 0 ? citationsCount / sourceEventCount : 1),
        eval: evalSummary,
      };
    });
    const semanticContradictionDetected = semanticSamples.filter((sample) => sample.eval.contradiction_detected).length;
    const semanticSparseSourceSummaries = semanticSamples.filter((sample) => sample.eval.sparse_source_summary).length;
    const shadowCompareGroups = new Map<
      string,
      {
        source_summary_title: string | null;
        source_summary_text: string;
        abstractions: Array<{ abstraction_kind: string | null; abstraction_text: string | null }>;
      }
    >();
    for (const row of semanticShadowCompareRes.rows) {
      if (!shadowCompareGroups.has(row.source_summary_id)) {
        shadowCompareGroups.set(row.source_summary_id, {
          source_summary_title: row.source_summary_title,
          source_summary_text: String(row.source_summary_text ?? ""),
          abstractions: [],
        });
      }
      const group = shadowCompareGroups.get(row.source_summary_id)!;
      if (row.abstraction_text) {
        group.abstractions.push({
          abstraction_kind: row.abstraction_kind,
          abstraction_text: row.abstraction_text,
        });
      }
    }
    const semanticShadowCompareSamples = Array.from(shadowCompareGroups.entries()).map(([sourceSummaryId, group]) =>
      buildSemanticShadowCompareSample(sourceSummaryId, group.source_summary_title, group.source_summary_text, group.abstractions),
    );
    const summariesWithL4 = semanticShadowCompareSamples.filter((sample) => sample.abstraction_count > 0).length;
    const avgAbstractionsPerSummary =
      semanticShadowCompareSamples.length > 0
        ? semanticShadowCompareSamples.reduce((sum, sample) => sum + sample.abstraction_count, 0) / semanticShadowCompareSamples.length
        : 0;
    const avgUniqueTermGainRatio =
      semanticShadowCompareSamples.length > 0
        ? semanticShadowCompareSamples.reduce((sum, sample) => sum + sample.unique_term_gain_ratio, 0) / semanticShadowCompareSamples.length
        : 0;

    const readyRatio = embeddingExpectedTotal > 0 ? embeddingExpectedReady / embeddingExpectedTotal : 1;
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
      {
        name: "semantic_abstraction_faithfulness",
        pass: semanticAbstractions === 0 || semanticFaithfulness >= minSemanticFaithfulness,
        value: round(semanticFaithfulness),
        threshold: { op: ">=", value: minSemanticFaithfulness },
      },
      {
        name: "semantic_abstraction_citation_coverage",
        pass: semanticAbstractions === 0 || semanticCitationCoverage >= minSemanticCitationCoverage,
        value: round(semanticCitationCoverage),
        threshold: { op: ">=", value: minSemanticCitationCoverage },
      },
      {
        name: "semantic_abstraction_contradiction_risk",
        pass: semanticAbstractions === 0 || semanticContradictionRisk <= maxSemanticContradictionRisk,
        value: round(semanticContradictionRisk),
        threshold: { op: "<=", value: maxSemanticContradictionRisk },
      },
    ];

    return {
      scope,
      thresholds: {
        min_ready_ratio: minReadyRatio,
        max_alias_rate: maxAliasRate,
        max_archive_ratio: maxArchiveRatio,
        min_fresh_30d_ratio: minFresh30dRatio,
        min_semantic_faithfulness: minSemanticFaithfulness,
        min_semantic_citation_coverage: minSemanticCitationCoverage,
        max_semantic_contradiction_risk: maxSemanticContradictionRisk,
      },
      metrics: {
        total_nodes: total,
        tier_counts: { hot, warm, cold, archive },
        embedding_ready_nodes: embeddingExpectedReady,
        embedding_ready_nodes_total: readyTotal,
        embedding_eligible_nodes: embeddingEligibleTotal,
        embedding_expected_nodes: embeddingExpectedTotal,
        embedding_untracked_nodes: Math.max(0, embeddingEligibleTotal - embeddingExpectedTotal),
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
        semantic_abstractions: {
          total: semanticAbstractions,
          by_kind: semanticByKind,
          avg_faithfulness: round(semanticFaithfulness),
          avg_coverage: round(semanticCoverage),
          avg_contradiction_risk: round(semanticContradictionRisk),
          avg_citation_coverage: round(semanticCitationCoverage),
          contradiction_detected_count: semanticContradictionDetected,
          sparse_source_summary_count: semanticSparseSourceSummaries,
          samples: semanticSamples,
        },
        semantic_shadow_compare: {
          source_summaries: semanticShadowCompareSamples.length,
          source_summaries_with_l4: summariesWithL4,
          avg_abstractions_per_summary: round(avgAbstractionsPerSummary),
          avg_unique_term_gain_ratio: round(avgUniqueTermGainRatio),
          samples: semanticShadowCompareSamples,
        },
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
