import { randomUUID } from "node:crypto";
import type {
  AionisClientOptions,
  AionisResponse,
  AutomationCreateInput,
  AutomationAssignReviewerInput,
  AutomationCreateResponse,
  AutomationTelemetryInput,
  AutomationTelemetryResponse,
  AutomationGetInput,
  AutomationShadowReportInput,
  AutomationShadowReportResponse,
  AutomationShadowReviewInput,
  AutomationShadowValidateInput,
  AutomationShadowValidateDispatchInput,
  AutomationShadowValidateDispatchResponse,
  AutomationShadowValidateResponse,
  AutomationCompensationPolicyMatrixInput,
  AutomationCompensationPolicyMatrixResponse,
  AutomationListInput,
  AutomationListResponse,
  AutomationGetResponse,
  AutomationPromoteInput,
  AutomationPromoteResponse,
  AutomationValidateInput,
  AutomationValidateResponse,
  AutomationRunApproveRepairInput,
  AutomationRunCancelInput,
  AutomationRunCompensationAssignInput,
  AutomationRunCompensationRecordActionInput,
  AutomationRunCompensationRetryInput,
  AutomationRunGetInput,
  AutomationRunListInput,
  AutomationRunListResponse,
  AutomationRunAssignReviewerInput,
  AutomationRunGetResponse,
  AutomationRunRejectRepairInput,
  AutomationRunInput,
  AutomationRunResponse,
  AutomationRunResumeInput,
  ApiErrorPayload,
  ControlAlertDeliveriesQuery,
  ControlAlertDeliveriesResponse,
  ControlAlertDeliveryAssignInput,
  ControlAlertDeliveryAssignResponse,
  ControlAlertDeliveryReplayInput,
  ControlAlertDeliveryReplayResponse,
  ControlAutomationAlertDispatchInput,
  ControlAutomationAlertDispatchResponse,
  ControlAutomationAlertPreviewInput,
  ControlAutomationAlertPreviewResponse,
  ControlAlertRouteInput,
  ControlAlertRouteResponse,
  ControlAlertRoutesQuery,
  ControlAlertRoutesResponse,
  ControlAlertRouteStatusInput,
  ControlApiKeyInput,
  ControlApiKeyResponse,
  ControlApiKeysQuery,
  ControlApiKeysResponse,
  ControlApiKeysStaleQuery,
  ControlApiKeysStaleResponse,
  ControlApiKeyRotateInput,
  ControlAuditEventsQuery,
  ControlAuditEventsResponse,
  ControlIncidentPublishJobInput,
  ControlIncidentPublishJobResponse,
  ControlIncidentPublishJobsQuery,
  ControlIncidentPublishJobsResponse,
  ControlIncidentPublishReplayInput,
  ControlIncidentPublishReplayResponse,
  ControlIncidentPublishRollupQuery,
  ControlIncidentPublishRollupResponse,
  ControlIncidentPublishSloQuery,
  ControlIncidentPublishSloResponse,
  ControlProjectInput,
  ControlProjectResponse,
  ControlTenantDashboardResponse,
  ControlTenantDiagnosticsQuery,
  ControlTenantDiagnosticsResponse,
  ControlTenantInput,
  ControlTenantKeyUsageQuery,
  ControlTenantKeyUsageResponse,
  ControlSandboxBudgetDeleteResponse,
  ControlSandboxBudgetGetQuery,
  ControlSandboxBudgetInput,
  ControlSandboxBudgetResponse,
  ControlSandboxBudgetsQuery,
  ControlSandboxBudgetsResponse,
  ControlSandboxProjectBudgetDeleteResponse,
  ControlSandboxProjectBudgetGetQuery,
  ControlSandboxProjectBudgetInput,
  ControlSandboxProjectBudgetResponse,
  ControlSandboxProjectBudgetsQuery,
  ControlSandboxProjectBudgetsResponse,
  ControlTenantQuotaDeleteResponse,
  ControlTenantQuotaInput,
  ControlTenantQuotaResponse,
  ControlTenantResponse,
  ControlTenantsQuery,
  ControlTenantsResponse,
  ControlTenantTimeseriesQuery,
  ControlTenantTimeseriesResponse,
  CapabilityContractSpec,
  ContextAssembleInput,
  ContextAssembleResponse,
  PlanningContextInput,
  PlanningContextResponse,
  HealthResponse,
  HandoffRecoverInput,
  HandoffRecoverResponse,
  HandoffStoreInput,
  HandoffStoreResponse,
  MemoryArchiveRehydrateInput,
  MemoryArchiveRehydrateResponse,
  MemoryEventWriteInput,
  MemoryEventWriteResponse,
  MemoryFindInput,
  MemoryFindResponse,
  MemoryNodesActivateInput,
  MemoryNodesActivateResponse,
  MemoryResolveInput,
  MemoryResolveResponse,
  MemoryPackExportInput,
  MemoryPackExportResponse,
  MemoryPackImportInput,
  MemoryPackImportResponse,
  MemoryRecallInput,
  MemoryRecallResponse,
  MemoryRecallTextInput,
  MemorySessionCreateInput,
  MemorySessionCreateResponse,
  MemorySessionsListInput,
  MemorySessionsListResponse,
  MemorySessionEventsListInput,
  MemorySessionEventsListResponse,
  MemoryWriteInput,
  MemoryWriteResponse,
  RequestOptions,
  ReplayPlaybookCompileInput,
  ReplayPlaybookCompileResponse,
  ReplayPlaybookCandidateInput,
  ReplayPlaybookCandidateResponse,
  ReplayPlaybookDispatchInput,
  ReplayPlaybookDispatchResponse,
  ReplayPlaybookGetInput,
  ReplayPlaybookGetResponse,
  ReplayPlaybookPromoteInput,
  ReplayPlaybookPromoteResponse,
  ReplayPlaybookRepairInput,
  ReplayPlaybookRepairResponse,
  ReplayPlaybookRepairReviewInput,
  ReplayPlaybookRepairReviewResponse,
  ReplayPlaybookRunInput,
  ReplayPlaybookRunResponse,
  ReplayRunEndInput,
  ReplayRunEndResponse,
  ReplayRunGetInput,
  ReplayRunGetResponse,
  ReplayRunStartInput,
  ReplayRunStartResponse,
  ReplayStepAfterInput,
  ReplayStepAfterResponse,
  ReplayStepBeforeInput,
  ReplayStepBeforeResponse,
  RuleFeedbackInput,
  RuleFeedbackResponse,
  RuleStateUpdateInput,
  RuleStateUpdateResponse,
  RetryPolicy,
  RulesEvaluateInput,
  RulesEvaluateResponse,
  SandboxExecuteInput,
  SandboxExecuteResponse,
  SandboxRunCancelInput,
  SandboxRunCancelResponse,
  SandboxRunGetInput,
  SandboxRunGetResponse,
  SandboxRunArtifactInput,
  SandboxRunArtifactResponse,
  SandboxRunLogsInput,
  SandboxRunLogsResponse,
  SandboxSessionCreateInput,
  SandboxSessionCreateResponse,
  ToolsDecisionInput,
  ToolsDecisionResponse,
  ToolsFeedbackInput,
  ToolsFeedbackResponse,
  ToolsRunInput,
  ToolsRunResponse,
  ToolsSelectInput,
  ToolsSelectResponse,
} from "./types.js";
import { AionisApiError, AionisNetworkError } from "./types.js";

