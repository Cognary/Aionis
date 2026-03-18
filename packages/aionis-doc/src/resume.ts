import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  RecoverInputKindSchema,
  RecoverResultSchema,
  recoverAionisDocSource,
  recoverHandoffStoreRequest,
  recoverPublishedAionisDoc,
  recoverRuntimeHandoff,
  type AionisDocRecoverResult,
} from "./recover.js";

export const AIONIS_DOC_RESUME_RESULT_VERSION = "aionis_doc_resume_result_v1" as const;

export const ResumeInputKindSchema = z.enum([
  ...RecoverInputKindSchema.options,
  "recover-result",
]);
export type ResumeInputKind = z.infer<typeof ResumeInputKindSchema>;

export const ContextAssembleResumeRequestSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  context: z.record(z.unknown()),
  execution_result_summary: z.record(z.unknown()).optional(),
  execution_artifacts: z.array(z.record(z.unknown())).optional(),
  execution_evidence: z.array(z.record(z.unknown())).optional(),
  execution_state_v1: z.record(z.unknown()).optional(),
  execution_packet_v1: z.record(z.unknown()).optional(),
  include_rules: z.boolean().default(false),
  return_layered_context: z.boolean().default(true),
});
export type ContextAssembleResumeRequest = z.infer<typeof ContextAssembleResumeRequestSchema>;

export const ToolsSelectResumeRequestSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: z.string().min(1),
  context: z.record(z.unknown()),
  execution_result_summary: z.record(z.unknown()).optional(),
  execution_artifacts: z.array(z.record(z.unknown())).optional(),
  execution_evidence: z.array(z.record(z.unknown())).optional(),
  execution_state_v1: z.record(z.unknown()).optional(),
  candidates: z.array(z.string().min(1)).min(1),
  include_shadow: z.boolean().default(false),
  rules_limit: z.number().int().positive().max(200).default(50),
  strict: z.boolean().default(true),
});
export type ToolsSelectResumeRequest = z.infer<typeof ToolsSelectResumeRequestSchema>;

export const ContextAssembleResumePayloadSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1),
  execution_kernel: z.record(z.unknown()).optional(),
  query: z.record(z.unknown()).optional(),
  recall: z.record(z.unknown()).optional(),
  rules: z.record(z.unknown()).optional(),
  tools: z.record(z.unknown()).optional(),
  assembly_summary: z.record(z.unknown()).optional(),
  layered_context: z.record(z.unknown()).optional(),
  cost_signals: z.record(z.unknown()).optional(),
});
export type ContextAssembleResumePayload = z.infer<typeof ContextAssembleResumePayloadSchema>;

export const ToolsSelectResumePayloadSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1),
  candidates: z.array(z.string()).optional(),
  execution_kernel: z.record(z.unknown()).optional(),
  selection_summary: z.record(z.unknown()).optional(),
  selection: z.record(z.unknown()),
  rules: z.record(z.unknown()),
  decision: z.record(z.unknown()).optional(),
});
export type ToolsSelectResumePayload = z.infer<typeof ToolsSelectResumePayloadSchema>;

export const ToolsDecisionResumePayloadSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1),
  lookup_mode: z.string().optional(),
  decision: z.record(z.unknown()),
  lifecycle_summary: z.record(z.unknown()).optional(),
});
export type ToolsDecisionResumePayload = z.infer<typeof ToolsDecisionResumePayloadSchema>;

export const ToolsRunResumePayloadSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1),
  run_id: z.string().min(1),
  lifecycle: z.record(z.unknown()),
  decisions: z.array(z.record(z.unknown())),
  feedback: z.record(z.unknown()).optional(),
  lifecycle_summary: z.record(z.unknown()).optional(),
});
export type ToolsRunResumePayload = z.infer<typeof ToolsRunResumePayloadSchema>;

