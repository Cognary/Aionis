import type { LiteExecutionDecisionRow, LiteFindNodeRow, LiteResolveCommitRow, LiteWriteStore } from "../store/lite-write-store.js";
import { HttpError } from "../util/http.js";
import {
  MemoryAnchorV1Schema,
  MemoryPayloadRehydrateToolRequest,
  type MemoryPayloadRehydrateToolInput,
} from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
import { buildAionisUri, parseAionisUri } from "./uri.js";

function requireCompatibleFilter(name: string, expected: string, actual?: string | null) {
  if (actual == null || String(actual).trim() === "") return;
  if (String(actual).trim() !== expected) {
    throw new HttpError(400, "rehydrate_anchor_filter_mismatch", `${name} does not match anchor reference`, {
      field: name,
      expected,
      actual,
    });
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const next = typeof value === "string" ? value.trim() : "";
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function consumerAgentIdForLite(parsed: MemoryPayloadRehydrateToolInput, defaultLocalActorId?: string | null): string | null {
  return parsed.actor?.trim() || defaultLocalActorId?.trim() || null;
}

type RehydratedNodeSummary = {
  id: string;
  uri: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  commit_id: string | null;
  commit_uri: string | null;
  tier?: string;
  salience?: number;
  importance?: number;
  confidence?: number;
  slots?: Record<string, unknown>;
  raw_ref?: string | null;
  evidence_ref?: string | null;
};

type RehydratedDecisionSummary = {
  decision_id: string;
  decision_uri: string;
  decision_kind: string;
  run_id: string | null;
  selected_tool: string | null;
  created_at: string;
  commit_id: string | null;
  commit_uri: string | null;
  source_rule_ids: string[];
  metadata?: Record<string, unknown>;
};

function summarizeNode(row: LiteFindNodeRow, tenancy: { tenant_id: string; scope: string }, full: boolean): RehydratedNodeSummary {
  return {
    id: row.id,
    uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.type, id: row.id }),
    type: row.type,
    title: row.title ?? null,
    text_summary: row.text_summary ?? null,
    commit_id: row.commit_id ?? null,
    commit_uri: row.commit_id
      ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.commit_id })
      : null,
    ...(full
      ? {
          tier: row.tier,
          salience: row.salience,
          importance: row.importance,
          confidence: row.confidence,
          slots: row.slots,
          raw_ref: row.raw_ref ?? null,
          evidence_ref: row.evidence_ref ?? null,
        }
      : {}),
  };
}

function summarizeDecision(
  row: LiteExecutionDecisionRow & { commit_scope?: string | null },
  tenancy: { tenant_id: string; scope: string },
  full: boolean,
): RehydratedDecisionSummary {
  return {
    decision_id: row.id,
    decision_uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "decision", id: row.id }),
    decision_kind: row.decision_kind,
    run_id: row.run_id ?? null,
    selected_tool: row.selected_tool ?? null,
    created_at: row.created_at,
    commit_id: row.commit_id ?? null,
    commit_uri: row.commit_id
      ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.commit_id })
      : null,
    source_rule_ids: Array.isArray(row.source_rule_ids) ? row.source_rule_ids : [],
    ...(full ? { metadata: row.metadata_json ?? {} } : {}),
  };
}

function summarizeCommit(row: LiteResolveCommitRow, tenancy: { tenant_id: string; scope: string }) {
  return {
    commit_id: row.id,
    commit_uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.id }),
    actor: row.actor,
    created_at: row.created_at,
    linked_object_counts: {
      nodes: row.node_count,
      edges: row.edge_count,
      decisions: row.decision_count,
    },
  };
}

