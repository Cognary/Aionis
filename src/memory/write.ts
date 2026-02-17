import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { assertDim, toVectorLiteral } from "../util/pgvector.js";
import { normalizeText } from "../util/normalize.js";
import { redactJsonStrings, redactPII } from "../util/redaction.js";
import { stableUuid } from "../util/uuid.js";
import { badRequest } from "../util/http.js";
import { MemoryWriteRequest } from "./schemas.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { resolveTenantScope, toTenantScopeKey } from "./tenant.js";

type WriteResult = {
  tenant_id?: string;
  scope?: string;
  commit_id: string;
  commit_hash: string;
  nodes: Array<{ id: string; client_id?: string; type: string }>;
  edges: Array<{ id: string; type: string; src_id: string; dst_id: string }>;
  embedding_backfill?: { enqueued: true; pending_nodes: number };
  shadow_dual_write?: {
    enabled: boolean;
    strict: boolean;
    mirrored: boolean;
    copied?: { commits: number; nodes: number; edges: number; outbox: number };
    error?: string;
  };
  topic_cluster?:
    | {
        topic_commit_id: string | null;
        topic_commit_hash: string | null;
        processed_events: number;
        assigned: number;
        created_topics: number;
        promoted: number;
        strategy_requested: "online_knn" | "offline_hdbscan";
        strategy_executed: "online_knn" | "offline_hdbscan";
        strategy_note: string | null;
        quality: { cohesion: number; coverage: number; orphan_rate_after: number; merge_rate_30d: number };
      }
    | { enqueued: true };
};

function resolveScope(reqScope: string | undefined, defaultScope: string): string {
  return (reqScope && reqScope.trim()) || defaultScope;
}

function resolveId(v: { id?: string; client_id?: string }, clientIdToId: Map<string, string>): string {
  if (v.id) return v.id;
  if (v.client_id) {
    const key = v.client_id.trim();
    const out = clientIdToId.get(key);
    if (!out) throw new Error(`unknown client_id reference: ${v.client_id}`);
    return out;
  }
  throw new Error("missing id/client_id");
}

function stableNodeIdFromClientId(scope: string, client_id: string): string {
  // Contract: client_id is a stable external key within a scope, so server-generated ids must
  // depend only on (scope, client_id) to guarantee idempotency across retries/writes.
  return stableUuid(`${scope}:node:${client_id.trim()}`);
}

type PrepareWriteOptions = {
  maxTextLen: number;
  piiRedaction: boolean;
  allowCrossScopeEdges: boolean;
};

type ApplyWriteOptions = PrepareWriteOptions & {
  shadowDualWriteEnabled: boolean;
  shadowDualWriteStrict: boolean;
};

async function fetchExistingNodeScopes(
  client: pg.PoolClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const r = await client.query<{ id: string; scope: string }>(
    "SELECT id, scope FROM memory_nodes WHERE id = ANY($1::uuid[])",
    [ids],
  );
  const out = new Map<string, string>();
  for (const row of r.rows) out.set(row.id, row.scope);
  return out;
}

type PreparedNode = {
  id: string;
  client_id?: string;
  scope: string;
  type: string;
  tier?: "hot" | "warm" | "cold" | "archive";
  memory_lane: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
  title?: string;
  text_summary?: string;
  slots: Record<string, unknown>;
  raw_ref?: string;
  evidence_ref?: string;
  embedding?: number[];
  embedding_model?: string;
  embed_text?: string;
  salience?: number;
  importance?: number;
  confidence?: number;
};

type PreparedEdge = {
  id: string;
  scope: string;
  type: string;
  src_id: string;
  dst_id: string;
  weight?: number;
  confidence?: number;
  decay_rate?: number;
};

type PreparedWrite = {
  tenant_id: string;
  scope_public: string;
  scope: string;
  actor: string;
  memory_lane_default: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
  parent_commit_id: string | null;
  input_sha256: string;
  model_version: string | null;
  prompt_version: string | null;
  redaction_meta: Record<string, number>;
  auto_embed_effective: boolean;
  force_reembed: boolean;
  nodes: PreparedNode[];
  edges: PreparedEdge[];
  requested_trigger_topic_cluster?: boolean;
  requested_topic_cluster_async?: boolean;
};

