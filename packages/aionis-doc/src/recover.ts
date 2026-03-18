import { z } from "zod";

import {
  AionisDocHandoffStoreRequestSchema,
  type AionisDocHandoffStoreRequest,
} from "./handoff-store.js";
import {
  publishAionisDocSource,
  publishHandoffStoreRequest,
  publishRuntimeHandoff,
  PublishInputKindSchema,
  PublishResultSchema,
  type AionisDocPublishResult,
} from "./publish.js";
import { AionisDocRuntimeHandoffSchema } from "./runtime-handoff.js";

export const AIONIS_DOC_RECOVER_RESULT_VERSION = "aionis_doc_recover_result_v1" as const;

export const RecoverInputKindSchema = z.enum([
  ...PublishInputKindSchema.options,
  "publish-result",
]);
export type RecoverInputKind = z.infer<typeof RecoverInputKindSchema>;

export const HandoffRecoverRequestSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  anchor: z.string().min(1),
  repo_root: z.string().min(1).optional(),
  file_path: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  handoff_kind: z.enum(["patch_handoff", "review_handoff", "task_handoff"]).optional(),
  memory_lane: z.enum(["private", "shared"]).optional(),
  limit: z.number().int().positive().optional(),
});
export type AionisDocRecoverRequest = z.infer<typeof HandoffRecoverRequestSchema>;

export const HandoffRecoverPayloadSchema = z.object({
  tenant_id: z.string().min(1),
  scope: z.string().min(1),
  handoff_kind: z.string().min(1),
  anchor: z.string().min(1),
  matched_nodes: z.number().int().nonnegative(),
  handoff: z.record(z.unknown()),
  prompt_safe_handoff: z.record(z.unknown()).optional(),
  execution_ready_handoff: z.record(z.unknown()).optional(),
  execution_result_summary: z.record(z.unknown()).optional(),
  execution_artifacts: z.array(z.record(z.unknown())).optional(),
  execution_evidence: z.array(z.record(z.unknown())).optional(),
  execution_state_v1: z.record(z.unknown()).optional(),
  execution_packet_v1: z.record(z.unknown()).optional(),
  control_profile_v1: z.record(z.unknown()).optional(),
  execution_transitions_v1: z.array(z.record(z.unknown())).optional(),
});
export type AionisDocRecoveredHandoffPayload = z.infer<typeof HandoffRecoverPayloadSchema>;

export const RecoverResultSchema = z.object({
  recover_result_version: z.literal(AIONIS_DOC_RECOVER_RESULT_VERSION),
  recovered_at: z.string().min(1),
  base_url: z.string().min(1),
  input_kind: RecoverInputKindSchema,
  source_doc_id: z.string().min(1).nullable(),
  source_doc_version: z.string().min(1).nullable(),
  publish_result: PublishResultSchema.nullable(),
  recover_request: HandoffRecoverRequestSchema,
  recover_response: z.object({
    status: z.number().int().nonnegative(),
    request_id: z.string().nullable(),
    data: HandoffRecoverPayloadSchema,
  }),
});
export type AionisDocRecoverResult = z.infer<typeof RecoverResultSchema>;

type SharedNetworkOptions = {
  baseUrl: string;
  timeoutMs?: number;
  apiKey?: string;
  authBearer?: string;
  adminToken?: string;
  requestId?: string;
  recoveredAt?: string;
};

type RecoverOverrides = {
  tenantId?: string;
  scope?: string;
  memoryLane?: "private" | "shared";
  repoRoot?: string | null;
  filePath?: string | null;
  symbol?: string | null;
  handoffKind?: "patch_handoff" | "review_handoff" | "task_handoff";
  limit?: number;
};

