import type {
  AutomationCreateInput,
  AutomationAssignReviewerInput,
  AutomationTelemetryInput,
  AutomationGetInput,
  AutomationShadowReportInput,
  AutomationShadowReviewInput,
  AutomationShadowValidateInput,
  AutomationShadowValidateDispatchInput,
  AutomationCompensationPolicyMatrixInput,
  AutomationListInput,
  AutomationPromoteInput,
  AutomationValidateInput,
  AutomationRunApproveRepairInput,
  AutomationRunCancelInput,
  AutomationRunCompensationAssignInput,
  AutomationRunCompensationRecordActionInput,
  AutomationRunCompensationRetryInput,
  AutomationRunGetInput,
  AutomationRunListInput,
  AutomationRunAssignReviewerInput,
  AutomationRunRejectRepairInput,
  AutomationRunResumeInput,
  SandboxExecuteInput,
  SandboxRunCancelInput,
  SandboxRunGetInput,
  SandboxRunLogsInput,
  SandboxSessionCreateInput,
  ContextAssembleInput,
  ContextLayerConfigInput,
  MemoryEventWriteInput,
  MemoryFindInput,
  MemoryResolveInput,
  MemoryPackExportInput,
  MemoryPackImportInput,
  MemoryRecallInput,
  MemoryRecallTextInput,
  ReplayPlaybookCandidateInput,
  ReplayPlaybookDispatchInput,
  ReplayPlaybookGetInput,
  ReplayPlaybookRunInput,
  MemorySessionCreateInput,
  MemorySessionEventsListInput as MemorySessionEventsListSchemaInput,
  MemoryWriteInput,
  RulesEvaluateInput,
  ToolsDecisionInput,
  ToolsFeedbackInput,
  ToolsRunInput,
  ToolsSelectInput,
} from "../memory/schemas.js";

export type {
  AutomationCreateInput,
  AutomationAssignReviewerInput,
  AutomationTelemetryInput,
  AutomationGetInput,
  AutomationShadowReportInput,
  AutomationShadowReviewInput,
  AutomationShadowValidateInput,
  AutomationShadowValidateDispatchInput,
  AutomationCompensationPolicyMatrixInput,
  AutomationListInput,
  AutomationPromoteInput,
  AutomationValidateInput,
  AutomationRunApproveRepairInput,
  AutomationRunCancelInput,
  AutomationRunCompensationAssignInput,
  AutomationRunCompensationRecordActionInput,
  AutomationRunCompensationRetryInput,
  AutomationRunGetInput,
  AutomationRunListInput,
  AutomationRunAssignReviewerInput,
  AutomationRunRejectRepairInput,
  AutomationRunResumeInput,
  SandboxExecuteInput,
  SandboxRunCancelInput,
  SandboxRunGetInput,
  SandboxRunLogsInput,
  SandboxSessionCreateInput,
  ContextAssembleInput,
  ContextLayerConfigInput,
  MemoryEventWriteInput,
  MemoryFindInput,
  MemoryResolveInput,
  MemoryPackExportInput,
  MemoryPackImportInput,
  MemoryRecallInput,
  MemoryRecallTextInput,
  ReplayPlaybookCandidateInput,
  ReplayPlaybookDispatchInput,
  ReplayPlaybookGetInput,
  ReplayPlaybookRunInput,
  MemorySessionCreateInput,
  MemoryWriteInput,
  RulesEvaluateInput,
  ToolsDecisionInput,
  ToolsFeedbackInput,
  ToolsRunInput,
  ToolsSelectInput,
};

export type MemorySessionEventsListInput = Partial<Omit<MemorySessionEventsListSchemaInput, "session_id">>;
export type ContextLayerName = "facts" | "episodes" | "rules" | "decisions" | "tools" | "citations";
export type AutomationDefStatus = "draft" | "shadow" | "active" | "disabled";
export type AutomationRunLifecycleState = "queued" | "running" | "paused" | "compensating" | "terminal";
export type AutomationRunPauseReason = "approval_required" | "repair_required" | "dependency_wait" | "operator_pause";
export type AutomationRunTerminalOutcome = "succeeded" | "failed" | "cancelled" | "failed_compensated" | "cancelled_compensated";
export type AutomationNodeKind = "playbook" | "approval" | "condition" | "artifact_gate";
export type AutomationNodeLifecycleState = "pending" | "ready" | "running" | "paused" | "retrying" | "compensating" | "terminal";
export type AutomationNodePauseReason = "approval_required" | "repair_required";
export type AutomationNodeTerminalOutcome = "succeeded" | "failed" | "rejected" | "skipped" | "compensated";
export type AutomationRunInput = {
  tenant_id?: string;
  scope?: string;
  actor?: string;
  automation_id: string;
  version?: number;
  params?: Record<string, unknown>;
  options?: {
    execution_mode?: "default" | "shadow";
    allow_local_exec?: boolean;
    record_run?: boolean;
    stop_on_failure?: boolean;
  };
};

export type AutomationPromoteResponse = {
  tenant_id: string;
  scope: string;
  from_version: number;
  to_version: number;
  status?: AutomationDefStatus;
  unchanged?: boolean;
  reason?: string | null;
  automation: {
    automation_id: string;
    name: string;
    status: AutomationDefStatus;
    definition_status?: AutomationDefStatus;
    version: number;
    latest_version: number;
    input_contract: Record<string, unknown>;
    output_contract: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version_metadata?: Record<string, unknown>;
    graph: Record<string, unknown>;
    compile_summary: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
    version_created_at?: string;
    [k: string]: unknown;
  };
  validation: {
    node_ids: string[];
    start_node_ids: string[];
    topological_order: string[];
    issues: Array<Record<string, unknown>>;
  };
  [k: string]: unknown;
};

