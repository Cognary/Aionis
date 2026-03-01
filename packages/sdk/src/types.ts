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

export type MemoryWriteInput = {
  tenant_id?: string;
  scope?: string;
  actor?: string;
  parent_commit_id?: string;
  input_text?: string;
  input_sha256?: string;
  model_version?: string;
  prompt_version?: string;
  auto_embed?: boolean;
  force_reembed?: boolean;
  memory_lane?: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
  trigger_topic_cluster?: boolean;
  topic_cluster_async?: boolean;
  nodes?: Array<{
    id?: string;
    client_id?: string;
    scope?: string;
    type: string;
    tier?: "hot" | "warm" | "cold" | "archive";
    memory_lane?: "private" | "shared";
    producer_agent_id?: string;
    owner_agent_id?: string;
    owner_team_id?: string;
    title?: string;
    text_summary?: string;
    slots?: Record<string, unknown>;
    raw_ref?: string;
    evidence_ref?: string;
    embedding?: number[];
    embedding_model?: string;
    salience?: number;
    importance?: number;
    confidence?: number;
  }>;
  edges?: Array<{
    id?: string;
    scope?: string;
    type: string;
    src: { id?: string; client_id?: string };
    dst: { id?: string; client_id?: string };
    weight?: number;
    confidence?: number;
    decay_rate?: number;
  }>;
};

export type MemoryRecallInput = {
  tenant_id?: string;
  scope?: string;
  query_embedding: number[];
  consumer_agent_id?: string;
  consumer_team_id?: string;
  limit?: number;
  neighborhood_hops?: number;
  return_debug?: boolean;
  include_embeddings?: boolean;
  include_meta?: boolean;
  include_slots?: boolean;
  include_slots_preview?: boolean;
  slots_preview_keys?: number;
  max_nodes?: number;
  max_edges?: number;
  ranked_limit?: number;
  min_edge_weight?: number;
  min_edge_confidence?: number;
  context_token_budget?: number;
  context_char_budget?: number;
  context_compaction_profile?: "balanced" | "aggressive";
  rules_context?: unknown;
  rules_include_shadow?: boolean;
  rules_limit?: number;
};

export type MemoryRecallTextInput = Omit<MemoryRecallInput, "query_embedding"> & {
  query_text: string;
};

export type MemoryFindInput = {
  tenant_id?: string;
  scope?: string;
  uri?: string;
  id?: string;
  client_id?: string;
  type?: "event" | "entity" | "topic" | "rule" | "evidence" | "concept" | "procedure" | "self_model";
  title_contains?: string;
  text_contains?: string;
  memory_lane?: "private" | "shared";
  slots_contains?: Record<string, unknown>;
  consumer_agent_id?: string;
  consumer_team_id?: string;
  include_meta?: boolean;
  include_slots?: boolean;
  include_slots_preview?: boolean;
  slots_preview_keys?: number;
  limit?: number;
  offset?: number;
};

export type MemorySessionCreateInput = {
  tenant_id?: string;
  scope?: string;
  actor?: string;
  session_id: string;
  title?: string;
  text_summary?: string;
  input_text?: string;
  metadata?: Record<string, unknown>;
  auto_embed?: boolean;
  memory_lane?: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
};

export type MemoryEventWriteInput = {
  tenant_id?: string;
  scope?: string;
  actor?: string;
  session_id: string;
  event_id?: string;
  title?: string;
  text_summary?: string;
  input_text?: string;
  metadata?: Record<string, unknown>;
  auto_embed?: boolean;
  memory_lane?: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
  edge_weight?: number;
  edge_confidence?: number;
};

export type MemorySessionEventsListInput = {
  tenant_id?: string;
  scope?: string;
  consumer_agent_id?: string;
  consumer_team_id?: string;
  include_meta?: boolean;
  include_slots?: boolean;
  include_slots_preview?: boolean;
  slots_preview_keys?: number;
  limit?: number;
  offset?: number;
};

export type MemoryPackExportInput = {
  tenant_id?: string;
  scope?: string;
  include_nodes?: boolean;
  include_edges?: boolean;
  include_commits?: boolean;
  include_meta?: boolean;
  max_rows?: number;
};

export type MemoryPackImportInput = {
  tenant_id?: string;
  scope?: string;
  actor?: string;
  verify_only?: boolean;
  auto_embed?: boolean;
  manifest_sha256?: string;
  pack: {
    version: "aionis_pack_v1";
    tenant_id: string;
    scope: string;
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
    commits?: Array<Record<string, unknown>>;
  };
};

export type RulesEvaluateInput = {
  tenant_id?: string;
  scope?: string;
  context: unknown;
  include_shadow?: boolean;
  limit?: number;
};

export type ToolsSelectInput = {
  tenant_id?: string;
  scope?: string;
  run_id?: string;
  context: unknown;
  candidates: string[];
  include_shadow?: boolean;
  rules_limit?: number;
  strict?: boolean;
};

export type ToolsDecisionInput = {
  tenant_id?: string;
  scope?: string;
  decision_id: string;
};

export type ToolsFeedbackInput = {
  tenant_id?: string;
  scope?: string;
  actor?: string;
  run_id?: string;
  decision_id?: string;
  outcome: "positive" | "negative" | "neutral";
  context: unknown;
  candidates: string[];
  selected_tool: string;
  include_shadow?: boolean;
  rules_limit?: number;
  target?: "tool" | "all";
  note?: string;
  input_text?: string;
  input_sha256?: string;
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
  endpoint?: "write" | "recall" | "recall_text";
  window_hours?: number;
  limit?: number;
  offset?: number;
  cursor?: string;
};

export type ControlTenantKeyUsageQuery = {
  endpoint?: "write" | "recall" | "recall_text";
  window_hours?: number;
  baseline_hours?: number;
  min_requests?: number;
  zscore_threshold?: number;
  limit?: number;
  offset?: number;
  cursor?: string;
};

export type MemoryWriteResponse = {
  tenant_id?: string;
  scope?: string;
  commit_id: string;
  commit_hash: string;
  nodes: Array<{ id: string; client_id?: string; type: string }>;
  edges: Array<Record<string, unknown>>;
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

export type MemoryRecallResponse = {
  tenant_id?: string;
  scope: string;
  seeds: Array<Record<string, unknown>>;
  subgraph: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
  ranked: Array<Record<string, unknown>>;
  context: {
    text: string;
    items: Array<Record<string, unknown>>;
    citations: Array<Record<string, unknown>>;
  };
  debug?: Record<string, unknown>;
  rules?: Record<string, unknown>;
  query?: Record<string, unknown>;
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

export type MemorySessionCreateResponse = {
  tenant_id: string;
  scope: string;
  session_id: string;
  session_node_id: string | null;
  session_uri: string | null;
  commit_id: string;
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
    };
    truncated: {
      nodes: boolean;
      edges: boolean;
      commits: boolean;
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
  planned?: { nodes: number; edges: number; commits_in_pack: number };
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
  decision: {
    decision_id: string;
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
  commit_hash: string | null;
  decision_id?: string;
  decision_link_mode?: "provided" | "inferred" | "created_from_feedback";
  decision_policy_sha256?: string;
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
