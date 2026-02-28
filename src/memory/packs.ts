import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { badRequest } from "../util/http.js";
import { resolveTenantScope } from "./tenant.js";
import { applyMemoryWrite, prepareMemoryWrite } from "./write.js";
import { createPostgresWriteStoreAccess } from "../store/write-access.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import { MemoryPackExportRequest, MemoryPackImportRequest } from "./schemas.js";
import type { EmbeddingProvider } from "../embeddings/types.js";

type PackOptions = {
  defaultScope: string;
  defaultTenantId: string;
  maxTextLen: number;
  piiRedaction: boolean;
  allowCrossScopeEdges: boolean;
  shadowDualWriteEnabled: boolean;
  shadowDualWriteStrict: boolean;
  writeAccessShadowMirrorV2: boolean;
  embedder: EmbeddingProvider | null;
  embeddedRuntime?: EmbeddedMemoryRuntime | null;
};

type ExportNodeRow = {
  id: string;
  client_id: string | null;
  type: string;
  tier: string;
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  title: string | null;
  text_summary: string | null;
  slots: any;
  raw_ref: string | null;
  evidence_ref: string | null;
  salience: number;
  importance: number;
  confidence: number;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
};

type ExportEdgeRow = {
  id: string;
  type: string;
  src_id: string;
  dst_id: string;
  src_client_id: string | null;
  dst_client_id: string | null;
  weight: number;
  confidence: number;
  decay_rate: number;
  created_at: string;
  commit_id: string | null;
};

type ExportCommitRow = {
  id: string;
  parent_id: string | null;
  input_sha256: string;
  actor: string;
  model_version: string | null;
  prompt_version: string | null;
  created_at: string;
  commit_hash: string;
};

function computePackHash(payload: unknown): string {
  return sha256Hex(stableStringify(payload));
}

