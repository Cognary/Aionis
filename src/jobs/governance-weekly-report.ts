import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

type Severity = "error" | "warning";

type CheckResult = {
  name: string;
  severity: Severity;
  pass: boolean;
  value: number;
  threshold: { op: ">=" | "<="; value: number };
  note?: string;
};

type TenantRollup = {
  tenant_id: string;
  active_rules: number;
  shadow_rules: number;
  draft_rules: number;
  disabled_rules: number;
  feedback_total: number;
  feedback_positive: number;
  feedback_negative: number;
  feedback_negative_ratio: number;
  feedback_run_id_coverage: number;
  decision_link_coverage: number | null;
  recall_total: number;
  recall_identity_coverage: number | null;
  private_total: number;
  private_owner_coverage: number | null;
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

function pct(v: number): number {
  return round(v * 100, 2);
}

function nowRunId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function toTenantExpr(defaultTenantId: string): string {
  return `
    CASE
      WHEN scope LIKE 'tenant:%::scope:%'
        THEN split_part(split_part(scope, '::scope:', 1), 'tenant:', 2)
      ELSE '${defaultTenantId.replace(/'/g, "''")}'
    END
  `;
}

async function hasTable(table: string): Promise<boolean> {
  const r = await db.pool.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS ok
    `,
    [table],
  );
  return !!r.rows[0]?.ok;
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const r = await db.pool.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS ok
    `,
    [table, column],
  );
  return !!r.rows[0]?.ok;
}