export const ToolsFeedbackResumePayloadSchema = z.object({
  ok: z.boolean().optional(),
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  updated_rules: z.number().int().nonnegative(),
  rule_node_ids: z.array(z.string()).optional(),
  commit_id: z.string().nullable().optional(),
  commit_uri: z.string().optional(),
  commit_hash: z.string().nullable().optional(),
  decision_id: z.string().optional(),
  decision_uri: z.string().optional(),
  decision_link_mode: z.enum(["provided", "inferred", "created_from_feedback"]).optional(),
  decision_policy_sha256: z.string().optional(),
}).passthrough();
export type ToolsFeedbackResumePayload = z.infer<typeof ToolsFeedbackResumePayloadSchema>;

export const ToolsFeedbackResumeRequestSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  decision_id: z.string().min(1).optional(),
  decision_uri: z.string().min(1).optional(),
  outcome: z.enum(["positive", "negative", "neutral"]),
  context: z.record(z.unknown()),
  candidates: z.array(z.string().min(1)).min(1),
  selected_tool: z.string().min(1),
  include_shadow: z.boolean().default(false),
  rules_limit: z.number().int().positive().max(200).default(50),
  target: z.enum(["tool", "all"]).default("tool"),
  note: z.string().min(1).optional(),
  input_text: z.string().min(1),
});
export type ToolsFeedbackResumeRequest = z.infer<typeof ToolsFeedbackResumeRequestSchema>;

export const ResumeSummarySchema = z.object({
  selected_tool: z.string().nullable(),
  decision_id: z.string().nullable(),
  run_id: z.string().min(1),
  resume_state: z.enum(["inspection_only", "feedback_applied", "lifecycle_advanced"]),
  feedback_written: z.boolean(),
  feedback_outcome: z.enum(["positive", "negative", "neutral"]).nullable(),
  pre_feedback_run_status: z.string().nullable(),
  post_feedback_run_status: z.string().nullable(),
  lifecycle_transition: z.string().nullable(),
  lifecycle_advanced: z.boolean(),
  feedback_updated_rules: z.number().int().nonnegative().nullable(),
});
export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;

export const ResumeResultSchema = z.object({
  resume_result_version: z.literal(AIONIS_DOC_RESUME_RESULT_VERSION),
  resumed_at: z.string().min(1),
  base_url: z.string().min(1),
  input_kind: ResumeInputKindSchema,
  source_doc_id: z.string().min(1).nullable(),
  source_doc_version: z.string().min(1).nullable(),
  run_id: z.string().min(1),
  resume_summary: ResumeSummarySchema,
  recover_result: RecoverResultSchema.nullable(),
  context_assemble_request: ContextAssembleResumeRequestSchema,
  context_assemble_response: z.object({
    status: z.number().int().nonnegative(),
    request_id: z.string().nullable(),
    data: ContextAssembleResumePayloadSchema,
  }),
  tools_select_request: ToolsSelectResumeRequestSchema,
  tools_select_response: z.object({
    status: z.number().int().nonnegative(),
    request_id: z.string().nullable(),
    data: ToolsSelectResumePayloadSchema,
  }),
  tools_decision_response: z.object({
    status: z.number().int().nonnegative(),
    request_id: z.string().nullable(),
    data: ToolsDecisionResumePayloadSchema,
  }).nullable(),
  tools_run_response: z.object({
    status: z.number().int().nonnegative(),
    request_id: z.string().nullable(),
    data: ToolsRunResumePayloadSchema,
  }).nullable(),
  tools_run_post_feedback_response: z.object({
    status: z.number().int().nonnegative(),
    request_id: z.string().nullable(),
    data: ToolsRunResumePayloadSchema,
  }).nullable(),
  tools_feedback_request: ToolsFeedbackResumeRequestSchema.nullable(),
  tools_feedback_response: z.object({
    status: z.number().int().nonnegative(),
    request_id: z.string().nullable(),
    data: ToolsFeedbackResumePayloadSchema,
  }).nullable(),
});
export type AionisDocResumeResult = z.infer<typeof ResumeResultSchema>;

