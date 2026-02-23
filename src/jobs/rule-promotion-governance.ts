import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { parsePolicyPatch } from "../memory/rule-policy.js";
import { resolveTenantScope } from "../memory/tenant.js";
import { sha256Hex } from "../util/crypto.js";

type Check = {
  name: string;
  severity: "error" | "warning";
  pass: boolean;
  value: string | number | boolean;
  expected: string;
};

type RuleRow = {
  rule_node_id: string;
  state: string;
  summary: string | null;
  commit_id: string | null;
  positive_count: number;
  negative_count: number;
  recent_total: number;
  recent_positive: number;
  recent_negative: number;
  recent_distinct_runs: number;
  if_json: any;
  then_json: any;
  exceptions_json: any;
  rule_scope: string | null;
  target_agent_id: string | null;
  target_team_id: string | null;
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

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const scopeInput = argValue("--scope") ?? env.MEMORY_SCOPE;
  const tenantIdInput = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const ruleNodeId = argValue("--rule-node-id");
  const targetStateRaw = (argValue("--target-state") ?? "active").trim().toLowerCase();
  if (targetStateRaw !== "shadow" && targetStateRaw !== "active") {
    throw new Error("invalid --target-state, expected shadow|active");
  }
  const targetState = targetStateRaw as "shadow" | "active";
  const windowHours = clampInt(Number(argValue("--window-hours") ?? "168"), 1, 24 * 90);

  const minDraftShadowPositives = clampInt(Number(argValue("--min-draft-shadow-positives") ?? "3"), 0, 1_000_000);
  const maxDraftShadowNegatives = clampInt(Number(argValue("--max-draft-shadow-negatives") ?? "0"), 0, 1_000_000);
  const minDraftShadowDistinctRuns = clampInt(Number(argValue("--min-draft-shadow-distinct-runs") ?? "3"), 0, 1_000_000);

  const minShadowActivePositives = clampInt(Number(argValue("--min-shadow-active-positives") ?? "10"), 0, 1_000_000);
  const maxShadowActiveNegRatio = clampNum(Number(argValue("--max-shadow-active-neg-ratio") ?? "0.1"), 0, 1);
  const minShadowActiveDistinctRuns = clampInt(Number(argValue("--min-shadow-active-distinct-runs") ?? "3"), 0, 1_000_000);
  const minShadowActiveScore = clampInt(Number(argValue("--min-shadow-active-score") ?? "9"), -1_000_000, 1_000_000);

  const strict = hasFlag("--strict");

  const tenancy = resolveTenantScope(
    { scope: scopeInput, tenant_id: tenantIdInput },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );

  try {
    const row = await withTx(db, async (client) => {
      const r = await client.query<RuleRow>(
        `
        WITH feedback_recent AS (
          SELECT
            rule_node_id,
            count(*)::int AS recent_total,
            count(*) FILTER (WHERE outcome = 'positive')::int AS recent_positive,
            count(*) FILTER (WHERE outcome = 'negative')::int AS recent_negative,
            count(DISTINCT nullif(trim(COALESCE(run_id, '')), ''))::int AS recent_distinct_runs
          FROM memory_rule_feedback
          WHERE scope = $1
            AND created_at >= now() - (($3::text || ' hours')::interval)
          GROUP BY rule_node_id
        )
        SELECT
          n.id AS rule_node_id,
          COALESCE(d.state::text, 'draft') AS state,
          n.text_summary AS summary,
          COALESCE(d.commit_id::text, n.commit_id::text) AS commit_id,
          COALESCE(d.positive_count, 0)::int AS positive_count,
          COALESCE(d.negative_count, 0)::int AS negative_count,
          COALESCE(fr.recent_total, 0)::int AS recent_total,
          COALESCE(fr.recent_positive, 0)::int AS recent_positive,
          COALESCE(fr.recent_negative, 0)::int AS recent_negative,
          COALESCE(fr.recent_distinct_runs, 0)::int AS recent_distinct_runs,
          COALESCE(d.if_json, n.slots->'if', '{}'::jsonb) AS if_json,
          COALESCE(d.then_json, n.slots->'then', '{}'::jsonb) AS then_json,
          COALESCE(d.exceptions_json, n.slots->'exceptions', '[]'::jsonb) AS exceptions_json,
          COALESCE(d.rule_scope::text, nullif(trim(COALESCE(n.slots->>'rule_scope', '')), '')) AS rule_scope,
          COALESCE(d.target_agent_id, nullif(trim(COALESCE(n.slots->>'target_agent_id', '')), '')) AS target_agent_id,
          COALESCE(d.target_team_id, nullif(trim(COALESCE(n.slots->>'target_team_id', '')), '')) AS target_team_id
        FROM memory_nodes n
        LEFT JOIN memory_rule_defs d ON d.rule_node_id = n.id AND d.scope = n.scope
        LEFT JOIN feedback_recent fr ON fr.rule_node_id = n.id
        WHERE n.scope = $1
          AND n.type = 'rule'
          AND ($2::uuid IS NULL OR n.id = $2::uuid)
        ORDER BY n.updated_at DESC
        LIMIT 1
        `,
        [tenancy.scope_key, ruleNodeId ?? null, windowHours],
      );
      return r.rows[0] ?? null;
    });

    if (!row) {
      throw new Error(`rule not found in scope: ${tenancy.scope} (${ruleNodeId ?? "latest"})`);
    }

    const checks: Check[] = [];
    const score = Number(row.positive_count) - Number(row.negative_count);
    const recentNegRatio = row.recent_total > 0 ? Number(row.recent_negative) / Number(row.recent_total) : 0;
    const ruleScope = (typeof row.rule_scope === "string" ? row.rule_scope.trim().toLowerCase() : "") || "global";

    const policyPatchValid = (() => {
      try {
        parsePolicyPatch(row.then_json);
        return true;
      } catch {
        return false;
      }
    })();
    checks.push({
      name: "policy_patch_valid",
      severity: "error",
      pass: policyPatchValid,
      value: policyPatchValid,
      expected: "then_json must match policy patch schema",
    });
    checks.push({
      name: "if_json_object",
      severity: "error",
      pass: isPlainObject(row.if_json),
      value: isPlainObject(row.if_json),
      expected: "if_json is object",
    });
    checks.push({
      name: "exceptions_json_array",
      severity: "error",
      pass: Array.isArray(row.exceptions_json),
      value: Array.isArray(row.exceptions_json),
      expected: "exceptions_json is array",
    });
    checks.push({
      name: "scope_target_valid",
      severity: "error",
      pass:
        (ruleScope === "global") ||
        (ruleScope === "team" && !!row.target_team_id) ||
        (ruleScope === "agent" && !!row.target_agent_id),
      value: ruleScope,
      expected: "global OR team(target_team_id) OR agent(target_agent_id)",
    });

    if (targetState === "shadow") {
      checks.push({
        name: "transition_path",
        severity: "error",
        pass: row.state === "draft",
        value: row.state,
        expected: "draft -> shadow",
      });
      checks.push({
        name: "draft_shadow_min_positives",
        severity: "error",
        pass: row.positive_count >= minDraftShadowPositives,
        value: row.positive_count,
        expected: `>= ${minDraftShadowPositives}`,
      });
      checks.push({
        name: "draft_shadow_max_negatives",
        severity: "error",
        pass: row.negative_count <= maxDraftShadowNegatives,
        value: row.negative_count,
        expected: `<= ${maxDraftShadowNegatives}`,
      });
      checks.push({
        name: "draft_shadow_min_distinct_runs",
        severity: "warning",
        pass: row.recent_distinct_runs >= minDraftShadowDistinctRuns,
        value: row.recent_distinct_runs,
        expected: `>= ${minDraftShadowDistinctRuns} (window=${windowHours}h)`,
      });
    } else {
      checks.push({
        name: "transition_path",
        severity: "error",
        pass: row.state === "shadow",
        value: row.state,
        expected: "shadow -> active",
      });
      checks.push({
        name: "shadow_active_min_positives",
        severity: "error",
        pass: row.positive_count >= minShadowActivePositives,
        value: row.positive_count,
        expected: `>= ${minShadowActivePositives}`,
      });
      checks.push({
        name: "shadow_active_max_neg_ratio",
        severity: "error",
        pass: recentNegRatio <= maxShadowActiveNegRatio,
        value: round(recentNegRatio),
        expected: `<= ${maxShadowActiveNegRatio}`,
      });
      checks.push({
        name: "shadow_active_min_score",
        severity: "warning",
        pass: score >= minShadowActiveScore,
        value: score,
        expected: `>= ${minShadowActiveScore}`,
      });
      checks.push({
        name: "shadow_active_min_distinct_runs",
        severity: "warning",
        pass: row.recent_distinct_runs >= minShadowActiveDistinctRuns,
        value: row.recent_distinct_runs,
        expected: `>= ${minShadowActiveDistinctRuns} (window=${windowHours}h)`,
      });
    }

    const failedErrors = checks.filter((x) => !x.pass && x.severity === "error").map((x) => x.name);
    const failedWarnings = checks.filter((x) => !x.pass && x.severity === "warning").map((x) => x.name);
    const pass = failedErrors.length === 0 && failedWarnings.length === 0;
    const gatingHash = sha256Hex(
      stableStringify({
        scope: tenancy.scope,
        tenant_id: tenancy.tenant_id,
        rule_node_id: row.rule_node_id,
        target_state: targetState,
        checks: checks.map((x) => ({ name: x.name, pass: x.pass, value: x.value })),
      }),
    );

    const out = {
      ok: true,
      kind: "rule_promotion_governance",
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
      target_state: targetState,
      window_hours: windowHours,
      rule: {
        rule_node_id: row.rule_node_id,
        current_state: row.state,
        summary: row.summary,
        commit_id: row.commit_id,
      },
      thresholds: {
        draft_to_shadow: {
          min_positives: minDraftShadowPositives,
          max_negatives: maxDraftShadowNegatives,
          min_distinct_runs: minDraftShadowDistinctRuns,
        },
        shadow_to_active: {
          min_positives: minShadowActivePositives,
          max_negative_ratio: maxShadowActiveNegRatio,
          min_distinct_runs: minShadowActiveDistinctRuns,
          min_score: minShadowActiveScore,
        },
      },
      metrics: {
        positive_count: row.positive_count,
        negative_count: row.negative_count,
        score,
        recent_total: row.recent_total,
        recent_positive: row.recent_positive,
        recent_negative: row.recent_negative,
        recent_negative_ratio: round(recentNegRatio),
        recent_distinct_runs: row.recent_distinct_runs,
      },
      checks,
      summary: {
        pass,
        failed_errors: failedErrors,
        failed_warnings: failedWarnings,
      },
      next_step: {
        can_promote: pass,
        apply: {
          endpoint: "/v1/memory/rules/state",
          payload: {
            scope: tenancy.scope,
            tenant_id: tenancy.tenant_id,
            rule_node_id: row.rule_node_id,
            state: targetState,
            input_text: `rule promotion governance check ${targetState}`,
          },
        },
      },
      governance_hash: gatingHash,
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));

    if (strict && !pass) process.exitCode = 2;
  } finally {
    await closeDb(db);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
