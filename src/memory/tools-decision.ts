import type pg from "pg";
import { HttpError } from "../util/http.js";
import { ToolsDecisionRequest } from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";

type DecisionRow = {
  id: string;
  scope: string;
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

export async function getToolsDecisionById(
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
) {
  const parsed = ToolsDecisionRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;

  const res = await client.query<DecisionRow>(
    `
    SELECT
      id::text,
      scope,
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
      AND id = $2
    LIMIT 1
    `,
    [scope, parsed.decision_id],
  );
  const row = res.rows[0] ?? null;
  if (!row) {
    throw new HttpError(404, "decision_not_found_in_scope", "decision_id was not found in this scope", {
      decision_id: parsed.decision_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    decision: {
      decision_id: row.id,
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
    },
  };
}