export type AutomationTelemetryResponse = {
  tenant_id: string;
  scope: string;
  window_hours: number;
  automation_id?: string | null;
  summary: {
    total_runs: number;
    terminal_runs: number;
    succeeded_runs: number;
    failed_runs: number;
    cancelled_runs: number;
    compensated_runs: number;
    paused_runs: number;
    repair_paused_runs: number;
    approval_paused_runs: number;
    compensation_failed_runs: number;
    shadow_runs: number;
    active_runs: number;
    success_rate?: number | null;
    pause_rate?: number | null;
    compensation_failure_rate?: number | null;
    p95_duration_seconds?: number | null;
    slo?: Record<string, unknown>;
    [k: string]: unknown;
  };
  alert_candidates: Array<{
    code: string;
    severity: "warning" | "critical" | string;
    summary: string;
    recommended_event_type?: string;
    threshold?: number | null;
    current_value?: number | null;
    suggested_action?: string;
    [k: string]: unknown;
  }>;
  root_causes: Array<{
    root_cause_code?: string | null;
    count: number;
    [k: string]: unknown;
  }>;
  incidents: Array<AutomationRunView & {
    action_hint?: string | null;
  }>;
  [k: string]: unknown;
};

export type AutomationValidateResponse = {
  tenant_id: string;
  scope: string;
  validation: {
    node_ids: string[];
    start_node_ids: string[];
    topological_order: string[];
    issues: Array<Record<string, unknown>>;
  };
  graph: Record<string, unknown>;
  [k: string]: unknown;
};

export type ControlTenantInput = {
  tenant_id: string;
  display_name?: string | null;
  status?: "active" | "suspended";
  metadata?: Record<string, unknown>;
};

export type ControlTenantsQuery = {
  status?: "active" | "suspended";
  limit?: number;
  offset?: number;
};

export type ControlProjectInput = {
  project_id: string;
  tenant_id: string;
  display_name?: string | null;
  status?: "active" | "archived";
  metadata?: Record<string, unknown>;
};

export type ControlApiKeyInput = {
  tenant_id: string;
  project_id?: string | null;
  label?: string | null;
  role?: string | null;
  agent_id?: string | null;
  team_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type ControlApiKeysQuery = {
  tenant_id?: string;
  project_id?: string;
  status?: "active" | "revoked";
  limit?: number;
  offset?: number;
};

export type ControlApiKeysStaleQuery = {
  max_age_days?: number;
  warn_age_days?: number;
  rotation_window_days?: number;
  limit?: number;
};

export type ControlApiKeyRotateInput = {
  label?: string | null;
  metadata?: Record<string, unknown>;
};

export type ControlAlertRouteInput = {
  tenant_id: string;
  channel: "webhook" | "slack_webhook" | "pagerduty_events";
  label?: string | null;
  events?: string[];
  status?: "active" | "disabled";
  target: string;
  secret?: string | null;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type ControlAlertRoutesQuery = {
  tenant_id?: string;
  channel?: "webhook" | "slack_webhook" | "pagerduty_events";
  status?: "active" | "disabled";
  limit?: number;
  offset?: number;
};

export type ControlAlertRouteStatusInput = {
  status: "active" | "disabled";
};

export type ControlAlertDeliveriesQuery = {
  tenant_id?: string;
  event_type?: string;
  status?: "sent" | "failed" | "skipped";
  limit?: number;
  offset?: number;
};

export type ControlAutomationAlertPreviewInput = {
  tenant_id?: string;
  scope?: string;
  automation_id?: string;
  window_hours?: number;
  incident_limit?: number;
};

export type ControlAutomationAlertDispatchInput = {
  tenant_id?: string;
  scope?: string;
  automation_id?: string;
  window_hours?: number;
  incident_limit?: number;
  candidate_codes?: string[];
  dry_run?: boolean;
  dedupe_ttl_seconds?: number;
};

export type ControlAlertDeliveryReplayInput = {
  ids: string[];
  dry_run?: boolean;
  dedupe_ttl_seconds?: number;
  allow_disabled_route?: boolean;
  override_target?: string;
};

export type ControlAlertDeliveryAssignInput = {
  ids: string[];
  owner?: string | null;
  escalation_owner?: string | null;
  sla_target_at?: string | null;
  workflow_state?: "replay_backlog" | "manual_review" | "dead_letter" | null;
  note?: string | null;
  actor?: string;
};

export type ControlIncidentPublishJobInput = {
  tenant_id: string;
  run_id: string;
  source_dir: string;
  target: string;
  max_attempts?: number;
  metadata?: Record<string, unknown>;
};

export type ControlIncidentPublishJobsQuery = {
  tenant_id?: string;
  status?: "pending" | "processing" | "succeeded" | "failed" | "dead_letter";
  limit?: number;
  offset?: number;
};

export type ControlIncidentPublishReplayInput = {
  tenant_id?: string;
  statuses?: Array<"failed" | "dead_letter">;
  ids?: string[];
  limit?: number;
  reset_attempts?: boolean;
  reason?: string;
  dry_run?: boolean;
  allow_all_tenants?: boolean;
};

export type ControlTenantQuotaInput = {
  recall_rps: number;
  recall_burst: number;
  write_rps: number;
  write_burst: number;
  write_max_wait_ms: number;
  debug_embed_rps: number;
  debug_embed_burst: number;
  recall_text_embed_rps: number;
  recall_text_embed_burst: number;
  recall_text_embed_max_wait_ms: number;
};

export type ControlAuditEventsQuery = {
  tenant_id?: string;
  action?: string;
  limit?: number;
  offset?: number;
};

export type ControlTenantDiagnosticsQuery = {
  scope?: string;
  window_minutes?: number;
};

export type ControlIncidentPublishRollupQuery = {
  window_hours?: number;
  sample_limit?: number;
};

export type ControlIncidentPublishSloQuery = {
  window_hours?: number;
  baseline_hours?: number;
  min_jobs?: number;
  adaptive_multiplier?: number;
  failure_rate_floor?: number;
  dead_letter_rate_floor?: number;
  backlog_warning_abs?: number;
  dead_letter_backlog_warning_abs?: number;
  dead_letter_backlog_critical_abs?: number;
};

export type ControlTenantTimeseriesQuery = {
  endpoint?: "write" | "recall" | "recall_text" | "planning_context" | "context_assemble";
  window_hours?: number;
  limit?: number;
  offset?: number;
  cursor?: string;
};

export type ControlTenantKeyUsageQuery = {
  endpoint?: "write" | "recall" | "recall_text" | "planning_context" | "context_assemble";
  window_hours?: number;
  baseline_hours?: number;
  min_requests?: number;
  zscore_threshold?: number;
  limit?: number;
  offset?: number;
  cursor?: string;
};

export type AionisResponse<T> = {
  data: T;
  status: number;
  request_id: string | null;
};

export type RetryPolicy = {
  max_retries: number;
  base_delay_ms: number;
  max_delay_ms: number;
  jitter_ratio: number;
};

export type AionisClientOptions = {
  base_url: string;
  timeout_ms?: number;
  retry?: Partial<RetryPolicy>;
  default_headers?: Record<string, string>;
  admin_token?: string;
  api_key?: string;
  auth_bearer?: string;
};

export type RequestOptions = {
  request_id?: string;
  timeout_ms?: number;
  retry?: Partial<RetryPolicy>;
  admin_token?: string;
  api_key?: string;
  auth_bearer?: string;
  headers?: Record<string, string>;
};

export type ApiErrorPayload = {
  error?: string;
  message?: string;
  details?: unknown;
  issues?: Array<{ path: string; message: string }>;
};

export type CapabilityFailureMode = "hard_fail" | "soft_degrade";

export type CapabilityContractSpec = {
  failure_mode: CapabilityFailureMode;
  degraded_modes: string[];
};

export type BackendCapabilityErrorDetails = {
  capability: string;
  backend?: string;
  failure_mode?: CapabilityFailureMode;
  degraded_mode?: string;
  fallback_applied?: boolean;
  [k: string]: unknown;
};

export type ShadowDualWriteStrictFailureDetails = {
  capability: "shadow_mirror_v2";
  failure_mode?: CapabilityFailureMode;
  degraded_mode?: "capability_unsupported" | "mirror_failed";
  fallback_applied?: boolean;
  strict?: boolean;
  mirrored?: boolean;
  error?: string;
  [k: string]: unknown;
};

export class AionisApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly request_id: string | null;
  readonly issues: Array<{ path: string; message: string }> | null;

  constructor(args: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    request_id?: string | null;
    issues?: Array<{ path: string; message: string }> | null;
  }) {
    super(args.message);
    this.name = "AionisApiError";
    this.status = args.status;
    this.code = args.code;
    this.details = args.details ?? null;
    this.request_id = args.request_id ?? null;
    this.issues = args.issues ?? null;
  }
}