export async function exportMemoryPack(client: pg.PoolClient, body: unknown, opts: PackOptions) {
  const parsed = MemoryPackExportRequest.parse(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const maxRows = parsed.max_rows;

  let nodes: ExportNodeRow[] = [];
  let edges: ExportEdgeRow[] = [];
  let commits: ExportCommitRow[] = [];
  let nodesHasMore = false;
  let edgesHasMore = false;
  let commitsHasMore = false;

  if (opts.embeddedRuntime) {
    const snapshot = opts.embeddedRuntime.exportPackSnapshot({
      scope: tenancy.scope_key,
      includeNodes: parsed.include_nodes,
      includeEdges: parsed.include_edges,
      includeCommits: parsed.include_commits,
      maxRows,
    });
    nodes = snapshot.nodes.map((n) => ({
      id: n.id,
      client_id: n.client_id,
      type: n.type,
      tier: n.tier,
      memory_lane: n.memory_lane,
      producer_agent_id: n.producer_agent_id,
      owner_agent_id: n.owner_agent_id,
      owner_team_id: n.owner_team_id,
      title: n.title,
      text_summary: n.text_summary,
      slots: n.slots,
      raw_ref: n.raw_ref,
      evidence_ref: n.evidence_ref,
      salience: n.salience,
      importance: n.importance,
      confidence: n.confidence,
      created_at: n.created_at,
      updated_at: n.updated_at,
      commit_id: n.commit_id,
    }));
    edges = snapshot.edges.map((e) => ({
      id: e.id,
      type: e.type,
      src_id: e.src_id,
      dst_id: e.dst_id,
      src_client_id: e.src_client_id,
      dst_client_id: e.dst_client_id,
      weight: e.weight,
      confidence: e.confidence,
      decay_rate: e.decay_rate,
      created_at: e.created_at,
      commit_id: e.commit_id,
    }));
    commits = snapshot.commits.map((c) => ({
      id: c.id,
      parent_id: c.parent_id,
      input_sha256: c.input_sha256,
      actor: c.actor,
      model_version: c.model_version,
      prompt_version: c.prompt_version,
      created_at: c.created_at,
      commit_hash: c.commit_hash,
    }));
    nodesHasMore = snapshot.truncated.nodes;
    edgesHasMore = snapshot.truncated.edges;
    commitsHasMore = snapshot.truncated.commits;
  } else if (parsed.include_nodes) {
    const rr = await client.query<ExportNodeRow>(
      `
      SELECT
        n.id::text AS id,
        n.client_id,
        n.type::text AS type,
        n.tier::text AS tier,
        n.memory_lane::text AS memory_lane,
        n.producer_agent_id,
        n.owner_agent_id,
        n.owner_team_id,
        n.title,
        n.text_summary,
        n.slots,
        n.raw_ref,
        n.evidence_ref,
        n.salience,
        n.importance,
        n.confidence,
        n.created_at::text AS created_at,
        n.updated_at::text AS updated_at,
        n.commit_id::text AS commit_id
      FROM memory_nodes n
      WHERE n.scope = $1
      ORDER BY n.created_at ASC, n.id ASC
      LIMIT $2
      `,
      [tenancy.scope_key, maxRows + 1],
    );
    nodesHasMore = rr.rows.length > maxRows;
    nodes = nodesHasMore ? rr.rows.slice(0, maxRows) : rr.rows;
  }

  if (!opts.embeddedRuntime && parsed.include_edges) {
    const rr = await client.query<ExportEdgeRow>(
      `
      SELECT
        e.id::text AS id,
        e.type::text AS type,
        e.src_id::text AS src_id,
        e.dst_id::text AS dst_id,
        s.client_id AS src_client_id,
        d.client_id AS dst_client_id,
        e.weight,
        e.confidence,
        e.decay_rate,
        e.created_at::text AS created_at,
        e.commit_id::text AS commit_id
      FROM memory_edges e
      JOIN memory_nodes s ON s.id = e.src_id
      JOIN memory_nodes d ON d.id = e.dst_id
      WHERE e.scope = $1
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT $2
      `,
      [tenancy.scope_key, maxRows + 1],
    );
    edgesHasMore = rr.rows.length > maxRows;
    edges = edgesHasMore ? rr.rows.slice(0, maxRows) : rr.rows;
  }

  if (!opts.embeddedRuntime && parsed.include_commits) {
    const rr = await client.query<ExportCommitRow>(
      `
      SELECT
        c.id::text AS id,
        c.parent_id::text AS parent_id,
        c.input_sha256,
        c.actor,
        c.model_version,
        c.prompt_version,
        c.created_at::text AS created_at,
        c.commit_hash
      FROM memory_commits c
      WHERE c.scope = $1
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT $2
      `,
      [tenancy.scope_key, maxRows + 1],
    );
    commitsHasMore = rr.rows.length > maxRows;
    commits = commitsHasMore ? rr.rows.slice(0, maxRows) : rr.rows;
  }

  const pack = {
    version: "aionis_pack_v1" as const,
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    nodes: parsed.include_meta ? nodes : nodes.map((n) => ({ id: n.id, client_id: n.client_id, type: n.type, title: n.title, text_summary: n.text_summary, slots: n.slots })),
    edges: parsed.include_meta ? edges : edges.map((e) => ({ id: e.id, type: e.type, src_id: e.src_id, dst_id: e.dst_id, src_client_id: e.src_client_id, dst_client_id: e.dst_client_id, weight: e.weight, confidence: e.confidence })),
    commits: parsed.include_meta ? commits : commits.map((c) => ({ id: c.id, parent_id: c.parent_id, commit_hash: c.commit_hash })),
  };
  const packHash = computePackHash(pack);

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    manifest: {
      version: "aionis_pack_manifest_v1",
      pack_version: pack.version,
      sha256: packHash,
      generated_at: new Date().toISOString(),
      counts: {
        nodes: pack.nodes.length,
        edges: pack.edges.length,
        commits: pack.commits.length,
      },
      truncated: {
        nodes: nodesHasMore,
        edges: edgesHasMore,
        commits: commitsHasMore,
      },
      max_rows: maxRows,
    },
    pack,
  };
}

