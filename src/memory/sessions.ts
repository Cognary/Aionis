import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { HttpError } from "../util/http.js";
import {
  MemoryEventWriteRequest,
  MemorySessionCreateRequest,
  MemorySessionEventsListRequest,
  type MemoryEventWriteInput,
  type MemorySessionCreateInput,
  type MemorySessionEventsListInput,
} from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
import { applyMemoryWrite, prepareMemoryWrite } from "./write.js";
import { buildAionisUri } from "./uri.js";

type SessionWriteOptions = {
  defaultScope: string;
  defaultTenantId: string;
  maxTextLen: number;
  piiRedaction: boolean;
  allowCrossScopeEdges: boolean;
  shadowDualWriteEnabled: boolean;
  shadowDualWriteStrict: boolean;
  embedder: EmbeddingProvider | null;
};

type SessionEventListOptions = {
  defaultScope: string;
  defaultTenantId: string;
};

type EventRow = {
  id: string;
  client_id: string | null;
  type: string;
  title: string | null;
  text_summary: string | null;
  slots: any;
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
  edge_weight: number;
  edge_confidence: number;
};

type SessionRow = {
  id: string;
  title: string | null;
  text_summary: string | null;
  memory_lane: "private" | "shared";
  owner_agent_id: string | null;
  owner_team_id: string | null;
};

function sessionKey(v: string): string {
  return encodeURIComponent(v.trim());
}

function sessionClientId(sessionId: string): string {
  return `session:${sessionKey(sessionId)}`;
}

function sessionEventClientId(sessionId: string, eventId: string): string {
  return `session_event:${sessionKey(sessionId)}:${sessionKey(eventId)}`;
}

function pickSlotsPreview(slots: unknown, maxKeys: number): Record<string, unknown> | null {
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return null;
  const obj = slots as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys.slice(0, maxKeys)) out[k] = obj[k];
  return out;
}

function normalizeSessionCreateInput(body: unknown): MemorySessionCreateInput {
  return MemorySessionCreateRequest.parse(body);
}

function normalizeEventWriteInput(body: unknown): MemoryEventWriteInput {
  return MemoryEventWriteRequest.parse(body);
}

function normalizeSessionEventsListInput(input: unknown): MemorySessionEventsListInput {
  return MemorySessionEventsListRequest.parse(input);
}

function normalizedIdentity(input: { owner_agent_id?: string; owner_team_id?: string; producer_agent_id?: string }) {
  const ownerAgentId = input.owner_agent_id?.trim() || null;
  const ownerTeamId = input.owner_team_id?.trim() || null;
  const producerAgentId = input.producer_agent_id?.trim() || null;
  return {
    owner_agent_id: ownerAgentId,
    owner_team_id: ownerTeamId,
    producer_agent_id: producerAgentId,
    writer_agent_id: ownerAgentId ?? producerAgentId,
  };
}

function assertSessionWriteAllowed(
  session: SessionRow,
  writer: { writer_agent_id: string | null; owner_team_id: string | null },
): void {
  if (session.memory_lane === "shared") return;
  const agentMatch =
    !!session.owner_agent_id && !!writer.writer_agent_id && session.owner_agent_id === writer.writer_agent_id;
  const teamMatch = !!session.owner_team_id && !!writer.owner_team_id && session.owner_team_id === writer.owner_team_id;
  if (agentMatch || teamMatch) return;
  throw new HttpError(403, "session_owner_mismatch", "cannot append events to a private session owned by another principal");
}

export async function createSession(client: pg.PoolClient, body: unknown, opts: SessionWriteOptions) {
  const parsed = normalizeSessionCreateInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const sid = parsed.session_id.trim();
  const sessionCid = sessionClientId(sid);
  const title = parsed.title?.trim() || `Session ${sid}`;
  const textSummary = parsed.text_summary?.trim() || title;
  const inputText = parsed.input_text?.trim() || `create session ${sid}`;
  const sessionSlots = {
    system_kind: "session",
    session_id: sid,
    ...(parsed.metadata ?? {}),
  };

  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "session_api",
    input_text: inputText,
    auto_embed: parsed.auto_embed ?? false,
    memory_lane: parsed.memory_lane,
    producer_agent_id: parsed.producer_agent_id,
    owner_agent_id: parsed.owner_agent_id,
    owner_team_id: parsed.owner_team_id,
    nodes: [
      {
        client_id: sessionCid,
        type: "topic" as const,
        title,
        text_summary: textSummary,
        slots: sessionSlots,
      },
    ],
    edges: [],
  };

  const prepared = await prepareMemoryWrite(
    writeReq,
    opts.defaultScope,
    opts.defaultTenantId,
    {
      maxTextLen: opts.maxTextLen,
      piiRedaction: opts.piiRedaction,
      allowCrossScopeEdges: opts.allowCrossScopeEdges,
    },
    opts.embedder,
  );
  const out = await applyMemoryWrite(client, prepared, {
    maxTextLen: opts.maxTextLen,
    piiRedaction: opts.piiRedaction,
    allowCrossScopeEdges: opts.allowCrossScopeEdges,
    shadowDualWriteEnabled: opts.shadowDualWriteEnabled,
    shadowDualWriteStrict: opts.shadowDualWriteStrict,
  });

  const node = out.nodes.find((n) => n.client_id === sessionCid) ?? out.nodes[0] ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    session_id: sid,
    session_node_id: node?.id ?? null,
    session_uri:
      node?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "topic",
            id: node.id,
          })
        : null,
    commit_id: out.commit_id,
    commit_hash: out.commit_hash,
    nodes: out.nodes,
    edges: out.edges,
    embedding_backfill: out.embedding_backfill ?? null,
  };
}

