import type pg from "pg";
import { HttpError } from "../util/http.js";
import { ToolsRunRequest, ToolsRunsListRequest } from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
import { buildToolsRunLifecycleSummary } from "./tools-lifecycle-summary.js";
import { buildAionisUri } from "./uri.js";
import type { LiteWriteStore } from "../store/lite-write-store.js";

type DecisionRow = {
  id: string;
  decision_kind: "tools_select";
  run_id: string | null;
  selected_tool: string | null;
  candidates_json: any;
  context_sha256: string;
  policy_sha256: string;
  source_rule_ids: string[] | null;
  metadata_json: any;
  created_at: string;
  commit_id: string | null;
};

type FeedbackSummaryRow = {
  total: string;
  positive: string;
  negative: string;
  neutral: string;
  linked_decision_count: string;
  tools_feedback_count: string;
  latest_feedback_at: string | null;
};

type FeedbackRow = {
  id: string;
  rule_node_id: string;
  outcome: "positive" | "negative" | "neutral";
  note: string | null;
  source: "rule_feedback" | "tools_feedback";
  decision_id: string | null;
  commit_id: string | null;
  created_at: string;
};

function toDecisionPayload(row: DecisionRow, tenantId: string, scope: string) {
  return {
    decision_id: row.id,
    decision_uri: buildAionisUri({
      tenant_id: tenantId,
      scope,
      type: "decision",
      id: row.id,
    }),
    decision_kind: row.decision_kind,
    run_id: row.run_id,
    selected_tool: row.selected_tool,
    candidates: Array.isArray(row.candidates_json) ? row.candidates_json : [],
    context_sha256: row.context_sha256,
    policy_sha256: row.policy_sha256,
    source_rule_ids: Array.isArray(row.source_rule_ids) ? row.source_rule_ids : [],
    metadata: row.metadata_json ?? {},
    created_at: row.created_at,
    commit_id: row.commit_id,
    commit_uri:
      row.commit_id != null
        ? buildAionisUri({
            tenant_id: tenantId,
            scope,
            type: "commit",
            id: row.commit_id,
          })
        : null,
  };
}

export async function getToolsRunLifecycle(
  client: pg.PoolClient | null,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: {
    liteWriteStore?: Pick<LiteWriteStore, "listExecutionDecisionsByRun" | "listRuleFeedbackByRun"> | null;
  } = {},
) {
  const parsed = ToolsRunRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;

  const liteRun = opts.liteWriteStore
    ? await opts.liteWriteStore.listExecutionDecisionsByRun({
        scope,
        runId: parsed.run_id,
        limit: parsed.decision_limit,
      })
    : null;
  const countRes = liteRun
    ? {
        count: liteRun.count,
        latest_decision_at: liteRun.latest_created_at,
      }
    : await client!.query<{ count: string; latest_decision_at: string | null }>(
        `
        SELECT
          count(*)::text AS count,
          max(created_at)::text AS latest_decision_at
        FROM memory_execution_decisions
        WHERE scope = $1
          AND run_id = $2
        `,
        [scope, parsed.run_id],
      ).then((res) => ({
        count: Number(res.rows[0]?.count ?? "0"),
        latest_decision_at: res.rows[0]?.latest_decision_at ?? null,
      }));
  const decisionCount = Number(countRes.count ?? 0);
  if (decisionCount <= 0) {
    throw new HttpError(404, "run_not_found_in_scope", "run_id was not found in this scope", {
      run_id: parsed.run_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  const decisionsRows = liteRun
    ? liteRun.rows
    : await client!.query<DecisionRow>(
        `
        SELECT
          id::text,
          decision_kind::text AS decision_kind,
          run_id,
          selected_tool,
          candidates_json,
          context_sha256,
          policy_sha256,
          source_rule_ids::text[] AS source_rule_ids,
          metadata_json,
          created_at::text AS created_at,
          commit_id::text AS commit_id
        FROM memory_execution_decisions
        WHERE scope = $1
          AND run_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [scope, parsed.run_id, parsed.decision_limit],
      ).then((res) => res.rows);

  let feedbackSummary: FeedbackSummaryRow | null = null;
  let feedbackRows: FeedbackRow[] = [];
  if (parsed.include_feedback) {
    if (opts.liteWriteStore) {
      const liteFeedback = await opts.liteWriteStore.listRuleFeedbackByRun({
        scope,
        runId: parsed.run_id,
        limit: parsed.feedback_limit,
      });
      feedbackSummary = {
        total: String(liteFeedback.total),
        positive: String(liteFeedback.positive),
        negative: String(liteFeedback.negative),
        neutral: String(liteFeedback.neutral),
        linked_decision_count: String(liteFeedback.linked_decision_count),
        tools_feedback_count: String(liteFeedback.tools_feedback_count),
        latest_feedback_at: liteFeedback.latest_feedback_at,
      };
      feedbackRows = liteFeedback.rows as FeedbackRow[];
    } else {
      const summaryRes = await client!.query<FeedbackSummaryRow>(
        `
        SELECT
          count(*)::text AS total,
          count(*) FILTER (WHERE outcome = 'positive')::text AS positive,
          count(*) FILTER (WHERE outcome = 'negative')::text AS negative,
          count(*) FILTER (WHERE outcome = 'neutral')::text AS neutral,
          count(*) FILTER (WHERE decision_id IS NOT NULL)::text AS linked_decision_count,
          count(*) FILTER (WHERE source = 'tools_feedback')::text AS tools_feedback_count,
          max(created_at)::text AS latest_feedback_at
        FROM memory_rule_feedback
        WHERE scope = $1
          AND run_id = $2
        `,
        [scope, parsed.run_id],
      );
      feedbackSummary = summaryRes.rows[0] ?? null;

      const feedbackRes = await client!.query<FeedbackRow>(
        `
        SELECT
          id::text,
          rule_node_id::text,
          outcome::text AS outcome,
          note,
          source::text AS source,
          decision_id::text AS decision_id,
          commit_id::text AS commit_id,
          created_at::text AS created_at
        FROM memory_rule_feedback
        WHERE scope = $1
          AND run_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [scope, parsed.run_id, parsed.feedback_limit],
      );
      feedbackRows = feedbackRes.rows;
    }
  }

  const latestDecisionAt = countRes.latest_decision_at ?? null;
  const latestFeedbackAt = feedbackSummary?.latest_feedback_at ?? null;
  const feedbackTotal = Number(feedbackSummary?.total ?? "0");
  const lifecycleStatus: "feedback_linked" | "decision_recorded" =
    feedbackTotal > 0 ? "feedback_linked" : "decision_recorded";

  const response = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run_id: parsed.run_id,
    lifecycle: {
      status: lifecycleStatus,
      decision_count: decisionCount,
      latest_decision_at: latestDecisionAt,
      latest_feedback_at: latestFeedbackAt,
    },
    decisions: decisionsRows.map((row) => toDecisionPayload(row, tenancy.tenant_id, tenancy.scope)),
    feedback: parsed.include_feedback
      ? {
          total: feedbackTotal,
          by_outcome: {
            positive: Number(feedbackSummary?.positive ?? "0"),
            negative: Number(feedbackSummary?.negative ?? "0"),
            neutral: Number(feedbackSummary?.neutral ?? "0"),
          },
          linked_decision_count: Number(feedbackSummary?.linked_decision_count ?? "0"),
          tools_feedback_count: Number(feedbackSummary?.tools_feedback_count ?? "0"),
          recent: feedbackRows,
        }
      : undefined,
  };
  return {
    ...response,
    lifecycle_summary: buildToolsRunLifecycleSummary({
      run_id: response.run_id,
      lifecycle: response.lifecycle,
      decisions: response.decisions,
      feedback: response.feedback,
    }),
  };
}