export type EffectiveWritePolicy = {
  trigger_topic_cluster: boolean;
  topic_cluster_async: boolean;
};

export function computeEffectiveWritePolicy(
  prepared: PreparedWrite,
  defaults: { autoTopicClusterOnWrite: boolean; topicClusterAsyncOnWrite: boolean },
): EffectiveWritePolicy {
  const hasEvents = prepared.nodes.some((n) => n.type === "event");
  const trigger =
    (prepared.requested_trigger_topic_cluster ?? defaults.autoTopicClusterOnWrite) && hasEvents;
  const asyncMode = prepared.requested_topic_cluster_async ?? defaults.topicClusterAsyncOnWrite;
  return { trigger_topic_cluster: trigger, topic_cluster_async: asyncMode };
}

function nodeEmbedText(n: PreparedNode, fallbackEventText: string | undefined): string | null {
  const title = n.title?.trim();
  const summary = n.text_summary?.trim();
  if (n.type === "event" || n.type === "evidence") return summary ?? title ?? fallbackEventText ?? null;
  if (n.type === "entity" || n.type === "topic" || n.type === "concept") return title ?? summary ?? null;
  if (n.type === "rule") return summary ?? title ?? null;
  return summary ?? title ?? null;
}

export async function prepareMemoryWrite(
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: PrepareWriteOptions,
  embedder: EmbeddingProvider | null,
): Promise<PreparedWrite> {
  const parsed = MemoryWriteRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  const actor = parsed.actor ?? "system";

  const redactionMeta: Record<string, number> = {};
  const bump = (c: Record<string, number>) => {
    for (const [k, v] of Object.entries(c)) redactionMeta[k] = (redactionMeta[k] ?? 0) + v;
  };

  const normalizeMaybeRedact = (s: string | undefined): string | undefined => {
    if (!s) return s;
    const normalized = normalizeText(s, opts.maxTextLen);
    if (!opts.piiRedaction) return normalized;
    const r = redactPII(normalized);
    bump(r.counts);
    return r.text;
  };
  const normalizeId = (s: string | undefined): string | undefined => {
    if (!s) return undefined;
    const v = s.trim();
    return v.length > 0 ? v : undefined;
  };

  const defaultLane = parsed.memory_lane ?? "private";
  const defaultProducerAgentId = normalizeId(parsed.producer_agent_id);
  const defaultOwnerAgentId = normalizeId(parsed.owner_agent_id);
  const defaultOwnerTeamId = normalizeId(parsed.owner_team_id);

  // Hash the normalized/redacted input by default (keeps PII out of stored hashes).
  const inputText = normalizeMaybeRedact(parsed.input_text);
  if (parsed.input_text && (!inputText || inputText.length === 0)) {
    throw new Error("input_text becomes empty after normalization; provide non-whitespace content");
  }

  // Prepare ids deterministically so retries are idempotent.
  const clientIdToId = new Map<string, string>();
  const nodes: PreparedNode[] = parsed.nodes.map((n) => {
    const nodeScopePublic = resolveScope(n.scope, tenancy.scope);
    const nodeScope = toTenantScopeKey(nodeScopePublic, tenancy.tenant_id, defaultTenantId);
    const client_id = n.client_id?.trim();
    if (n.client_id && (!client_id || client_id.length === 0)) {
      throw new Error("client_id becomes empty after trimming; provide a non-whitespace client_id");
    }

    const expectedId = client_id ? stableNodeIdFromClientId(nodeScope, client_id) : null;
    if (n.id && expectedId && n.id !== expectedId) {
      throw new Error(`client_id/id mismatch: scope=${nodeScope} client_id=${client_id} id=${n.id} expected_id=${expectedId}`);
    }

    const id = n.id ?? (expectedId ?? stableUuid(`${nodeScope}:node:${sha256Hex(stableStringify(n))}`));
    if (client_id) clientIdToId.set(client_id, id);

    const title = normalizeMaybeRedact(n.title);
    const text_summary = normalizeMaybeRedact(n.text_summary);
    const embedding_model = normalizeMaybeRedact((n as any).embedding_model);
    let slots = n.slots ?? {};
    if (opts.piiRedaction) {
      const r = redactJsonStrings(slots);
      slots = (r.value ?? {}) as Record<string, unknown>;
      bump(r.counts);
    }

    const lane = n.memory_lane ?? defaultLane;
    const producerAgentId = normalizeId(n.producer_agent_id) ?? defaultProducerAgentId;
    const ownerAgentId = normalizeId(n.owner_agent_id) ?? defaultOwnerAgentId ?? producerAgentId;
    const ownerTeamId = normalizeId(n.owner_team_id) ?? defaultOwnerTeamId;

    return {
      ...n,
      client_id,
      id,
      scope: nodeScope,
      memory_lane: lane,
      producer_agent_id: producerAgentId,
      owner_agent_id: ownerAgentId,
      owner_team_id: ownerTeamId,
      title,
      text_summary,
      embedding_model,
      slots,
    };
  });

  for (const n of nodes) {
    if (n.type !== "rule") continue;
    if (n.memory_lane !== "private") continue;
    if (n.owner_agent_id || n.owner_team_id) continue;
    badRequest("invalid_private_rule_owner", "private rule requires owner_agent_id or owner_team_id", {
      node_id: n.id,
      client_id: n.client_id ?? null,
      memory_lane: n.memory_lane,
      type: n.type,
    });
  }

  const edges: PreparedEdge[] = parsed.edges.map((e) => {
    const id =
      e.id ??
      stableUuid(
        `${scope}:edge:${inputText ?? parsed.input_sha256 ?? "noinput"}:${e.type}:${e.src.id ?? e.src.client_id}:${e.dst.id ?? e.dst.client_id}`,
      );
    const edgeScope = resolveScope(e.scope, scope);
    const src_id = resolveId(e.src, clientIdToId);
    const dst_id = resolveId(e.dst, clientIdToId);
    return { ...e, id, scope: edgeScope, src_id, dst_id };
  });

  // Embeddings are a derived artifact: we do NOT block /write.
  // If auto_embed is enabled and a provider is configured, we only compute an embed_text
  // that a worker can use to backfill embeddings asynchronously.
  const shouldAutoEmbed = (parsed.auto_embed ?? true) && !!embedder;
  if (shouldAutoEmbed) {
    for (const n of nodes) {
      if (n.embedding) continue;
      const t = nodeEmbedText(n, inputText);
      if (!t) continue;
      const norm = normalizeText(t, opts.maxTextLen);
      if (norm.length > 0) n.embed_text = norm;
    }
  }

  const inputSha = parsed.input_sha256 ?? sha256Hex(inputText!);

  return {
    scope,
    scope_public: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    actor,
    memory_lane_default: defaultLane,
    producer_agent_id: defaultProducerAgentId,
    owner_agent_id: defaultOwnerAgentId,
    owner_team_id: defaultOwnerTeamId,
    parent_commit_id: parsed.parent_commit_id ?? null,
    input_sha256: inputSha,
    model_version: parsed.model_version ?? null,
    prompt_version: parsed.prompt_version ?? null,
    redaction_meta: redactionMeta,
    auto_embed_effective: shouldAutoEmbed,
    force_reembed: parsed.force_reembed ?? false,
    nodes,
    edges,
    requested_trigger_topic_cluster: parsed.trigger_topic_cluster,
    requested_topic_cluster_async: parsed.topic_cluster_async,
  };
}

