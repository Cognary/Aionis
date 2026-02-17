import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { collectConsolidationCandidates, parseTypes, toMergeCandidateV1 } from "./consolidation-core.js";

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

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const types = parseTypes(argValue("--types"));
  const maxAnchors = clampInt(Number(argValue("--max-anchors") ?? String(env.MEMORY_CONSOLIDATION_MAX_ANCHORS)), 1, 2000);
  const neighborsPerNode = clampInt(
    Number(argValue("--neighbors-per-node") ?? String(env.MEMORY_CONSOLIDATION_NEIGHBORS_PER_NODE)),
    1,
    50,
  );
  const minVector = clampNum(Number(argValue("--min-vector") ?? String(env.MEMORY_CONSOLIDATION_MIN_VECTOR_SIM)), 0, 1);
  const minScore = clampNum(Number(argValue("--min-score") ?? String(env.MEMORY_CONSOLIDATION_MIN_SCORE)), 0, 1);
  const maxPairs = clampInt(Number(argValue("--max-pairs") ?? String(env.MEMORY_CONSOLIDATION_MAX_PAIRS)), 1, 2000);
  const conflictMinSharedTokens = clampInt(
    Number(argValue("--conflict-min-shared-tokens") ?? String(env.MEMORY_CONSOLIDATION_CONFLICT_MIN_SHARED_TOKENS)),
    1,
    8,
  );
  const conflictNegationLexicalMin = clampNum(
    Number(argValue("--conflict-negation-lexical-min") ?? String(env.MEMORY_CONSOLIDATION_CONFLICT_NEGATION_LEXICAL_MIN)),
    0,
    1,
  );
  const includeSummary = !hasFlag("--no-summary");

  const out = await withTx(db, async (client) =>
    collectConsolidationCandidates(client, {
      scope,
      types,
      max_anchors: maxAnchors,
      neighbors_per_node: neighborsPerNode,
      min_vector_similarity: minVector,
      min_score: minScore,
      max_pairs: maxPairs,
      include_summary: includeSummary,
      conflict_min_shared_tokens: conflictMinSharedTokens,
      conflict_negation_lexical_min: conflictNegationLexicalMin,
    }),
  );
  const conflictDetected = out.suggestions.filter((x) => x.conflict.detected).length;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        scope,
        kind: "consolidation_candidates_shadow",
        thresholds: {
          types,
          max_anchors: maxAnchors,
          neighbors_per_node: neighborsPerNode,
          min_vector_similarity: minVector,
          min_score: minScore,
          max_pairs: maxPairs,
          conflict_min_shared_tokens: conflictMinSharedTokens,
          conflict_negation_lexical_min: conflictNegationLexicalMin,
        },
        scanned: {
          anchors: out.anchors_scanned,
          neighbors_examined: out.neighbors_examined,
          pair_candidates: out.pair_candidates,
        },
        suggested: out.suggestions.length,
        conflict_detected: conflictDetected,
        suggestions: out.suggestions,
        merge_protocol_version: "consolidation_candidate_v1",
        merge_candidates_v1: out.suggestions.map((s) => toMergeCandidateV1(s)),
        next_step: {
          note: "Shadow mode only. No state mutated. Review candidates before alias/canonical writes.",
          suggested_action: "Promote selected pairs into alias_of/superseded_by plan in Phase 3.2.",
        },
      },
      null,
      2,
    ),
  );

  if (hasFlag("--strict") && out.suggestions.length > 0) {
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