type SharedNetworkOptions = {
  baseUrl: string;
  timeoutMs?: number;
  apiKey?: string;
  authBearer?: string;
  adminToken?: string;
  requestId?: string;
  resumedAt?: string;
};

type ResumeOptions = SharedNetworkOptions & {
  queryText?: string;
  runId?: string;
  tenantId?: string;
  scope?: string;
  includeRules?: boolean;
  candidates: string[];
  strict?: boolean;
  includeShadow?: boolean;
  rulesLimit?: number;
  feedbackOutcome?: "positive" | "negative" | "neutral";
  feedbackTarget?: "tool" | "all";
  feedbackNote?: string;
  feedbackInputText?: string;
  feedbackSelectedTool?: string;
  feedbackActor?: string;
};

type ResumeFromSourceOptions = ResumeOptions & {
  source: string;
  inputPath: string;
  actor?: string;
  memoryLane?: "private" | "shared";
  title?: string;
  tags?: string[];
  repoRoot?: string | null;
  filePath?: string | null;
  symbol?: string | null;
  currentStage?: "triage" | "patch" | "review" | "resume";
  activeRole?: "orchestrator" | "triage" | "patch" | "review" | "resume";
  handoffKind?: "patch_handoff" | "review_handoff" | "task_handoff";
  limit?: number;
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

function maybeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function maybeRecords(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry));
}

function readString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNonNegativeInt(record: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = record?.[key];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  return null;
}

function buildResumeContext(recoverResult: AionisDocRecoverResult) {
  const recovered = recoverResult.recover_response.data;
  return {
    intent: "doc_resume",
    workflow_kind: "aionis_doc",
    handoff_anchor: recovered.anchor,
    ...(recovered.control_profile_v1 ? { control_profile_v1: recovered.control_profile_v1 } : {}),
  };
}

function buildToolsFeedbackResumeRequest(args: {
  recoverResult: AionisDocRecoverResult;
  toolsSelectRequest: ToolsSelectResumeRequest;
  toolsSelectResponse: ToolsSelectResumePayload;
  toolsDecisionResponse: ToolsDecisionResumePayload | null;
  outcome: "positive" | "negative" | "neutral";
  actor?: string;
  note?: string;
  inputText?: string;
  target?: "tool" | "all";
  includeShadow?: boolean;
  rulesLimit?: number;
  selectedTool?: string;
}): ToolsFeedbackResumeRequest {
  const selectedTool =
    args.selectedTool ??
    firstString(
      maybeRecord(args.toolsDecisionResponse?.decision)?.selected_tool,
      maybeRecord(args.toolsSelectResponse.selection)?.selected,
    );
  if (!selectedTool) throw new Error("Unable to derive selected_tool for tools/feedback.");
  const decision = maybeRecord(args.toolsDecisionResponse?.decision);
  return ToolsFeedbackResumeRequestSchema.parse({
    tenant_id: args.toolsSelectRequest.tenant_id,
    scope: args.toolsSelectRequest.scope,
    actor: args.actor,
    run_id: firstString(decision?.run_id, args.toolsSelectRequest.run_id),
    decision_id: firstString(decision?.decision_id),
    decision_uri: firstString(decision?.decision_uri),
    outcome: args.outcome,
    context: args.toolsSelectRequest.context,
    candidates: args.toolsSelectRequest.candidates,
    selected_tool: selectedTool,
    include_shadow: args.includeShadow ?? args.toolsSelectRequest.include_shadow,
    rules_limit: args.rulesLimit ?? args.toolsSelectRequest.rules_limit,
    target: args.target ?? "tool",
    note: args.note,
    input_text:
      args.inputText ??
      firstString(
        args.note,
        maybeRecord(args.toolsDecisionResponse?.decision)?.selected_tool,
        args.toolsSelectRequest.context.intent,
        "resume feedback",
      )!,
  });
}