const DEFAULT_RETRY: RetryPolicy = {
  max_retries: 2,
  base_delay_ms: 200,
  max_delay_ms: 2000,
  jitter_ratio: 0.2,
};

function mergeRetryPolicy(base: RetryPolicy, override?: Partial<RetryPolicy>): RetryPolicy {
  return {
    max_retries: override?.max_retries ?? base.max_retries,
    base_delay_ms: override?.base_delay_ms ?? base.base_delay_ms,
    max_delay_ms: override?.max_delay_ms ?? base.max_delay_ms,
    jitter_ratio: override?.jitter_ratio ?? base.jitter_ratio,
  };
}

function clampRetryPolicy(p: RetryPolicy): RetryPolicy {
  return {
    max_retries: Math.max(0, Math.min(10, Math.trunc(p.max_retries))),
    base_delay_ms: Math.max(1, Math.min(30_000, Math.trunc(p.base_delay_ms))),
    max_delay_ms: Math.max(1, Math.min(60_000, Math.trunc(p.max_delay_ms))),
    jitter_ratio: Math.max(0, Math.min(1, p.jitter_ratio)),
  };
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  const sec = Number(v);
  if (Number.isFinite(sec) && sec > 0) return Math.round(sec * 1000);
  return null;
}

function computeBackoffMs(policy: RetryPolicy, attempt: number): number {
  const exp = policy.base_delay_ms * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(exp, policy.max_delay_ms);
  const spread = capped * policy.jitter_ratio;
  const jitter = spread > 0 ? (Math.random() * 2 - 1) * spread : 0;
  return Math.max(1, Math.round(capped + jitter));
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  if (signal.aborted) throw new Error("aborted");
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort);
  });
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildQueryString(query: Record<string, unknown> | undefined): string {
  if (!query) return "";
  const qp = new URLSearchParams();
  for (const [k, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item === undefined || item === null) continue;
        qp.append(k, String(item));
      }
      continue;
    }
    qp.append(k, String(raw));
  }
  const s = qp.toString();
  return s.length > 0 ? `?${s}` : "";
}

async function parseBody(res: Response): Promise<unknown> {
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    return res.json();
  }
  const txt = await res.text();
  return txt.length > 0 ? txt : null;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const want = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === want);
}