export async function importMemoryPack(client: pg.PoolClient, body: unknown, opts: PackOptions) {
  const parsed = MemoryPackImportRequest.parse(body);
  const pack = parsed.pack;
  const packHash = computePackHash(pack);
  if (parsed.manifest_sha256 && parsed.manifest_sha256 !== packHash) {
    badRequest("pack_hash_mismatch", "manifest_sha256 does not match pack payload hash", {
      expected: parsed.manifest_sha256,
      actual: packHash,
    });
  }

  const tenantId = (parsed.tenant_id ?? pack.tenant_id).trim();
  const scope = (parsed.scope ?? pack.scope).trim();
  if (parsed.tenant_id && parsed.tenant_id.trim() !== pack.tenant_id) {
    badRequest("pack_scope_mismatch", "tenant_id conflicts with pack tenant_id");
  }
  if (parsed.scope && parsed.scope.trim() !== pack.scope) {
    badRequest("pack_scope_mismatch", "scope conflicts with pack scope");
  }

  const nodeClientById = new Map<string, string>();
  const shortHash = packHash.slice(0, 16);
  const nodes = pack.nodes.map((n) => {
    const cid = n.client_id?.trim() || `pack:${shortHash}:node:${n.id}`;
    nodeClientById.set(n.id, cid);
    return {
      client_id: cid,
      type: n.type,
      tier: n.tier,
      memory_lane: n.memory_lane,
      producer_agent_id: n.producer_agent_id ?? undefined,
      owner_agent_id: n.owner_agent_id ?? undefined,
      owner_team_id: n.owner_team_id ?? undefined,
      title: n.title ?? undefined,
      text_summary: n.text_summary ?? undefined,
      slots: n.slots ?? {},
      raw_ref: n.raw_ref ?? undefined,
      evidence_ref: n.evidence_ref ?? undefined,
      salience: n.salience,
      importance: n.importance,
      confidence: n.confidence,
    };
  });

  const edges = pack.edges.map((e) => {
    const srcClient = e.src_client_id?.trim() || nodeClientById.get(e.src_id);
    const dstClient = e.dst_client_id?.trim() || nodeClientById.get(e.dst_id);
    if (!srcClient || !dstClient) {
      badRequest("pack_edge_reference_missing", "edge references missing src/dst client mapping", {
        edge_id: e.id,
        src_id: e.src_id,
        dst_id: e.dst_id,
      });
    }
    return {
      type: e.type,
      src: { client_id: srcClient },
      dst: { client_id: dstClient },
      weight: e.weight,
      confidence: e.confidence,
      decay_rate: e.decay_rate,
    };
  });

  if (parsed.verify_only) {
    return {
      ok: true,
      verified: true,
      imported: false,
      tenant_id: tenantId,
      scope,
      pack_sha256: packHash,
      planned: {
        nodes: nodes.length,
        edges: edges.length,
        commits_in_pack: pack.commits.length,
      },
    };
  }

  const writeReq = {
    tenant_id: tenantId,
    scope,
    actor: parsed.actor ?? "pack_import",
    input_text: `pack import ${packHash}`,
    auto_embed: parsed.auto_embed,
    nodes,
    edges,
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
    write_access: createPostgresWriteStoreAccess(client, {
      capabilities: { shadow_mirror_v2: opts.writeAccessShadowMirrorV2 },
    }),
  });
  if (opts.embeddedRuntime) await opts.embeddedRuntime.applyWrite(prepared as any, out as any);

  return {
    ok: true,
    verified: true,
    imported: true,
    tenant_id: out.tenant_id ?? tenantId,
    scope: out.scope ?? scope,
    pack_sha256: packHash,
    commit_id: out.commit_id,
    commit_hash: out.commit_hash,
    nodes: out.nodes.length,
    edges: out.edges.length,
    embedding_backfill: out.embedding_backfill ?? null,
  };
}