export function buildContextAssembleResumeRequest(args: {
  recoverResult: AionisDocRecoverResult;
  queryText?: string;
  tenantId?: string;
  scope?: string;
  includeRules?: boolean;
}): ContextAssembleResumeRequest {
  const recovered = args.recoverResult.recover_response.data;
  const executionReady = maybeRecord(recovered.execution_ready_handoff);
  const handoff = maybeRecord(recovered.handoff);
  const executionState = maybeRecord(recovered.execution_state_v1);
  return ContextAssembleResumeRequestSchema.parse({
    tenant_id: args.tenantId ?? recovered.tenant_id,
    scope: args.scope ?? recovered.scope,
    query_text:
      args.queryText ??
      firstString(
        executionReady?.next_action,
        executionState?.task_brief,
        handoff?.summary,
        recovered.anchor,
      ) ??
      "resume recovered handoff",
    context: buildResumeContext(args.recoverResult),
    execution_result_summary: maybeRecord((recovered as Record<string, unknown>).execution_result_summary) ?? undefined,
    execution_artifacts: maybeRecords((recovered as Record<string, unknown>).execution_artifacts),
    execution_evidence: maybeRecords((recovered as Record<string, unknown>).execution_evidence),
    execution_state_v1: executionState ?? undefined,
    execution_packet_v1: maybeRecord(recovered.execution_packet_v1) ?? undefined,
    include_rules: args.includeRules ?? false,
    return_layered_context: true,
  });
}

export function buildToolsSelectResumeRequest(args: {
  recoverResult: AionisDocRecoverResult;
  runId?: string;
  tenantId?: string;
  scope?: string;
  candidates: string[];
  strict?: boolean;
  includeShadow?: boolean;
  rulesLimit?: number;
}): ToolsSelectResumeRequest {
  const recovered = args.recoverResult.recover_response.data;
  return ToolsSelectResumeRequestSchema.parse({
    tenant_id: args.tenantId ?? recovered.tenant_id,
    scope: args.scope ?? recovered.scope,
    run_id: args.runId ?? randomUUID(),
    context: buildResumeContext(args.recoverResult),
    execution_result_summary: maybeRecord((recovered as Record<string, unknown>).execution_result_summary) ?? undefined,
    execution_artifacts: maybeRecords((recovered as Record<string, unknown>).execution_artifacts),
    execution_evidence: maybeRecords((recovered as Record<string, unknown>).execution_evidence),
    execution_state_v1: maybeRecord(recovered.execution_state_v1) ?? undefined,
    candidates: args.candidates,
    strict: args.strict ?? true,
    include_shadow: args.includeShadow ?? false,
    rules_limit: args.rulesLimit ?? 50,
  });
}

async function postJson(args: {
  baseUrl: string;
  path: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
  apiKey?: string;
  authBearer?: string;
  adminToken?: string;
  requestId?: string;
}) {
  const timeout = withTimeout(args.timeoutMs ?? 10_000);
  try {
    const res = await fetch(joinUrl(args.baseUrl, args.path), {
      method: "POST",
      headers: buildHeaders(args),
      body: JSON.stringify(args.body),
      signal: timeout.signal,
    });
    const body = await parseResponseBody(res);
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof (body as Record<string, unknown>).message === "string"
          ? String((body as Record<string, unknown>).message)
          : `${args.path} failed with status ${res.status}`;
      throw new Error(message);
    }
    return {
      status: res.status,
      request_id: extractRequestId(res.headers),
      body,
    };
  } finally {
    timeout.cancel();
  }
}

