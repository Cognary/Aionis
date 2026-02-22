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
  rules_context?: unknown;
  rules_include_shadow?: boolean;
  rules_limit?: number;
};

export type MemoryRecallTextInput = Omit<MemoryRecallInput, "query_embedding"> & {
  query_text: string;
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

export type MemoryWriteResponse = {
  tenant_id?: string;
  scope?: string;
  commit_id: string;
  commit_hash: string;
  nodes: Array<{ id: string; client_id?: string; type: string }>;
  edges: Array<Record<string, unknown>>;
  embedding_backfill?: { enqueued: true; pending_nodes: number };
  topic_cluster?: Record<string, unknown>;
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