function buildMarkdown(args: {
  reportWeek: string;
  generatedAt: string;
  scope: string;
  windowHours: number;
  checks: CheckResult[];
  scopeSnapshot: any;
  drift: any;
  topTenants: TenantRollup[];
  recommendations: string[];
}): string {
  const { reportWeek, generatedAt, scope, windowHours, checks, scopeSnapshot, drift, topTenants, recommendations } = args;
  const failed = checks.filter((c) => !c.pass);
  const errors = failed.filter((c) => c.severity === "error");
  const warnings = failed.filter((c) => c.severity === "warning");
  const overall = errors.length > 0 ? "red" : warnings.length > 0 ? "yellow" : "green";

  const lines: string[] = [];
  lines.push("# Governance Weekly Status");
  lines.push("");
  lines.push("## Header");
  lines.push("");
  lines.push(`1. Week: \`${reportWeek}\``);
  lines.push(`2. Generated at: \`${generatedAt}\``);
  lines.push(`3. Scope snapshot: \`${scope}\``);
  lines.push(`4. Window hours: \`${windowHours}\``);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(`1. Overall status: \`${overall}\``);
  lines.push(`2. Failed error checks: \`${errors.length}\``);
  lines.push(`3. Failed warning checks: \`${warnings.length}\``);
  lines.push(`4. Tenant count: \`${drift.tenant_count}\``);
  lines.push("");
  lines.push("## Scope Snapshot");
  lines.push("");
  lines.push(`1. Feedback total: \`${scopeSnapshot.feedback.total}\``);
  lines.push(`2. Feedback run_id coverage: \`${pct(scopeSnapshot.feedback.run_id_coverage)}%\``);
  lines.push(`3. Decision link coverage: \`${pct(scopeSnapshot.decision.link_coverage)}%\``);
  lines.push(`4. Recall identity coverage: \`${pct(scopeSnapshot.recall.identity_coverage)}%\``);
  lines.push(`5. Private owner coverage: \`${pct(scopeSnapshot.lane.private_owner_coverage)}%\``);
  lines.push("");
  lines.push("## Cross-Tenant Drift");
  lines.push("");
  lines.push(`1. Active rule count drift: \`${drift.active_rule_count_drift}\``);
  lines.push(`2. Negative ratio drift: \`${round(drift.negative_ratio_drift)}\``);
  lines.push(`3. Tenants with feedback floor: \`${drift.tenants_with_feedback_floor}\``);
  lines.push("");
  lines.push("## Gate Checks");
  lines.push("");
  for (const c of checks) {
    lines.push(`1. [${c.pass ? "PASS" : "FAIL"}] ${c.name} (${c.severity}) value=${c.value} threshold=${c.threshold.op}${c.threshold.value}`);
  }
  lines.push("");
  lines.push("## Top Tenants");
  lines.push("");
  lines.push("| tenant_id | active_rules | feedback_total | negative_ratio | decision_link_coverage | recall_identity_coverage | private_owner_coverage |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const t of topTenants) {
    lines.push(
      `| ${t.tenant_id} | ${t.active_rules} | ${t.feedback_total} | ${round(t.feedback_negative_ratio)} | ${
        t.decision_link_coverage === null ? "n/a" : round(t.decision_link_coverage)
      } | ${t.recall_identity_coverage === null ? "n/a" : round(t.recall_identity_coverage)} | ${
        t.private_owner_coverage === null ? "n/a" : round(t.private_owner_coverage)
      } |`,
    );
  }
  lines.push("");
  lines.push("## Recommendations");
  lines.push("");
  for (const r of recommendations) {
    lines.push(`1. ${r}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const defaultTenantId = env.MEMORY_TENANT_ID;
  const windowHours = clampInt(Number(argValue("--window-hours") ?? "168"), 1, 24 * 90);
  const tenantDriftMinFeedback = clampInt(Number(argValue("--tenant-drift-min-feedback") ?? "5"), 0, 1_000_000);

  const minDecisionLinkCoverage = clampNum(Number(argValue("--min-decision-link-coverage") ?? "0.95"), 0, 1);
  const minRecallIdentityCoverage = clampNum(Number(argValue("--min-recall-identity-coverage") ?? "0.8"), 0, 1);
  const minPrivateOwnerCoverage = clampNum(Number(argValue("--min-private-owner-coverage") ?? "1"), 0, 1);
  const maxTenantActiveRuleCountDrift = clampInt(Number(argValue("--max-tenant-active-rule-count-drift") ?? "20"), 0, 1_000_000);
  const maxTenantNegativeRatioDrift = clampNum(Number(argValue("--max-tenant-negative-ratio-drift") ?? "0.3"), 0, 1);

  const strict = hasFlag("--strict");
  const strictWarnings = hasFlag("--strict-warnings");
  const runId = argValue("--run-id") ?? nowRunId();
  const reportWeek = argValue("--report-week") ?? isoWeekLabel(new Date());
  const outDir = path.resolve(argValue("--out-dir") ?? path.join("artifacts", "governance", "weekly", `${reportWeek}_${runId}`));

  const hasExecutionDecisions = await hasTable("memory_execution_decisions");
  const hasFeedbackSource = await hasColumn("memory_rule_feedback", "source");
  const hasFeedbackDecisionId = await hasColumn("memory_rule_feedback", "decision_id");
  const hasRecallAudit = await hasTable("memory_recall_audit");
  const hasRecallConsumerAgent = hasRecallAudit && (await hasColumn("memory_recall_audit", "consumer_agent_id"));
  const hasRecallConsumerTeam = hasRecallAudit && (await hasColumn("memory_recall_audit", "consumer_team_id"));
  const hasLaneColumns =
    (await hasColumn("memory_nodes", "memory_lane")) &&
    (await hasColumn("memory_nodes", "owner_agent_id")) &&
    (await hasColumn("memory_nodes", "owner_team_id"));

  const tenantExpr = toTenantExpr(defaultTenantId);

  const out = await withTx(db, async (client) => {
    const scopeFeedbackRes = await client.query<{
      total: string;
      positive: string;
      negative: string;
      neutral: string;
      with_run_id: string;
    }>(
      `
      SELECT
        count(*)::text AS total,
        count(*) FILTER (WHERE outcome = 'positive')::text AS positive,
        count(*) FILTER (WHERE outcome = 'negative')::text AS negative,
        count(*) FILTER (WHERE outcome = 'neutral')::text AS neutral,
        count(*) FILTER (WHERE nullif(trim(COALESCE(run_id, '')), '') IS NOT NULL)::text AS with_run_id
      FROM memory_rule_feedback
      WHERE scope = $1
        AND created_at >= now() - (($2::text || ' hours')::interval)
      `,
      [scope, windowHours],
    );

    const scopeRuleRes = await client.query<{
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
        count(*) FILTER (WHERE d.state = 'active' AND rf.rule_node_id IS NOT NULL)::text AS active_with_recent_feedback
      FROM memory_rule_defs d
      LEFT JOIN recent_rule_feedback rf ON rf.rule_node_id = d.rule_node_id
      WHERE d.scope = $1
      `,
      [scope, windowHours],
    );

    const scopeDecisionRes =
      hasExecutionDecisions && hasFeedbackSource && hasFeedbackDecisionId
        ? await client.query<{
            tools_feedback_total: string;
            linked_decision_id: string;
          }>(
            `
            SELECT
              count(*) FILTER (WHERE source = 'tools_feedback')::text AS tools_feedback_total,
              count(*) FILTER (WHERE source = 'tools_feedback' AND decision_id IS NOT NULL)::text AS linked_decision_id
            FROM memory_rule_feedback
            WHERE scope = $1
              AND created_at >= now() - (($2::text || ' hours')::interval)
            `,
            [scope, windowHours],
          )
        : null;

    const scopeRecallRes =
      hasRecallAudit && hasRecallConsumerAgent && hasRecallConsumerTeam
        ? await client.query<{ total: string; with_identity: string }>(
            `
            SELECT
              count(*)::text AS total,
              count(*) FILTER (
                WHERE nullif(trim(COALESCE(consumer_agent_id, '')), '') IS NOT NULL
                   OR nullif(trim(COALESCE(consumer_team_id, '')), '') IS NOT NULL
              )::text AS with_identity
            FROM memory_recall_audit
            WHERE scope = $1
              AND created_at >= now() - (($2::text || ' hours')::interval)
            `,
            [scope, windowHours],
          )
        : null;

    const scopeLaneRes =
      hasLaneColumns
        ? await client.query<{ private_total: string; private_with_owner: string; shared_total: string }>(
            `
            SELECT
              count(*) FILTER (WHERE memory_lane = 'private')::text AS private_total,
              count(*) FILTER (
                WHERE memory_lane = 'private'
                  AND (
                    nullif(trim(COALESCE(owner_agent_id, '')), '') IS NOT NULL
                    OR nullif(trim(COALESCE(owner_team_id, '')), '') IS NOT NULL
                  )
              )::text AS private_with_owner,
              count(*) FILTER (WHERE memory_lane = 'shared')::text AS shared_total
            FROM memory_nodes
            WHERE scope = $1
            `,
            [scope],
          )
        : null;

    const tenantRuleRes = await client.query<{
      tenant_id: string;
      active_rules: string;
      shadow_rules: string;
      draft_rules: string;
      disabled_rules: string;
    }>(
      `
      SELECT
        ${tenantExpr} AS tenant_id,
        count(*) FILTER (WHERE state = 'active')::text AS active_rules,
        count(*) FILTER (WHERE state = 'shadow')::text AS shadow_rules,
        count(*) FILTER (WHERE state = 'draft')::text AS draft_rules,
        count(*) FILTER (WHERE state = 'disabled')::text AS disabled_rules
      FROM memory_rule_defs
      GROUP BY 1
      ORDER BY 1
      `,
    );

    const tenantFeedbackRes = await client.query<{
      tenant_id: string;
      feedback_total: string;
      feedback_positive: string;
      feedback_negative: string;
      with_run_id: string;
      tools_feedback_total: string;
      linked_decision_id: string;
    }>(
      `
      SELECT
        ${tenantExpr} AS tenant_id,
        count(*)::text AS feedback_total,
        count(*) FILTER (WHERE outcome = 'positive')::text AS feedback_positive,
        count(*) FILTER (WHERE outcome = 'negative')::text AS feedback_negative,
        count(*) FILTER (WHERE nullif(trim(COALESCE(run_id, '')), '') IS NOT NULL)::text AS with_run_id,
        count(*) FILTER (
          WHERE ${hasFeedbackSource ? "source = 'tools_feedback'" : "false"}
        )::text AS tools_feedback_total,
        count(*) FILTER (
          WHERE ${hasFeedbackSource && hasFeedbackDecisionId ? "source = 'tools_feedback' AND decision_id IS NOT NULL" : "false"}
        )::text AS linked_decision_id
      FROM memory_rule_feedback
      WHERE created_at >= now() - (($1::text || ' hours')::interval)
      GROUP BY 1
      ORDER BY 1
      `,
      [windowHours],
    );

    const tenantRecallRes =
      hasRecallAudit && hasRecallConsumerAgent && hasRecallConsumerTeam
        ? await client.query<{
            tenant_id: string;
            recall_total: string;
            recall_with_identity: string;
          }>(
            `
            SELECT
              ${tenantExpr} AS tenant_id,
              count(*)::text AS recall_total,
              count(*) FILTER (
                WHERE nullif(trim(COALESCE(consumer_agent_id, '')), '') IS NOT NULL
                   OR nullif(trim(COALESCE(consumer_team_id, '')), '') IS NOT NULL
              )::text AS recall_with_identity
            FROM memory_recall_audit
            WHERE created_at >= now() - (($1::text || ' hours')::interval)
            GROUP BY 1
            ORDER BY 1
            `,
            [windowHours],
          )
        : { rows: [] as Array<{ tenant_id: string; recall_total: string; recall_with_identity: string }> };

    const tenantLaneRes =
      hasLaneColumns
        ? await client.query<{
            tenant_id: string;
            private_total: string;
            private_with_owner: string;
          }>(
            `
            SELECT
              ${tenantExpr} AS tenant_id,
              count(*) FILTER (WHERE memory_lane = 'private')::text AS private_total,
              count(*) FILTER (
                WHERE memory_lane = 'private'
                  AND (
                    nullif(trim(COALESCE(owner_agent_id, '')), '') IS NOT NULL
                    OR nullif(trim(COALESCE(owner_team_id, '')), '') IS NOT NULL
                  )
              )::text AS private_with_owner
            FROM memory_nodes
            GROUP BY 1
            ORDER BY 1
            `,
          )
        : { rows: [] as Array<{ tenant_id: string; private_total: string; private_with_owner: string }> };

    return {
      scopeFeedback: scopeFeedbackRes.rows[0] ?? { total: "0", positive: "0", negative: "0", neutral: "0", with_run_id: "0" },
      scopeRules: scopeRuleRes.rows[0] ?? {
        active_total: "0",
        shadow_total: "0",
        draft_total: "0",
        disabled_total: "0",
        active_with_recent_feedback: "0",
      },
      scopeDecision: scopeDecisionRes?.rows[0] ?? { tools_feedback_total: "0", linked_decision_id: "0" },
      scopeRecall: scopeRecallRes?.rows[0] ?? { total: "0", with_identity: "0" },
      scopeLane: scopeLaneRes?.rows[0] ?? { private_total: "0", private_with_owner: "0", shared_total: "0" },
      tenantRules: tenantRuleRes.rows,
      tenantFeedback: tenantFeedbackRes.rows,
      tenantRecall: tenantRecallRes.rows,
      tenantLane: tenantLaneRes.rows,
      support: {
        hasExecutionDecisions,
        hasFeedbackSource,
        hasFeedbackDecisionId,
        hasRecallAudit,
        hasRecallConsumerAgent,
        hasRecallConsumerTeam,
        hasLaneColumns,
      },
    };
  });

  const scopeFeedbackTotal = Number(out.scopeFeedback.total ?? "0");
  const scopeWithRunId = Number(out.scopeFeedback.with_run_id ?? "0");
  const scopeDecisionTotal = Number(out.scopeDecision.tools_feedback_total ?? "0");
  const scopeDecisionLinked = Number(out.scopeDecision.linked_decision_id ?? "0");
  const scopeRecallTotal = Number(out.scopeRecall.total ?? "0");
  const scopeRecallWithIdentity = Number(out.scopeRecall.with_identity ?? "0");
  const scopePrivateTotal = Number(out.scopeLane.private_total ?? "0");
  const scopePrivateWithOwner = Number(out.scopeLane.private_with_owner ?? "0");

  const scopeSnapshot = {
    feedback: {
      total: scopeFeedbackTotal,
      positive: Number(out.scopeFeedback.positive ?? "0"),
      negative: Number(out.scopeFeedback.negative ?? "0"),
      neutral: Number(out.scopeFeedback.neutral ?? "0"),
      run_id_coverage: scopeFeedbackTotal > 0 ? scopeWithRunId / scopeFeedbackTotal : 1,
    },
    rules: {
      active_total: Number(out.scopeRules.active_total ?? "0"),
      shadow_total: Number(out.scopeRules.shadow_total ?? "0"),
      draft_total: Number(out.scopeRules.draft_total ?? "0"),
      disabled_total: Number(out.scopeRules.disabled_total ?? "0"),
      active_with_recent_feedback: Number(out.scopeRules.active_with_recent_feedback ?? "0"),
    },
    decision: {
      tools_feedback_total: scopeDecisionTotal,
      linked_decision_id: scopeDecisionLinked,
      link_coverage: scopeDecisionTotal > 0 ? scopeDecisionLinked / scopeDecisionTotal : 1,
      available: out.support.hasExecutionDecisions && out.support.hasFeedbackSource && out.support.hasFeedbackDecisionId,
    },
    recall: {
      total: scopeRecallTotal,
      with_identity: scopeRecallWithIdentity,
      identity_coverage: scopeRecallTotal > 0 ? scopeRecallWithIdentity / scopeRecallTotal : 1,
      available: out.support.hasRecallAudit && out.support.hasRecallConsumerAgent && out.support.hasRecallConsumerTeam,
    },
    lane: {
      private_total: scopePrivateTotal,
      private_with_owner: scopePrivateWithOwner,
      private_owner_coverage: scopePrivateTotal > 0 ? scopePrivateWithOwner / scopePrivateTotal : 1,
      shared_total: Number(out.scopeLane.shared_total ?? "0"),
      available: out.support.hasLaneColumns,
    },
  };

  const byTenant = new Map<string, TenantRollup>();
  const ensureTenant = (tenantId: string): TenantRollup => {
    const key = tenantId || defaultTenantId;
    const got = byTenant.get(key);
    if (got) return got;
    const row: TenantRollup = {
      tenant_id: key,
      active_rules: 0,
      shadow_rules: 0,
      draft_rules: 0,
      disabled_rules: 0,
      feedback_total: 0,
      feedback_positive: 0,
      feedback_negative: 0,
      feedback_negative_ratio: 0,
      feedback_run_id_coverage: 1,
      decision_link_coverage: null,
      recall_total: 0,
      recall_identity_coverage: null,
      private_total: 0,
      private_owner_coverage: null,
    };
    byTenant.set(key, row);
    return row;
  };

  for (const r of out.tenantRules) {
    const t = ensureTenant(r.tenant_id);
    t.active_rules = Number(r.active_rules ?? "0");
    t.shadow_rules = Number(r.shadow_rules ?? "0");
    t.draft_rules = Number(r.draft_rules ?? "0");
    t.disabled_rules = Number(r.disabled_rules ?? "0");
  }

  for (const r of out.tenantFeedback) {
    const t = ensureTenant(r.tenant_id);
    t.feedback_total = Number(r.feedback_total ?? "0");
    t.feedback_positive = Number(r.feedback_positive ?? "0");
    t.feedback_negative = Number(r.feedback_negative ?? "0");
    t.feedback_negative_ratio = t.feedback_total > 0 ? t.feedback_negative / t.feedback_total : 0;
    const withRunId = Number(r.with_run_id ?? "0");
    t.feedback_run_id_coverage = t.feedback_total > 0 ? withRunId / t.feedback_total : 1;
    if (out.support.hasExecutionDecisions && out.support.hasFeedbackSource && out.support.hasFeedbackDecisionId) {
      const toolsTotal = Number(r.tools_feedback_total ?? "0");
      const linked = Number(r.linked_decision_id ?? "0");
      t.decision_link_coverage = toolsTotal > 0 ? linked / toolsTotal : 1;
    }
  }

  for (const r of out.tenantRecall) {
    const t = ensureTenant(r.tenant_id);
    t.recall_total = Number(r.recall_total ?? "0");
    const withIdentity = Number(r.recall_with_identity ?? "0");
    t.recall_identity_coverage = t.recall_total > 0 ? withIdentity / t.recall_total : 1;
  }

  for (const r of out.tenantLane) {
    const t = ensureTenant(r.tenant_id);
    t.private_total = Number(r.private_total ?? "0");
    const withOwner = Number(r.private_with_owner ?? "0");
    t.private_owner_coverage = t.private_total > 0 ? withOwner / t.private_total : 1;
  }

  const tenantRows = Array.from(byTenant.values()).sort((a, b) => b.active_rules - a.active_rules || a.tenant_id.localeCompare(b.tenant_id));
  const tenantCount = tenantRows.length;

  const activeRuleCounts = tenantRows.map((t) => t.active_rules);
  const activeRuleCountDrift =
    activeRuleCounts.length > 0 ? Math.max(...activeRuleCounts) - Math.min(...activeRuleCounts) : 0;

  const eligibleNegativeRatioRows = tenantRows.filter((t) => t.feedback_total >= tenantDriftMinFeedback);
  const negativeRatios = eligibleNegativeRatioRows.map((t) => t.feedback_negative_ratio);
  const negativeRatioDrift = negativeRatios.length > 0 ? Math.max(...negativeRatios) - Math.min(...negativeRatios) : 0;

  const checks: CheckResult[] = [
    {
      name: "scope_private_owner_coverage_min",
      severity: "error",
      pass: scopeSnapshot.lane.private_owner_coverage >= minPrivateOwnerCoverage,
      value: round(scopeSnapshot.lane.private_owner_coverage),
      threshold: { op: ">=", value: minPrivateOwnerCoverage },
      note: "Private nodes in scope should carry owner fields for lane governance.",
    },
    {
      name: "scope_decision_link_coverage_min",
      severity: "warning",
      pass: scopeSnapshot.decision.link_coverage >= minDecisionLinkCoverage,
      value: round(scopeSnapshot.decision.link_coverage),
      threshold: { op: ">=", value: minDecisionLinkCoverage },
      note: "tools_feedback decision linkage should remain high for replayability.",
    },
    {
      name: "scope_recall_identity_coverage_min",
      severity: "warning",
      pass: scopeSnapshot.recall.identity_coverage >= minRecallIdentityCoverage,
      value: round(scopeSnapshot.recall.identity_coverage),
      threshold: { op: ">=", value: minRecallIdentityCoverage },
      note: "Recall audit should include consumer identity in most requests.",
    },
    {
      name: "tenant_active_rule_count_drift_max",
      severity: "warning",
      pass: eligibleNegativeRatioRows.length < 2 || activeRuleCountDrift <= maxTenantActiveRuleCountDrift,
      value: activeRuleCountDrift,
      threshold: { op: "<=", value: maxTenantActiveRuleCountDrift },
      note: "Large active-rule spread across tenants indicates governance drift risk.",
    },
    {
      name: "tenant_negative_ratio_drift_max",
      severity: "warning",
      pass: eligibleNegativeRatioRows.length < 2 || negativeRatioDrift <= maxTenantNegativeRatioDrift,
      value: round(negativeRatioDrift),
      threshold: { op: "<=", value: maxTenantNegativeRatioDrift },
      note: "Cross-tenant negative outcome drift should stay bounded for policy consistency.",
    },
  ];

  if (!scopeSnapshot.decision.available) {
    checks.push({
      name: "decision_schema_available",
      severity: "warning",
      pass: false,
      value: 0,
      threshold: { op: ">=", value: 1 },
      note: "Execution provenance schema unavailable; apply migration 0021_execution_decision_provenance.sql.",
    });
  }

  if (!scopeSnapshot.recall.available) {
    checks.push({
      name: "recall_audit_schema_available",
      severity: "warning",
      pass: false,
      value: 0,
      threshold: { op: ">=", value: 1 },
      note: "Recall audit schema unavailable; apply migration 0013_multi_agent_fabric.sql.",
    });
  }

  if (!scopeSnapshot.lane.available) {
    checks.push({
      name: "lane_schema_available",
      severity: "error",
      pass: false,
      value: 0,
      threshold: { op: ">=", value: 1 },
      note: "Lane ownership schema unavailable; apply migration 0013_multi_agent_fabric.sql.",
    });
  }

  const failedErrors = checks.filter((c) => !c.pass && c.severity === "error").map((c) => c.name);
  const failedWarnings = checks.filter((c) => !c.pass && c.severity === "warning").map((c) => c.name);
  const pass = failedErrors.length === 0 && failedWarnings.length === 0;

  const recommendations: string[] = [];
  if (failedErrors.length === 0 && failedWarnings.length === 0) {
    recommendations.push("Current governance posture is stable; continue weekly snapshots.");
  }
  if (failedErrors.includes("scope_private_owner_coverage_min") || failedErrors.includes("lane_schema_available")) {
    recommendations.push("Run private owner backfill and block rollout until private owner coverage returns to 100%.");
  }
  if (failedWarnings.includes("scope_decision_link_coverage_min")) {
    recommendations.push("Ensure planners pass decision_id from /tools/select to /tools/feedback.");
  }
  if (failedWarnings.includes("scope_recall_identity_coverage_min")) {
    recommendations.push("Inject consumer_agent_id/consumer_team_id on recall paths through gateway identity propagation.");
  }
  if (failedWarnings.includes("tenant_active_rule_count_drift_max") || failedWarnings.includes("tenant_negative_ratio_drift_max")) {
    recommendations.push("Investigate tenant-level policy mismatch and run policy adaptation gate per tenant scope.");
  }

  const generatedAt = new Date().toISOString();
  const summary = {
    ok: true,
    kind: "governance_weekly_report",
    report_week: reportWeek,
    run_id: runId,
    generated_at: generatedAt,
    out_dir: outDir,
    window_hours: windowHours,
    scope,
    thresholds: {
      min_decision_link_coverage: minDecisionLinkCoverage,
      min_recall_identity_coverage: minRecallIdentityCoverage,
      min_private_owner_coverage: minPrivateOwnerCoverage,
      max_tenant_active_rule_count_drift: maxTenantActiveRuleCountDrift,
      max_tenant_negative_ratio_drift: maxTenantNegativeRatioDrift,
      tenant_drift_min_feedback: tenantDriftMinFeedback,
    },
    scope_snapshot: {
      feedback: {
        ...scopeSnapshot.feedback,
        run_id_coverage: round(scopeSnapshot.feedback.run_id_coverage),
      },
      rules: scopeSnapshot.rules,
      decision: {
        ...scopeSnapshot.decision,
        link_coverage: round(scopeSnapshot.decision.link_coverage),
      },
      recall: {
        ...scopeSnapshot.recall,
        identity_coverage: round(scopeSnapshot.recall.identity_coverage),
      },
      lane: {
        ...scopeSnapshot.lane,
        private_owner_coverage: round(scopeSnapshot.lane.private_owner_coverage),
      },
    },
    cross_tenant: {
      tenant_count: tenantCount,
      tenants_with_feedback_floor: eligibleNegativeRatioRows.length,
      active_rule_count_drift: activeRuleCountDrift,
      negative_ratio_drift: round(negativeRatioDrift),
      top_tenants: tenantRows.slice(0, 20).map((t) => ({
        ...t,
        feedback_negative_ratio: round(t.feedback_negative_ratio),
        feedback_run_id_coverage: round(t.feedback_run_id_coverage),
        decision_link_coverage: t.decision_link_coverage === null ? null : round(t.decision_link_coverage),
        recall_identity_coverage: t.recall_identity_coverage === null ? null : round(t.recall_identity_coverage),
        private_owner_coverage: t.private_owner_coverage === null ? null : round(t.private_owner_coverage),
      })),
    },
    checks,
    summary: {
      pass,
      failed_errors: failedErrors,
      failed_warnings: failedWarnings,
    },
    recommendations,
  };

  const markdown = buildMarkdown({
    reportWeek,
    generatedAt,
    scope,
    windowHours,
    checks,
    scopeSnapshot,
    drift: {
      tenant_count: tenantCount,
      tenants_with_feedback_floor: eligibleNegativeRatioRows.length,
      active_rule_count_drift: activeRuleCountDrift,
      negative_ratio_drift: negativeRatioDrift,
    },
    topTenants: tenantRows.slice(0, 20),
    recommendations,
  });

  mkdirSync(outDir, { recursive: true });
  const summaryPath = path.join(outDir, "summary.json");
  const mdPath = path.join(outDir, "WEEKLY_STATUS.md");
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdown, "utf8");

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ...summary, summary_json: summaryPath, weekly_md: mdPath }, null, 2));

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