export async function resumeRecoveredAionisDoc(args: ResumeOptions & {
  recoverResult: unknown;
  inputKind?: ResumeInputKind;
}): Promise<AionisDocResumeResult> {
  const recoverResult = RecoverResultSchema.parse(args.recoverResult);
  const contextAssembleRequest = buildContextAssembleResumeRequest({
    recoverResult,
    queryText: args.queryText,
    tenantId: args.tenantId,
    scope: args.scope,
    includeRules: args.includeRules,
  });
  const contextAssembleResponse = await postJson({
    baseUrl: args.baseUrl,
    path: "/v1/memory/context/assemble",
    body: contextAssembleRequest,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
  });
  const toolsSelectRequest = buildToolsSelectResumeRequest({
    recoverResult,
    runId: args.runId,
    tenantId: args.tenantId,
    scope: args.scope,
    candidates: args.candidates,
    strict: args.strict,
    includeShadow: args.includeShadow,
    rulesLimit: args.rulesLimit,
  });
  const toolsSelectResponse = await postJson({
    baseUrl: args.baseUrl,
    path: "/v1/memory/tools/select",
    body: toolsSelectRequest,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
  });
  const toolsSelectBody = ToolsSelectResumePayloadSchema.parse(toolsSelectResponse.body);
  const selectedDecision = maybeRecord(toolsSelectBody.decision);
  const decisionId = firstString(selectedDecision?.decision_id);
  const runId = firstString(selectedDecision?.run_id, toolsSelectRequest.run_id);

  let toolsDecisionResponse:
    | {
        status: number;
        request_id: string | null;
        data: ToolsDecisionResumePayload;
      }
    | null = null;
  if (decisionId || runId) {
    const decisionLookup = await postJson({
      baseUrl: args.baseUrl,
      path: "/v1/memory/tools/decision",
      body: decisionId ? { tenant_id: toolsSelectRequest.tenant_id, scope: toolsSelectRequest.scope, decision_id: decisionId } : { tenant_id: toolsSelectRequest.tenant_id, scope: toolsSelectRequest.scope, run_id: runId },
      timeoutMs: args.timeoutMs,
      apiKey: args.apiKey,
      authBearer: args.authBearer,
      adminToken: args.adminToken,
      requestId: args.requestId,
    });
    toolsDecisionResponse = {
      status: decisionLookup.status,
      request_id: decisionLookup.request_id,
      data: ToolsDecisionResumePayloadSchema.parse(decisionLookup.body),
    };
  }

  let toolsRunResponse:
    | {
        status: number;
        request_id: string | null;
        data: ToolsRunResumePayload;
      }
    | null = null;
  if (runId) {
    const runLookup = await postJson({
      baseUrl: args.baseUrl,
      path: "/v1/memory/tools/run",
      body: {
        tenant_id: toolsSelectRequest.tenant_id,
        scope: toolsSelectRequest.scope,
        run_id: runId,
      },
      timeoutMs: args.timeoutMs,
      apiKey: args.apiKey,
      authBearer: args.authBearer,
      adminToken: args.adminToken,
      requestId: args.requestId,
    });
    toolsRunResponse = {
      status: runLookup.status,
      request_id: runLookup.request_id,
      data: ToolsRunResumePayloadSchema.parse(runLookup.body),
    };
  }
  let toolsRunPostFeedbackResponse:
    | {
        status: number;
        request_id: string | null;
        data: ToolsRunResumePayload;
      }
    | null = null;

  let toolsFeedbackRequest: ToolsFeedbackResumeRequest | null = null;
  let toolsFeedbackResponse:
    | {
        status: number;
        request_id: string | null;
        data: ToolsFeedbackResumePayload;
      }
    | null = null;
  if (args.feedbackOutcome) {
    toolsFeedbackRequest = buildToolsFeedbackResumeRequest({
      recoverResult,
      toolsSelectRequest,
      toolsSelectResponse: toolsSelectBody,
      toolsDecisionResponse: toolsDecisionResponse?.data ?? null,
      outcome: args.feedbackOutcome,
      actor: args.feedbackActor,
      note: args.feedbackNote,
      inputText: args.feedbackInputText,
      target: args.feedbackTarget,
      includeShadow: args.includeShadow,
      rulesLimit: args.rulesLimit,
      selectedTool: args.feedbackSelectedTool,
    });
    const feedbackWrite = await postJson({
      baseUrl: args.baseUrl,
      path: "/v1/memory/tools/feedback",
      body: toolsFeedbackRequest,
      timeoutMs: args.timeoutMs,
      apiKey: args.apiKey,
      authBearer: args.authBearer,
      adminToken: args.adminToken,
      requestId: args.requestId,
    });
    toolsFeedbackResponse = {
      status: feedbackWrite.status,
      request_id: feedbackWrite.request_id,
      data: ToolsFeedbackResumePayloadSchema.parse(feedbackWrite.body),
    };
    if (runId) {
      const runLookupAfterFeedback = await postJson({
        baseUrl: args.baseUrl,
        path: "/v1/memory/tools/run",
        body: {
          tenant_id: toolsSelectRequest.tenant_id,
          scope: toolsSelectRequest.scope,
          run_id: runId,
          include_feedback: true,
        },
        timeoutMs: args.timeoutMs,
        apiKey: args.apiKey,
        authBearer: args.authBearer,
        adminToken: args.adminToken,
        requestId: args.requestId,
      });
      toolsRunPostFeedbackResponse = {
        status: runLookupAfterFeedback.status,
        request_id: runLookupAfterFeedback.request_id,
        data: ToolsRunResumePayloadSchema.parse(runLookupAfterFeedback.body),
      };
    }
  }

  const toolsDecisionRecord = maybeRecord(toolsDecisionResponse?.data.decision);
  const preRunLifecycle = maybeRecord(toolsRunResponse?.data.lifecycle);
  const postRunLifecycle = maybeRecord(toolsRunPostFeedbackResponse?.data.lifecycle);
  const preStatus = readString(preRunLifecycle, "status");
  const postStatus = readString(postRunLifecycle, "status");
  const selectedTool =
    firstString(
      readString(toolsDecisionRecord, "selected_tool"),
      readString(maybeRecord(toolsSelectBody.selection), "selected"),
    ) ?? null;
  const resolvedDecisionId = readString(toolsDecisionRecord, "decision_id");
  const lifecycleTransition =
    preStatus && postStatus && preStatus !== postStatus ? `${preStatus} -> ${postStatus}` : null;
  const feedbackWritten = Boolean(toolsFeedbackResponse);
  const lifecycleAdvanced = Boolean(lifecycleTransition);
  const resumeState = !feedbackWritten
    ? "inspection_only"
    : lifecycleAdvanced
      ? "lifecycle_advanced"
      : "feedback_applied";
  const resumeSummary = ResumeSummarySchema.parse({
    selected_tool: selectedTool,
    decision_id: resolvedDecisionId,
    run_id: toolsSelectRequest.run_id,
    resume_state: resumeState,
    feedback_written: feedbackWritten,
    feedback_outcome: args.feedbackOutcome ?? null,
    pre_feedback_run_status: preStatus,
    post_feedback_run_status: postStatus,
    lifecycle_transition: lifecycleTransition,
    lifecycle_advanced: lifecycleAdvanced,
    feedback_updated_rules: readNonNegativeInt(maybeRecord(toolsFeedbackResponse?.data), "updated_rules"),
  });

  return ResumeResultSchema.parse({
    resume_result_version: AIONIS_DOC_RESUME_RESULT_VERSION,
    resumed_at: args.resumedAt ?? new Date().toISOString(),
    base_url: args.baseUrl,
    input_kind: args.inputKind ?? "recover-result",
    source_doc_id: recoverResult.source_doc_id,
    source_doc_version: recoverResult.source_doc_version,
    run_id: toolsSelectRequest.run_id,
    resume_summary: resumeSummary,
    recover_result: recoverResult,
    context_assemble_request: contextAssembleRequest,
    context_assemble_response: {
      status: contextAssembleResponse.status,
      request_id: contextAssembleResponse.request_id,
      data: ContextAssembleResumePayloadSchema.parse(contextAssembleResponse.body),
    },
    tools_select_request: toolsSelectRequest,
    tools_select_response: {
      status: toolsSelectResponse.status,
      request_id: toolsSelectResponse.request_id,
      data: toolsSelectBody,
    },
    tools_decision_response: toolsDecisionResponse,
    tools_run_response: toolsRunResponse,
    tools_run_post_feedback_response: toolsRunPostFeedbackResponse,
    tools_feedback_request: toolsFeedbackRequest,
    tools_feedback_response: toolsFeedbackResponse,
  });
}

