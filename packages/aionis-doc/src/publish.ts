import { z } from "zod";

import { compileAionisDoc } from "./compile.js";
import {
  buildHandoffStoreRequestFromRuntimeHandoff,
  AionisDocHandoffStoreRequestSchema,
  type AionisDocHandoffStoreRequest,
} from "./handoff-store.js";
import {
  buildRuntimeHandoffV1,
  AionisDocRuntimeHandoffSchema,
  type AionisDocRuntimeHandoffV1,
} from "./runtime-handoff.js";

export const AIONIS_DOC_PUBLISH_RESULT_VERSION = "aionis_doc_publish_result_v1" as const;

export const PublishInputKindSchema = z.enum(["source", "runtime-handoff", "handoff-store-request"]);
export type PublishInputKind = z.infer<typeof PublishInputKindSchema>;

export const PublishResultSchema = z.object({
  publish_result_version: z.literal(AIONIS_DOC_PUBLISH_RESULT_VERSION),
  published_at: z.string().min(1),
  base_url: z.string().min(1),
  input_kind: PublishInputKindSchema,
  source_doc_id: z.string().min(1).nullable(),
  source_doc_version: z.string().min(1).nullable(),
  request: z.object({
    anchor: z.string().min(1),
    handoff_kind: z.string().min(1),
    scope: z.string().min(1).optional(),
    memory_lane: z.enum(["private", "shared"]).optional(),
  }),
  response: z.object({
    status: z.number().int().nonnegative(),
    request_id: z.string().nullable(),
    tenant_id: z.string().optional(),
    scope: z.string().optional(),
    commit_id: z.string().min(1),
    commit_uri: z.string().optional(),
    handoff_anchor: z.string().nullable(),
    handoff_kind: z.string().nullable(),
  }),
  handoff_store_request: z.record(z.unknown()),
});

export type AionisDocPublishResult = z.infer<typeof PublishResultSchema>;

type PublishFromSourceOptions = {
  source: string;
  inputPath: string;
  baseUrl: string;
  scope?: string;
  tenantId?: string;
  actor?: string;
  memoryLane?: "private" | "shared";
  title?: string;
  tags?: string[];
  repoRoot?: string | null;
  filePath?: string | null;
  symbol?: string | null;
  currentStage?: "triage" | "patch" | "review" | "resume";
  activeRole?: "orchestrator" | "triage" | "patch" | "review" | "resume";
  allowCompileErrors?: boolean;
  timeoutMs?: number;
  apiKey?: string;
  authBearer?: string;
  adminToken?: string;
  requestId?: string;
  publishedAt?: string;
};

type PublishRequestOptions = {
  baseUrl: string;
  handoffStoreRequest: unknown;
  inputKind: PublishInputKind;
  sourceDocId?: string | null;
  sourceDocVersion?: string | null;
  timeoutMs?: number;
  apiKey?: string;
  authBearer?: string;
  adminToken?: string;
  requestId?: string;
  publishedAt?: string;
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
  if (contentType.includes("application/json")) {
    return res.json();
  }
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

export async function publishHandoffStoreRequest(args: PublishRequestOptions): Promise<AionisDocPublishResult> {
  const handoffStoreRequest = AionisDocHandoffStoreRequestSchema.parse(args.handoffStoreRequest);
  const timeoutMs = args.timeoutMs ?? 10_000;
  const url = joinUrl(args.baseUrl, "/v1/handoff/store");
  const timeout = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders({
        apiKey: args.apiKey,
        authBearer: args.authBearer,
        adminToken: args.adminToken,
        requestId: args.requestId,
      }),
      body: JSON.stringify(handoffStoreRequest),
      signal: timeout.signal,
    });
    const body = await parseResponseBody(res);
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof (body as Record<string, unknown>).message === "string"
          ? String((body as Record<string, unknown>).message)
          : `handoff publish failed with status ${res.status}`;
      throw new Error(message);
    }
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    return PublishResultSchema.parse({
      publish_result_version: AIONIS_DOC_PUBLISH_RESULT_VERSION,
      published_at: args.publishedAt ?? new Date().toISOString(),
      base_url: args.baseUrl,
      input_kind: args.inputKind,
      source_doc_id: args.sourceDocId ?? null,
      source_doc_version: args.sourceDocVersion ?? null,
      request: {
        anchor: handoffStoreRequest.anchor,
        handoff_kind: handoffStoreRequest.handoff_kind,
        scope: handoffStoreRequest.scope,
        memory_lane: handoffStoreRequest.memory_lane,
      },
      response: {
        status: res.status,
        request_id: extractRequestId(res.headers),
        tenant_id: typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
        scope: typeof payload.scope === "string" ? payload.scope : undefined,
        commit_id: String(payload.commit_id ?? ""),
        commit_uri: typeof payload.commit_uri === "string" ? payload.commit_uri : undefined,
        handoff_anchor:
          payload.handoff && typeof payload.handoff === "object" && typeof (payload.handoff as Record<string, unknown>).anchor === "string"
            ? String((payload.handoff as Record<string, unknown>).anchor)
            : null,
        handoff_kind:
          payload.handoff && typeof payload.handoff === "object" && typeof (payload.handoff as Record<string, unknown>).handoff_kind === "string"
            ? String((payload.handoff as Record<string, unknown>).handoff_kind)
            : null,
      },
      handoff_store_request: handoffStoreRequest,
    });
  } finally {
    timeout.cancel();
  }
}

export async function publishAionisDocSource(args: PublishFromSourceOptions): Promise<AionisDocPublishResult> {
  const compile = compileAionisDoc(args.source);
  const runtimeHandoff = buildRuntimeHandoffV1({
    inputPath: args.inputPath,
    result: compile,
    scope: args.scope,
    repoRoot: args.repoRoot,
    filePath: args.filePath,
    symbol: args.symbol,
    currentStage: args.currentStage,
    activeRole: args.activeRole,
    requireErrorFree: !(args.allowCompileErrors ?? false),
  });
  const storeRequest = buildHandoffStoreRequestFromRuntimeHandoff({
    handoff: runtimeHandoff,
    tenantId: args.tenantId,
    scope: args.scope,
    actor: args.actor,
    memoryLane: args.memoryLane,
    title: args.title,
    tags: args.tags,
  });

  return publishHandoffStoreRequest({
    baseUrl: args.baseUrl,
    handoffStoreRequest: storeRequest,
    inputKind: "source",
    sourceDocId: runtimeHandoff.source_doc_id,
    sourceDocVersion: runtimeHandoff.source_doc_version,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    publishedAt: args.publishedAt,
  });
}

export async function publishRuntimeHandoff(args: {
  runtimeHandoff: unknown;
} & Omit<PublishFromSourceOptions, "source" | "inputPath">): Promise<AionisDocPublishResult> {
  const runtimeHandoff = AionisDocRuntimeHandoffSchema.parse(args.runtimeHandoff);
  const storeRequest = buildHandoffStoreRequestFromRuntimeHandoff({
    handoff: runtimeHandoff,
    tenantId: args.tenantId,
    scope: args.scope,
    actor: args.actor,
    memoryLane: args.memoryLane,
    title: args.title,
    tags: args.tags,
  });

  return publishHandoffStoreRequest({
    baseUrl: args.baseUrl,
    handoffStoreRequest: storeRequest,
    inputKind: "runtime-handoff",
    sourceDocId: runtimeHandoff.source_doc_id,
    sourceDocVersion: runtimeHandoff.source_doc_version,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    publishedAt: args.publishedAt,
  });
}