export async function listToolsRuns(
  client: pg.PoolClient | null,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: {
    liteWriteStore?: Pick<LiteWriteStore, "listExecutionRuns"> | null;
  } = {},
) {
  const parsed = ToolsRunsListRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;

  const rows = opts.liteWriteStore
    ? await opts.liteWriteStore.listExecutionRuns({
        scope,
        limit: parsed.limit,
      })
    : await client!.query<{
        run_id: string;
        decision_count: string;
        latest_decision_at: string;
        latest_selected_tool: string | null;
        feedback_total: string;
        latest_feedback_at: string | null;
      }>(
        `
        WITH decision_rollup AS (
          SELECT
            run_id,
            count(*)::text AS decision_count,
            max(created_at)::text AS latest_decision_at
          FROM memory_execution_decisions
          WHERE scope = $1
            AND run_id IS NOT NULL
          GROUP BY run_id
        )
        SELECT
          d.run_id,
          d.decision_count,
          d.latest_decision_at,
          (
            SELECT ed.selected_tool
            FROM memory_execution_decisions ed
            WHERE ed.scope = $1
              AND ed.run_id = d.run_id
            ORDER BY ed.created_at DESC, ed.id DESC
            LIMIT 1
          ) AS latest_selected_tool,
          COALESCE((
            SELECT count(*)::text
            FROM memory_rule_feedback rf
            WHERE rf.scope = $1
              AND rf.run_id = d.run_id
          ), '0') AS feedback_total,
          (
            SELECT max(rf.created_at)::text
            FROM memory_rule_feedback rf
            WHERE rf.scope = $1
              AND rf.run_id = d.run_id
          ) AS latest_feedback_at
        FROM decision_rollup d
        ORDER BY d.latest_decision_at DESC, d.run_id DESC
        LIMIT $2
        `,
        [scope, parsed.limit],
      ).then((res) =>
        res.rows.map((row) => ({
          run_id: row.run_id,
          decision_count: Number(row.decision_count ?? "0"),
          latest_decision_at: row.latest_decision_at,
          latest_selected_tool: row.latest_selected_tool ?? null,
          feedback_total: Number(row.feedback_total ?? "0"),
          latest_feedback_at: row.latest_feedback_at ?? null,
        })),
      );

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    items: rows.map((row) => ({
      run_id: row.run_id,
      status: row.feedback_total > 0 ? "feedback_linked" : "decision_recorded",
      decision_count: Number(row.decision_count ?? 0),
      feedback_total: Number(row.feedback_total ?? 0),
      latest_decision_at: row.latest_decision_at,
      latest_feedback_at: row.latest_feedback_at ?? null,
      latest_selected_tool: row.latest_selected_tool ?? null,
    })),
  };
}