export async function resumePublishedAionisDoc(args: ResumeOptions & {
  publishResult: unknown;
}): Promise<AionisDocResumeResult> {
  const recoverResult = await recoverPublishedAionisDoc({
    publishResult: args.publishResult,
    inputKind: "publish-result",
    baseUrl: args.baseUrl,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    scope: args.scope,
    tenantId: args.tenantId,
  });
  return resumeRecoveredAionisDoc({
    ...args,
    recoverResult,
    inputKind: "publish-result",
  });
}

export async function resumeRuntimeHandoff(args: ResumeOptions & {
  runtimeHandoff: unknown;
} & Pick<
  ResumeFromSourceOptions,
  "actor" | "memoryLane" | "title" | "tags" | "repoRoot" | "filePath" | "symbol" | "handoffKind" | "limit" | "allowCompileErrors"
>): Promise<AionisDocResumeResult> {
  const recoverResult = await recoverRuntimeHandoff({
    runtimeHandoff: args.runtimeHandoff,
    baseUrl: args.baseUrl,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    scope: args.scope,
    tenantId: args.tenantId,
    actor: args.actor,
    memoryLane: args.memoryLane,
    title: args.title,
    tags: args.tags,
    repoRoot: args.repoRoot,
    filePath: args.filePath,
    symbol: args.symbol,
    handoffKind: args.handoffKind,
    limit: args.limit,
  });
  return resumeRecoveredAionisDoc({
    ...args,
    recoverResult,
    inputKind: "runtime-handoff",
  });
}

