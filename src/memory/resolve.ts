import type pg from "pg";
import type {
  LiteResolveCommitRow,
  LiteResolveDecisionRow,
  LiteResolveEdgeRow,
  LiteResolveNodeRow,
  LiteWriteStore,
} from "../store/lite-write-store.js";
import { HttpError, badRequest } from "../util/http.js";
import { MemoryResolveRequest } from "./schemas.js";
import { fromTenantScopeKey, resolveTenantScope } from "./tenant.js";
import { buildAionisUri, parseAionisUri } from "./uri.js";

type NodeRow = {
  id: string;
  type: string;
  client_id: string | null;
  title: string | null;
  text_summary: string | null;
  slots: any;
  tier: string;
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  embedding_status: string | null;
  embedding_model: string | null;
  raw_ref: string | null;
  evidence_ref: string | null;
  salience: number;
  importance: number;
  confidence: number;
  last_activated: string | null;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
  commit_scope: string | null;
  topic_state: string | null;
  member_count: number | null;
};

type EdgeRow = {
  id: string;
  type: string;
  src_id: string;
  src_type: string;
  dst_id: string;
  dst_type: string;
  weight: number;
  confidence: number;
  decay_rate: number;
  last_activated: string | null;
  created_at: string;
  commit_id: string | null;
  commit_scope: string | null;
};

type CommitRow = {
  id: string;
  parent_id: string | null;
  input_sha256: string;
  diff_json: unknown;
  actor: string;
  model_version: string | null;
  prompt_version: string | null;
  commit_hash: string;
  created_at: string;
  node_count: number;
  edge_count: number;
  decision_count: number;
};

type DecisionRow = {
  id: string;
  decision_kind: string;
  run_id: string | null;
  selected_tool: string | null;
  candidates_json: unknown;
  context_sha256: string;
  policy_sha256: string;
  source_rule_ids: string[];
  metadata_json: unknown;
  created_at: string;
  commit_id: string | null;
  commit_scope: string | null;
};

type ResolveSummary = {
  summary_version: "resolve_summary_v1";
  resolved_type: string;
  payload_kind: "node" | "edge" | "commit" | "decision";
  include_meta: boolean;
  slots_mode: "full" | "preview" | "none";
  related_uris: string[];
  related_uri_count: number;
  object_keys: string[];
};

function pickSlotsPreview(slots: unknown, maxKeys: number): Record<string, unknown> | null {
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return null;
  const obj = slots as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys.slice(0, maxKeys)) out[k] = obj[k];
  return out;
}

function requireCompatibleFilter(field: string, uriValue: string | undefined, requestValue: string | undefined) {
  if (!uriValue || !requestValue || uriValue === requestValue) return;
  badRequest("conflicting_filters", `${field} conflicts with URI`, {
    field,
    uri_value: uriValue,
    request_value: requestValue,
  });
}

function buildCommitUri(
  tenantId: string,
  scopeKey: string | null,
  commitId: string | null,
  defaultTenantId: string,
): string | null {
  if (!scopeKey || !commitId) return null;
  return buildAionisUri({
    tenant_id: tenantId,
    scope: fromTenantScopeKey(scopeKey, tenantId, defaultTenantId),
    type: "commit",
    id: commitId,
  });
}

function sortObjectKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

function buildResolveSummary(args: {
  resolvedType: string;
  payloadKind: "node" | "edge" | "commit" | "decision";
  includeMeta: boolean;
  includeSlots: boolean;
  includeSlotsPreview: boolean;
  relatedUris: Array<string | null | undefined>;
  payload: Record<string, unknown>;
}): ResolveSummary {
  const dedupedRelatedUris = Array.from(
    new Set(args.relatedUris.filter((value): value is string => typeof value === "string" && value.length > 0)),
  ).sort();
  return {
    summary_version: "resolve_summary_v1",
    resolved_type: args.resolvedType,
    payload_kind: args.payloadKind,
    include_meta: args.includeMeta,
    slots_mode: args.includeSlots ? "full" : args.includeSlotsPreview ? "preview" : "none",
    related_uris: dedupedRelatedUris,
    related_uri_count: dedupedRelatedUris.length,
    object_keys: sortObjectKeys(args.payload),
  };
}