export async function applyMemoryWrite(
  client: pg.PoolClient,
  prepared: PreparedWrite,
  opts: ApplyWriteOptions,
): Promise<WriteResult> {
  const scope = prepared.scope;
  const actor = prepared.actor;
  const nodes = prepared.nodes;
  const edges = prepared.edges;

  // Enforce scope policy: nodes/edges should not cross scopes by default.
  // We allow node-level scope overrides, but edges must match both endpoints' scopes unless explicitly enabled.
  const localNodeScope = new Map(nodes.map((n) => [n.id, n.scope]));

  // Guard against explicit-id collisions across scopes.
  {
    const ids = nodes.map((n) => n.id);
    const existing = await fetchExistingNodeScopes(client, Array.from(new Set(ids)));
    for (const n of nodes) {
      const s = existing.get(n.id);
      if (s && s !== n.scope) {
        throw new Error(`node id collision across scopes: id=${n.id} existing.scope=${s} requested.scope=${n.scope}`);
      }
    }
  }

  const referencedExistingIds = Array.from(
    new Set(edges.flatMap((e) => [e.src_id, e.dst_id]).filter((id) => !localNodeScope.has(id))),
  );
  const existingScopes = await fetchExistingNodeScopes(client, referencedExistingIds);

  for (const e of edges) {
    const srcScope = localNodeScope.get(e.src_id) ?? existingScopes.get(e.src_id);
    const dstScope = localNodeScope.get(e.dst_id) ?? existingScopes.get(e.dst_id);
    if (!srcScope) throw new Error(`edge src_id not found (any scope): ${e.src_id}`);
    if (!dstScope) throw new Error(`edge dst_id not found (any scope): ${e.dst_id}`);

    if (!opts.allowCrossScopeEdges && (srcScope !== e.scope || dstScope !== e.scope)) {
      throw new Error(
        `cross-scope edge not allowed: edge.scope=${e.scope} src.scope=${srcScope} dst.scope=${dstScope} (set ALLOW_CROSS_SCOPE_EDGES=true to override)`,
      );
    }
  }

  const diff = {
    redaction: opts.piiRedaction ? prepared.redaction_meta : {},
    nodes: nodes.map((n) => ({
      id: n.id,
      client_id: n.client_id,
      type: n.type,
      title: n.title,
      memory_lane: n.memory_lane,
      producer_agent_id: n.producer_agent_id ?? null,
      owner_agent_id: n.owner_agent_id ?? null,
      owner_team_id: n.owner_team_id ?? null,
    })),
    edges: edges.map((e) => ({ id: e.id, type: e.type, src_id: e.src_id, dst_id: e.dst_id })),
  };

  // Compute commit chain.
  let parentHash = "";
  if (prepared.parent_commit_id) {
    const r = await client.query<{ commit_hash: string }>(
      "SELECT commit_hash FROM memory_commits WHERE id = $1 AND scope = $2",
      [prepared.parent_commit_id, scope],
    );
    if (r.rowCount !== 1) throw new Error(`parent_commit_id not found in scope ${scope}`);
    parentHash = r.rows[0].commit_hash;
  }

  const diffSha = sha256Hex(stableStringify(diff));
  const commitHash = sha256Hex(
    stableStringify({
      parentHash,
      inputSha: prepared.input_sha256,
      diffSha,
      scope,
      actor,
      model_version: prepared.model_version,
      prompt_version: prepared.prompt_version,
    }),
  );

  // Insert commit.
  const commitRes = await client.query<{ id: string }>(
    `INSERT INTO memory_commits
      (scope, parent_id, input_sha256, diff_json, actor, model_version, prompt_version, commit_hash)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
     ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
     RETURNING id`,
    [
      scope,
      prepared.parent_commit_id,
      prepared.input_sha256,
      JSON.stringify(diff),
      actor,
      prepared.model_version,
      prepared.prompt_version,
      commitHash,
    ],
  );
  const commit_id = commitRes.rows[0].id;

  // Insert nodes.
  for (const n of nodes) {
    if (n.embedding) assertDim(n.embedding, 1536);

    const embedPlanned = prepared.auto_embed_effective && !n.embedding && !!n.embed_text;
    const embeddingStatus = n.embedding ? "ready" : embedPlanned ? "pending" : "failed";
    const embeddingLastError = n.embedding
      ? null
      : embedPlanned
        ? null
        : prepared.auto_embed_effective
          ? "no_embed_text"
          : "auto_embed_disabled_or_no_provider";
    const embeddingModel = n.embedding ? (n.embedding_model?.trim() ? n.embedding_model.trim() : "client") : null;

	    await client.query(
	      `INSERT INTO memory_nodes
	        (id, scope, client_id, type, tier, title, text_summary, slots, raw_ref, evidence_ref, embedding, embedding_model,
	         memory_lane, producer_agent_id, owner_agent_id, owner_team_id,
	         embedding_status, embedding_attempts, embedding_last_error, embedding_last_attempt_at, embedding_ready_at,
	         salience, importance, confidence, redaction_version, commit_id)
	       VALUES
	        ($1, $2, $3, $4::memory_node_type, $5::memory_tier, $6, $7, $8::jsonb, $9, $10, $11::vector(1536), $12,
	         $13::memory_lane, $14, $15, $16,
	         $17::memory_embedding_status, 0, $18, NULL, CASE WHEN $11 IS NOT NULL THEN now() ELSE NULL END,
	         $19, $20, $21, $22, $23)
	       ON CONFLICT (id) DO NOTHING`,
	      [
	        n.id,
	        n.scope,
	        n.client_id ?? null,
        n.type,
        n.tier ?? "hot",
        n.title ?? null,
        n.text_summary ?? null,
        JSON.stringify(n.slots ?? {}),
        n.raw_ref ?? null,
	        n.evidence_ref ?? null,
	        n.embedding ? toVectorLiteral(n.embedding) : null,
	        embeddingModel,
          n.memory_lane,
          n.producer_agent_id ?? null,
          n.owner_agent_id ?? null,
          n.owner_team_id ?? null,
	        embeddingStatus,
	        embeddingLastError,
	        n.salience ?? 0.5,
	        n.importance ?? 0.5,
	        n.confidence ?? 0.5,
	        1,
	        commit_id,
	      ],
	    );

    // If this is a rule node, also create a rule def row (draft by default).
    if (n.type === "rule") {
      const slots = (n.slots ?? {}) as Record<string, unknown>;
      const if_json = slots["if"] ?? {};
      const then_json = slots["then"] ?? {};
      const exceptions_json = slots["exceptions"] ?? [];
      const scopeRaw = typeof slots["rule_scope"] === "string" ? String(slots["rule_scope"]).trim().toLowerCase() : "";
      const ruleScope = scopeRaw === "team" || scopeRaw === "agent" ? scopeRaw : "global";
      const targetAgentId = typeof slots["target_agent_id"] === "string" ? String(slots["target_agent_id"]).trim() : "";
      const targetTeamId = typeof slots["target_team_id"] === "string" ? String(slots["target_team_id"]).trim() : "";
      if (ruleScope === "agent" && !targetAgentId) {
        throw new Error("agent-scoped rule requires slots.target_agent_id");
      }
      if (ruleScope === "team" && !targetTeamId) {
        throw new Error("team-scoped rule requires slots.target_team_id");
      }
      await client.query(
        `INSERT INTO memory_rule_defs
          (scope, rule_node_id, state, if_json, then_json, exceptions_json, rule_scope, target_agent_id, target_team_id, commit_id)
         VALUES ($1, $2, 'draft', $3::jsonb, $4::jsonb, $5::jsonb, $6::memory_rule_scope, $7, $8, $9)
         ON CONFLICT (rule_node_id) DO NOTHING`,
        [
          n.scope,
          n.id,
          JSON.stringify(if_json),
          JSON.stringify(then_json),
          JSON.stringify(exceptions_json),
          ruleScope,
          targetAgentId || null,
          targetTeamId || null,
          commit_id,
        ],
      );
    }
  }

  // Insert edges (upsert to keep ingestion idempotent).
  for (const e of edges) {
    await client.query(
      `INSERT INTO memory_edges
        (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id)
       VALUES
        ($1, $2, $3::memory_edge_type, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
         weight = GREATEST(memory_edges.weight, EXCLUDED.weight),
         confidence = GREATEST(memory_edges.confidence, EXCLUDED.confidence),
         commit_id = EXCLUDED.commit_id,
         last_activated = now()`,
      [
        e.id,
        e.scope,
        e.type,
        e.src_id,
        e.dst_id,
        e.weight ?? 0.5,
        e.confidence ?? 0.5,
        e.decay_rate ?? 0.01,
        commit_id,
      ],
    );
  }

  const result: WriteResult = {
    tenant_id: prepared.tenant_id,
    scope: prepared.scope_public,
    commit_id,
    commit_hash: commitHash,
    nodes: nodes.map((n) => ({ id: n.id, client_id: n.client_id, type: n.type })),
    edges: edges.map((e) => ({ id: e.id, type: e.type, src_id: e.src_id, dst_id: e.dst_id })),
  };

  // Derived artifact: enqueue embedding backfill for nodes that opted into auto-embed and have embed_text.
  let enqueuedEmbedNodes = false;
  if (prepared.auto_embed_effective) {
    const embedPlanned = nodes
      .filter((n) => !n.embedding && !!n.embed_text)
      .map((n) => ({ id: n.id, text: n.embed_text as string }));

    // Avoid outbox noise: if a node already has a READY embedding, do not enqueue embed_nodes for it.
    // The handler is still idempotent, but suppressing unnecessary jobs reduces outbox churn and worker load.
    let embedNodes = embedPlanned;
    if (!prepared.force_reembed && embedNodes.length > 0) {
      const ids = embedNodes.map((n) => n.id);
      const rr = await client.query<{ id: string }>(
        `
        SELECT id
        FROM memory_nodes
        WHERE scope = $1
          AND id = ANY($2::uuid[])
          AND embedding_status = 'ready'
          AND embedding IS NOT NULL
        `,
        [scope, ids],
      );
      if (rr.rowCount && rr.rowCount > 0) {
        const ready = new Set(rr.rows.map((r) => r.id));
        embedNodes = embedNodes.filter((n) => !ready.has(n.id));
      }
    }

    if (embedNodes.length > 0) {
      const payload = { nodes: embedNodes, ...(prepared.force_reembed ? { force_reembed: true } : {}) };
      const payloadSha = sha256Hex(stableStringify(payload));
      const jobKey = sha256Hex(stableStringify({ v: 1, scope, commit_id, event_type: "embed_nodes", payloadSha }));
      await client.query(
        `INSERT INTO memory_outbox (scope, commit_id, event_type, job_key, payload_sha256, payload)
         VALUES ($1, $2, 'embed_nodes', $3, $4, $5::jsonb)
         ON CONFLICT (scope, event_type, job_key) DO NOTHING`,
        [scope, commit_id, jobKey, payloadSha, JSON.stringify(payload)],
      );
      enqueuedEmbedNodes = true;
      result.embedding_backfill = { enqueued: true, pending_nodes: embedNodes.length };
    }
  }

  // Optional: enqueue topic-cluster request (async mode) or run sync (handled by the caller for now).
  // The decision for trigger/async is made by the API handler; we only honor it if the handler sets them.
  const trigger = (prepared as any).trigger_topic_cluster === true;
  const asyncMode = (prepared as any).topic_cluster_async === true;

  if (trigger && asyncMode) {
    const eventIds = nodes.filter((n) => n.type === "event").map((n) => n.id);
    const embeddableEventIds = new Set(
      nodes.filter((n) => n.type === "event" && prepared.auto_embed_effective && !!n.embed_text).map((n) => n.id),
    );

    // Detect current embedding readiness from DB (handles idempotent retries where the node already exists and is READY).
    const readyInDb = new Set<string>();
    if (eventIds.length > 0) {
      const rr = await client.query<{ id: string }>(
        `
        SELECT id
        FROM memory_nodes
        WHERE scope = $1
          AND id = ANY($2::uuid[])
          AND embedding_status = 'ready'
          AND embedding IS NOT NULL
        `,
        [scope, eventIds],
      );
      for (const row of rr.rows) readyInDb.add(row.id);
    }

    // If force_reembed, prefer clustering after the new embedding is computed (so we don't cluster using stale vectors).
    const mustWaitForReembed = (id: string) => prepared.force_reembed && embeddableEventIds.has(id);

    const waitForEmbed: string[] = [];
    const runNow: string[] = [];
    for (const id of eventIds) {
      if (mustWaitForReembed(id)) {
        waitForEmbed.push(id);
        continue;
      }
      if (readyInDb.has(id)) {
        runNow.push(id);
        continue;
      }
      // Not ready: only cluster later if we can actually embed it.
      if (embeddableEventIds.has(id)) waitForEmbed.push(id);
    }

    // If some events are not ready (or forced) and we enqueued embed_nodes, attach event ids so worker can enqueue clustering after backfill.
    if (waitForEmbed.length > 0 && enqueuedEmbedNodes) {
      await client.query(
        `UPDATE memory_outbox
         SET payload = payload || jsonb_build_object('after_topic_cluster_event_ids', $3::jsonb)
         WHERE scope=$1 AND commit_id=$2 AND event_type='embed_nodes'`,
        [scope, commit_id, JSON.stringify(waitForEmbed)],
      );
      result.topic_cluster = { enqueued: true };
    }

    // Enqueue clustering immediately for ready events.
    if (runNow.length > 0) {
      const payload = { event_ids: runNow };
      const payloadSha = sha256Hex(stableStringify(payload));
      const jobKey = sha256Hex(stableStringify({ v: 1, scope, commit_id, event_type: "topic_cluster", payloadSha }));
      await client.query(
        `INSERT INTO memory_outbox (scope, commit_id, event_type, job_key, payload_sha256, payload)
         VALUES ($1, $2, 'topic_cluster', $3, $4, $5::jsonb)
         ON CONFLICT (scope, event_type, job_key) DO NOTHING`,
        [scope, commit_id, jobKey, payloadSha, JSON.stringify(payload)],
      );
      result.topic_cluster = { enqueued: true };
    }
  }

  if (opts.shadowDualWriteEnabled) {
    try {
      const copied = await mirrorCommitArtifactsToShadowV2(client, scope, commit_id);
      result.shadow_dual_write = {
        enabled: true,
        strict: opts.shadowDualWriteStrict,
        mirrored: true,
        copied,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.shadow_dual_write = {
        enabled: true,
        strict: opts.shadowDualWriteStrict,
        mirrored: false,
        error: msg,
      };
      if (opts.shadowDualWriteStrict) {
        throw new Error(`shadow dual-write failed: ${msg}`);
      }
    }
  }

  return result;
}

async function mirrorCommitArtifactsToShadowV2(
  client: pg.PoolClient,
  scope: string,
  commitId: string,
): Promise<{ commits: number; nodes: number; edges: number; outbox: number }> {
  // Best effort: create scope partitions if scaffold function exists.
  try {
    await client.query("SELECT aionis_partition_ensure_scope($1)", [scope]);
  } catch {
    // noop: fall back to default partitions if available
  }

  const commitsRes = await client.query(
    `
    INSERT INTO memory_commits_v2
    SELECT *
    FROM memory_commits
    WHERE scope = $1
      AND id = $2
    ON CONFLICT DO NOTHING
    `,
    [scope, commitId],
  );

  const nodesRes = await client.query(
    `
    INSERT INTO memory_nodes_v2
    SELECT *
    FROM memory_nodes
    WHERE scope = $1
      AND commit_id = $2
    ON CONFLICT DO NOTHING
    `,
    [scope, commitId],
  );

  const edgesRes = await client.query(
    `
    INSERT INTO memory_edges_v2
    SELECT *
    FROM memory_edges
    WHERE scope = $1
      AND commit_id = $2
    ON CONFLICT DO NOTHING
    `,
    [scope, commitId],
  );

  const outboxRes = await client.query(
    `
    INSERT INTO memory_outbox_v2
    SELECT *
    FROM memory_outbox
    WHERE scope = $1
      AND commit_id = $2
    ON CONFLICT DO NOTHING
    `,
    [scope, commitId],
  );

  return {
    commits: commitsRes.rowCount ?? 0,
    nodes: nodesRes.rowCount ?? 0,
    edges: edgesRes.rowCount ?? 0,
    outbox: outboxRes.rowCount ?? 0,
  };
}
