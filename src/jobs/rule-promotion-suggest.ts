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
  const limit = clampInt(Number(argValue("--limit") ?? "50"), 1, 500);

  // Defaults aligned with docs/RULE_LIFECYCLE.md (SHADOW -> ACTIVE).
  const minPositives = clampInt(Number(argValue("--min-positives") ?? "10"), 0, 1_000_000);
  const maxNegRatio = clampNum(Number(argValue("--max-neg-ratio") ?? "0.1"), 0, 1);
  const minScore = clampInt(Number(argValue("--min-score") ?? String(Math.max(0, minPositives - 1))), 0, 1_000_000);

  const includeJson = !hasFlag("--no-json");

  const rows = await withTx(db, async (client) => {
    const r = await client.query<{
      rule_node_id: string;
      state: string;
      positive_count: number;
      negative_count: number;
      last_evaluated_at: string | null;
      updated_at: string;
      commit_id: string | null;
      summary: string | null;
      if_json: any;
      then_json: any;
      exceptions_json: any;
      positive_runs: number;
      negative_runs: number;
    }>(
      `
      WITH run_stats AS (
        SELECT
          rule_node_id,
          count(DISTINCT run_id) FILTER (WHERE outcome = 'positive' AND run_id IS NOT NULL) AS positive_runs,
          count(DISTINCT run_id) FILTER (WHERE outcome = 'negative' AND run_id IS NOT NULL) AS negative_runs
        FROM memory_rule_feedback
        WHERE scope = $1
        GROUP BY rule_node_id
      )
      SELECT
        d.rule_node_id,
        d.state::text AS state,
        d.positive_count,
        d.negative_count,
        d.last_evaluated_at::text AS last_evaluated_at,
        d.updated_at::text AS updated_at,
        d.commit_id::text AS commit_id,
        n.text_summary AS summary,
        d.if_json,
        d.then_json,
        d.exceptions_json,
        COALESCE(rs.positive_runs, 0)::int AS positive_runs,
        COALESCE(rs.negative_runs, 0)::int AS negative_runs
      FROM memory_rule_defs d
      JOIN memory_nodes n ON n.id = d.rule_node_id
      LEFT JOIN run_stats rs ON rs.rule_node_id = d.rule_node_id
      WHERE d.scope = $1
        AND d.state = 'shadow'
      ORDER BY (d.positive_count - d.negative_count) DESC, d.updated_at DESC
      LIMIT $2
      `,
      [scope, limit],
    );
    return r.rows;
  });

  const suggestions = rows
    .map((r) => {
      const score = Number(r.positive_count ?? 0) - Number(r.negative_count ?? 0);
      const negRatio = r.positive_count > 0 ? Number(r.negative_count) / Number(r.positive_count) : 0;

      const reasons: string[] = [];
      if (r.positive_count >= minPositives) reasons.push(`positive_count >= ${minPositives}`);
      else reasons.push(`positive_count < ${minPositives}`);

      if (negRatio <= maxNegRatio) reasons.push(`negative/positive <= ${maxNegRatio}`);
      else reasons.push(`negative/positive > ${maxNegRatio}`);

      if (score >= minScore) reasons.push(`score(positive-negative) >= ${minScore}`);
      else reasons.push(`score(positive-negative) < ${minScore}`);

      const shouldPromote = r.positive_count >= minPositives && negRatio <= maxNegRatio && score >= minScore;

      return {
        rule_node_id: r.rule_node_id,
        state: r.state,
        summary: r.summary,
        positive_count: r.positive_count,
        negative_count: r.negative_count,
        score,
        negative_ratio: Number(negRatio.toFixed(4)),
        positive_runs: r.positive_runs,
        negative_runs: r.negative_runs,
        last_evaluated_at: r.last_evaluated_at,
        updated_at: r.updated_at,
        commit_id: r.commit_id,
        should_promote_to_active: shouldPromote,
        reasons,
        ...(includeJson
          ? { if_json: r.if_json, then_json: r.then_json, exceptions_json: r.exceptions_json }
          : {}),
      };
    })
    .filter((x) => x.should_promote_to_active);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        scope,
        kind: "rule_promotion_suggest",
        thresholds: { state_from: "shadow", state_to: "active", min_positives: minPositives, max_neg_ratio: maxNegRatio, min_score: minScore },
        limit_scanned: rows.length,
        suggested: suggestions.length,
        suggestions,
        next_step: {
          note: "This job does not mutate rule state. To promote, call POST /v1/memory/rules/state with state=active.",
          example: { rule_node_id: suggestions[0]?.rule_node_id ?? null, state: "active", input_text: "promote to active" },
        },
      },
      null,
      2,
    ),
  );

  // Non-zero exit when there are suggestions can be useful in automation, but default to 0 for dev ergonomics.
  if (hasFlag("--strict") && suggestions.length > 0) {
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