export class AionisNetworkError extends Error {
  readonly request_id: string | null;

  constructor(message: string, requestId?: string | null) {
    super(message);
    this.name = "AionisNetworkError";
    this.request_id = requestId ?? null;
  }
}

export function parseBackendCapabilityErrorDetails(details: unknown): BackendCapabilityErrorDetails | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const obj = details as Record<string, unknown>;
  if (typeof obj.capability !== "string" || obj.capability.trim().length === 0) return null;
  const out: BackendCapabilityErrorDetails = {
    capability: obj.capability,
  };
  if (typeof obj.backend === "string") out.backend = obj.backend;
  if (obj.failure_mode === "hard_fail" || obj.failure_mode === "soft_degrade") {
    out.failure_mode = obj.failure_mode;
  }
  if (typeof obj.degraded_mode === "string") out.degraded_mode = obj.degraded_mode;
  if (typeof obj.fallback_applied === "boolean") out.fallback_applied = obj.fallback_applied;
  for (const [k, v] of Object.entries(obj)) {
    if (k in out) continue;
    out[k] = v;
  }
  return out;
}

export function isBackendCapabilityUnsupportedError(err: unknown): err is AionisApiError & { details: BackendCapabilityErrorDetails } {
  if (!(err instanceof AionisApiError)) return false;
  if (err.code !== "backend_capability_unsupported") return false;
  return parseBackendCapabilityErrorDetails(err.details) !== null;
}

export function parseShadowDualWriteStrictFailureDetails(details: unknown): ShadowDualWriteStrictFailureDetails | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const obj = details as Record<string, unknown>;
  if (obj.capability !== "shadow_mirror_v2") return null;
  const out: ShadowDualWriteStrictFailureDetails = {
    capability: "shadow_mirror_v2",
  };
  if (obj.failure_mode === "hard_fail" || obj.failure_mode === "soft_degrade") {
    out.failure_mode = obj.failure_mode;
  }
  if (obj.degraded_mode === "capability_unsupported" || obj.degraded_mode === "mirror_failed") {
    out.degraded_mode = obj.degraded_mode;
  }
  if (typeof obj.fallback_applied === "boolean") out.fallback_applied = obj.fallback_applied;
  if (typeof obj.strict === "boolean") out.strict = obj.strict;
  if (typeof obj.mirrored === "boolean") out.mirrored = obj.mirrored;
  if (typeof obj.error === "string") out.error = obj.error;
  for (const [k, v] of Object.entries(obj)) {
    if (k in out) continue;
    out[k] = v;
  }
  return out;
}