export async function memoryResolve(client: pg.PoolClient, body: unknown, defaultScope: string, defaultTenantId: string) {
  const parsed = MemoryResolveRequest.parse(body);
  const uriParts = parseAionisUri(parsed.uri);
  const consumerAgentId = parsed.consumer_agent_id?.trim() || null;
  const consumerTeamId = parsed.consumer_team_id?.trim() || null;

  const requestTenant = parsed.tenant_id?.trim();
  const requestScope = parsed.scope?.trim();
  requireCompatibleFilter("tenant_id", uriParts.tenant_id, requestTenant);
  requireCompatibleFilter("scope", uriParts.scope, requestScope);

  const tenancy = resolveTenantScope(
    {
      tenant_id: uriParts.tenant_id,
      scope: uriParts.scope,
    },
    { defaultScope, defaultTenantId },
  );

  const base = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    uri: parsed.uri,
    type: uriParts.type,
  };

  if (uriParts.type === "edge") {
    const rr = await client.query<EdgeRow>(
      `
      SELECT
        e.id::text AS id,
        e.type::text AS type,
        e.src_id::text AS src_id,
        src.type::text AS src_type,
        e.dst_id::text AS dst_id,
        dst.type::text AS dst_type,
        e.weight,
        e.confidence,
        e.decay_rate,
        e.last_activated::text AS last_activated,
        e.created_at::text AS created_at,
        e.commit_id::text AS commit_id,
        c.scope::text AS commit_scope
      FROM memory_edges e
      JOIN memory_nodes src ON src.id = e.src_id AND src.scope = e.scope
      JOIN memory_nodes dst ON dst.id = e.dst_id AND dst.scope = e.scope
      LEFT JOIN memory_commits c ON c.id = e.commit_id
      WHERE e.scope = $1 AND e.id = $2::uuid
        AND (
          src.memory_lane = 'shared'::memory_lane
          OR (src.memory_lane = 'private'::memory_lane AND src.owner_agent_id = $3::text)
          OR ($4::text IS NOT NULL AND src.memory_lane = 'private'::memory_lane AND src.owner_team_id = $4::text)
        )
        AND (
          dst.memory_lane = 'shared'::memory_lane
          OR (dst.memory_lane = 'private'::memory_lane AND dst.owner_agent_id = $3::text)
          OR ($4::text IS NOT NULL AND dst.memory_lane = 'private'::memory_lane AND dst.owner_team_id = $4::text)
        )
      LIMIT 1
      `,
      [tenancy.scope_key, uriParts.id, consumerAgentId, consumerTeamId],
    );
    const row = rr.rows[0];
    if (!row) {
      throw new HttpError(404, "edge_not_found_in_scope", "edge URI was not found in this scope", {
        uri: parsed.uri,
      });
    }
    return {
      ...base,
      edge: {
        id: row.id,
        uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "edge", id: row.id }),
        type: row.type,
        src_id: row.src_id,
        src_uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.src_type, id: row.src_id }),
        dst_id: row.dst_id,
        dst_uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.dst_type, id: row.dst_id }),
        weight: row.weight,
        confidence: row.confidence,
        decay_rate: row.decay_rate,
        last_activated: row.last_activated,
        created_at: row.created_at,
        commit_id: row.commit_id,
        commit_uri: buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
      },
      resolve_summary: buildResolveSummary({
        resolvedType: uriParts.type,
        payloadKind: "edge",
        includeMeta: true,
        includeSlots: false,
        includeSlotsPreview: false,
        relatedUris: [
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "edge", id: row.id }),
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.src_type, id: row.src_id }),
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.dst_type, id: row.dst_id }),
          buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
        ],
        payload: {
          id: row.id,
          type: row.type,
          src_id: row.src_id,
          dst_id: row.dst_id,
          commit_id: row.commit_id,
        },
      }),
    };
  }

  if (uriParts.type === "commit") {
    const rr = await client.query<CommitRow>(
      `
      SELECT
        c.id::text AS id,
        c.parent_id::text AS parent_id,
        c.input_sha256,
        c.diff_json,
        c.actor,
        c.model_version,
        c.prompt_version,
        c.commit_hash,
        c.created_at::text AS created_at,
        (
          SELECT count(*)::int
          FROM memory_nodes n
          WHERE n.commit_id = c.id
        ) AS node_count,
        (
          SELECT count(*)::int
          FROM memory_edges e
          WHERE e.commit_id = c.id
        ) AS edge_count,
        (
          SELECT count(*)::int
          FROM memory_execution_decisions d
          WHERE d.commit_id = c.id
        ) AS decision_count
      FROM memory_commits c
      WHERE c.scope = $1 AND c.id = $2::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM memory_nodes n
          WHERE n.scope = c.scope
            AND n.commit_id = c.id
            AND NOT (
              n.memory_lane = 'shared'::memory_lane
              OR (n.memory_lane = 'private'::memory_lane AND n.owner_agent_id = $3::text)
              OR ($4::text IS NOT NULL AND n.memory_lane = 'private'::memory_lane AND n.owner_team_id = $4::text)
            )
        )
      LIMIT 1
      `,
      [tenancy.scope_key, uriParts.id, consumerAgentId, consumerTeamId],
    );
    const row = rr.rows[0];
    if (!row) {
      throw new HttpError(404, "commit_not_found_in_scope", "commit URI was not found in this scope", {
        uri: parsed.uri,
      });
    }
    return {
      ...base,
      commit: {
        id: row.id,
        uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.id }),
        parent_id: row.parent_id,
        parent_uri: row.parent_id
          ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.parent_id })
          : null,
        input_sha256: row.input_sha256,
        diff_json: row.diff_json,
        actor: row.actor,
        model_version: row.model_version,
        prompt_version: row.prompt_version,
        commit_hash: row.commit_hash,
        created_at: row.created_at,
        linked_object_counts: {
          nodes: Number(row.node_count ?? 0),
          edges: Number(row.edge_count ?? 0),
          decisions: Number(row.decision_count ?? 0),
          total: Number(row.node_count ?? 0) + Number(row.edge_count ?? 0) + Number(row.decision_count ?? 0),
        },
      },
      resolve_summary: buildResolveSummary({
        resolvedType: uriParts.type,
        payloadKind: "commit",
        includeMeta: true,
        includeSlots: false,
        includeSlotsPreview: false,
        relatedUris: [
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.id }),
          row.parent_id
            ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.parent_id })
            : null,
        ],
        payload: {
          id: row.id,
          parent_id: row.parent_id,
          actor: row.actor,
          node_count: Number(row.node_count ?? 0),
          edge_count: Number(row.edge_count ?? 0),
          decision_count: Number(row.decision_count ?? 0),
        },
      }),
    };
  }

  if (uriParts.type === "decision") {
    const rr = await client.query<DecisionRow>(
      `
      SELECT
        d.id::text AS id,
        d.decision_kind,
        d.run_id,
        d.selected_tool,
        d.candidates_json,
        d.context_sha256,
        d.policy_sha256,
        d.source_rule_ids::text[] AS source_rule_ids,
        d.metadata_json,
        d.created_at::text AS created_at,
        d.commit_id::text AS commit_id,
        c.scope::text AS commit_scope
      FROM memory_execution_decisions d
      LEFT JOIN memory_commits c ON c.id = d.commit_id
      WHERE d.scope = $1 AND d.id = $2::uuid
        AND (
          d.commit_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM memory_nodes n
            WHERE n.scope = d.scope
              AND n.commit_id = d.commit_id
              AND NOT (
                n.memory_lane = 'shared'::memory_lane
                OR (n.memory_lane = 'private'::memory_lane AND n.owner_agent_id = $3::text)
                OR ($4::text IS NOT NULL AND n.memory_lane = 'private'::memory_lane AND n.owner_team_id = $4::text)
              )
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM memory_nodes src_rule
          WHERE src_rule.scope = d.scope
            AND src_rule.id::text = ANY(d.source_rule_ids::text[])
            AND NOT (
              src_rule.memory_lane = 'shared'::memory_lane
              OR (src_rule.memory_lane = 'private'::memory_lane AND src_rule.owner_agent_id = $3::text)
              OR ($4::text IS NOT NULL AND src_rule.memory_lane = 'private'::memory_lane AND src_rule.owner_team_id = $4::text)
            )
        )
      LIMIT 1
      `,
      [tenancy.scope_key, uriParts.id, consumerAgentId, consumerTeamId],
    );
    const row = rr.rows[0];
    if (!row) {
      throw new HttpError(404, "decision_not_found_in_scope", "decision URI was not found in this scope", {
        uri: parsed.uri,
      });
    }
    return {
      ...base,
      decision: {
        decision_id: row.id,
        decision_uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "decision", id: row.id }),
        decision_kind: row.decision_kind,
        run_id: row.run_id,
        selected_tool: row.selected_tool,
        candidates: Array.isArray(row.candidates_json) ? row.candidates_json : [],
        context_sha256: row.context_sha256,
        policy_sha256: row.policy_sha256,
        source_rule_ids: Array.isArray(row.source_rule_ids) ? row.source_rule_ids : [],
        metadata: row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {},
        created_at: row.created_at,
        commit_id: row.commit_id,
        commit_uri: buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
      },
      resolve_summary: buildResolveSummary({
        resolvedType: uriParts.type,
        payloadKind: "decision",
        includeMeta: true,
        includeSlots: false,
        includeSlotsPreview: false,
        relatedUris: [
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "decision", id: row.id }),
          buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
        ],
        payload: {
          decision_id: row.id,
          decision_kind: row.decision_kind,
          run_id: row.run_id,
          selected_tool: row.selected_tool,
          commit_id: row.commit_id,
        },
      }),
    };
  }

  const rr = await client.query<NodeRow>(
    `
    SELECT
      n.id::text AS id,
      n.type::text AS type,
      n.client_id,
      n.title,
      n.text_summary,
      n.slots,
      n.tier::text AS tier,
      n.memory_lane::text AS memory_lane,
      n.producer_agent_id,
      n.owner_agent_id,
      n.owner_team_id,
      n.embedding_status::text AS embedding_status,
      n.embedding_model,
      n.raw_ref,
      n.evidence_ref,
      n.salience,
      n.importance,
      n.confidence,
      n.last_activated::text AS last_activated,
      n.created_at::text AS created_at,
      n.updated_at::text AS updated_at,
      n.commit_id::text AS commit_id,
      c.scope::text AS commit_scope,
      CASE WHEN n.type = 'topic'::memory_node_type THEN COALESCE(n.slots->>'topic_state', 'active') ELSE NULL END AS topic_state,
      CASE WHEN n.type = 'topic'::memory_node_type AND (n.slots->>'member_count') ~ '^[0-9]+$' THEN (n.slots->>'member_count')::int ELSE NULL END AS member_count
    FROM memory_nodes n
    LEFT JOIN memory_commits c ON c.id = n.commit_id
    WHERE n.scope = $1
      AND n.id = $2::uuid
      AND n.type::text = $3
      AND (
        n.memory_lane = 'shared'::memory_lane
        OR (n.memory_lane = 'private'::memory_lane AND n.owner_agent_id = $4::text)
        OR ($5::text IS NOT NULL AND n.memory_lane = 'private'::memory_lane AND n.owner_team_id = $5::text)
      )
    LIMIT 1
    `,
    [tenancy.scope_key, uriParts.id, uriParts.type, consumerAgentId, consumerTeamId],
  );

  const row = rr.rows[0];
  if (!row) {
    throw new HttpError(404, "node_not_found_in_scope_or_visibility", "node URI was not found in this scope/visibility", {
      uri: parsed.uri,
    });
  }

  const node: Record<string, unknown> = {
    id: row.id,
    uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.type, id: row.id }),
    type: row.type,
    client_id: row.client_id,
    title: row.title,
    text_summary: row.text_summary,
  };
  if (row.type === "topic") {
    node.topic_state = row.topic_state ?? "active";
    node.member_count = row.member_count;
  }
  if (parsed.include_slots) {
    node.slots = row.slots;
  } else if (parsed.include_slots_preview) {
    node.slots_preview = pickSlotsPreview(row.slots, parsed.slots_preview_keys);
  }
  if (parsed.include_meta) {
    node.tier = row.tier;
    node.memory_lane = row.memory_lane;
    node.producer_agent_id = row.producer_agent_id;
    node.owner_agent_id = row.owner_agent_id;
    node.owner_team_id = row.owner_team_id;
    node.embedding_status = row.embedding_status;
    node.embedding_model = row.embedding_model;
    node.raw_ref = row.raw_ref;
    node.evidence_ref = row.evidence_ref;
    node.created_at = row.created_at;
    node.updated_at = row.updated_at;
    node.last_activated = row.last_activated;
    node.salience = row.salience;
    node.importance = row.importance;
    node.confidence = row.confidence;
    node.commit_id = row.commit_id;
    node.commit_uri = buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId);
  }

  return {
    ...base,
    node,
    resolve_summary: buildResolveSummary({
      resolvedType: uriParts.type,
      payloadKind: "node",
      includeMeta: parsed.include_meta,
      includeSlots: parsed.include_slots,
      includeSlotsPreview: parsed.include_slots_preview,
      relatedUris: [
        buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.type, id: row.id }),
        buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
      ],
      payload: {
        id: row.id,
        type: row.type,
        client_id: row.client_id,
        commit_id: row.commit_id,
      },
    }),
  };
}