export class AionisClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retry: RetryPolicy;
  private readonly defaultHeaders: Record<string, string>;
  private readonly adminToken?: string;
  private readonly apiKey?: string;
  private readonly authBearer?: string;

  constructor(opts: AionisClientOptions) {
    this.baseUrl = opts.base_url.replace(/\/+$/, "");
    this.timeoutMs = opts.timeout_ms ?? 10_000;
    this.retry = clampRetryPolicy(mergeRetryPolicy(DEFAULT_RETRY, opts.retry));
    this.defaultHeaders = opts.default_headers ?? {};
    this.adminToken = opts.admin_token;
    this.apiKey = opts.api_key;
    this.authBearer = opts.auth_bearer;
  }

  async write(input: MemoryWriteInput, opts?: RequestOptions): Promise<AionisResponse<MemoryWriteResponse>> {
    return this.requestPost<MemoryWriteInput, MemoryWriteResponse>("/v1/memory/write", input, opts);
  }

  async recall(input: MemoryRecallInput, opts?: RequestOptions): Promise<AionisResponse<MemoryRecallResponse>> {
    return this.requestPost<MemoryRecallInput, MemoryRecallResponse>("/v1/memory/recall", input, opts);
  }

  async recallText(input: MemoryRecallTextInput, opts?: RequestOptions): Promise<AionisResponse<MemoryRecallResponse>> {
    return this.requestPost<MemoryRecallTextInput, MemoryRecallResponse>("/v1/memory/recall_text", input, opts);
  }

  async contextAssemble(input: ContextAssembleInput, opts?: RequestOptions): Promise<AionisResponse<ContextAssembleResponse>> {
    return this.requestPost<ContextAssembleInput, ContextAssembleResponse>("/v1/memory/context/assemble", input, opts);
  }

  async planningContext(input: PlanningContextInput, opts?: RequestOptions): Promise<AionisResponse<PlanningContextResponse>> {
    return this.requestPost<PlanningContextInput, PlanningContextResponse>("/v1/memory/planning/context", input, opts);
  }

  async handoffStore(input: HandoffStoreInput, opts?: RequestOptions): Promise<AionisResponse<HandoffStoreResponse>> {
    return this.requestPost<HandoffStoreInput, HandoffStoreResponse>("/v1/handoff/store", input, opts);
  }

  async handoffRecover(input: HandoffRecoverInput, opts?: RequestOptions): Promise<AionisResponse<HandoffRecoverResponse>> {
    return this.requestPost<HandoffRecoverInput, HandoffRecoverResponse>("/v1/handoff/recover", input, opts);
  }

  async find(input: MemoryFindInput, opts?: RequestOptions): Promise<AionisResponse<MemoryFindResponse>> {
    return this.requestPost<MemoryFindInput, MemoryFindResponse>("/v1/memory/find", input, opts);
  }

  async resolve(input: MemoryResolveInput, opts?: RequestOptions): Promise<AionisResponse<MemoryResolveResponse>> {
    return this.requestPost<MemoryResolveInput, MemoryResolveResponse>("/v1/memory/resolve", input, opts);
  }

  async createSession(input: MemorySessionCreateInput, opts?: RequestOptions): Promise<AionisResponse<MemorySessionCreateResponse>> {
    return this.requestPost<MemorySessionCreateInput, MemorySessionCreateResponse>("/v1/memory/sessions", input, opts);
  }

  async listSessions(
    input?: MemorySessionsListInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<MemorySessionsListResponse>> {
    return this.requestGet<MemorySessionsListResponse>("/v1/memory/sessions", input ?? {}, opts);
  }

  async writeEvent(input: MemoryEventWriteInput, opts?: RequestOptions): Promise<AionisResponse<MemoryEventWriteResponse>> {
    return this.requestPost<MemoryEventWriteInput, MemoryEventWriteResponse>("/v1/memory/events", input, opts);
  }

  async listSessionEvents(
    sessionId: string,
    input?: MemorySessionEventsListInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<MemorySessionEventsListResponse>> {
    const sid = String(sessionId ?? "").trim();
    if (!sid) throw new Error("sessionId is required");
    const path = `/v1/memory/sessions/${encodeURIComponent(sid)}/events`;
    return this.requestGet<MemorySessionEventsListResponse>(path, input ?? {}, opts);
  }

  async packExport(input: MemoryPackExportInput, opts?: RequestOptions): Promise<AionisResponse<MemoryPackExportResponse>> {
    return this.requestPost<MemoryPackExportInput, MemoryPackExportResponse>("/v1/memory/packs/export", input, opts);
  }

  async packImport(input: MemoryPackImportInput, opts?: RequestOptions): Promise<AionisResponse<MemoryPackImportResponse>> {
    return this.requestPost<MemoryPackImportInput, MemoryPackImportResponse>("/v1/memory/packs/import", input, opts);
  }

  async archiveRehydrate(
    input: MemoryArchiveRehydrateInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<MemoryArchiveRehydrateResponse>> {
    return this.requestPost<MemoryArchiveRehydrateInput, MemoryArchiveRehydrateResponse>("/v1/memory/archive/rehydrate", input, opts);
  }

  async nodesActivate(
    input: MemoryNodesActivateInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<MemoryNodesActivateResponse>> {
    return this.requestPost<MemoryNodesActivateInput, MemoryNodesActivateResponse>("/v1/memory/nodes/activate", input, opts);
  }

  async sandboxCreateSession(
    input: SandboxSessionCreateInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<SandboxSessionCreateResponse>> {
    return this.requestPost<SandboxSessionCreateInput, SandboxSessionCreateResponse>("/v1/memory/sandbox/sessions", input, opts);
  }

  async sandboxExecute(input: SandboxExecuteInput, opts?: RequestOptions): Promise<AionisResponse<SandboxExecuteResponse>> {
    return this.requestPost<SandboxExecuteInput, SandboxExecuteResponse>("/v1/memory/sandbox/execute", input, opts);
  }

  async sandboxRunGet(input: SandboxRunGetInput, opts?: RequestOptions): Promise<AionisResponse<SandboxRunGetResponse>> {
    return this.requestPost<SandboxRunGetInput, SandboxRunGetResponse>("/v1/memory/sandbox/runs/get", input, opts);
  }

  async sandboxRunLogs(
    input: SandboxRunLogsInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<SandboxRunLogsResponse>> {
    return this.requestPost<SandboxRunLogsInput, SandboxRunLogsResponse>("/v1/memory/sandbox/runs/logs", input, opts);
  }

  async sandboxRunArtifact(
    input: SandboxRunArtifactInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<SandboxRunArtifactResponse>> {
    return this.requestPost<SandboxRunArtifactInput, SandboxRunArtifactResponse>("/v1/memory/sandbox/runs/artifact", input, opts);
  }

  async sandboxRunCancel(
    input: SandboxRunCancelInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<SandboxRunCancelResponse>> {
    return this.requestPost<SandboxRunCancelInput, SandboxRunCancelResponse>("/v1/memory/sandbox/runs/cancel", input, opts);
  }

  async rulesEvaluate(input: RulesEvaluateInput, opts?: RequestOptions): Promise<AionisResponse<RulesEvaluateResponse>> {
    return this.requestPost<RulesEvaluateInput, RulesEvaluateResponse>("/v1/memory/rules/evaluate", input, opts);
  }

  async toolsSelect(input: ToolsSelectInput, opts?: RequestOptions): Promise<AionisResponse<ToolsSelectResponse>> {
    return this.requestPost<ToolsSelectInput, ToolsSelectResponse>("/v1/memory/tools/select", input, opts);
  }

  async toolsDecision(input: ToolsDecisionInput, opts?: RequestOptions): Promise<AionisResponse<ToolsDecisionResponse>> {
    return this.requestPost<ToolsDecisionInput, ToolsDecisionResponse>("/v1/memory/tools/decision", input, opts);
  }

  async toolsRun(input: ToolsRunInput, opts?: RequestOptions): Promise<AionisResponse<ToolsRunResponse>> {
    return this.requestPost<ToolsRunInput, ToolsRunResponse>("/v1/memory/tools/run", input, opts);
  }

  async toolsFeedback(input: ToolsFeedbackInput, opts?: RequestOptions): Promise<AionisResponse<ToolsFeedbackResponse>> {
    return this.requestPost<ToolsFeedbackInput, ToolsFeedbackResponse>("/v1/memory/tools/feedback", input, opts);
  }

  async feedback(input: RuleFeedbackInput, opts?: RequestOptions): Promise<AionisResponse<RuleFeedbackResponse>> {
    return this.requestPost<RuleFeedbackInput, RuleFeedbackResponse>("/v1/memory/feedback", input, opts);
  }

  async rulesState(input: RuleStateUpdateInput, opts?: RequestOptions): Promise<AionisResponse<RuleStateUpdateResponse>> {
    return this.requestPost<RuleStateUpdateInput, RuleStateUpdateResponse>("/v1/memory/rules/state", input, opts);
  }

  async replayRunStart(input: ReplayRunStartInput, opts?: RequestOptions): Promise<AionisResponse<ReplayRunStartResponse>> {
    return this.requestPost<ReplayRunStartInput, ReplayRunStartResponse>("/v1/memory/replay/run/start", input, opts);
  }

  async replayStepBefore(
    input: ReplayStepBeforeInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ReplayStepBeforeResponse>> {
    return this.requestPost<ReplayStepBeforeInput, ReplayStepBeforeResponse>("/v1/memory/replay/step/before", input, opts);
  }

  async replayStepAfter(input: ReplayStepAfterInput, opts?: RequestOptions): Promise<AionisResponse<ReplayStepAfterResponse>> {
    return this.requestPost<ReplayStepAfterInput, ReplayStepAfterResponse>("/v1/memory/replay/step/after", input, opts);
  }

  async replayRunEnd(input: ReplayRunEndInput, opts?: RequestOptions): Promise<AionisResponse<ReplayRunEndResponse>> {
    return this.requestPost<ReplayRunEndInput, ReplayRunEndResponse>("/v1/memory/replay/run/end", input, opts);
  }

  async replayRunGet(input: ReplayRunGetInput, opts?: RequestOptions): Promise<AionisResponse<ReplayRunGetResponse>> {
    return this.requestPost<ReplayRunGetInput, ReplayRunGetResponse>("/v1/memory/replay/runs/get", input, opts);
  }

  async replayPlaybookCompileFromRun(
    input: ReplayPlaybookCompileInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ReplayPlaybookCompileResponse>> {
    return this.requestPost<ReplayPlaybookCompileInput, ReplayPlaybookCompileResponse>(
      "/v1/memory/replay/playbooks/compile_from_run",
      input,
      opts,
    );
  }

  async replayPlaybookGet(
    input: ReplayPlaybookGetInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ReplayPlaybookGetResponse>> {
    return this.requestPost<ReplayPlaybookGetInput, ReplayPlaybookGetResponse>("/v1/memory/replay/playbooks/get", input, opts);
  }

  async replayPlaybookCandidate(
    input: ReplayPlaybookCandidateInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ReplayPlaybookCandidateResponse>> {
    return this.requestPost<ReplayPlaybookCandidateInput, ReplayPlaybookCandidateResponse>(
      "/v1/memory/replay/playbooks/candidate",
      input,
      opts,
    );
  }

  async replayPlaybookPromote(
    input: ReplayPlaybookPromoteInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ReplayPlaybookPromoteResponse>> {
    return this.requestPost<ReplayPlaybookPromoteInput, ReplayPlaybookPromoteResponse>(
      "/v1/memory/replay/playbooks/promote",
      input,
      opts,
    );
  }

  async replayPlaybookRepair(
    input: ReplayPlaybookRepairInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ReplayPlaybookRepairResponse>> {
    return this.requestPost<ReplayPlaybookRepairInput, ReplayPlaybookRepairResponse>("/v1/memory/replay/playbooks/repair", input, opts);
  }

  async replayPlaybookRepairReview(
    input: ReplayPlaybookRepairReviewInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ReplayPlaybookRepairReviewResponse>> {
    return this.requestPost<ReplayPlaybookRepairReviewInput, ReplayPlaybookRepairReviewResponse>(
      "/v1/memory/replay/playbooks/repair/review",
      input,
      opts,
    );
  }

  async replayPlaybookRun(input: ReplayPlaybookRunInput, opts?: RequestOptions): Promise<AionisResponse<ReplayPlaybookRunResponse>> {
    return this.requestPost<ReplayPlaybookRunInput, ReplayPlaybookRunResponse>("/v1/memory/replay/playbooks/run", input, opts);
  }

  async replayPlaybookDispatch(
    input: ReplayPlaybookDispatchInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ReplayPlaybookDispatchResponse>> {
    return this.requestPost<ReplayPlaybookDispatchInput, ReplayPlaybookDispatchResponse>(
      "/v1/memory/replay/playbooks/dispatch",
      input,
      opts,
    );
  }

  async automationCreate(input: AutomationCreateInput, opts?: RequestOptions): Promise<AionisResponse<AutomationCreateResponse>> {
    return this.requestPost<AutomationCreateInput, AutomationCreateResponse>("/v1/automations/create", input, opts);
  }

  async automationGet(input: AutomationGetInput, opts?: RequestOptions): Promise<AionisResponse<AutomationGetResponse>> {
    return this.requestPost<AutomationGetInput, AutomationGetResponse>("/v1/automations/get", input, opts);
  }

  async automationShadowReport(input: AutomationShadowReportInput, opts?: RequestOptions): Promise<AionisResponse<AutomationShadowReportResponse>> {
    return this.requestPost<AutomationShadowReportInput, AutomationShadowReportResponse>("/v1/automations/shadow/report", input, opts);
  }

  async automationShadowReview(input: AutomationShadowReviewInput, opts?: RequestOptions): Promise<AionisResponse<AutomationShadowReportResponse>> {
    return this.requestPost<AutomationShadowReviewInput, AutomationShadowReportResponse>("/v1/automations/shadow/review", input, opts);
  }

  async automationShadowValidate(input: AutomationShadowValidateInput, opts?: RequestOptions): Promise<AionisResponse<AutomationShadowValidateResponse>> {
    return this.requestPost<AutomationShadowValidateInput, AutomationShadowValidateResponse>("/v1/automations/shadow/validate", input, opts);
  }

  async automationShadowValidateDispatch(input: AutomationShadowValidateDispatchInput, opts?: RequestOptions): Promise<AionisResponse<AutomationShadowValidateDispatchResponse>> {
    return this.requestPost<AutomationShadowValidateDispatchInput, AutomationShadowValidateDispatchResponse>("/v1/automations/shadow/validate/dispatch", input, opts);
  }

  async automationCompensationPolicyMatrix(input: AutomationCompensationPolicyMatrixInput = {}, opts?: RequestOptions): Promise<AionisResponse<AutomationCompensationPolicyMatrixResponse>> {
    return this.requestPost<AutomationCompensationPolicyMatrixInput, AutomationCompensationPolicyMatrixResponse>("/v1/automations/compensation/policy_matrix", input, opts);
  }

  async automationList(input: AutomationListInput, opts?: RequestOptions): Promise<AionisResponse<AutomationListResponse>> {
    return this.requestPost<AutomationListInput, AutomationListResponse>("/v1/automations/list", input, opts);
  }

  async automationTelemetry(input: AutomationTelemetryInput, opts?: RequestOptions): Promise<AionisResponse<AutomationTelemetryResponse>> {
    return this.requestPost<AutomationTelemetryInput, AutomationTelemetryResponse>("/v1/automations/telemetry", input, opts);
  }

  async automationAssignReviewer(input: AutomationAssignReviewerInput, opts?: RequestOptions): Promise<AionisResponse<AutomationGetResponse>> {
    return this.requestPost<AutomationAssignReviewerInput, AutomationGetResponse>("/v1/automations/assign_reviewer", input, opts);
  }

  async automationPromote(input: AutomationPromoteInput, opts?: RequestOptions): Promise<AionisResponse<AutomationPromoteResponse>> {
    return this.requestPost<AutomationPromoteInput, AutomationPromoteResponse>("/v1/automations/promote", input, opts);
  }

  async automationValidate(input: AutomationValidateInput, opts?: RequestOptions): Promise<AionisResponse<AutomationValidateResponse>> {
    return this.requestPost<AutomationValidateInput, AutomationValidateResponse>("/v1/automations/validate", input, opts);
  }

  async automationGraphValidate(
    input: AutomationValidateInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<AutomationValidateResponse>> {
    return this.requestPost<AutomationValidateInput, AutomationValidateResponse>("/v1/automations/graph/validate", input, opts);
  }

  async automationRun(input: AutomationRunInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunResponse>> {
    return this.requestPost<AutomationRunInput, AutomationRunResponse>("/v1/automations/run", input, opts);
  }

  async automationRunGet(input: AutomationRunGetInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunGetResponse>> {
    return this.requestPost<AutomationRunGetInput, AutomationRunGetResponse>("/v1/automations/runs/get", input, opts);
  }

  async automationRunList(input: AutomationRunListInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunListResponse>> {
    return this.requestPost<AutomationRunListInput, AutomationRunListResponse>("/v1/automations/runs/list", input, opts);
  }

  async automationRunAssignReviewer(input: AutomationRunAssignReviewerInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunResponse>> {
    return this.requestPost<AutomationRunAssignReviewerInput, AutomationRunResponse>("/v1/automations/runs/assign_reviewer", input, opts);
  }

  async automationRunCancel(input: AutomationRunCancelInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunResponse>> {
    return this.requestPost<AutomationRunCancelInput, AutomationRunResponse>("/v1/automations/runs/cancel", input, opts);
  }

  async automationRunApproveRepair(input: AutomationRunApproveRepairInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunResponse>> {
    return this.requestPost<AutomationRunApproveRepairInput, AutomationRunResponse>("/v1/automations/runs/approve_repair", input, opts);
  }

  async automationRunCompensationRetry(input: AutomationRunCompensationRetryInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunResponse>> {
    return this.requestPost<AutomationRunCompensationRetryInput, AutomationRunResponse>("/v1/automations/runs/compensation/retry", input, opts);
  }

  async automationRunCompensationAssign(input: AutomationRunCompensationAssignInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunGetResponse>> {
    return this.requestPost<AutomationRunCompensationAssignInput, AutomationRunGetResponse>("/v1/automations/runs/compensation/assign", input, opts);
  }

  async automationRunCompensationRecordAction(input: AutomationRunCompensationRecordActionInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunGetResponse>> {
    return this.requestPost<AutomationRunCompensationRecordActionInput, AutomationRunGetResponse>("/v1/automations/runs/compensation/record_action", input, opts);
  }

  async automationRunResume(input: AutomationRunResumeInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunResponse>> {
    return this.requestPost<AutomationRunResumeInput, AutomationRunResponse>("/v1/automations/runs/resume", input, opts);
  }

  async automationRunRejectRepair(input: AutomationRunRejectRepairInput, opts?: RequestOptions): Promise<AionisResponse<AutomationRunResponse>> {
    return this.requestPost<AutomationRunRejectRepairInput, AutomationRunResponse>("/v1/automations/runs/reject_repair", input, opts);
  }

  async health(opts?: RequestOptions): Promise<AionisResponse<HealthResponse>> {
    return this.requestGet<HealthResponse>("/health", undefined, opts);
  }

  async getCapabilityContract(opts?: RequestOptions): Promise<AionisResponse<Record<string, CapabilityContractSpec>>> {
    const out = await this.health(opts);
    const contract =
      out.data && typeof out.data === "object" && out.data.memory_store_capability_contract
        ? out.data.memory_store_capability_contract
        : {};
    return {
      data: contract,
      status: out.status,
      request_id: out.request_id,
    };
  }

  async controlUpsertTenant(input: ControlTenantInput, opts?: RequestOptions): Promise<AionisResponse<ControlTenantResponse>> {
    return this.requestPost<ControlTenantInput, ControlTenantResponse>("/v1/admin/control/tenants", input, opts);
  }

  async controlListTenants(query?: ControlTenantsQuery, opts?: RequestOptions): Promise<AionisResponse<ControlTenantsResponse>> {
    return this.requestGet<ControlTenantsResponse>("/v1/admin/control/tenants", query, opts);
  }

  async controlUpsertProject(input: ControlProjectInput, opts?: RequestOptions): Promise<AionisResponse<ControlProjectResponse>> {
    return this.requestPost<ControlProjectInput, ControlProjectResponse>("/v1/admin/control/projects", input, opts);
  }

  async controlCreateApiKey(input: ControlApiKeyInput, opts?: RequestOptions): Promise<AionisResponse<ControlApiKeyResponse>> {
    return this.requestPost<ControlApiKeyInput, ControlApiKeyResponse>("/v1/admin/control/api-keys", input, opts);
  }

  async controlListApiKeys(query?: ControlApiKeysQuery, opts?: RequestOptions): Promise<AionisResponse<ControlApiKeysResponse>> {
    return this.requestGet<ControlApiKeysResponse>("/v1/admin/control/api-keys", query, opts);
  }

  async controlListStaleApiKeys(
    query?: ControlApiKeysStaleQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlApiKeysStaleResponse>> {
    return this.requestGet<ControlApiKeysStaleResponse>("/v1/admin/control/api-keys/stale", query, opts);
  }

  async controlRevokeApiKey(id: string, opts?: RequestOptions): Promise<AionisResponse<ControlApiKeyResponse>> {
    const keyId = String(id ?? "").trim();
    if (!keyId) throw new Error("id is required");
    return this.requestPost<undefined, ControlApiKeyResponse>(
      `/v1/admin/control/api-keys/${encodeURIComponent(keyId)}/revoke`,
      undefined,
      opts,
    );
  }

  async controlRotateApiKey(
    id: string,
    input?: ControlApiKeyRotateInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlApiKeyResponse>> {
    const keyId = String(id ?? "").trim();
    if (!keyId) throw new Error("id is required");
    return this.requestPost<ControlApiKeyRotateInput, ControlApiKeyResponse>(
      `/v1/admin/control/api-keys/${encodeURIComponent(keyId)}/rotate`,
      input ?? {},
      opts,
    );
  }

  async controlCreateAlertRoute(
    input: ControlAlertRouteInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAlertRouteResponse>> {
    return this.requestPost<ControlAlertRouteInput, ControlAlertRouteResponse>("/v1/admin/control/alerts/routes", input, opts);
  }

  async controlListAlertRoutes(
    query?: ControlAlertRoutesQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAlertRoutesResponse>> {
    return this.requestGet<ControlAlertRoutesResponse>("/v1/admin/control/alerts/routes", query, opts);
  }

  async controlUpdateAlertRouteStatus(
    id: string,
    input: ControlAlertRouteStatusInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAlertRouteResponse>> {
    const routeId = String(id ?? "").trim();
    if (!routeId) throw new Error("id is required");
    return this.requestPost<ControlAlertRouteStatusInput, ControlAlertRouteResponse>(
      `/v1/admin/control/alerts/routes/${encodeURIComponent(routeId)}/status`,
      input,
      opts,
    );
  }

  async controlListAlertDeliveries(
    query?: ControlAlertDeliveriesQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAlertDeliveriesResponse>> {
    return this.requestGet<ControlAlertDeliveriesResponse>("/v1/admin/control/alerts/deliveries", query, opts);
  }

  async controlReplayAlertDeliveries(
    input: ControlAlertDeliveryReplayInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAlertDeliveryReplayResponse>> {
    return this.requestPost<ControlAlertDeliveryReplayInput, ControlAlertDeliveryReplayResponse>(
      "/v1/admin/control/alerts/deliveries/replay",
      input,
      opts,
    );
  }

  async controlAssignAlertDeliveries(
    input: ControlAlertDeliveryAssignInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAlertDeliveryAssignResponse>> {
    return this.requestPost<ControlAlertDeliveryAssignInput, ControlAlertDeliveryAssignResponse>(
      "/v1/admin/control/alerts/deliveries/assign",
      input,
      opts,
    );
  }

  async controlAutomationAlertPreview(
    input: ControlAutomationAlertPreviewInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAutomationAlertPreviewResponse>> {
    return this.requestPost<ControlAutomationAlertPreviewInput, ControlAutomationAlertPreviewResponse>(
      "/v1/admin/control/automations/alerts/preview",
      input,
      opts,
    );
  }

  async controlAutomationAlertDispatch(
    input: ControlAutomationAlertDispatchInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAutomationAlertDispatchResponse>> {
    return this.requestPost<ControlAutomationAlertDispatchInput, ControlAutomationAlertDispatchResponse>(
      "/v1/admin/control/automations/alerts/dispatch",
      input,
      opts,
    );
  }

  async controlEnqueueIncidentPublishJob(
    input: ControlIncidentPublishJobInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlIncidentPublishJobResponse>> {
    return this.requestPost<ControlIncidentPublishJobInput, ControlIncidentPublishJobResponse>(
      "/v1/admin/control/incident-publish/jobs",
      input,
      opts,
    );
  }

  async controlListIncidentPublishJobs(
    query?: ControlIncidentPublishJobsQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlIncidentPublishJobsResponse>> {
    return this.requestGet<ControlIncidentPublishJobsResponse>("/v1/admin/control/incident-publish/jobs", query, opts);
  }

  async controlReplayIncidentPublishJobs(
    input: ControlIncidentPublishReplayInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlIncidentPublishReplayResponse>> {
    return this.requestPost<ControlIncidentPublishReplayInput, ControlIncidentPublishReplayResponse>(
      "/v1/admin/control/incident-publish/jobs/replay",
      input,
      opts,
    );
  }

  async controlUpsertTenantQuota(
    tenantId: string,
    input: ControlTenantQuotaInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlTenantQuotaResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestPut<ControlTenantQuotaInput, ControlTenantQuotaResponse>(
      `/v1/admin/control/tenant-quotas/${encodeURIComponent(tid)}`,
      input,
      opts,
    );
  }

  async controlGetTenantQuota(tenantId: string, opts?: RequestOptions): Promise<AionisResponse<ControlTenantQuotaResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestGet<ControlTenantQuotaResponse>(`/v1/admin/control/tenant-quotas/${encodeURIComponent(tid)}`, undefined, opts);
  }

  async controlDeleteTenantQuota(
    tenantId: string,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlTenantQuotaDeleteResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestDelete<ControlTenantQuotaDeleteResponse>(`/v1/admin/control/tenant-quotas/${encodeURIComponent(tid)}`, opts);
  }

  async controlUpsertSandboxBudget(
    tenantId: string,
    input: ControlSandboxBudgetInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlSandboxBudgetResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestPut<ControlSandboxBudgetInput, ControlSandboxBudgetResponse>(
      `/v1/admin/control/sandbox-budgets/${encodeURIComponent(tid)}`,
      input,
      opts,
    );
  }

  async controlGetSandboxBudget(
    tenantId: string,
    query?: ControlSandboxBudgetGetQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlSandboxBudgetResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestGet<ControlSandboxBudgetResponse>(
      `/v1/admin/control/sandbox-budgets/${encodeURIComponent(tid)}`,
      query,
      opts,
    );
  }

  async controlDeleteSandboxBudget(
    tenantId: string,
    query?: ControlSandboxBudgetGetQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlSandboxBudgetDeleteResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.request<ControlSandboxBudgetDeleteResponse>(
      "DELETE",
      `/v1/admin/control/sandbox-budgets/${encodeURIComponent(tid)}`,
      opts,
      undefined,
      query ?? {},
    );
  }

  async controlListSandboxBudgets(
    query?: ControlSandboxBudgetsQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlSandboxBudgetsResponse>> {
    return this.requestGet<ControlSandboxBudgetsResponse>("/v1/admin/control/sandbox-budgets", query, opts);
  }

  async controlUpsertSandboxProjectBudget(
    tenantId: string,
    projectId: string,
    input: ControlSandboxProjectBudgetInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlSandboxProjectBudgetResponse>> {
    const tid = String(tenantId ?? "").trim();
    const pid = String(projectId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    if (!pid) throw new Error("projectId is required");
    return this.requestPut<ControlSandboxProjectBudgetInput, ControlSandboxProjectBudgetResponse>(
      `/v1/admin/control/sandbox-project-budgets/${encodeURIComponent(tid)}/${encodeURIComponent(pid)}`,
      input,
      opts,
    );
  }

  async controlGetSandboxProjectBudget(
    tenantId: string,
    projectId: string,
    query?: ControlSandboxProjectBudgetGetQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlSandboxProjectBudgetResponse>> {
    const tid = String(tenantId ?? "").trim();
    const pid = String(projectId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    if (!pid) throw new Error("projectId is required");
    return this.requestGet<ControlSandboxProjectBudgetResponse>(
      `/v1/admin/control/sandbox-project-budgets/${encodeURIComponent(tid)}/${encodeURIComponent(pid)}`,
      query,
      opts,
    );
  }

  async controlDeleteSandboxProjectBudget(
    tenantId: string,
    projectId: string,
    query?: ControlSandboxProjectBudgetGetQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlSandboxProjectBudgetDeleteResponse>> {
    const tid = String(tenantId ?? "").trim();
    const pid = String(projectId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    if (!pid) throw new Error("projectId is required");
    return this.request<ControlSandboxProjectBudgetDeleteResponse>(
      "DELETE",
      `/v1/admin/control/sandbox-project-budgets/${encodeURIComponent(tid)}/${encodeURIComponent(pid)}`,
      opts,
      undefined,
      query ?? {},
    );
  }

  async controlListSandboxProjectBudgets(
    query?: ControlSandboxProjectBudgetsQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlSandboxProjectBudgetsResponse>> {
    return this.requestGet<ControlSandboxProjectBudgetsResponse>("/v1/admin/control/sandbox-project-budgets", query, opts);
  }

  async controlListAuditEvents(
    query?: ControlAuditEventsQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlAuditEventsResponse>> {
    return this.requestGet<ControlAuditEventsResponse>("/v1/admin/control/audit-events", query, opts);
  }

  async controlGetTenantDashboard(
    tenantId: string,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlTenantDashboardResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestGet<ControlTenantDashboardResponse>(`/v1/admin/control/dashboard/tenant/${encodeURIComponent(tid)}`, undefined, opts);
  }

  async controlGetTenantDiagnostics(
    tenantId: string,
    query?: ControlTenantDiagnosticsQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlTenantDiagnosticsResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestGet<ControlTenantDiagnosticsResponse>(
      `/v1/admin/control/diagnostics/tenant/${encodeURIComponent(tid)}`,
      query,
      opts,
    );
  }

  async controlGetTenantIncidentPublishRollup(
    tenantId: string,
    query?: ControlIncidentPublishRollupQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlIncidentPublishRollupResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestGet<ControlIncidentPublishRollupResponse>(
      `/v1/admin/control/dashboard/tenant/${encodeURIComponent(tid)}/incident-publish-rollup`,
      query,
      opts,
    );
  }

  async controlGetTenantIncidentPublishSlo(
    tenantId: string,
    query?: ControlIncidentPublishSloQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlIncidentPublishSloResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestGet<ControlIncidentPublishSloResponse>(
      `/v1/admin/control/dashboard/tenant/${encodeURIComponent(tid)}/incident-publish-slo`,
      query,
      opts,
    );
  }

  async controlGetTenantTimeseries(
    tenantId: string,
    query?: ControlTenantTimeseriesQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlTenantTimeseriesResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestGet<ControlTenantTimeseriesResponse>(
      `/v1/admin/control/dashboard/tenant/${encodeURIComponent(tid)}/timeseries`,
      query,
      opts,
    );
  }

  async controlGetTenantKeyUsage(
    tenantId: string,
    query?: ControlTenantKeyUsageQuery,
    opts?: RequestOptions,
  ): Promise<AionisResponse<ControlTenantKeyUsageResponse>> {
    const tid = String(tenantId ?? "").trim();
    if (!tid) throw new Error("tenantId is required");
    return this.requestGet<ControlTenantKeyUsageResponse>(
      `/v1/admin/control/dashboard/tenant/${encodeURIComponent(tid)}/key-usage`,
      query,
      opts,
    );
  }

  private async requestPost<TReq, TRes>(path: string, body: TReq, opts?: RequestOptions): Promise<AionisResponse<TRes>> {
    return this.request<TRes>("POST", path, opts, body, undefined);
  }

  private async requestPut<TReq, TRes>(path: string, body: TReq, opts?: RequestOptions): Promise<AionisResponse<TRes>> {
    return this.request<TRes>("PUT", path, opts, body, undefined);
  }

  private async requestGet<TRes>(path: string, query?: Record<string, unknown>, opts?: RequestOptions): Promise<AionisResponse<TRes>> {
    return this.request<TRes>("GET", path, opts, undefined, query);
  }

  private async requestDelete<TRes>(path: string, opts?: RequestOptions): Promise<AionisResponse<TRes>> {
    return this.request<TRes>("DELETE", path, opts, undefined, undefined);
  }

  private async request<TRes>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts?: RequestOptions,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<AionisResponse<TRes>> {
    const requestId = opts?.request_id ?? randomUUID();
    const perReqRetry = clampRetryPolicy(mergeRetryPolicy(this.retry, opts?.retry));
    const timeoutMs = opts?.timeout_ms ?? this.timeoutMs;
    const url = `${joinUrl(this.baseUrl, path)}${buildQueryString(query)}`;

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-request-id": requestId,
      ...this.defaultHeaders,
      ...(opts?.headers ?? {}),
    };
    const apiKey = opts?.api_key ?? this.apiKey;
    if (apiKey && !hasHeader(headers, "x-api-key")) headers["x-api-key"] = apiKey;

    const authBearer = opts?.auth_bearer ?? this.authBearer;
    if (authBearer && !hasHeader(headers, "authorization")) {
      headers.authorization = authBearer.toLowerCase().startsWith("bearer ") ? authBearer : `Bearer ${authBearer}`;
    }

    const adminToken = opts?.admin_token ?? this.adminToken;
    if (adminToken && !hasHeader(headers, "x-admin-token")) headers["x-admin-token"] = adminToken;

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= perReqRetry.max_retries; attempt++) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
          signal: abort.signal,
        });
        clearTimeout(timer);
        const responseRequestId = res.headers.get("x-request-id") ?? requestId;
        const parsedBody = (await parseBody(res)) as TRes | ApiErrorPayload;

        if (res.ok) {
          return {
            data: parsedBody as TRes,
            status: res.status,
            request_id: responseRequestId,
          };
        }

        const errPayload = (parsedBody ?? {}) as ApiErrorPayload;
        const code = errPayload.error ?? `http_${res.status}`;
        const message = errPayload.message ?? `request failed with status ${res.status}`;
        const apiErr = new AionisApiError({
          status: res.status,
          code,
          message,
          details: errPayload.details ?? null,
          request_id: responseRequestId,
          issues: Array.isArray(errPayload.issues) ? errPayload.issues : null,
        });

        const canRetry = attempt < perReqRetry.max_retries && shouldRetryStatus(res.status);
        if (!canRetry) throw apiErr;

        const retryAfterMs = parseRetryAfterMs(res);
        await sleep(retryAfterMs ?? computeBackoffMs(perReqRetry, attempt + 1));
        continue;
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err;

        const isAbort = err?.name === "AbortError" || String(err?.message ?? "").toLowerCase().includes("aborted");
        const canRetry = attempt < perReqRetry.max_retries;
        if (!canRetry) break;

        if (err instanceof AionisApiError) {
          throw err;
        }
        await sleep(computeBackoffMs(perReqRetry, attempt + 1));
        if (isAbort) continue;
      }
    }

    if (lastError instanceof AionisApiError) throw lastError;
    throw new AionisNetworkError(
      `network request failed for ${method} ${path}: ${String((lastError as any)?.message ?? lastError ?? "unknown error")}`,
      requestId,
    );
  }
}