export function isShadowDualWriteStrictFailureError(
  err: unknown,
): err is AionisApiError & { details: ShadowDualWriteStrictFailureDetails } {
  if (!(err instanceof AionisApiError)) return false;
  if (err.code !== "shadow_dual_write_strict_failure") return false;
  return parseShadowDualWriteStrictFailureDetails(err.details) !== null;
}

export type MemoryWriteWarning = {
  code: "write_no_nodes" | string;
  message: string;
  details?: Record<string, unknown>;
  [k: string]: unknown;
};

export type MemoryWriteResponse = {
  tenant_id?: string;
  scope?: string;
  commit_id: string;
  commit_uri?: string;
  commit_hash: string;
  nodes: Array<{ id: string; uri?: string; client_id?: string; type: string }>;
  edges: Array<{ id: string; uri?: string; type: string; src_id: string; dst_id: string }>;
  embedding_backfill?: { enqueued: true; pending_nodes: number };
  topic_cluster?: Record<string, unknown>;
  shadow_dual_write?: {
    enabled: boolean;
    strict: boolean;
    mirrored: boolean;
    copied?: { commits: number; nodes: number; edges: number; outbox: number };
    capability?: string;
    failure_mode?: CapabilityFailureMode;
    degraded_mode?: string;
    fallback_applied?: boolean;
    error?: string;
  };
  warnings?: MemoryWriteWarning[];
  [k: string]: unknown;
};

export type HealthResponse = {
  ok: boolean;
  memory_store_backend?: string;
  memory_store_recall_capabilities?: Record<string, boolean>;
  memory_store_write_capabilities?: Record<string, boolean>;
  memory_store_feature_capabilities?: Record<string, boolean>;
  memory_store_capability_contract?: Record<string, CapabilityContractSpec>;
  [k: string]: unknown;
};

export type RecallSeedDto = {
  id: string;
  uri?: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  tier: string;
  salience: number;
  confidence: number;
  similarity: number;
  [k: string]: unknown;
};

export type RecallSubgraphNodeDto = {
  id: string;
  uri?: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  [k: string]: unknown;
};

export type RecallSubgraphEdgeDto = {
  id: string;
  uri: string;
  from_id: string;
  to_id: string;
  type: string;
  weight: number;
  commit_uri?: string | null;
  [k: string]: unknown;
};

export type RecallRankedDto = {
  id: string;
  uri?: string;
  activation: number;
  score: number;
  [k: string]: unknown;
};

export type RecallContextItemDto = {
  kind: string;
  node_id: string;
  uri?: string;
  [k: string]: unknown;
};

export type RecallCitationDto = {
  node_id: string;
  uri?: string;
  commit_id?: string | null;
  commit_uri?: string;
  raw_ref?: string | null;
  evidence_ref?: string | null;
  [k: string]: unknown;
};

export type MemoryRecallResponse = {
  tenant_id?: string;
  scope: string;
  seeds: RecallSeedDto[];
  subgraph: {
    nodes: RecallSubgraphNodeDto[];
    edges: RecallSubgraphEdgeDto[];
  };
  ranked: RecallRankedDto[];
  context: {
    text: string;
    items: RecallContextItemDto[];
    citations: RecallCitationDto[];
  };
  debug?: Record<string, unknown>;
  rules?: Record<string, unknown>;
  query?: Record<string, unknown>;
  trajectory?: {
    strategy?: string;
    layers?: Array<Record<string, unknown>>;
    budgets?: Record<string, unknown>;
    pruned_reasons?: string[];
    uri_links?: {
      nodes: string[];
      edges: string[];
      commits: string[];
      decisions: string[];
      counts: {
        nodes: number;
        edges: number;
        commits: number;
        decisions: number;
      };
      chain?: {
        decision_uri: string;
        commit_uri?: string;
        node_uri?: string;
        edge_uri?: string;
      };
    };
    [k: string]: unknown;
  };
  observability?: Record<string, unknown>;
  [k: string]: unknown;
};

