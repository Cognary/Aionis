import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

type Severity = "error" | "warning";
type RiskLevel = "low" | "medium" | "high";

type Check = {
  name: string;
  severity: Severity;
  pass: boolean;
  value: number;
  threshold: { op: "<=" | ">="; value: number };
  note?: string;
};

type RuleRow = {
  rule_node_id: string;
  state: "draft" | "shadow" | "active";
  summary: string | null;
  commit_id: string | null;
  updated_at: string;
  last_evaluated_at: string | null;
  positive_count: number;
  negative_count: number;
  recent_total: number;
  recent_positive: number;
  recent_negative: number;
  recent_neutral: number;
  recent_distinct_runs: number;
  recent_last_feedback_at: string | null;
  all_positive_runs: number;
  all_negative_runs: number;
  if_json: any;
  then_json: any;
  exceptions_json: any;
};

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

function round(v: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function riskLevel(score: number): RiskLevel {
  if (score >= 0.67) return "high";
  if (score >= 0.34) return "medium";
  return "low";
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const d = Date.now() - ts;
  if (!Number.isFinite(d) || d < 0) return 0;
  return d / (1000 * 60 * 60);
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const windowHours = clampInt(Number(argValue("--window-hours") ?? "168"), 1, 24 * 90);
  const limit = clampInt(Number(argValue("--limit") ?? "200"), 1, 2000);

  const minPromotePositives = clampInt(Number(argValue("--min-promote-positives") ?? "10"), 0, 1_000_000);
  const minPromoteDistinctRuns = clampInt(Number(argValue("--min-promote-distinct-runs") ?? "3"), 0, 1_000_000);
  const maxPromoteNegRatio = clampNum(Number(argValue("--max-promote-neg-ratio") ?? "0.1"), 0, 1);
  const minPromoteScore = clampInt(
    Number(argValue("--min-promote-score") ?? String(Math.max(0, minPromotePositives - 1))),
    0,
    1_000_000,
  );
  const minPromoteConfidence = clampNum(Number(argValue("--min-promote-confidence") ?? "0.55"), 0, 1);
  const minPromoteShadowPositives = clampInt(Number(argValue("--min-promote-shadow-positives") ?? "3"), 0, 1_000_000);
  const maxPromoteShadowNegatives = clampInt(Number(argValue("--max-promote-shadow-negatives") ?? "0"), 0, 1_000_000);
  const minPromoteShadowDistinctRuns = clampInt(Number(argValue("--min-promote-shadow-distinct-runs") ?? "3"), 0, 1_000_000);
  const minPromoteShadowConfidence = clampNum(Number(argValue("--min-promote-shadow-confidence") ?? "0.50"), 0, 1);

  const minDisableNegatives = clampInt(Number(argValue("--min-disable-negatives") ?? "5"), 0, 1_000_000);
  const minDisableNegRatio = clampNum(Number(argValue("--min-disable-neg-ratio") ?? "0.6"), 0, 1);
  const minDisableConfidence = clampNum(Number(argValue("--min-disable-confidence") ?? "0.6"), 0, 1);
  const staleActiveHours = clampInt(Number(argValue("--stale-active-hours") ?? String(24 * 14)), 1, 24 * 365);

  const canaryMinFeedback = clampInt(Number(argValue("--canary-min-feedback") ?? "20"), 1, 1_000_000);
  const urgentDisableConfidence = clampNum(Number(argValue("--urgent-disable-confidence") ?? "0.85"), 0, 1);
  const maxUrgentDisableCandidates = clampInt(Number(argValue("--max-urgent-disable-candidates") ?? "0"), 0, 10_000);
  const maxCanaryDisableCandidates = clampInt(Number(argValue("--max-canary-disable-candidates") ?? "3"), 0, 10_000);

  const includeJson = !hasFlag("--no-json");
  const strict = hasFlag("--strict");
  const strictWarnings = hasFlag("--strict-warnings");

  const rows = await withTx(db, async (client) => {
    const r = await client.query<RuleRow>(
      `
      WITH feedback_recent AS (
        SELECT
          rule_node_id,
          count(*)::int AS recent_total,
          count(*) FILTER (WHERE outcome = 'positive')::int AS recent_positive,
          count(*) FILTER (WHERE outcome = 'negative')::int AS recent_negative,
          count(*) FILTER (WHERE outcome = 'neutral')::int AS recent_neutral,
          count(DISTINCT nullif(trim(COALESCE(run_id, '')), ''))::int AS recent_distinct_runs,
          max(created_at)::text AS recent_last_feedback_at
        FROM memory_rule_feedback
        WHERE scope = $1
          AND created_at >= now() - (($2::text || ' hours')::interval)
        GROUP BY rule_node_id
      ),
      feedback_all AS (
        SELECT
          rule_node_id,
          count(DISTINCT nullif(trim(COALESCE(run_id, '')), '')) FILTER (WHERE outcome = 'positive')::int AS all_positive_runs,
          count(DISTINCT nullif(trim(COALESCE(run_id, '')), '')) FILTER (WHERE outcome = 'negative')::int AS all_negative_runs
        FROM memory_rule_feedback
        WHERE scope = $1
        GROUP BY rule_node_id
      )
      SELECT
        d.rule_node_id,
        d.state::text AS state,
        n.text_summary AS summary,
        d.commit_id::text AS commit_id,
        d.updated_at::text AS updated_at,
        d.last_evaluated_at::text AS last_evaluated_at,
        d.positive_count,
        d.negative_count,
        COALESCE(fr.recent_total, 0)::int AS recent_total,
        COALESCE(fr.recent_positive, 0)::int AS recent_positive,
        COALESCE(fr.recent_negative, 0)::int AS recent_negative,
        COALESCE(fr.recent_neutral, 0)::int AS recent_neutral,
        COALESCE(fr.recent_distinct_runs, 0)::int AS recent_distinct_runs,
        fr.recent_last_feedback_at,
        COALESCE(fa.all_positive_runs, 0)::int AS all_positive_runs,
        COALESCE(fa.all_negative_runs, 0)::int AS all_negative_runs,
        d.if_json,
        d.then_json,
        d.exceptions_json
      FROM memory_rule_defs d
      JOIN memory_nodes n
        ON n.id = d.rule_node_id
       AND n.scope = d.scope
      LEFT JOIN feedback_recent fr ON fr.rule_node_id = d.rule_node_id
      LEFT JOIN feedback_all fa ON fa.rule_node_id = d.rule_node_id
      WHERE d.scope = $1
        AND d.state IN ('draft', 'shadow', 'active')
      ORDER BY d.updated_at DESC
      LIMIT $3
      `,
      [scope, windowHours, limit],
    );
    return r.rows;
  });

  const promoteShadowSuggestions = rows
    .filter((r) => r.state === "draft")
    .map((r) => {
      const score = Number(r.positive_count ?? 0) - Number(r.negative_count ?? 0);
      const volumeScore = clamp01(r.recent_total / Math.max(canaryMinFeedback, 1));
      const negativePenalty = clamp01(Number(r.negative_count ?? 0) / Math.max(maxPromoteShadowNegatives + 1, 1));
      const runsScore = clamp01(r.recent_distinct_runs / Math.max(minPromoteShadowDistinctRuns, 1));
      const confidence = clamp01(0.45 * volumeScore + 0.35 * runsScore + 0.2 * (1 - negativePenalty));
      const riskScore = clamp01(1 - confidence);

      const reasons: string[] = [];
      if (r.positive_count >= minPromoteShadowPositives) reasons.push(`positive_count >= ${minPromoteShadowPositives}`);
      else reasons.push(`positive_count < ${minPromoteShadowPositives}`);
      if (r.negative_count <= maxPromoteShadowNegatives) reasons.push(`negative_count <= ${maxPromoteShadowNegatives}`);
      else reasons.push(`negative_count > ${maxPromoteShadowNegatives}`);
      if (r.recent_distinct_runs >= minPromoteShadowDistinctRuns)
        reasons.push(`recent_distinct_runs >= ${minPromoteShadowDistinctRuns}`);
      else reasons.push(`recent_distinct_runs < ${minPromoteShadowDistinctRuns}`);

      const canaryRecommended = confidence < 0.75 || r.recent_total < canaryMinFeedback;

      return {
        action: "promote_to_shadow" as const,
        rule_node_id: r.rule_node_id,
        current_state: r.state,
        target_state: "shadow" as const,
        summary: r.summary,
        confidence: round(confidence),
        risk_score: round(riskScore),
        risk_level: riskLevel(riskScore),
        canary_recommended: canaryRecommended,
        metrics: {
          score,
          positive_count: r.positive_count,
          negative_count: r.negative_count,
          recent_total: r.recent_total,
          recent_positive: r.recent_positive,
          recent_negative: r.recent_negative,
          recent_neutral: r.recent_neutral,
          recent_distinct_runs: r.recent_distinct_runs,
          all_positive_runs: r.all_positive_runs,
          all_negative_runs: r.all_negative_runs,
        },
        reasons,
        trace: {
          commit_id: r.commit_id,
          updated_at: r.updated_at,
          last_evaluated_at: r.last_evaluated_at,
          recent_last_feedback_at: r.recent_last_feedback_at,
        },
        apply: {
          endpoint: "/v1/memory/rules/state",
          payload: {
            scope,
            rule_node_id: r.rule_node_id,
            state: "shadow",
            input_text: "policy adaptation gate: promote draft rule",
          },
        },
        rollback: {
          endpoint: "/v1/memory/rules/state",
          payload: {
            scope,
            rule_node_id: r.rule_node_id,
            state: "draft",
            input_text: "policy adaptation gate: rollback draft promotion",
          },
        },
        ...(includeJson ? { if_json: r.if_json, then_json: r.then_json, exceptions_json: r.exceptions_json } : {}),
      };
    })
    .filter((x) => x.confidence >= minPromoteShadowConfidence)
    .filter((x) =>
      x.reasons.includes(`positive_count >= ${minPromoteShadowPositives}`) &&
      x.reasons.includes(`negative_count <= ${maxPromoteShadowNegatives}`) &&
      x.reasons.includes(`recent_distinct_runs >= ${minPromoteShadowDistinctRuns}`),
    )
    .sort((a, b) => b.confidence - a.confidence || b.metrics.score - a.metrics.score);

  const promoteSuggestions = rows
    .filter((r) => r.state === "shadow")
    .map((r) => {
      const score = Number(r.positive_count ?? 0) - Number(r.negative_count ?? 0);
      const recentNegRatio = r.recent_total > 0 ? Number(r.recent_negative) / Number(r.recent_total) : 0;
      const volumeScore = clamp01(r.recent_total / Math.max(canaryMinFeedback, 1));
      const qualityScore = clamp01(1 - recentNegRatio / Math.max(maxPromoteNegRatio, 0.0001));
      const runsScore = clamp01(r.recent_distinct_runs / Math.max(minPromoteDistinctRuns, 1));
      const confidence = clamp01(0.45 * qualityScore + 0.35 * volumeScore + 0.2 * runsScore);
      const riskScore = clamp01(1 - confidence);

      const reasons: string[] = [];
      if (r.positive_count >= minPromotePositives) reasons.push(`positive_count >= ${minPromotePositives}`);
      else reasons.push(`positive_count < ${minPromotePositives}`);

      if (recentNegRatio <= maxPromoteNegRatio) reasons.push(`recent_negative_ratio <= ${maxPromoteNegRatio}`);
      else reasons.push(`recent_negative_ratio > ${maxPromoteNegRatio}`);

      if (score >= minPromoteScore) reasons.push(`score(positive-negative) >= ${minPromoteScore}`);
      else reasons.push(`score(positive-negative) < ${minPromoteScore}`);

      if (r.recent_distinct_runs >= minPromoteDistinctRuns) reasons.push(`recent_distinct_runs >= ${minPromoteDistinctRuns}`);
      else reasons.push(`recent_distinct_runs < ${minPromoteDistinctRuns}`);

      const canaryRecommended = confidence < 0.8 || r.recent_total < canaryMinFeedback;

      return {
        action: "promote_to_active" as const,
        rule_node_id: r.rule_node_id,
        current_state: r.state,
        target_state: "active" as const,
        summary: r.summary,
        confidence: round(confidence),
        risk_score: round(riskScore),
        risk_level: riskLevel(riskScore),
        canary_recommended: canaryRecommended,
        metrics: {
          score,
          positive_count: r.positive_count,
          negative_count: r.negative_count,
          recent_total: r.recent_total,
          recent_positive: r.recent_positive,
          recent_negative: r.recent_negative,
          recent_neutral: r.recent_neutral,
          recent_distinct_runs: r.recent_distinct_runs,
          recent_negative_ratio: round(recentNegRatio),
          all_positive_runs: r.all_positive_runs,
          all_negative_runs: r.all_negative_runs,
        },
        reasons,
        trace: {
          commit_id: r.commit_id,
          updated_at: r.updated_at,
          last_evaluated_at: r.last_evaluated_at,
          recent_last_feedback_at: r.recent_last_feedback_at,
        },
        apply: {
          endpoint: "/v1/memory/rules/state",
          payload: {
            scope,
            rule_node_id: r.rule_node_id,
            state: "active",
            input_text: "policy adaptation gate: promote shadow rule",
          },
        },
        rollback: {
          endpoint: "/v1/memory/rules/state",
          payload: {
            scope,
            rule_node_id: r.rule_node_id,
            state: "shadow",
            input_text: "policy adaptation gate: rollback promote",
          },
        },
        ...(includeJson ? { if_json: r.if_json, then_json: r.then_json, exceptions_json: r.exceptions_json } : {}),
      };
    })
    .filter((x) => x.confidence >= minPromoteConfidence)
    .filter((x) =>
      x.reasons.includes(`positive_count >= ${minPromotePositives}`) &&
      x.reasons.includes(`recent_negative_ratio <= ${maxPromoteNegRatio}`) &&
      x.reasons.includes(`score(positive-negative) >= ${minPromoteScore}`) &&
      x.reasons.includes(`recent_distinct_runs >= ${minPromoteDistinctRuns}`),
    )
    .sort((a, b) => b.confidence - a.confidence || b.metrics.score - a.metrics.score);

  const disableSuggestions = rows
    .filter((r) => r.state === "active")
    .map((r) => {
      const recentNegRatio = r.recent_total > 0 ? Number(r.recent_negative) / Number(r.recent_total) : 0;
      const staleHours = hoursSince(r.recent_last_feedback_at);
      const stale = staleHours !== null && staleHours >= staleActiveHours;
      const score = Number(r.positive_count ?? 0) - Number(r.negative_count ?? 0);

      const volumeScore = clamp01(r.recent_total / Math.max(minDisableNegatives * 2, 1));
      const negativePressure = clamp01(recentNegRatio / Math.max(minDisableNegRatio, 0.0001));
      const stalePressure = stale ? 1 : 0;
      const confidence = clamp01(0.55 * negativePressure + 0.25 * volumeScore + 0.2 * stalePressure);
      const riskScore = clamp01(confidence);

      const reasons: string[] = [];
      if (r.recent_negative >= minDisableNegatives) reasons.push(`recent_negative >= ${minDisableNegatives}`);
      else reasons.push(`recent_negative < ${minDisableNegatives}`);

      if (recentNegRatio >= minDisableNegRatio) reasons.push(`recent_negative_ratio >= ${minDisableNegRatio}`);
      else reasons.push(`recent_negative_ratio < ${minDisableNegRatio}`);

      if (stale) reasons.push(`recent_feedback_stale_hours >= ${staleActiveHours}`);
      else reasons.push(`recent_feedback_stale_hours < ${staleActiveHours}`);

      const eligibleByNegative = r.recent_negative >= minDisableNegatives && recentNegRatio >= minDisableNegRatio;
      const eligibleByStale = stale && score < 0;
      const shouldDisable = (eligibleByNegative || eligibleByStale) && confidence >= minDisableConfidence;
      const canaryRecommended = confidence < urgentDisableConfidence || r.recent_total < canaryMinFeedback;

      return {
        action: "disable_rule" as const,
        rule_node_id: r.rule_node_id,
        current_state: r.state,
        target_state: "disabled" as const,
        summary: r.summary,
        confidence: round(confidence),
        risk_score: round(riskScore),
        risk_level: riskLevel(riskScore),
        canary_recommended: canaryRecommended,
        metrics: {
          score,
          positive_count: r.positive_count,
          negative_count: r.negative_count,
          recent_total: r.recent_total,
          recent_positive: r.recent_positive,
          recent_negative: r.recent_negative,
          recent_neutral: r.recent_neutral,
          recent_distinct_runs: r.recent_distinct_runs,
          recent_negative_ratio: round(recentNegRatio),
          recent_feedback_stale_hours: staleHours !== null ? round(staleHours, 2) : null,
          all_positive_runs: r.all_positive_runs,
          all_negative_runs: r.all_negative_runs,
        },
        reasons,
        trace: {
          commit_id: r.commit_id,
          updated_at: r.updated_at,
          last_evaluated_at: r.last_evaluated_at,
          recent_last_feedback_at: r.recent_last_feedback_at,
        },
        apply: {
          endpoint: "/v1/memory/rules/state",
          payload: {
            scope,
            rule_node_id: r.rule_node_id,
            state: "disabled",
            input_text: "policy adaptation gate: disable active rule",
          },
        },
        rollback: {
          endpoint: "/v1/memory/rules/state",
          payload: {
            scope,
            rule_node_id: r.rule_node_id,
            state: "active",
            input_text: "policy adaptation gate: rollback disable",
          },
        },
        ...(includeJson ? { if_json: r.if_json, then_json: r.then_json, exceptions_json: r.exceptions_json } : {}),
        _should_disable: shouldDisable,
      };
    })
    .filter((x) => x._should_disable)
    .map(({ _should_disable, ...rest }) => rest)
    .sort((a, b) => b.confidence - a.confidence || b.metrics.recent_negative - a.metrics.recent_negative);

  const urgentDisableCandidates = disableSuggestions.filter((x) => x.confidence >= urgentDisableConfidence);
  const canaryDisableCandidates = disableSuggestions.filter(
    (x) => x.confidence < urgentDisableConfidence && x.canary_recommended,
  );

  const checks: Check[] = [
    {
      name: "urgent_disable_candidates_max",
      severity: "error",
      pass: urgentDisableCandidates.length <= maxUrgentDisableCandidates,
      value: urgentDisableCandidates.length,
      threshold: { op: "<=", value: maxUrgentDisableCandidates },
      note: "High-confidence active->disabled candidates should be handled before release.",
    },
    {
      name: "canary_disable_candidates_max",
      severity: "warning",
      pass: canaryDisableCandidates.length <= maxCanaryDisableCandidates,
      value: canaryDisableCandidates.length,
      threshold: { op: "<=", value: maxCanaryDisableCandidates },
      note: "Too many canary-needed disable candidates indicate unstable policy adaptation.",
    },
  ];

  const failedErrors = checks.filter((c) => !c.pass && c.severity === "error").map((c) => c.name);
  const failedWarnings = checks.filter((c) => !c.pass && c.severity === "warning").map((c) => c.name);
  const pass = failedErrors.length === 0 && failedWarnings.length === 0;

  const out = {
    ok: true,
    kind: "policy_adaptation_gate",
    scope,
    window_hours: windowHours,
    thresholds: {
      promote: {
        min_positives: minPromotePositives,
        min_distinct_runs: minPromoteDistinctRuns,
        max_negative_ratio: maxPromoteNegRatio,
        min_score: minPromoteScore,
        min_confidence: minPromoteConfidence,
      },
      promote_to_shadow: {
        min_positives: minPromoteShadowPositives,
        max_negatives: maxPromoteShadowNegatives,
        min_distinct_runs: minPromoteShadowDistinctRuns,
        min_confidence: minPromoteShadowConfidence,
      },
      disable: {
        min_negatives: minDisableNegatives,
        min_negative_ratio: minDisableNegRatio,
        min_confidence: minDisableConfidence,
        stale_active_hours: staleActiveHours,
      },
      canary: {
        min_feedback: canaryMinFeedback,
        urgent_disable_confidence: urgentDisableConfidence,
      },
      gate: {
        max_urgent_disable_candidates: maxUrgentDisableCandidates,
        max_canary_disable_candidates: maxCanaryDisableCandidates,
      },
    },
    scanned: {
      rules: rows.length,
      draft_rules: rows.filter((r) => r.state === "draft").length,
      shadow_rules: rows.filter((r) => r.state === "shadow").length,
      active_rules: rows.filter((r) => r.state === "active").length,
    },
    checks,
    summary: {
      pass,
      failed_errors: failedErrors,
      failed_warnings: failedWarnings,
      promote_to_shadow_candidates: promoteShadowSuggestions.length,
      promote_candidates: promoteSuggestions.length,
      disable_candidates: disableSuggestions.length,
      urgent_disable_candidates: urgentDisableCandidates.length,
      canary_disable_candidates: canaryDisableCandidates.length,
    },
    suggestions: {
      promote_to_shadow: promoteShadowSuggestions,
      promote_to_active: promoteSuggestions,
      disable_active: disableSuggestions,
    },
    next_step: {
      note: "Review high-confidence suggestions first. Apply through /v1/memory/rules/state and keep rollback payloads.",
      canary_hint: "If canary_recommended=true, roll out to partial traffic and attach run_id feedback before full activation.",
    },
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));

  if (strict && (failedErrors.length > 0 || failedWarnings.length > 0)) process.exitCode = 2;
  if (strictWarnings && failedWarnings.length > 0) process.exitCode = 2;
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