export async function rehydrateAnchorPayloadLite(
  liteWriteStore: LiteWriteStore,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  defaultLocalActorId?: string | null,
) {
  const parsed = MemoryPayloadRehydrateToolRequest.parse(body);
  const consumerAgentId = consumerAgentIdForLite(parsed, defaultLocalActorId);
  const consumerTeamId = null;
  const uriParts = parsed.anchor_uri ? parseAionisUri(parsed.anchor_uri) : null;

  if (uriParts) {
    requireCompatibleFilter("tenant_id", uriParts.tenant_id, parsed.tenant_id ?? null);
    requireCompatibleFilter("scope", uriParts.scope, parsed.scope ?? null);
  }

  const tenancy = resolveTenantScope(
    {
      tenant_id: uriParts?.tenant_id ?? parsed.tenant_id,
      scope: uriParts?.scope ?? parsed.scope,
    },
    { defaultScope, defaultTenantId },
  );

  const anchorId = uriParts?.id ?? parsed.anchor_id!;
  const { rows } = await liteWriteStore.findNodes({
    scope: tenancy.scope_key,
    id: anchorId,
    consumerAgentId,
    consumerTeamId,
    limit: 1,
    offset: 0,
  });
  const anchorRow = rows[0] ?? null;
  if (!anchorRow) {
    throw new HttpError(404, "anchor_not_found_in_scope_or_visibility", "anchor was not found in this scope/visibility", {
      anchor_id: anchorId,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  const anchorPayload = MemoryAnchorV1Schema.safeParse(anchorRow.slots?.anchor_v1);
  if (!anchorPayload.success) {
    throw new HttpError(400, "anchor_payload_invalid", "node does not contain a valid anchor_v1 payload", {
      anchor_id: anchorId,
      type: anchorRow.type,
    });
  }

  const anchor = anchorPayload.data;
  const out = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    mode: parsed.mode,
    anchor: {
      id: anchorRow.id,
      uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: anchorRow.type, id: anchorRow.id }),
      type: anchorRow.type,
      title: anchorRow.title ?? null,
      text_summary: anchorRow.text_summary ?? null,
      tier: anchorRow.tier,
      anchor_v1: anchor,
    },
    rehydrated: {
      nodes: [] as RehydratedNodeSummary[],
      decisions: [] as RehydratedDecisionSummary[],
      commits: [] as Array<ReturnType<typeof summarizeCommit>>,
      summary: {
        linked_node_count: anchor.payload_refs.node_ids.length,
        linked_decision_count: anchor.payload_refs.decision_ids.length,
        linked_run_count: anchor.payload_refs.run_ids.length,
        linked_commit_count: anchor.payload_refs.commit_ids.length,
        resolved_nodes: 0,
        resolved_decisions: 0,
        resolved_commits: 0,
        missing_node_ids: [] as string[],
        missing_decision_ids: [] as string[],
        missing_commit_ids: [] as string[],
      },
    },
  };

  if (parsed.mode === "summary_only") {
    return out;
  }

  const full = parsed.mode === "full";
  for (const nodeId of uniqueStrings(anchor.payload_refs.node_ids)) {
    const { rows: resolvedRows } = await liteWriteStore.findNodes({
      scope: tenancy.scope_key,
      id: nodeId,
      consumerAgentId,
      consumerTeamId,
      limit: 1,
      offset: 0,
    });
    const row = resolvedRows[0] ?? null;
    if (!row) {
      out.rehydrated.summary.missing_node_ids.push(nodeId);
      continue;
    }
    out.rehydrated.nodes.push(summarizeNode(row, tenancy, full));
  }

  const decisionIds = new Set<string>(uniqueStrings(anchor.payload_refs.decision_ids));
  if (parsed.include_linked_decisions) {
    for (const runId of uniqueStrings(anchor.payload_refs.run_ids)) {
      const decisions = await liteWriteStore.listExecutionDecisionsByRun({
        scope: tenancy.scope_key,
        runId,
        limit: 20,
      });
      for (const row of decisions.rows) decisionIds.add(row.id);
    }
  }

  for (const decisionId of decisionIds) {
    const row = await liteWriteStore.resolveDecision({
      scope: tenancy.scope_key,
      id: decisionId,
      consumerAgentId,
      consumerTeamId,
    });
    if (!row) {
      out.rehydrated.summary.missing_decision_ids.push(decisionId);
      continue;
    }
    out.rehydrated.decisions.push(summarizeDecision(row, tenancy, full));
  }

  for (const commitId of uniqueStrings([
    ...anchor.payload_refs.commit_ids,
    ...out.rehydrated.nodes.map((row) => row.commit_id),
    ...out.rehydrated.decisions.map((row) => row.commit_id),
  ])) {
    const row = await liteWriteStore.resolveCommit({
      scope: tenancy.scope_key,
      id: commitId,
      consumerAgentId,
      consumerTeamId,
    });
    if (!row) {
      out.rehydrated.summary.missing_commit_ids.push(commitId);
      continue;
    }
    out.rehydrated.commits.push(summarizeCommit(row, tenancy));
  }

  out.rehydrated.summary.resolved_nodes = out.rehydrated.nodes.length;
  out.rehydrated.summary.resolved_decisions = out.rehydrated.decisions.length;
  out.rehydrated.summary.resolved_commits = out.rehydrated.commits.length;
  return out;
}
