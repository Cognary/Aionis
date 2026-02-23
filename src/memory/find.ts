import type pg from "pg";
import { badRequest } from "../util/http.js";
import { MemoryFindRequest, type MemoryFindInput } from "./schemas.js";
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

type NodeDTO = {
  uri: string;
  id: string;
  client_id: string | null;
  type: string;
  title: string | null;
  text_summary: string | null;
  topic_state?: string | null;
  member_count?: number | null;
  slots?: unknown;
  slots_preview?: Record<string, unknown> | null;
  tier?: string;
  memory_lane?: "private" | "shared";
  producer_agent_id?: string | null;
  owner_agent_id?: string | null;
  owner_team_id?: string | null;
  embedding_status?: string | null;
  embedding_model?: string | null;
  raw_ref?: string | null;
  evidence_ref?: string | null;
  created_at?: string;
  updated_at?: string;
  last_activated?: string | null;
  salience?: number;
  importance?: number;
  confidence?: number;
  commit_id?: string | null;
};

function pickSlotsPreview(slots: unknown, maxKeys: number): Record<string, unknown> | null {
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return null;
  const obj = slots as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys.slice(0, maxKeys)) out[k] = obj[k];
  return out;
}

function requireCompatibleFilter(field: string, a: string | undefined, b: string | undefined) {
  if (!a || !b) return;
  if (a === b) return;
  badRequest("conflicting_filters", `${field} conflicts with URI`, { field, uri_value: a, request_value: b });
}

function normalizeFindInput(parsed: MemoryFindInput): {
  tenant_id?: string;
  scope?: string;
  type?: string;
  id?: string;
  limit: number;
  offset: number;
  client_id?: string;
  title_contains?: string;
  text_contains?: string;
  memory_lane?: "private" | "shared";
  slots_contains?: Record<string, unknown>;
  consumer_agent_id?: string;
  consumer_team_id?: string;
  include_meta: boolean;
  include_slots: boolean;
  include_slots_preview: boolean;
  slots_preview_keys: number;
} {
  let uriParts: ReturnType<typeof parseAionisUri> | null = null;
  if (parsed.uri) uriParts = parseAionisUri(parsed.uri);

  const requestTenant = parsed.tenant_id?.trim();
  const requestScope = parsed.scope?.trim();
  const requestType = parsed.type?.trim();
  const requestId = parsed.id?.trim();

  requireCompatibleFilter("tenant_id", uriParts?.tenant_id, requestTenant);
  requireCompatibleFilter("scope", uriParts?.scope, requestScope);
  requireCompatibleFilter("type", uriParts?.type, requestType);
  requireCompatibleFilter("id", uriParts?.id, requestId);

  const titleContains = parsed.title_contains?.trim();
  const textContains = parsed.text_contains?.trim();
  const clientId = parsed.client_id?.trim();
  const consumerAgentId = parsed.consumer_agent_id?.trim();
  const consumerTeamId = parsed.consumer_team_id?.trim();

  return {
    tenant_id: uriParts?.tenant_id ?? requestTenant,
    scope: uriParts?.scope ?? requestScope,
    type: uriParts?.type ?? requestType,
    id: uriParts?.id ?? requestId,
    client_id: clientId || undefined,
    title_contains: titleContains || undefined,
    text_contains: textContains || undefined,
    memory_lane: parsed.memory_lane,
    slots_contains: parsed.slots_contains,
    consumer_agent_id: consumerAgentId || undefined,
    consumer_team_id: consumerTeamId || undefined,
    limit: parsed.limit,
    offset: parsed.offset,
    include_meta: parsed.include_meta,
    include_slots: parsed.include_slots,
    include_slots_preview: parsed.include_slots_preview,
    slots_preview_keys: parsed.slots_preview_keys,
  };
}

