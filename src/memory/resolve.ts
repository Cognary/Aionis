import type pg from "pg";
import { HttpError, badRequest } from "../util/http.js";
import { MemoryResolveRequest } from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
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

export async function memoryResolve(client: pg.PoolClient, body: unknown, defaultScope: string, defaultTenantId: string) {
  const parsed = MemoryResolveRequest.parse(body);
  const uriParts = parseAionisUri(parsed.uri);

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
        e.commit_id::text AS commit_id
      FROM memory_edges e
      JOIN memory_nodes src ON src.id = e.src_id AND src.scope = e.scope
      JOIN memory_nodes dst ON dst.id = e.dst_id AND dst.scope = e.scope
      WHERE e.scope = $1 AND e.id = $2::uuid
      LIMIT 1
      `,
      [tenancy.scope_key, uriParts.id],
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
        commit_uri: row.commit_id
          ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.commit_id })
          : null,
      },
    };
  }

  if (uriParts.type === "commit") {
    const rr = await client.query<CommitRow>(
      `
      SELECT
        id::text AS id,
        parent_id::text AS parent_id,
        input_sha256,
        diff_json,
        actor,
        model_version,
        prompt_version,
        commit_hash,
        created_at::text AS created_at
      FROM memory_commits
      WHERE scope = $1 AND id = $2::uuid
      LIMIT 1
      `,
      [tenancy.scope_key, uriParts.id],
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
      },
    };
  }

  if (uriParts.type === "decision") {
    const rr = await client.query<DecisionRow>(
      `
      SELECT
        id::text AS id,
        decision_kind,
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
      WHERE scope = $1 AND id = $2::uuid
      LIMIT 1
      `,
      [tenancy.scope_key, uriParts.id],
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
        commit_uri: row.commit_id
          ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.commit_id })
          : null,
      },
    };
  }

  const consumerAgentId = parsed.consumer_agent_id?.trim() || null;
  const consumerTeamId = parsed.consumer_team_id?.trim() || null;
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
      CASE WHEN n.type = 'topic'::memory_node_type THEN COALESCE(n.slots->>'topic_state', 'active') ELSE NULL END AS topic_state,
      CASE WHEN n.type = 'topic'::memory_node_type AND (n.slots->>'member_count') ~ '^[0-9]+$' THEN (n.slots->>'member_count')::int ELSE NULL END AS member_count
    FROM memory_nodes n
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
    node.commit_uri = row.commit_id
      ? buildAionisUri({ tenant_id: tenancy.tenant_id, scope: tenancy.scope, type: "commit", id: row.commit_id })
      : null;
  }

  return {
    ...base,
    node,
  };
}