export type ContextAssembleResponse = {
  tenant_id?: string;
  scope: string;
  query: {
    text?: string;
    embedding_provider?: string;
    [k: string]: unknown;
  };
  recall: MemoryRecallResponse;
  rules?: RulesEvaluateResponse;
  tools?: ToolsSelectResponse;
  layered_context?: {
    version?: string;
    mode?: string;
    order?: string[];
    budget?: {
      total_chars?: number;
      used_chars?: number;
      remaining_chars?: number;
      [k: string]: unknown;
    };
    stats?: {
      source_items?: number;
      kept_items?: number;
      dropped_items?: number;
      forgotten_items?: number;
      layers_with_content?: number;
      [k: string]: unknown;
    };
    layers?: Record<
      string,
      {
        items?: Array<Record<string, unknown>>;
        source_count?: number;
        forgotten_count?: number;
        kept_count?: number;
        dropped_count?: number;
        budget_chars?: number | null;
        used_chars?: number;
        max_items?: number | null;
        [k: string]: unknown;
      }
    >;
    merged_text?: string;
    merge_trace?: Array<Record<string, unknown>>;
    dropped_reasons?: string[];
    forgetting?: {
      enabled?: boolean;
      allowed_tiers?: string[];
      exclude_archived?: boolean;
      min_salience?: number | null;
      dropped_items?: number;
      dropped_by_reason?: Record<string, number>;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type MemoryFindResponse = {
  tenant_id: string;
  scope: string;
  mode: "find";
  filters: Record<string, unknown>;
  nodes: Array<Record<string, unknown>>;
  page: {
    limit: number;
    offset: number;
    returned: number;
    has_more: boolean;
  };
  [k: string]: unknown;
};

export type MemoryResolveResponse = {
  tenant_id: string;
  scope: string;
  uri: string;
  type: "event" | "entity" | "topic" | "rule" | "evidence" | "concept" | "procedure" | "self_model" | "edge" | "commit" | "decision";
  node?: Record<string, unknown>;
  edge?: Record<string, unknown>;
  commit?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  [k: string]: unknown;
};

export type MemorySessionCreateResponse = {
  tenant_id: string;
  scope: string;
  session_id: string;
  session_node_id: string | null;
  session_uri: string | null;
  commit_id: string;
  commit_uri?: string;
  commit_hash: string;
  nodes: Array<{ id: string; client_id?: string; type: string }>;
  edges: Array<Record<string, unknown>>;
  embedding_backfill?: { enqueued: true; pending_nodes: number } | null;
  [k: string]: unknown;
};

export type MemoryEventWriteResponse = {
  tenant_id: string;
  scope: string;
  session_id: string;
  event_id: string;
  event_node_id: string | null;
  session_node_id: string | null;
  event_uri: string | null;
  session_uri: string | null;
  commit_id: string;
  commit_uri?: string;
  commit_hash: string;
  nodes: Array<{ id: string; client_id?: string; type: string }>;
  edges: Array<Record<string, unknown>>;
  embedding_backfill?: { enqueued: true; pending_nodes: number } | null;
  [k: string]: unknown;
};

export type MemorySessionEventsListResponse = {
  tenant_id: string;
  scope: string;
  session: {
    session_id: string;
    node_id: string;
    title: string | null;
    text_summary: string | null;
    uri: string;
  } | null;
  events: Array<Record<string, unknown>>;
  page: {
    limit: number;
    offset: number;
    returned: number;
    has_more: boolean;
  };
  [k: string]: unknown;
};

export type MemoryPackExportResponse = {
  tenant_id: string;
  scope: string;
  manifest: {
    version: string;
    pack_version: string;
    sha256: string;
    generated_at: string;
    counts: {
      nodes: number;
      edges: number;
      commits: number;
      decisions?: number;
    };
    truncated: {
      nodes: boolean;
      edges: boolean;
      commits: boolean;
      decisions?: boolean;
    };
    max_rows: number;
  };
  pack: {
    version: "aionis_pack_v1";
    tenant_id: string;
    scope: string;
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
    commits: Array<Record<string, unknown>>;
    decisions?: Array<Record<string, unknown>>;
  };
  [k: string]: unknown;
};

export type MemoryPackImportResponse = {
  ok: boolean;
  verified: boolean;
  imported: boolean;
  tenant_id: string;
  scope: string;
  pack_sha256: string;
  commit_id?: string;
  commit_hash?: string;
  nodes?: number;
  edges?: number;
  embedding_backfill?: { enqueued: true; pending_nodes: number } | null;
  planned?: { nodes: number; edges: number; commits_in_pack: number; decisions_in_pack?: number };
  [k: string]: unknown;
};

export type ReplayDeterministicGateResult = {
  enabled: boolean;
  requested_mode: "simulate" | "strict" | "guided";
  effective_mode: "simulate" | "strict" | "guided";
  decision: "disabled" | "matched" | "promoted_to_strict" | "fallback_to_requested_mode" | "rejected";
  mismatch_reasons?: string[];
  inference_skipped: boolean;
  playbook_status: string;
  required_statuses: string[];
  status_match: boolean;
  matchers_match: boolean;
  policy_constraints_match: boolean;
  matched: boolean;
  request_matcher_fingerprint?: string | null;
  playbook_matcher_fingerprint?: string | null;
  request_policy_fingerprint?: string | null;
  playbook_policy_fingerprint?: string | null;
  [k: string]: unknown;
};

export type ReplayPlaybookGetResponse = {
  tenant_id?: string;
  scope: string;
  playbook: {
    playbook_id: string;
    name?: string | null;
    text_summary?: string | null;
    version: number;
    status: string;
    matchers?: Record<string, unknown>;
    success_criteria?: Record<string, unknown>;
    risk_profile?: string;
    source_run_id?: string | null;
    steps_template: Array<Record<string, unknown>>;
    compile_summary?: Record<string, unknown>;
    uri?: string;
    node_id?: string;
    commit_id?: string | null;
    commit_uri?: string | null;
    created_at?: string;
    updated_at?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type ReplayPlaybookCandidateResponse = {
  tenant_id?: string;
  scope: string;
  playbook: {
    playbook_id: string;
    version: number;
    status: string;
    name?: string | null;
    uri?: string;
    node_id?: string;
    [k: string]: unknown;
  };
  candidate: {
    eligible_for_deterministic_replay: boolean;
    recommended_mode: "simulate" | "strict" | "guided";
    next_action: string;
    mismatch_reasons?: string[];
    rejectable?: boolean;
    [k: string]: unknown;
  };
  deterministic_gate: ReplayDeterministicGateResult;
  [k: string]: unknown;
};

export type ReplayPlaybookRunResponse = {
  tenant_id?: string;
  scope: string;
  playbook: {
    playbook_id: string;
    version: number;
    status: string;
    name?: string | null;
    uri?: string;
    [k: string]: unknown;
  };
  mode: "simulate" | "strict" | "guided";
  deterministic_gate?: ReplayDeterministicGateResult;
  run?: Record<string, unknown> | null;
  summary?: Record<string, unknown>;
  steps?: Array<Record<string, unknown>>;
  execution?: Record<string, unknown>;
  execution_policy?: Record<string, unknown>;
  params_echo?: Record<string, unknown>;
  [k: string]: unknown;
};

export type ReplayPlaybookDispatchResponse = {
  tenant_id?: string;
  scope: string;
  dispatch: {
    decision: "deterministic_replay_executed" | "fallback_replay_executed" | "candidate_only";
    primary_inference_skipped: boolean;
    fallback_executed: boolean;
    [k: string]: unknown;
  };
  candidate: ReplayPlaybookCandidateResponse;
  replay: ReplayPlaybookRunResponse | null;
  [k: string]: unknown;
};

export type RulesEvaluateResponse = {
  tenant_id?: string;
  scope: string;
  considered: number;
  matched: number;
  active: Array<Record<string, unknown>>;
  shadow: Array<Record<string, unknown>>;
  applied: Record<string, unknown>;
  [k: string]: unknown;
};

export type ToolsSelectResponse = {
  tenant_id?: string;
  scope: string;
  candidates: string[];
  selection: {
    candidates: string[];
    selected: string | null;
    ordered: string[];
    denied: Array<{ name: string; reason: string }>;
    fallback?: Record<string, unknown>;
    [k: string]: unknown;
  };
  rules: Record<string, unknown>;
  decision?: {
    decision_id: string;
    decision_uri?: string;
    run_id: string | null;
    selected_tool: string | null;
    policy_sha256: string;
    source_rule_ids: string[];
    created_at: string | null;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type ToolsDecisionResponse = {
  tenant_id: string;
  scope: string;
  lookup_mode?: "decision_id" | "run_id_latest";
  decision: {
    decision_id: string;
    decision_uri?: string;
    decision_kind: "tools_select";
    run_id: string | null;
    selected_tool: string | null;
    candidates: string[];
    context_sha256: string;
    policy_sha256: string;
    source_rule_ids: string[];
    metadata: Record<string, unknown>;
    created_at: string;
    commit_id: string | null;
    commit_uri?: string | null;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type ToolsRunResponse = {
  tenant_id: string;
  scope: string;
  run_id: string;
  lifecycle: {
    status: "decision_recorded" | "feedback_linked";
    decision_count: number;
    latest_decision_at: string | null;
    latest_feedback_at: string | null;
  };
  decisions: Array<{
    decision_id: string;
    decision_uri?: string;
    decision_kind: "tools_select";
    run_id: string | null;
    selected_tool: string | null;
    candidates: string[];
    context_sha256: string;
    policy_sha256: string;
    source_rule_ids: string[];
    metadata: Record<string, unknown>;
    created_at: string;
    commit_id: string | null;
    commit_uri?: string | null;
    [k: string]: unknown;
  }>;
  feedback?: {
    total: number;
    by_outcome: {
      positive: number;
      negative: number;
      neutral: number;
    };
    linked_decision_count: number;
    tools_feedback_count: number;
    recent: Array<{
      id: string;
      rule_node_id: string;
      outcome: "positive" | "negative" | "neutral";
      note: string | null;
      source: "rule_feedback" | "tools_feedback";
      decision_id: string | null;
      commit_id: string | null;
      created_at: string;
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type ToolsFeedbackResponse = {
  ok: boolean;
  tenant_id?: string;
  scope: string;
  updated_rules: number;
  rule_node_ids: string[];
  commit_id: string | null;
  commit_uri?: string;
  commit_hash: string | null;
  decision_id?: string;
  decision_uri?: string;
  decision_link_mode?: "provided" | "inferred" | "created_from_feedback";
  decision_policy_sha256?: string;
  [k: string]: unknown;
};

export type AutomationCreateResponse = {
  tenant_id: string;
  scope: string;
  automation: {
    automation_id: string;
    name: string;
    status: AutomationDefStatus;
    definition_status?: AutomationDefStatus;
    version: number;
    latest_version: number;
    input_contract: Record<string, unknown>;
    output_contract: Record<string, unknown>;
    metadata: Record<string, unknown>;
    graph: Record<string, unknown>;
    compile_summary: Record<string, unknown>;
    actor?: string | null;
    [k: string]: unknown;
  };
  validation: {
    node_ids: string[];
    start_node_ids: string[];
    topological_order: string[];
    issues: Array<Record<string, unknown>>;
  };
  [k: string]: unknown;
};

export type AutomationGetResponse = {
  tenant_id: string;
  scope: string;
  automation: {
    automation_id: string;
    name: string;
    status: AutomationDefStatus;
    definition_status?: AutomationDefStatus;
    version: number;
    latest_version: number;
    input_contract: Record<string, unknown>;
    output_contract: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version_metadata?: Record<string, unknown>;
    review_assignment?: Record<string, unknown>;
    shadow_review?: Record<string, unknown>;
    shadow_validation?: Record<string, unknown>;
    graph: Record<string, unknown>;
    compile_summary: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
    version_created_at?: string;
    [k: string]: unknown;
  };
  validation: {
    node_ids: string[];
    start_node_ids: string[];
    topological_order: string[];
    issues: Array<Record<string, unknown>>;
  };
  [k: string]: unknown;
};

export type AutomationListResponse = {
  tenant_id: string;
  scope: string;
  automations: Array<{
    automation_id: string;
    name: string;
    status: AutomationDefStatus;
    definition_status?: AutomationDefStatus;
    version: number;
    latest_version: number;
    metadata?: Record<string, unknown>;
    version_metadata?: Record<string, unknown>;
    review_assignment?: Record<string, unknown>;
    shadow_review?: Record<string, unknown>;
    shadow_validation?: Record<string, unknown>;
    compile_summary?: Record<string, unknown>;
    updated_at?: string;
    version_created_at?: string;
    action_hint?: string | null;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
};

export type AutomationShadowReportResponse = {
  tenant_id: string;
  scope: string;
  automation_id: string;
  versions: {
    shadow: null | {
      version: number;
      status: AutomationDefStatus | string;
      compile_summary?: Record<string, unknown>;
      version_metadata?: Record<string, unknown>;
      review_assignment?: Record<string, unknown>;
      shadow_review?: Record<string, unknown>;
      shadow_review_history?: Array<Record<string, unknown>>;
      shadow_validation?: Record<string, unknown>;
      shadow_validation_history?: Array<Record<string, unknown>>;
      created_at?: string;
    };
    active: null | {
      version: number;
      status: AutomationDefStatus | string;
      compile_summary?: Record<string, unknown>;
      version_metadata?: Record<string, unknown>;
      created_at?: string;
    };
  };
  runs: {
    shadow: (AutomationRunView & { [k: string]: unknown }) | null;
    active: (AutomationRunView & { [k: string]: unknown }) | null;
  };
  evidence: {
    shadow: Record<string, unknown>;
    active: Record<string, unknown>;
  };
  history: {
    shadow_runs: Array<AutomationRunView & { [k: string]: unknown }>;
    active_runs: Array<AutomationRunView & { [k: string]: unknown }>;
    shadow_reviews: Array<Record<string, unknown>>;
    shadow_validations: Array<Record<string, unknown>>;
  };
  notes: {
    shadow_review_note?: string | null;
    shadow_review_verdict?: string | null;
    shadow_validation_status?: string | null;
    shadow_promotion_note?: string | null;
    active_promotion_note?: string | null;
  };
  comparison: {
    readiness: {
      status: "ready" | "needs_review" | "blocked";
      reasons: string[];
    };
    changed_nodes: number;
    node_deltas: Array<Record<string, unknown>>;
  };
  [k: string]: unknown;
};

export type AutomationShadowValidateResponse = {
  tenant_id: string;
  scope: string;
  automation_id: string;
  accepted: boolean;
  queued: boolean;
  validation_request: Record<string, unknown> | null;
  run?: (AutomationRunView & { [k: string]: unknown }) | null;
  report: AutomationShadowReportResponse;
  [k: string]: unknown;
};

export type AutomationShadowValidateDispatchResponse = {
  tenant_id: string;
  scope: string;
  automation_id?: string | null;
  limit: number;
  dry_run: boolean;
  matched: number;
  dispatched?: number;
  completed?: number;
  failed?: number;
  claims?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

export type AutomationCompensationPolicyMatrixResponse = {
  tenant_id: string;
  scope: string;
  matrix: Array<{
    class: string;
    status: "blocked" | "running" | "retryable" | "succeeded" | string;
    retry_allowed: boolean;
    escalation: string;
    summary: string;
    operator_action: string;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
};

export type AutomationRunNodeView = {
  run_id: string;
  node_id: string;
  attempt: number;
  node_kind: AutomationNodeKind | string;
  lifecycle_state: AutomationNodeLifecycleState | string;
  pause_reason: AutomationNodePauseReason | null;
  terminal_outcome: AutomationNodeTerminalOutcome | null;
  status_summary: string;
  depends_on_json?: unknown;
  blocking_node_ids_json?: unknown;
  error_code?: string | null;
  error_message?: string | null;
  approval_id?: string | null;
  playbook_id?: string | null;
  playbook_version?: number | null;
  playbook_run_id?: string | null;
  input_snapshot_json?: unknown;
  output_snapshot_json?: unknown;
  [k: string]: unknown;
};

export type AutomationRunView = {
  run_id: string;
  tenant_id: string;
  scope: string;
  automation_id: string;
  automation_version: number;
  requested_by?: string | null;
  lifecycle_state: AutomationRunLifecycleState | string;
  pause_reason: AutomationRunPauseReason | null;
  terminal_outcome: AutomationRunTerminalOutcome | null;
  status_summary: string;
  root_cause_code?: string | null;
  root_cause_node_id?: string | null;
  root_cause_message?: string | null;
  compensation_attempted?: boolean;
  compensation_status?: string;
  execution_mode?: "default" | "shadow";
  review_assignment?: Record<string, unknown>;
  compensation_workflow?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  [k: string]: unknown;
};

export type AutomationRunResponse = {
  run: AutomationRunView & {
    version?: number;
  };
  nodes: AutomationRunNodeView[];
  [k: string]: unknown;
};

export type AutomationRunGetResponse = {
  run: AutomationRunView & {
    summary?: Record<string, unknown>;
  };
  nodes?: AutomationRunNodeView[];
  compensation_workflow_history?: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

export type AutomationRunListResponse = {
  tenant_id: string;
  scope: string;
  runs: Array<AutomationRunView & {
    action_hint?: string | null;
  }>;
  [k: string]: unknown;
};

export type SandboxSessionCreateResponse = {
  tenant_id: string;
  scope: string;
  session: {
    session_id: string;
    profile: "default" | "restricted";
    metadata: Record<string, unknown>;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type SandboxExecuteResponse = {
  tenant_id: string;
  scope: string;
  accepted: boolean;
  run: {
    run_id: string;
    session_id: string;
    planner_run_id: string | null;
    decision_id: string | null;
    action: Record<string, unknown>;
    mode: "async" | "sync";
    status: "queued" | "running" | "succeeded" | "failed" | "canceled" | "timeout";
    timeout_ms: number;
    output: {
      stdout: string;
      stderr: string;
      truncated: boolean;
    };
    exit_code: number | null;
    error: string | null;
    cancel_requested: boolean;
    cancel_reason: string | null;
    result: Record<string, unknown>;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
    updated_at: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type SandboxRunGetResponse = {
  tenant_id: string;
  scope: string;
  run: SandboxExecuteResponse["run"];
  [k: string]: unknown;
};

export type SandboxRunLogsResponse = {
  tenant_id: string;
  scope: string;
  run_id: string;
  status: SandboxExecuteResponse["run"]["status"];
  logs: {
    tail_bytes: number;
    stdout: string;
    stderr: string;
    truncated: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type SandboxRunCancelResponse = {
  tenant_id: string;
  scope: string;
  run_id: string;
  status: SandboxExecuteResponse["run"]["status"];
  cancel_requested: boolean;
  cancel_reason: string | null;
  [k: string]: unknown;
};

export type ControlTenantResponse = {
  ok: boolean;
  tenant: Record<string, unknown>;
};

export type ControlTenantsResponse = {
  ok: boolean;
  tenants: Array<Record<string, unknown>>;
};

export type ControlProjectResponse = {
  ok: boolean;
  project: Record<string, unknown>;
};

export type ControlApiKeyResponse = {
  ok: boolean;
  key: Record<string, unknown>;
};

export type ControlApiKeysResponse = {
  ok: boolean;
  keys: Array<Record<string, unknown>>;
};

export type ControlApiKeysStaleResponse = {
  ok?: boolean;
  [k: string]: unknown;
};

export type ControlAlertRouteResponse = {
  ok: boolean;
  route: Record<string, unknown>;
};

export type ControlAlertRoutesResponse = {
  ok: boolean;
  routes: Array<Record<string, unknown>>;
};

export type ControlAlertDeliveriesResponse = {
  ok: boolean;
  deliveries: Array<Record<string, unknown>>;
};

export type ControlAutomationAlertPreviewResponse = {
  ok: boolean;
  tenant_id?: string | null;
  scope?: string | null;
  window_hours?: number | null;
  automation_id?: string | null;
  summary?: Record<string, unknown>;
  alert_previews: Array<{
    code?: string;
    severity?: string;
    summary?: string;
    recommended_event_type?: string;
    threshold?: number | null;
    current_value?: number | null;
    suggested_action?: string;
    route_count: number;
    dispatch_ready: boolean;
    routes: Array<{
      id: string;
      label?: string | null;
      channel: string;
      status?: string;
      target?: string | null;
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  }>;
};

export type ControlAutomationAlertDispatchResponse = {
  ok: boolean;
  tenant_id?: string | null;
  scope?: string | null;
  window_hours?: number | null;
  automation_id?: string | null;
  dry_run: boolean;
  summary?: Record<string, unknown>;
  candidates_considered: number;
  matched_routes: number;
  dispatched: number;
  failed: number;
  skipped: number;
  dry_run_rows: number;
  results: Array<{
    route_id?: string | null;
    route_label?: string | null;
    channel?: string | null;
    event_type?: string | null;
    code?: string | null;
    severity?: string | null;
    dedupe_key?: string | null;
    status: "dry_run" | "sent" | "failed" | "skipped" | string;
    skipped_reason?: string | null;
    response_code?: number | null;
    error?: string | null;
    preview_body?: unknown;
    [k: string]: unknown;
  }>;
};

export type ControlAlertDeliveryReplayResponse = {
  ok: boolean;
  dry_run: boolean;
  found_deliveries: number;
  replayed: number;
  failed: number;
  skipped: number;
  dry_run_rows: number;
  results: Array<{
    delivery_id?: string | null;
    replay_of_delivery_id?: string | null;
    route_id?: string | null;
    route_label?: string | null;
    channel?: string | null;
    event_type?: string | null;
    code?: string | null;
    dedupe_key?: string | null;
    status: "dry_run" | "sent" | "failed" | "skipped" | string;
    skipped_reason?: string | null;
    response_code?: number | null;
    error?: string | null;
    preview_body?: unknown;
    [k: string]: unknown;
  }>;
};

export type ControlAlertDeliveryAssignResponse = {
  ok: boolean;
  updated: number;
  deliveries: Array<Record<string, unknown>>;
};

export type ControlIncidentPublishJobResponse = {
  ok: boolean;
  job: Record<string, unknown>;
};

export type ControlIncidentPublishJobsResponse = {
  ok: boolean;
  jobs: Array<Record<string, unknown>>;
};

export type ControlIncidentPublishReplayResponse = {
  ok: boolean;
  [k: string]: unknown;
};

export type ControlTenantQuotaResponse = {
  ok: boolean;
  quota: Record<string, unknown>;
};

export type ControlTenantQuotaDeleteResponse = {
  ok: boolean;
  deleted: boolean;
};

export type ControlAuditEventsResponse = {
  ok: boolean;
  events: Array<Record<string, unknown>>;
};

export type ControlTenantDashboardResponse = {
  ok: boolean;
  dashboard: Record<string, unknown>;
};

export type ControlTenantDiagnosticsResponse = {
  ok: boolean;
  diagnostics: Record<string, unknown>;
};

export type ControlIncidentPublishRollupResponse = {
  ok: boolean;
  rollup: Record<string, unknown>;
};

export type ControlIncidentPublishSloResponse = {
  ok: boolean;
  report: Record<string, unknown>;
};

export type ControlTenantTimeseriesResponse = {
  ok?: boolean;
  [k: string]: unknown;
};

export type ControlTenantKeyUsageResponse = {
  ok?: boolean;
  [k: string]: unknown;
};