function toNodeDto(row: NodeRow, scope: string, tenantId: string, input: ReturnType<typeof normalizeFindInput>): NodeDTO {
  const out: NodeDTO = {
    uri: buildAionisUri({ tenant_id: tenantId, scope, type: row.type, id: row.id }),
    id: row.id,
    client_id: row.client_id,
    type: row.type,
    title: row.title,
    text_summary: row.text_summary,
  };
  if (row.type === "topic") {
    out.topic_state = row.topic_state ?? "active";
    out.member_count = row.member_count;
  }
  if (input.include_slots) {
    out.slots = row.slots;
  } else if (input.include_slots_preview) {
    out.slots_preview = pickSlotsPreview(row.slots, input.slots_preview_keys);
  }
  if (input.include_meta) {
    out.tier = row.tier;
    out.memory_lane = row.memory_lane;
    out.producer_agent_id = row.producer_agent_id;
    out.owner_agent_id = row.owner_agent_id;
    out.owner_team_id = row.owner_team_id;
    out.embedding_status = row.embedding_status;
    out.embedding_model = row.embedding_model;
    out.raw_ref = row.raw_ref;
    out.evidence_ref = row.evidence_ref;
    out.created_at = row.created_at;
    out.updated_at = row.updated_at;
    out.last_activated = row.last_activated;
    out.salience = row.salience;
    out.importance = row.importance;
    out.confidence = row.confidence;
    out.commit_id = row.commit_id;
  }
  return out;
}

export async function memoryFind(client: pg.PoolClient, body: unknown, defaultScope: string, defaultTenantId: string) {
  const parsed = MemoryFindRequest.parse(body);
  const input = normalizeFindInput(parsed);
  const tenancy = resolveTenantScope(
    {
      scope: input.scope,
      tenant_id: input.tenant_id,
    },
    { defaultScope, defaultTenantId },
  );

  const where: string[] = ["n.scope = $1"];
  const args: any[] = [tenancy.scope_key];
  const pushArg = (v: any): string => {
    args.push(v);
    return `$${args.length}`;
  };

  if (input.id) where.push(`n.id = ${pushArg(input.id)}::uuid`);
  if (input.type) where.push(`n.type::text = ${pushArg(input.type)}`);
  if (input.client_id) where.push(`n.client_id = ${pushArg(input.client_id)}`);
  if (input.title_contains) where.push(`n.title ILIKE '%' || ${pushArg(input.title_contains)} || '%'`);
  if (input.text_contains) where.push(`n.text_summary ILIKE '%' || ${pushArg(input.text_contains)} || '%'`);
  if (input.memory_lane) where.push(`n.memory_lane::text = ${pushArg(input.memory_lane)}`);
  if (input.slots_contains) where.push(`n.slots @> ${pushArg(JSON.stringify(input.slots_contains))}::jsonb`);

  // Keep lane visibility semantics aligned with recall:
  // shared is always readable; private requires owner match.
  const agentArg = pushArg(input.consumer_agent_id ?? null);
  const teamArg = pushArg(input.consumer_team_id ?? null);
  where.push(`(
    n.memory_lane = 'shared'::memory_lane
    OR (n.memory_lane = 'private'::memory_lane AND n.owner_agent_id = ${agentArg}::text)
    OR (${teamArg}::text IS NOT NULL AND n.memory_lane = 'private'::memory_lane AND n.owner_team_id = ${teamArg}::text)
  )`);

  const fetchLimit = input.limit + 1;
  const limitArg = pushArg(fetchLimit);
  const offsetArg = pushArg(input.offset);

  const sql = `
    SELECT
      n.id,
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
    WHERE ${where.join("\n      AND ")}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ${limitArg}
    OFFSET ${offsetArg}
  `;

  const rr = await client.query<NodeRow>(sql, args);
  const hasMore = rr.rows.length > input.limit;
  const rows = hasMore ? rr.rows.slice(0, input.limit) : rr.rows;

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    mode: "find",
    filters: {
      uri: parsed.uri ?? null,
      id: input.id ?? null,
      client_id: input.client_id ?? null,
      type: input.type ?? null,
      title_contains: input.title_contains ?? null,
      text_contains: input.text_contains ?? null,
      memory_lane: input.memory_lane ?? null,
      slots_contains: input.slots_contains ?? null,
      consumer_agent_id: input.consumer_agent_id ?? null,
      consumer_team_id: input.consumer_team_id ?? null,
    },
    nodes: rows.map((row) => toNodeDto(row, tenancy.scope, tenancy.tenant_id, input)),
    page: {
      limit: input.limit,
      offset: input.offset,
      returned: rows.length,
      has_more: hasMore,
    },
  };
}