type RecoverFromSourceOptions = SharedNetworkOptions &
  RecoverOverrides & {
    source: string;
    inputPath: string;
    actor?: string;
    title?: string;
    tags?: string[];
    currentStage?: "triage" | "patch" | "review" | "resume";
    activeRole?: "orchestrator" | "triage" | "patch" | "review" | "resume";
    allowCompileErrors?: boolean;
  };

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function withTimeout(timeoutMs: number): { signal?: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json")) return res.json();
  const text = await res.text();
  return text.length > 0 ? text : null;
}

function buildHeaders(args: {
  apiKey?: string;
  authBearer?: string;
  adminToken?: string;
  requestId?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (args.apiKey) headers["x-api-key"] = args.apiKey;
  if (args.adminToken) headers["x-admin-token"] = args.adminToken;
  if (args.authBearer) {
    headers.authorization = args.authBearer.toLowerCase().startsWith("bearer ")
      ? args.authBearer
      : `Bearer ${args.authBearer}`;
  }
  if (args.requestId) headers["x-request-id"] = args.requestId;
  return headers;
}

function extractRequestId(headers: Headers): string | null {
  return headers.get("x-request-id") ?? headers.get("request-id") ?? null;
}

function firstString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function firstMemoryLane(...values: Array<unknown>): "private" | "shared" | undefined {
  for (const value of values) {
    if (value === "private" || value === "shared") return value;
  }
  return undefined;
}

function maybeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function buildRecoverRequestFromPublishResult(
  publishResult: AionisDocPublishResult,
  overrides: RecoverOverrides,
): AionisDocRecoverRequest {
  const storeRequest = maybeRecord(publishResult.handoff_store_request);
  return HandoffRecoverRequestSchema.parse({
    tenant_id: overrides.tenantId ?? firstString(storeRequest?.tenant_id),
    scope: overrides.scope ?? firstString(publishResult.response.scope, publishResult.request.scope, storeRequest?.scope),
    anchor: firstString(
      publishResult.response.handoff_anchor,
      publishResult.request.anchor,
      storeRequest?.anchor,
    ),
    repo_root: firstString(overrides.repoRoot, storeRequest?.repo_root),
    file_path: firstString(overrides.filePath, storeRequest?.file_path),
    symbol: firstString(overrides.symbol, storeRequest?.symbol),
    handoff_kind:
      overrides.handoffKind ??
      firstString(publishResult.response.handoff_kind, publishResult.request.handoff_kind, storeRequest?.handoff_kind),
    memory_lane: firstMemoryLane(overrides.memoryLane, publishResult.request.memory_lane, storeRequest?.memory_lane),
    limit: overrides.limit,
  });
}

export async function recoverPublishedAionisDoc(args: {
  publishResult: unknown;
  inputKind?: RecoverInputKind;
} & SharedNetworkOptions &
  RecoverOverrides): Promise<AionisDocRecoverResult> {
  const publishResult = PublishResultSchema.parse(args.publishResult);
  const request = buildRecoverRequestFromPublishResult(publishResult, args);
  const timeoutMs = args.timeoutMs ?? 10_000;
  const timeout = withTimeout(timeoutMs);
  const url = joinUrl(args.baseUrl, "/v1/handoff/recover");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders({
        apiKey: args.apiKey,
        authBearer: args.authBearer,
        adminToken: args.adminToken,
        requestId: args.requestId,
      }),
      body: JSON.stringify(request),
      signal: timeout.signal,
    });
    const body = await parseResponseBody(res);
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof (body as Record<string, unknown>).message === "string"
          ? String((body as Record<string, unknown>).message)
          : `handoff recover failed with status ${res.status}`;
      throw new Error(message);
    }
    return RecoverResultSchema.parse({
      recover_result_version: AIONIS_DOC_RECOVER_RESULT_VERSION,
      recovered_at: args.recoveredAt ?? new Date().toISOString(),
      base_url: args.baseUrl,
      input_kind: args.inputKind ?? "publish-result",
      source_doc_id: publishResult.source_doc_id,
      source_doc_version: publishResult.source_doc_version,
      publish_result: publishResult,
      recover_request: request,
      recover_response: {
        status: res.status,
        request_id: extractRequestId(res.headers),
        data: HandoffRecoverPayloadSchema.parse(body),
      },
    });
  } finally {
    timeout.cancel();
  }
}

