import type pg from "pg";
import type { EmbeddingProvider } from "../embeddings/types.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import { createPostgresWriteStoreAccess, type WriteStoreAccess } from "../store/write-access.js";
import { applyMemoryWrite, prepareMemoryWrite } from "./write.js";

export type ReplayMirrorNodeRecord = {
  node_id: string;
  scope: string;
  replay_kind: string;
  run_id: string | null;
  step_id: string | null;
  step_index: number | null;
  playbook_id: string | null;
  version_num: number | null;
  playbook_status: string | null;
  node_type: string;
  title: string | null;
  text_summary: string | null;
  slots_json: string;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
};

export type ReplayWriteMirror = {
  upsertReplayNodes(entries: ReplayMirrorNodeRecord[]): Promise<void>;
};

export type ReplayMemoryWriteOptions = {
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
  replayMirror?: ReplayWriteMirror | null;
  writeAccess?: WriteStoreAccess | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIntOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function extractReplayMirrorNodes(writeReq: unknown, out: Awaited<ReturnType<typeof applyMemoryWrite>>): ReplayMirrorNodeRecord[] {
  const body = asObject(writeReq);
  const scope = toStringOrNull(body?.scope) ?? "default";
  const nodesRaw = Array.isArray(body?.nodes) ? body?.nodes : [];
  const persistedIds = new Map<string, string>();
  for (const row of out.nodes) {
    if (row.client_id) persistedIds.set(String(row.client_id), row.id);
  }
  const nowIso = new Date().toISOString();
  const records: ReplayMirrorNodeRecord[] = [];
  for (const raw of nodesRaw) {
    const node = asObject(raw);
    const slots = asObject(node?.slots);
    const replayKind = toStringOrNull(slots?.replay_kind);
    if (!node || !slots || !replayKind) continue;
    const clientId = toStringOrNull(node.client_id);
    const nodeId = clientId ? persistedIds.get(clientId) : null;
    if (!nodeId) continue;
    records.push({
      node_id: nodeId,
      scope,
      replay_kind: replayKind,
      run_id: toStringOrNull(slots.run_id),
      step_id: toStringOrNull(slots.step_id),
      step_index: toIntOrNull(slots.step_index),
      playbook_id: toStringOrNull(slots.playbook_id),
      version_num: toIntOrNull(slots.version),
      playbook_status: toStringOrNull(slots.status),
      node_type: toStringOrNull(node.type) ?? "event",
      title: toStringOrNull(node.title),
      text_summary: toStringOrNull(node.text_summary),
      slots_json: JSON.stringify(slots),
      created_at: nowIso,
      updated_at: nowIso,
      commit_id: out.commit_id ?? null,
    });
  }
  return records;
}

export async function applyReplayMemoryWrite(
  client: pg.PoolClient,
  writeReq: unknown,
  opts: ReplayMemoryWriteOptions,
): Promise<{
  prepared: unknown;
  out: Awaited<ReturnType<typeof applyMemoryWrite>>;
}> {
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
    write_access: opts.writeAccess ?? createPostgresWriteStoreAccess(client, {
      capabilities: { shadow_mirror_v2: opts.writeAccessShadowMirrorV2 },
    }),
  });
  if (opts.embeddedRuntime) await opts.embeddedRuntime.applyWrite(prepared as any, out as any);
  if (opts.replayMirror) {
    const replayNodes = extractReplayMirrorNodes(writeReq, out);
    if (replayNodes.length > 0) {
      await opts.replayMirror.upsertReplayNodes(replayNodes);
    }
  }
  return { prepared, out };
}