export async function writeSessionEvent(client: pg.PoolClient, body: unknown, opts: SessionWriteOptions) {
  const parsed = normalizeEventWriteInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const sid = parsed.session_id.trim();
  const eid = parsed.event_id?.trim() || randomUUID();
  const sessionCid = sessionClientId(sid);
  const eventCid = sessionEventClientId(sid, eid);
  const writerIdentity = normalizedIdentity({
    owner_agent_id: parsed.owner_agent_id,
    owner_team_id: parsed.owner_team_id,
    producer_agent_id: parsed.producer_agent_id,
  });
  const existingSessionRes = await client.query<SessionRow>(
    `
    SELECT
      id,
      title,
      text_summary,
      memory_lane::text AS memory_lane,
      owner_agent_id,
      owner_team_id
    FROM memory_nodes
    WHERE scope = $1
      AND type = 'topic'::memory_node_type
      AND client_id = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [tenancy.scope_key, sessionCid],
  );
  const existingSession = existingSessionRes.rows[0] ?? null;
  if (existingSession) {
    assertSessionWriteAllowed(existingSession, writerIdentity);
  }
  const effectiveLane = existingSession?.memory_lane ?? parsed.memory_lane;
  const effectiveOwnerAgentId = existingSession?.owner_agent_id ?? parsed.owner_agent_id;
  const effectiveOwnerTeamId = existingSession?.owner_team_id ?? parsed.owner_team_id;
  const title = parsed.title?.trim() || null;
  const textSummary = parsed.text_summary?.trim() || parsed.input_text?.trim() || parsed.title?.trim() || `session event ${eid}`;
  const inputText = parsed.input_text?.trim() || textSummary;
  const sessionSlots = {
    system_kind: "session",
    session_id: sid,
  };
  const eventSlots = {
    system_kind: "session_event",
    session_id: sid,
    event_id: eid,
    ...(parsed.metadata ?? {}),
  };

  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "event_api",
    input_text: inputText,
    auto_embed: parsed.auto_embed ?? true,
    memory_lane: effectiveLane,
    producer_agent_id: parsed.producer_agent_id,
    owner_agent_id: effectiveOwnerAgentId,
    owner_team_id: effectiveOwnerTeamId,
    nodes: [
      {
        client_id: sessionCid,
        type: "topic" as const,
        title: `Session ${sid}`,
        text_summary: `Session ${sid}`,
        slots: sessionSlots,
      },
      {
        client_id: eventCid,
        type: "event" as const,
        title: title ?? undefined,
        text_summary: textSummary,
        slots: eventSlots,
      },
    ],
    edges: [
      {
        type: "part_of" as const,
        src: { client_id: eventCid },
        dst: { client_id: sessionCid },
        weight: parsed.edge_weight ?? 1,
        confidence: parsed.edge_confidence ?? 1,
      },
    ],
  };

  const prepared = await prepareMemoryWrite(
    writeReq,
    opts.defaultScope,
    opts.defaultTenantId,
    {
      maxTextLen: opts.maxTextLen,
      piiRedaction: opts.piiRedaction,
      allowCrossScopeEdges: opts.allowCrossScopeEdges,
    },
    opts.embedder,
  );
  const out = await applyMemoryWrite(client, prepared, {
    maxTextLen: opts.maxTextLen,
    piiRedaction: opts.piiRedaction,
    allowCrossScopeEdges: opts.allowCrossScopeEdges,
    shadowDualWriteEnabled: opts.shadowDualWriteEnabled,
    shadowDualWriteStrict: opts.shadowDualWriteStrict,
  });

  const eventNode = out.nodes.find((n) => n.client_id === eventCid) ?? null;
  const sessionNode = out.nodes.find((n) => n.client_id === sessionCid) ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    session_id: sid,
    event_id: eid,
    event_node_id: eventNode?.id ?? null,
    session_node_id: sessionNode?.id ?? null,
    event_uri:
      eventNode?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "event",
            id: eventNode.id,
          })
        : null,
    session_uri:
      sessionNode?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "topic",
            id: sessionNode.id,
          })
        : null,
    commit_id: out.commit_id,
    commit_hash: out.commit_hash,
    nodes: out.nodes,
    edges: out.edges,
    embedding_backfill: out.embedding_backfill ?? null,
  };
}

export async function listSessionEvents(client: pg.PoolClient, input: unknown, opts: SessionEventListOptions) {
  const parsed = normalizeSessionEventsListInput(input);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const sid = parsed.session_id.trim();
  const sessionCid = sessionClientId(sid);
  const sr = await client.query<SessionRow>(
    `
    SELECT
      id,
      title,
      text_summary,
      memory_lane::text AS memory_lane,
      owner_agent_id,
      owner_team_id
    FROM memory_nodes
    WHERE scope = $1
      AND type = 'topic'::memory_node_type
      AND client_id = $2
      AND (
        memory_lane = 'shared'::memory_lane
        OR (memory_lane = 'private'::memory_lane AND owner_agent_id = $3::text)
        OR ($4::text IS NOT NULL AND memory_lane = 'private'::memory_lane AND owner_team_id = $4::text)
      )
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [tenancy.scope_key, sessionCid, parsed.consumer_agent_id ?? null, parsed.consumer_team_id ?? null],
  );
  const session = sr.rows[0] ?? null;
  if (!session) {
    return {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      session: null,
      events: [],
      page: {
        limit: parsed.limit,
        offset: parsed.offset,
        returned: 0,
        has_more: false,
      },
    };
  }

  const whereLane = `AND (
      e.memory_lane = 'shared'::memory_lane
      OR (e.memory_lane = 'private'::memory_lane AND e.owner_agent_id = $5::text)
      OR ($6::text IS NOT NULL AND e.memory_lane = 'private'::memory_lane AND e.owner_team_id = $6::text)
    )`;

  const rr = await client.query<EventRow>(
    `
    SELECT
      e.id,
      e.client_id,
      e.type::text AS type,
      e.title,
      e.text_summary,
      e.slots,
      e.memory_lane::text AS memory_lane,
      e.producer_agent_id,
      e.owner_agent_id,
      e.owner_team_id,
      e.embedding_status::text AS embedding_status,
      e.embedding_model,
      e.raw_ref,
      e.evidence_ref,
      e.salience,
      e.importance,
      e.confidence,
      e.last_activated::text AS last_activated,
      e.created_at::text AS created_at,
      e.updated_at::text AS updated_at,
      e.commit_id::text AS commit_id,
      me.weight AS edge_weight,
      me.confidence AS edge_confidence
    FROM memory_edges me
    JOIN memory_nodes e ON e.id = me.src_id
    WHERE me.scope = $1
      AND me.type = 'part_of'::memory_edge_type
      AND me.dst_id = $2::uuid
      AND e.scope = $1
      AND e.type = 'event'::memory_node_type
      ${whereLane}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT $3
    OFFSET $4
    `,
    [
      tenancy.scope_key,
      session.id,
      parsed.limit + 1,
      parsed.offset,
      parsed.consumer_agent_id ?? null,
      parsed.consumer_team_id ?? null,
    ],
  );

  const hasMore = rr.rows.length > parsed.limit;
  const rows = hasMore ? rr.rows.slice(0, parsed.limit) : rr.rows;
  const events = rows.map((row) => {
    const out: Record<string, unknown> = {
      uri: buildAionisUri({
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        type: "event",
        id: row.id,
      }),
      id: row.id,
      client_id: row.client_id,
      event_id: typeof row.slots?.event_id === "string" ? row.slots.event_id : null,
      type: row.type,
      title: row.title,
      text_summary: row.text_summary,
      edge_weight: row.edge_weight,
      edge_confidence: row.edge_confidence,
    };
    if (parsed.include_slots) out.slots = row.slots;
    else if (parsed.include_slots_preview) out.slots_preview = pickSlotsPreview(row.slots, parsed.slots_preview_keys);
    if (parsed.include_meta) {
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
  });

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    session: {
      session_id: sid,
      node_id: session.id,
      title: session.title,
      text_summary: session.text_summary,
      uri: buildAionisUri({
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        type: "topic",
        id: session.id,
      }),
    },
    events,
    page: {
      limit: parsed.limit,
      offset: parsed.offset,
      returned: events.length,
      has_more: hasMore,
    },
  };
}
