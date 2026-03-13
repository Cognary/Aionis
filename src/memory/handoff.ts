import type pg from "pg";
import { memoryFind, memoryFindLite } from "./find.js";
import { memoryResolve, memoryResolveLite } from "./resolve.js";
import {
  HandoffRecoverRequest,
  HandoffStoreRequest,
  type HandoffRecoverInput,
  type MemoryFindInput,
  type MemoryResolveInput,
  type MemoryWriteInput,
} from "./schemas.js";
import { HttpError } from "../util/http.js";

type LiteWriteStoreLike = {
  findNodes: (...args: any[]) => Promise<any>;
  resolveNode: (...args: any[]) => Promise<any>;
};

type HandoffNode = {
  id: string;
  uri: string;
  title: string | null;
  text_summary: string | null;
  slots?: Record<string, unknown>;
  commit_id?: string | null;
  commit_uri?: string | null;
  memory_lane?: "private" | "shared";
};

type HandoffFindCandidate = {
  id?: string;
  uri?: string;
  created_at?: string;
  updated_at?: string;
};

function stringifyChecks(checks: string[] | undefined): string | null {
  return checks && checks.length > 0 ? checks.join(" | ") : null;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const out = value.trim();
  return out.length > 0 ? out : undefined;
}

export function buildHandoffWriteBody(input: unknown): MemoryWriteInput {
  const parsed = HandoffStoreRequest.parse(input);
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const producerAgentId = normalizeOptionalString(typeof raw.producer_agent_id === "string" ? raw.producer_agent_id : undefined);
  const ownerAgentId = normalizeOptionalString(typeof raw.owner_agent_id === "string" ? raw.owner_agent_id : undefined);
  const ownerTeamId = normalizeOptionalString(typeof raw.owner_team_id === "string" ? raw.owner_team_id : undefined);
  const handoffText = [
    `anchor=${parsed.anchor}`,
    `file=${parsed.file_path}`,
    parsed.repo_root ? `repo_root=${parsed.repo_root}` : null,
    parsed.symbol ? `symbol=${parsed.symbol}` : null,
    `kind=${parsed.handoff_kind}`,
    parsed.risk ? `risk=${parsed.risk}` : null,
    `summary=${parsed.summary}`,
    `handoff=${parsed.handoff_text}`,
    stringifyChecks(parsed.acceptance_checks) ? `acceptance_checks=${stringifyChecks(parsed.acceptance_checks)}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    actor: parsed.actor,
    memory_lane: parsed.memory_lane,
    ...(producerAgentId ? { producer_agent_id: producerAgentId } : {}),
    ...(ownerAgentId ? { owner_agent_id: ownerAgentId } : {}),
    ...(ownerTeamId ? { owner_team_id: ownerTeamId } : {}),
    input_text: handoffText,
    edges: [],
    nodes: [
      {
        type: "event",
        title: parsed.title ?? `Handoff ${parsed.anchor}`,
        text_summary: parsed.summary,
        slots: {
          summary_kind: "handoff",
          handoff_kind: parsed.handoff_kind,
          anchor: parsed.anchor,
          file_path: parsed.file_path,
          repo_root: parsed.repo_root,
          symbol: parsed.symbol,
          risk: parsed.risk,
          handoff_text: parsed.handoff_text,
          acceptance_checks: parsed.acceptance_checks ?? [],
          tags: parsed.tags ?? [],
        },
      },
    ],
  };
}

function normalizeRecoveredHandoff(node: HandoffNode, matchedNodes: number, input: HandoffRecoverInput) {
  const slots = node.slots && typeof node.slots === "object" ? node.slots : {};
  const acceptanceChecks = Array.isArray(slots.acceptance_checks)
    ? slots.acceptance_checks.filter((value): value is string => typeof value === "string")
    : [];
  const tags = Array.isArray(slots.tags) ? slots.tags.filter((value): value is string => typeof value === "string") : [];
  return {
    handoff_kind: String(slots.handoff_kind ?? input.handoff_kind),
    anchor: String(slots.anchor ?? input.anchor),
    matched_nodes: matchedNodes,
    handoff: {
      id: node.id,
      uri: node.uri,
      title: node.title,
      summary: node.text_summary,
      handoff_text: typeof slots.handoff_text === "string" ? slots.handoff_text : "",
      file_path: typeof slots.file_path === "string" ? slots.file_path : null,
      repo_root: typeof slots.repo_root === "string" ? slots.repo_root : null,
      symbol: typeof slots.symbol === "string" ? slots.symbol : null,
      risk: typeof slots.risk === "string" ? slots.risk : null,
      acceptance_checks: acceptanceChecks,
      tags,
      memory_lane: node.memory_lane ?? null,
      commit_id: node.commit_id ?? null,
      commit_uri: node.commit_uri ?? null,
    },
  };
}

function compareIsoDesc(a?: string, b?: string): number {
  const aMs = typeof a === "string" ? Date.parse(a) : Number.NaN;
  const bMs = typeof b === "string" ? Date.parse(b) : Number.NaN;
  const aValid = Number.isFinite(aMs);
  const bValid = Number.isFinite(bMs);
  if (aValid && bValid && aMs !== bMs) return bMs - aMs;
  if (aValid !== bValid) return aValid ? -1 : 1;
  return 0;
}

function pickLatestHandoffCandidate(nodes: unknown[]): HandoffFindCandidate | null {
  const candidates = nodes.filter((node): node is HandoffFindCandidate => Boolean(node && typeof node === "object"));
  if (candidates.length === 0) return null;
  return candidates
    .slice()
    .sort(
      (a, b) =>
        compareIsoDesc(a.updated_at, b.updated_at) ||
        compareIsoDesc(a.created_at, b.created_at) ||
        String(b.id ?? "").localeCompare(String(a.id ?? "")),
    )[0]!;
}

export async function recoverHandoff(args: {
  client?: pg.PoolClient;
  liteWriteStore?: LiteWriteStoreLike | null;
  input: unknown;
  defaultScope: string;
  defaultTenantId: string;
  consumerAgentId?: string | null;
  consumerTeamId?: string | null;
}) {
  const parsed = HandoffRecoverRequest.parse(args.input);
  const normalizedFilePath = normalizeOptionalString(parsed.file_path);
  const normalizedSymbol = normalizeOptionalString(parsed.symbol);
  const consumerAgentId = normalizeOptionalString(args.consumerAgentId ?? undefined) ?? null;
  const consumerTeamId = normalizeOptionalString(args.consumerTeamId ?? undefined) ?? null;
  const findInput: MemoryFindInput = {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    type: "event",
    memory_lane: parsed.memory_lane,
    ...(consumerAgentId ? { consumer_agent_id: consumerAgentId } : {}),
    ...(consumerTeamId ? { consumer_team_id: consumerTeamId } : {}),
    include_meta: true,
    include_slots: false,
    include_slots_preview: true,
    slots_preview_keys: 20,
    limit: parsed.limit,
    offset: 0,
    slots_contains: {
      summary_kind: "handoff",
      handoff_kind: parsed.handoff_kind,
      anchor: parsed.anchor,
      ...(normalizedFilePath ? { file_path: normalizedFilePath } : {}),
      ...(normalizedSymbol ? { symbol: normalizedSymbol } : {}),
    },
  };

  const findResult = args.liteWriteStore
    ? await memoryFindLite(args.liteWriteStore as any, findInput, args.defaultScope, args.defaultTenantId)
    : await memoryFind(args.client!, findInput, args.defaultScope, args.defaultTenantId);

  const matchedNodeList = Array.isArray(findResult.nodes) ? findResult.nodes : [];
  const matchedNodes = matchedNodeList.length;
  const topNode = pickLatestHandoffCandidate(matchedNodeList);
  if (!topNode || typeof topNode.uri !== "string") {
    throw new HttpError(404, "handoff_not_found", "handoff was not found in this scope", {
      anchor: parsed.anchor,
      file_path: parsed.file_path ?? null,
      symbol: parsed.symbol ?? null,
      handoff_kind: parsed.handoff_kind,
      scope: findResult.scope,
      tenant_id: findResult.tenant_id,
    });
  }

  const resolveInput: MemoryResolveInput = {
    tenant_id: findResult.tenant_id,
    scope: findResult.scope,
    uri: topNode.uri,
    ...(consumerAgentId ? { consumer_agent_id: consumerAgentId } : {}),
    ...(consumerTeamId ? { consumer_team_id: consumerTeamId } : {}),
    include_meta: true,
    include_slots: true,
    include_slots_preview: false,
    slots_preview_keys: 10,
  };

  const resolved = args.liteWriteStore
    ? await memoryResolveLite(args.liteWriteStore as any, resolveInput, args.defaultScope, args.defaultTenantId)
    : await memoryResolve(args.client!, resolveInput, args.defaultScope, args.defaultTenantId);

  if (!resolved || typeof resolved !== "object" || !("node" in resolved) || !resolved.node) {
    throw new HttpError(500, "handoff_resolve_invalid", "handoff resolve did not return a node payload", {
      anchor: parsed.anchor,
      scope: findResult.scope,
      tenant_id: findResult.tenant_id,
      resolved_type: resolved && typeof resolved === "object" && "type" in resolved ? (resolved as any).type : null,
    });
  }

  return {
    tenant_id: findResult.tenant_id,
    scope: findResult.scope,
    ...normalizeRecoveredHandoff(resolved.node as HandoffNode, matchedNodes, parsed),
  };
}