export async function recoverAionisDocSource(args: RecoverFromSourceOptions): Promise<AionisDocRecoverResult> {
  const publishResult = await publishAionisDocSource({
    source: args.source,
    inputPath: args.inputPath,
    baseUrl: args.baseUrl,
    scope: args.scope,
    tenantId: args.tenantId,
    actor: args.actor,
    memoryLane: args.memoryLane,
    title: args.title,
    tags: args.tags,
    repoRoot: args.repoRoot,
    filePath: args.filePath,
    symbol: args.symbol,
    currentStage: args.currentStage,
    activeRole: args.activeRole,
    allowCompileErrors: args.allowCompileErrors,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    publishedAt: args.recoveredAt,
  });
  return recoverPublishedAionisDoc({
    publishResult,
    inputKind: "source",
    baseUrl: args.baseUrl,
    tenantId: args.tenantId,
    scope: args.scope,
    memoryLane: args.memoryLane,
    repoRoot: args.repoRoot,
    filePath: args.filePath,
    symbol: args.symbol,
    handoffKind: args.handoffKind,
    limit: args.limit,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    recoveredAt: args.recoveredAt,
  });
}

export async function recoverRuntimeHandoff(args: {
  runtimeHandoff: unknown;
} & Omit<RecoverFromSourceOptions, "source" | "inputPath">): Promise<AionisDocRecoverResult> {
  const runtimeHandoff = AionisDocRuntimeHandoffSchema.parse(args.runtimeHandoff);
  const publishResult = await publishRuntimeHandoff({
    runtimeHandoff,
    baseUrl: args.baseUrl,
    scope: args.scope,
    tenantId: args.tenantId,
    actor: args.actor,
    memoryLane: args.memoryLane,
    title: args.title,
    tags: args.tags,
    repoRoot: args.repoRoot,
    filePath: args.filePath,
    symbol: args.symbol,
    currentStage: args.currentStage,
    activeRole: args.activeRole,
    allowCompileErrors: args.allowCompileErrors,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    publishedAt: args.recoveredAt,
  });
  return recoverPublishedAionisDoc({
    publishResult,
    inputKind: "runtime-handoff",
    baseUrl: args.baseUrl,
    tenantId: args.tenantId,
    scope: args.scope,
    memoryLane: args.memoryLane,
    repoRoot: args.repoRoot,
    filePath: args.filePath,
    symbol: args.symbol,
    handoffKind: args.handoffKind,
    limit: args.limit,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    recoveredAt: args.recoveredAt,
  });
}

export async function recoverHandoffStoreRequest(args: {
  handoffStoreRequest: unknown;
} & SharedNetworkOptions &
  RecoverOverrides): Promise<AionisDocRecoverResult> {
  const handoffStoreRequest = AionisDocHandoffStoreRequestSchema.parse(args.handoffStoreRequest);
  const publishResult = await publishHandoffStoreRequest({
    baseUrl: args.baseUrl,
    handoffStoreRequest,
    inputKind: "handoff-store-request",
    sourceDocId: null,
    sourceDocVersion: null,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    publishedAt: args.recoveredAt,
  });
  return recoverPublishedAionisDoc({
    publishResult,
    inputKind: "handoff-store-request",
    baseUrl: args.baseUrl,
    tenantId: args.tenantId,
    scope: args.scope,
    memoryLane: args.memoryLane,
    repoRoot: args.repoRoot,
    filePath: args.filePath,
    symbol: args.symbol,
    handoffKind: args.handoffKind,
    limit: args.limit,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    recoveredAt: args.recoveredAt,
  });
}