export async function resumeHandoffStoreRequest(args: ResumeOptions & {
  handoffStoreRequest: unknown;
} & Pick<
  ResumeFromSourceOptions,
  "repoRoot" | "filePath" | "symbol" | "handoffKind" | "limit"
>): Promise<AionisDocResumeResult> {
  const recoverResult = await recoverHandoffStoreRequest({
    handoffStoreRequest: args.handoffStoreRequest,
    baseUrl: args.baseUrl,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
    scope: args.scope,
    tenantId: args.tenantId,
    repoRoot: args.repoRoot,
    filePath: args.filePath,
    symbol: args.symbol,
    handoffKind: args.handoffKind,
    limit: args.limit,
  });
  return resumeRecoveredAionisDoc({
    ...args,
    recoverResult,
    inputKind: "handoff-store-request",
  });
}

export async function resumeAionisDocSource(args: ResumeFromSourceOptions): Promise<AionisDocResumeResult> {
  const recoverResult = await recoverAionisDocSource({
    source: args.source,
    inputPath: args.inputPath,
    baseUrl: args.baseUrl,
    timeoutMs: args.timeoutMs,
    apiKey: args.apiKey,
    authBearer: args.authBearer,
    adminToken: args.adminToken,
    requestId: args.requestId,
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
    handoffKind: args.handoffKind,
    limit: args.limit,
    allowCompileErrors: args.allowCompileErrors,
  });
  return resumeRecoveredAionisDoc({
    ...args,
    recoverResult,
    inputKind: "source",
  });
}
