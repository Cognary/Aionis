import "dotenv/config";
import type pg from "pg";
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

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

async function hasTable(client: pg.PoolClient, tableName: string): Promise<boolean> {
  const r = await client.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS ok
    `,
    [tableName],
  );
  return !!r.rows[0]?.ok;
}

async function hasColumn(client: pg.PoolClient, tableName: string, columnName: string): Promise<boolean> {
  const r = await client.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS ok
    `,
    [tableName, columnName],
  );
  return !!r.rows[0]?.ok;
}

type CheckSeverity = "warning" | "error";

type GateCheck = {
  name: string;
  severity: CheckSeverity;
  pass: boolean;
  value: number;
  threshold: { op: ">=" | "<="; value: number };
  note?: string;
};

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const windowHours = clampInt(Number(argValue("--window-hours") ?? "24"), 1, 24 * 30);
  const minFeedbackEvents = clampInt(Number(argValue("--min-feedback-events") ?? "10"), 0, 1_000_000);
  const minDistinctRuns = clampInt(Number(argValue("--min-distinct-runs") ?? "3"), 0, 1_000_000);
  const minRunIdCoverage = clampNum(Number(argValue("--min-run-id-coverage") ?? "0.8"), 0, 1);
  const maxNegativeRatio = clampNum(Number(argValue("--max-negative-ratio") ?? "0.35"), 0, 1);
  const minActiveFeedbackCoverage = clampNum(Number(argValue("--min-active-feedback-coverage") ?? "0.6"), 0, 1);
  const maxStaleActiveRules = clampInt(Number(argValue("--max-stale-active-rules") ?? "5"), 0, 1_000_000);
  const minDecisionLinkCoverage = clampNum(Number(argValue("--min-decision-link-coverage") ?? "0.95"), 0, 1);
  const strict = hasFlag("--strict");
  const strictWarnings = hasFlag("--strict-warnings");

  const out = await withTx(db, async (client) => {
    const hasExecutionDecisions = await hasTable(client, "memory_execution_decisions");
    const hasFeedbackSource = await hasColumn(client, "memory_rule_feedback", "source");
    const hasFeedbackDecisionId = await hasColumn(client, "memory_rule_feedback", "decision_id");

    const feedbackRes = await client.query<{
      total: string;
      with_run_id: string;
      distinct_runs: string;
      positive: string;
      negative: string;
      neutral: string;
    }>(
      `
      SELECT
        count(*)::text AS total,
        count(*) FILTER (WHERE nullif(trim(COALESCE(run_id, '')), '') IS NOT NULL)::text AS with_run_id,
        count(DISTINCT nullif(trim(COALESCE(run_id, '')), ''))::text AS distinct_runs,
        count(*) FILTER (WHERE outcome = 'positive')::text AS positive,
        count(*) FILTER (WHERE outcome = 'negative')::text AS negative,
        count(*) FILTER (WHERE outcome = 'neutral')::text AS neutral
      FROM memory_rule_feedback
      WHERE scope = $1
        AND created_at >= now() - (($2::text || ' hours')::interval)
      `,
      [scope, windowHours],
    );

    const decisionRes =
      hasExecutionDecisions && hasFeedbackSource && hasFeedbackDecisionId
        ? await client.query<{
            tools_feedback_total: string;
            with_decision_id: string;
            linked_decision_id: string;
          }>(
            `
            SELECT
              count(*) FILTER (WHERE f.source = 'tools_feedback')::text AS tools_feedback_total,
              count(*) FILTER (WHERE f.source = 'tools_feedback' AND f.decision_id IS NOT NULL)::text AS with_decision_id,
              count(*) FILTER (WHERE f.source = 'tools_feedback' AND f.decision_id IS NOT NULL AND d.id IS NOT NULL)::text AS linked_decision_id
            FROM memory_rule_feedback f
            LEFT JOIN memory_execution_decisions d
              ON d.scope = f.scope
             AND d.id = f.decision_id
            WHERE f.scope = $1
              AND f.created_at >= now() - (($2::text || ' hours')::interval)
            `,
            [scope, windowHours],
          )
        : null;

    const ruleRes = await client.query<{
      active_total: string;
      shadow_total: string;
      draft_total: string;
      disabled_total: string;
      active_with_recent_feedback: string;
    }>(
      `
      WITH recent_rule_feedback AS (
        SELECT DISTINCT rule_node_id
        FROM memory_rule_feedback
        WHERE scope = $1
          AND created_at >= now() - (($2::text || ' hours')::interval)
      )
      SELECT
        count(*) FILTER (WHERE d.state = 'active')::text AS active_total,
        count(*) FILTER (WHERE d.state = 'shadow')::text AS shadow_total,
        count(*) FILTER (WHERE d.state = 'draft')::text AS draft_total,
        count(*) FILTER (WHERE d.state = 'disabled')::text AS disabled_total,
        count(*) FILTER (WHERE d.state = 'active' AND r.rule_node_id IS NOT NULL)::text AS active_with_recent_feedback
      FROM memory_rule_defs d
      LEFT JOIN recent_rule_feedback r ON r.rule_node_id = d.rule_node_id
      WHERE d.scope = $1
      `,
      [scope, windowHours],
    );

    const f = feedbackRes.rows[0] ?? {
      total: "0",
      with_run_id: "0",
      distinct_runs: "0",
      positive: "0",
      negative: "0",
      neutral: "0",
    };
    const r = ruleRes.rows[0] ?? {
      active_total: "0",
      shadow_total: "0",
      draft_total: "0",
      disabled_total: "0",
      active_with_recent_feedback: "0",
    };

    const feedbackTotal = Number(f.total ?? "0");
    const feedbackWithRunId = Number(f.with_run_id ?? "0");
    const distinctRuns = Number(f.distinct_runs ?? "0");
    const positive = Number(f.positive ?? "0");
    const negative = Number(f.negative ?? "0");
    const neutral = Number(f.neutral ?? "0");

    const activeTotal = Number(r.active_total ?? "0");
    const shadowTotal = Number(r.shadow_total ?? "0");
    const draftTotal = Number(r.draft_total ?? "0");
    const disabledTotal = Number(r.disabled_total ?? "0");
    const activeWithRecentFeedback = Number(r.active_with_recent_feedback ?? "0");

    const runIdCoverage = feedbackTotal > 0 ? feedbackWithRunId / feedbackTotal : 1;
    const negativeRatio = feedbackTotal > 0 ? negative / feedbackTotal : 0;
    const activeFeedbackCoverage = activeTotal > 0 ? activeWithRecentFeedback / activeTotal : 1;
    const staleActiveRules = Math.max(0, activeTotal - activeWithRecentFeedback);
    const decisionRows = decisionRes?.rows[0];
    const toolsFeedbackTotal = Number(decisionRows?.tools_feedback_total ?? "0");
    const withDecisionId = Number(decisionRows?.with_decision_id ?? "0");
    const linkedDecisionId = Number(decisionRows?.linked_decision_id ?? "0");
    const decisionLinkCoverage = toolsFeedbackTotal > 0 ? linkedDecisionId / toolsFeedbackTotal : 1;

    const checks: GateCheck[] = [
      {
        name: "feedback_events_min",
        severity: "warning",
        pass: feedbackTotal >= minFeedbackEvents,
        value: feedbackTotal,
        threshold: { op: ">=", value: minFeedbackEvents },
        note: "Feedback volume in rolling window should be high enough for policy adaptation signals.",
      },
      {
        name: "feedback_distinct_runs_min",
        severity: "warning",
        pass: distinctRuns >= minDistinctRuns,
        value: distinctRuns,
        threshold: { op: ">=", value: minDistinctRuns },
        note: "Distinct run_id count should avoid single-run bias.",
      },
      {
        name: "feedback_run_id_coverage_min",
        severity: "warning",
        pass: runIdCoverage >= minRunIdCoverage,
        value: round(runIdCoverage),
        threshold: { op: ">=", value: minRunIdCoverage },
        note: "Most feedback records should include run_id for audit linkage.",
      },
      {
        name: "feedback_negative_ratio_max",
        severity: "warning",
        pass: negativeRatio <= maxNegativeRatio,
        value: round(negativeRatio),
        threshold: { op: "<=", value: maxNegativeRatio },
        note: "High negative ratio indicates unstable policy injection.",
      },
      {
        name: "active_rule_feedback_coverage_min",
        severity: "warning",
        pass: activeFeedbackCoverage >= minActiveFeedbackCoverage,
        value: round(activeFeedbackCoverage),
        threshold: { op: ">=", value: minActiveFeedbackCoverage },
        note: "Active rules should receive recent feedback to remain trustworthy.",
      },
      {
        name: "stale_active_rules_max",
        severity: "warning",
        pass: staleActiveRules <= maxStaleActiveRules,
        value: staleActiveRules,
        threshold: { op: "<=", value: maxStaleActiveRules },
        note: "Too many active rules without recent feedback suggests drift.",
      },
    ];
    if (decisionRes) {
      checks.push({
        name: "decision_link_coverage_min",
        severity: "warning",
        pass: decisionLinkCoverage >= minDecisionLinkCoverage,
        value: round(decisionLinkCoverage),
        threshold: { op: ">=", value: minDecisionLinkCoverage },
        note: "tools_feedback rows should resolve to persisted decision records for replay/audit.",
      });
    }

    const failedWarnings = checks.filter((c) => !c.pass && c.severity === "warning").map((c) => c.name);
    const failedErrors = checks.filter((c) => !c.pass && c.severity === "error").map((c) => c.name);
    const pass = failedWarnings.length === 0 && failedErrors.length === 0;

    return {
      scope,
      window_hours: windowHours,
      thresholds: {
        min_feedback_events: minFeedbackEvents,
        min_distinct_runs: minDistinctRuns,
        min_run_id_coverage: minRunIdCoverage,
        max_negative_ratio: maxNegativeRatio,
        min_active_feedback_coverage: minActiveFeedbackCoverage,
        max_stale_active_rules: maxStaleActiveRules,
        min_decision_link_coverage: minDecisionLinkCoverage,
      },
      metrics: {
        feedback: {
          total: feedbackTotal,
          with_run_id: feedbackWithRunId,
          distinct_runs: distinctRuns,
          run_id_coverage: round(runIdCoverage),
          positive,
          negative,
          neutral,
          negative_ratio: round(negativeRatio),
        },
        rules: {
          active_total: activeTotal,
          shadow_total: shadowTotal,
          draft_total: draftTotal,
          disabled_total: disabledTotal,
          active_with_recent_feedback: activeWithRecentFeedback,
          active_feedback_coverage: round(activeFeedbackCoverage),
          stale_active_rules: staleActiveRules,
        },
        decision: decisionRes
          ? {
              tools_feedback_total: toolsFeedbackTotal,
              with_decision_id: withDecisionId,
              linked_decision_id: linkedDecisionId,
              decision_link_coverage: round(decisionLinkCoverage),
            }
          : {
              available: false,
              note: "Execution provenance schema missing; apply migration 0021_execution_decision_provenance.sql.",
            },
      },
      checks,
      summary: {
        pass,
        failed_warnings: failedWarnings,
        failed_errors: failedErrors,
      },
    };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, kind: "execution_loop_gate", ...out }, null, 2));

  const hasFailedWarnings = out.summary.failed_warnings.length > 0;
  const hasFailedErrors = out.summary.failed_errors.length > 0;
  if (strict && (hasFailedWarnings || hasFailedErrors)) process.exitCode = 2;
  if (strictWarnings && hasFailedWarnings) process.exitCode = 2;
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
