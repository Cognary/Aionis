import "dotenv/config";
import { writeFileSync } from "node:fs";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { collectConsolidationCandidates, parseTypes } from "./consolidation-core.js";

type AliasStatsRow = {
  alias_total: string;
  alias_with_apply_marker: string;
  alias_with_incident_edges: string;
  incident_edges_on_alias_nodes: string;
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

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const tenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;

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

  const maxCandidateQueueDepth = clampInt(Number(argValue("--max-candidate-queue-depth") ?? "200"), 0, 100000);
  const minApplySuccessRate = clampNum(Number(argValue("--min-apply-success-rate") ?? "0.98"), 0, 1);
  const minRedirectCompleteness = clampNum(Number(argValue("--min-redirect-completeness") ?? "0.99"), 0, 1);
  const maxPendingAliasEdges = clampInt(Number(argValue("--max-pending-alias-edges") ?? "0"), 0, 1000000000);

  const out = await withTx(db, async (client) => {
    const scan = await collectConsolidationCandidates(client, {
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

    const aliasStatsRes = await client.query<AliasStatsRow>(
      `
      WITH aliased AS (
        SELECT
          n.id,
          n.scope,
          coalesce(n.slots, '{}'::jsonb) AS slots
        FROM memory_nodes n
        WHERE n.scope = $1
          AND (n.slots ? 'alias_of')
          AND (n.slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
          AND n.id <> (n.slots->>'alias_of')::uuid
      ),
      alias_with_edges AS (
        SELECT DISTINCT a.id
        FROM aliased a
        JOIN memory_edges e
          ON e.scope = a.scope
         AND (e.src_id = a.id OR e.dst_id = a.id)
      ),
      alias_edge_count AS (
        SELECT count(*)::bigint AS c
        FROM aliased a
        JOIN memory_edges e
          ON e.scope = a.scope
         AND (e.src_id = a.id OR e.dst_id = a.id)
      )
      SELECT
        (SELECT count(*)::text FROM aliased) AS alias_total,
        (
          SELECT count(*)::text
          FROM aliased a
          WHERE lower(coalesce(a.slots->>'consolidation_state', '')) = 'aliased'
            AND coalesce(a.slots->>'consolidation_job', '') = 'consolidation_apply'
        ) AS alias_with_apply_marker,
        (SELECT count(*)::text FROM alias_with_edges) AS alias_with_incident_edges,
        (SELECT c::text FROM alias_edge_count) AS incident_edges_on_alias_nodes
      `,
      [scope],
    );

    const aliasStats = aliasStatsRes.rows[0] ?? {
      alias_total: "0",
      alias_with_apply_marker: "0",
      alias_with_incident_edges: "0",
      incident_edges_on_alias_nodes: "0",
    };

    const aliasTotal = Number(aliasStats.alias_total ?? "0");
    const aliasWithApplyMarker = Number(aliasStats.alias_with_apply_marker ?? "0");
    const aliasWithIncidentEdges = Number(aliasStats.alias_with_incident_edges ?? "0");
    const incidentEdgesOnAliasNodes = Number(aliasStats.incident_edges_on_alias_nodes ?? "0");

    const applySuccessRate = aliasTotal > 0 ? aliasWithApplyMarker / aliasTotal : 1;
    const redirectCompleteness = aliasTotal > 0 ? 1 - aliasWithIncidentEdges / aliasTotal : 1;

    const candidateQueueDepth = Number(scan.pair_candidates ?? 0);
    const conflictDetected = scan.suggestions.filter((x) => x.conflict.detected).length;

    const checks = [
      {
        name: "candidate_queue_depth",
        pass: candidateQueueDepth <= maxCandidateQueueDepth,
        value: candidateQueueDepth,
        threshold: { lte: maxCandidateQueueDepth },
      },
      {
        name: "apply_success_rate",
        pass: applySuccessRate >= minApplySuccessRate,
        value: round4(applySuccessRate),
        threshold: { gte: minApplySuccessRate },
      },
      {
        name: "redirect_completeness",
        pass: redirectCompleteness >= minRedirectCompleteness,
        value: round4(redirectCompleteness),
        threshold: { gte: minRedirectCompleteness },
      },
      {
        name: "pending_alias_edges",
        pass: incidentEdgesOnAliasNodes <= maxPendingAliasEdges,
        value: incidentEdgesOnAliasNodes,
        threshold: { lte: maxPendingAliasEdges },
      },
    ];

    const failed = checks.filter((x) => !x.pass).map((x) => x.name);

    return {
      ok: failed.length === 0,
      scope,
      tenant_id: tenantId,
      mode: "consolidation_health_slo",
      thresholds: {
        max_candidate_queue_depth: maxCandidateQueueDepth,
        min_apply_success_rate: minApplySuccessRate,
        min_redirect_completeness: minRedirectCompleteness,
        max_pending_alias_edges: maxPendingAliasEdges,
      },
      observed: {
        candidate_queue_depth: candidateQueueDepth,
        pair_candidates: candidateQueueDepth,
        suggestions_scanned: scan.suggestions.length,
        conflicts_detected: conflictDetected,
        alias_total: aliasTotal,
        alias_with_apply_marker: aliasWithApplyMarker,
        alias_with_incident_edges: aliasWithIncidentEdges,
        incident_edges_on_alias_nodes: incidentEdgesOnAliasNodes,
        apply_success_rate: round4(applySuccessRate),
        redirect_completeness: round4(redirectCompleteness),
      },
      checks,
      summary: {
        pass: failed.length === 0,
        failed,
      },
    };
  });

  const outPath = argValue("--out");
  const outText = JSON.stringify(out, null, 2);
  if (outPath) {
    writeFileSync(outPath, `${outText}\n`, "utf8");
  }

  // eslint-disable-next-line no-console
  console.log(outText);

  if (hasFlag("--strict") && !out.summary.pass) {
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
