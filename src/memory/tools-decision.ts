import type pg from "pg";
import { HttpError } from "../util/http.js";
import { ToolsDecisionRequest } from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
import { buildToolsDecisionLifecycleSummary } from "./tools-lifecycle-summary.js";
import { buildAionisUri, parseAionisUri } from "./uri.js";
import type { LiteWriteStore } from "../store/lite-write-store.js";

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
  client: pg.PoolClient | null,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: { liteWriteStore?: Pick<LiteWriteStore, "getExecutionDecision"> | null } = {},
) {
  const parsed = ToolsDecisionRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  let decisionId = parsed.decision_id ?? null;
  const runId = parsed.run_id ?? null;
  if (parsed.decision_uri) {
    const uriParts = parseAionisUri(parsed.decision_uri);
    if (uriParts.type !== "decision") {
      throw new HttpError(400, "invalid_decision_uri_type", "decision_uri must use type=decision", {
        decision_uri: parsed.decision_uri,
        type: uriParts.type,
      });
    }
    if (uriParts.tenant_id !== tenancy.tenant_id || uriParts.scope !== tenancy.scope) {
      throw new HttpError(400, "decision_uri_scope_mismatch", "decision_uri tenant/scope does not match request scope", {
        decision_uri: parsed.decision_uri,
        uri_tenant_id: uriParts.tenant_id,
        uri_scope: uriParts.scope,
        request_tenant_id: tenancy.tenant_id,
        request_scope: tenancy.scope,
      });
    }
    if (decisionId && decisionId !== uriParts.id) {
      throw new HttpError(400, "decision_uri_id_mismatch", "decision_uri id conflicts with decision_id", {
        decision_id: decisionId,
        decision_uri: parsed.decision_uri,
      });
    }
    decisionId = uriParts.id;
  }
  if (!decisionId && !runId) {
    throw new HttpError(400, "invalid_request", "decision_id, decision_uri, or run_id is required");
  }

  const row = opts.liteWriteStore
    ? await opts.liteWriteStore.getExecutionDecision({
        scope,
        ...(decisionId ? { id: decisionId } : { runId }),
      })
    : decisionId
      ? await client!.query<DecisionRow>(
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
          [scope, decisionId],
        ).then((res) => res.rows[0] ?? null)
      : await client!.query<DecisionRow>(
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
            AND run_id = $2
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [scope, runId],
        ).then((res) => res.rows[0] ?? null);
  if (!row) {
    if (decisionId) {
      throw new HttpError(404, "decision_not_found_in_scope", "decision_id was not found in this scope", {
        decision_id: decisionId,
        scope: tenancy.scope,
        tenant_id: tenancy.tenant_id,
      });
    }
    throw new HttpError(404, "decision_not_found_for_run", "run_id has no decision in this scope", {
      run_id: runId,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  if (decisionId && runId && row.run_id && row.run_id !== runId) {
    throw new HttpError(400, "decision_run_id_mismatch", "decision_id run_id does not match request run_id", {
      decision_id: decisionId,
      decision_run_id: row.run_id,
      request_run_id: runId,
    });
  }

  const lookupMode: "decision_id" | "run_id_latest" = decisionId ? "decision_id" : "run_id_latest";
  const response = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    lookup_mode: lookupMode,
    decision: {
      decision_id: row.id,
      decision_uri: buildAionisUri({
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
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
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              type: "commit",
              id: row.commit_id,
            })
          : null,
    },
  };
  return {
    ...response,
    lifecycle_summary: buildToolsDecisionLifecycleSummary({
      lookup_mode: response.lookup_mode,
      decision: response.decision,
    }),
  };
}