export async function memoryResolveLite(
  liteWriteStore: LiteWriteStore,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
) {
  const parsed = MemoryResolveRequest.parse(body);
  const uriParts = parseAionisUri(parsed.uri);
  const consumerAgentId = parsed.consumer_agent_id?.trim() || null;
  const consumerTeamId = parsed.consumer_team_id?.trim() || null;

  const requestTenant = parsed.tenant_id?.trim();
  const requestScope = parsed.scope?.trim();
  requireCompatibleFilter("tenant_id", uriParts.tenant_id, requestTenant);
  requireCompatibleFilter("scope", uriParts.scope, requestScope);

  const tenancy = resolveTenantScope(
    {
      tenant_id: uriParts.tenant_id,
      scope: uriParts.scope,
    },
    { defaultScope, defaultTenantId },
  );

  const base = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    uri: parsed.uri,
    type: uriParts.type,
  };

  if (uriParts.type === "edge") {
    const row = await liteWriteStore.resolveEdge({
      scope: tenancy.scope_key,
      id: uriParts.id,
      consumerAgentId,
      consumerTeamId,
    }) as LiteResolveEdgeRow | null;
    if (!row) {
      throw new HttpError(404, "edge_not_found_in_scope", "edge URI was not found in this scope", { uri: parsed.uri });
    }
    return {
      ...base,
      edge: {
        id: row.id,
        uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "edge", id: row.id }),
        type: row.type,
        src_id: row.src_id,
        src_uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.src_type, id: row.src_id }),
        dst_id: row.dst_id,
        dst_uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.dst_type, id: row.dst_id }),
        weight: row.weight,
        confidence: row.confidence,
        decay_rate: row.decay_rate,
        last_activated: row.last_activated,
        created_at: row.created_at,
        commit_id: row.commit_id,
        commit_uri: buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
      },
      resolve_summary: buildResolveSummary({
        resolvedType: uriParts.type,
        payloadKind: "edge",
        includeMeta: true,
        includeSlots: false,
        includeSlotsPreview: false,
        relatedUris: [
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "edge", id: row.id }),
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.src_type, id: row.src_id }),
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.dst_type, id: row.dst_id }),
          buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
        ],
        payload: {
          id: row.id,
          type: row.type,
          src_id: row.src_id,
          dst_id: row.dst_id,
          commit_id: row.commit_id,
        },
      }),
    };
  }

  if (uriParts.type === "commit") {
    const row = await liteWriteStore.resolveCommit({
      scope: tenancy.scope_key,
      id: uriParts.id,
      consumerAgentId,
      consumerTeamId,
    }) as LiteResolveCommitRow | null;
    if (!row) {
      throw new HttpError(404, "commit_not_found_in_scope", "commit URI was not found in this scope", { uri: parsed.uri });
    }
    return {
      ...base,
      commit: {
        id: row.id,
        uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.id }),
        parent_id: row.parent_id,
        parent_uri: row.parent_id
          ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.parent_id })
          : null,
        input_sha256: row.input_sha256,
        diff_json: row.diff_json,
        actor: row.actor,
        model_version: row.model_version,
        prompt_version: row.prompt_version,
        commit_hash: row.commit_hash,
        created_at: row.created_at,
        linked_object_counts: {
          nodes: Number(row.node_count ?? 0),
          edges: Number(row.edge_count ?? 0),
          decisions: Number(row.decision_count ?? 0),
          total: Number(row.node_count ?? 0) + Number(row.edge_count ?? 0) + Number(row.decision_count ?? 0),
        },
      },
      resolve_summary: buildResolveSummary({
        resolvedType: uriParts.type,
        payloadKind: "commit",
        includeMeta: true,
        includeSlots: false,
        includeSlotsPreview: false,
        relatedUris: [
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.id }),
          row.parent_id
            ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.parent_id })
            : null,
        ],
        payload: {
          id: row.id,
          parent_id: row.parent_id,
          actor: row.actor,
          node_count: Number(row.node_count ?? 0),
          edge_count: Number(row.edge_count ?? 0),
          decision_count: Number(row.decision_count ?? 0),
        },
      }),
    };
  }

  if (uriParts.type === "decision") {
    const row = await liteWriteStore.resolveDecision({
      scope: tenancy.scope_key,
      id: uriParts.id,
      consumerAgentId,
      consumerTeamId,
    }) as LiteResolveDecisionRow | null;
    if (!row) {
      throw new HttpError(404, "decision_not_found_in_scope", "decision URI was not found in this scope", {
        uri: parsed.uri,
      });
    }
    return {
      ...base,
      decision: {
        decision_id: row.id,
        decision_uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "decision", id: row.id }),
        decision_kind: row.decision_kind,
        run_id: row.run_id,
        selected_tool: row.selected_tool,
        candidates: Array.isArray(row.candidates_json) ? row.candidates_json : [],
        context_sha256: row.context_sha256,
        policy_sha256: row.policy_sha256,
        source_rule_ids: Array.isArray(row.source_rule_ids) ? row.source_rule_ids : [],
        metadata: row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {},
        created_at: row.created_at,
        commit_id: row.commit_id,
        commit_uri: buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
      },
      resolve_summary: buildResolveSummary({
        resolvedType: uriParts.type,
        payloadKind: "decision",
        includeMeta: true,
        includeSlots: false,
        includeSlotsPreview: false,
        relatedUris: [
          buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "decision", id: row.id }),
          buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
        ],
        payload: {
          decision_id: row.id,
          decision_kind: row.decision_kind,
          run_id: row.run_id,
          selected_tool: row.selected_tool,
          commit_id: row.commit_id,
        },
      }),
    };
  }

  const row = await liteWriteStore.resolveNode({
    scope: tenancy.scope_key,
    id: uriParts.id,
    type: uriParts.type,
    consumerAgentId,
    consumerTeamId,
  }) as LiteResolveNodeRow | null;
  if (!row) {
    throw new HttpError(404, "node_not_found_in_scope_or_visibility", "node URI was not found in this scope/visibility", {
      uri: parsed.uri,
    });
  }

  const node: Record<string, unknown> = {
    id: row.id,
    uri: buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.type, id: row.id }),
    type: row.type,
    client_id: row.client_id,
    title: row.title,
    text_summary: row.text_summary,
  };
  if (row.type === "topic") {
    node.topic_state = row.topic_state ?? "active";
    node.member_count = row.member_count;
  }
  if (parsed.include_slots) {
    node.slots = row.slots;
  } else if (parsed.include_slots_preview) {
    node.slots_preview = pickSlotsPreview(row.slots, parsed.slots_preview_keys);
  }
  if (parsed.include_meta) {
    node.tier = row.tier;
    node.memory_lane = row.memory_lane;
    node.producer_agent_id = row.producer_agent_id;
    node.owner_agent_id = row.owner_agent_id;
    node.owner_team_id = row.owner_team_id;
    node.embedding_status = row.embedding_status;
    node.embedding_model = row.embedding_model;
    node.raw_ref = row.raw_ref;
    node.evidence_ref = row.evidence_ref;
    node.created_at = row.created_at;
    node.updated_at = row.updated_at;
    node.last_activated = row.last_activated;
    node.salience = row.salience;
    node.importance = row.importance;
    node.confidence = row.confidence;
    node.commit_id = row.commit_id;
    node.commit_uri = buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId);
  }

  return {
    ...base,
    node,
    resolve_summary: buildResolveSummary({
      resolvedType: uriParts.type,
      payloadKind: "node",
      includeMeta: parsed.include_meta,
      includeSlots: parsed.include_slots,
      includeSlotsPreview: parsed.include_slots_preview,
      relatedUris: [
        buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: row.type, id: row.id }),
        buildCommitUri(tenancy.tenant_id, row.commit_scope, row.commit_id, defaultTenantId),
      ],
      payload: {
        id: row.id,
        type: row.type,
        client_id: row.client_id,
        commit_id: row.commit_id,
      },
    }),
  };
}
