import type pg from "pg";
import { HttpError } from "../util/http.js";
import { ToolsRunRequest } from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
import { buildAionisUri } from "./uri.js";

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
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
) {
  const parsed = ToolsRunRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;

  const countRes = await client.query<{ count: string; latest_decision_at: string | null }>(
    `
    SELECT
      count(*)::text AS count,
      max(created_at)::text AS latest_decision_at
    FROM memory_execution_decisions
    WHERE scope = $1
      AND run_id = $2
    `,
    [scope, parsed.run_id],
  );
  const decisionCount = Number(countRes.rows[0]?.count ?? "0");
  if (decisionCount <= 0) {
    throw new HttpError(404, "run_not_found_in_scope", "run_id was not found in this scope", {
      run_id: parsed.run_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  const decisionsRes = await client.query<DecisionRow>(
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
  );

  let feedbackSummary: FeedbackSummaryRow | null = null;
  let feedbackRows: FeedbackRow[] = [];
  if (parsed.include_feedback) {
    const summaryRes = await client.query<FeedbackSummaryRow>(
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

    const feedbackRes = await client.query<FeedbackRow>(
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

  const latestDecisionAt = countRes.rows[0]?.latest_decision_at ?? null;
  const latestFeedbackAt = feedbackSummary?.latest_feedback_at ?? null;
  const feedbackTotal = Number(feedbackSummary?.total ?? "0");
  const lifecycleStatus = feedbackTotal > 0 ? "feedback_linked" : "decision_recorded";

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run_id: parsed.run_id,
    lifecycle: {
      status: lifecycleStatus,
      decision_count: decisionCount,
      latest_decision_at: latestDecisionAt,
      latest_feedback_at: latestFeedbackAt,
    },
    decisions: decisionsRes.rows.map((row) => toDecisionPayload(row, tenancy.tenant_id, tenancy.scope)),
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
}
