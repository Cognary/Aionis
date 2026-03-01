from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, TypedDict


MemoryLane = Literal["private", "shared"]
Tier = Literal["hot", "warm", "cold", "archive"]
FeedbackOutcome = Literal["positive", "negative", "neutral"]
DecisionLinkMode = Literal["provided", "inferred", "created_from_feedback"]
CapabilityFailureMode = Literal["hard_fail", "soft_degrade"]


class AionisResponse(TypedDict, total=False):
    data: Any
    status: int
    request_id: Optional[str]


class CapabilityContractSpec(TypedDict, total=False):
    failure_mode: CapabilityFailureMode
    degraded_modes: List[str]


class BackendCapabilityErrorDetails(TypedDict, total=False):
    capability: str
    backend: str
    failure_mode: CapabilityFailureMode
    degraded_mode: str
    fallback_applied: bool


class ShadowDualWriteStrictFailureDetails(TypedDict, total=False):
    capability: Literal["shadow_mirror_v2"]
    failure_mode: CapabilityFailureMode
    degraded_mode: Literal["capability_unsupported", "mirror_failed"]
    fallback_applied: bool
    strict: bool
    mirrored: bool
    error: str


class HealthResponse(TypedDict, total=False):
    ok: bool
    memory_store_backend: str
    memory_store_recall_capabilities: Dict[str, bool]
    memory_store_write_capabilities: Dict[str, bool]
    memory_store_feature_capabilities: Dict[str, bool]
    memory_store_capability_contract: Dict[str, CapabilityContractSpec]


class EdgeEndpointInput(TypedDict, total=False):
    id: str
    client_id: str


class MemoryNodeInput(TypedDict, total=False):
    id: str
    client_id: str
    scope: str
    type: str
    tier: Tier
    memory_lane: MemoryLane
    producer_agent_id: str
    owner_agent_id: str
    owner_team_id: str
    title: str
    text_summary: str
    slots: Dict[str, Any]
    raw_ref: str
    evidence_ref: str
    embedding: List[float]
    embedding_model: str
    salience: float
    importance: float
    confidence: float


class MemoryEdgeInput(TypedDict, total=False):
    id: str
    scope: str
    type: str
    src: EdgeEndpointInput
    dst: EdgeEndpointInput
    weight: float
    confidence: float
    decay_rate: float


class MemoryWriteInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    actor: str
    parent_commit_id: str
    input_text: str
    input_sha256: str
    model_version: str
    prompt_version: str
    auto_embed: bool
    force_reembed: bool
    memory_lane: MemoryLane
    producer_agent_id: str
    owner_agent_id: str
    owner_team_id: str
    trigger_topic_cluster: bool
    topic_cluster_async: bool
    nodes: List[MemoryNodeInput]
    edges: List[MemoryEdgeInput]


class MemoryRecallInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    query_embedding: List[float]
    consumer_agent_id: str
    consumer_team_id: str
    limit: int
    neighborhood_hops: int
    return_debug: bool
    include_embeddings: bool
    include_meta: bool
    include_slots: bool
    include_slots_preview: bool
    slots_preview_keys: int
    max_nodes: int
    max_edges: int
    ranked_limit: int
    min_edge_weight: float
    min_edge_confidence: float
    context_token_budget: int
    context_char_budget: int
    context_compaction_profile: Literal["balanced", "aggressive"]
    rules_context: Dict[str, Any]
    rules_include_shadow: bool
    rules_limit: int


class MemoryRecallTextInput(MemoryRecallInput, total=False):
    query_text: str


class MemoryFindInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    uri: str
    id: str
    client_id: str
    type: Literal["event", "entity", "topic", "rule", "evidence", "concept", "procedure", "self_model"]
    title_contains: str
    text_contains: str
    memory_lane: MemoryLane
    slots_contains: Dict[str, Any]
    consumer_agent_id: str
    consumer_team_id: str
    include_meta: bool
    include_slots: bool
    include_slots_preview: bool
    slots_preview_keys: int
    limit: int
    offset: int


class MemorySessionCreateInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    actor: str
    session_id: str
    title: str
    text_summary: str
    input_text: str
    metadata: Dict[str, Any]
    auto_embed: bool
    memory_lane: MemoryLane
    producer_agent_id: str
    owner_agent_id: str
    owner_team_id: str


class MemoryEventWriteInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    actor: str
    session_id: str
    event_id: str
    title: str
    text_summary: str
    input_text: str
    metadata: Dict[str, Any]
    auto_embed: bool
    memory_lane: MemoryLane
    producer_agent_id: str
    owner_agent_id: str
    owner_team_id: str
    edge_weight: float
    edge_confidence: float


class MemorySessionEventsListInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    consumer_agent_id: str
    consumer_team_id: str
    include_meta: bool
    include_slots: bool
    include_slots_preview: bool
    slots_preview_keys: int
    limit: int
    offset: int


class MemoryPackExportInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    include_nodes: bool
    include_edges: bool
    include_commits: bool
    include_meta: bool
    max_rows: int


class MemoryPackV1(TypedDict, total=False):
    version: Literal["aionis_pack_v1"]
    tenant_id: str
    scope: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    commits: List[Dict[str, Any]]


class MemoryPackImportInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    actor: str
    verify_only: bool
    auto_embed: bool
    manifest_sha256: str
    pack: MemoryPackV1


class RulesEvaluateInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    context: Dict[str, Any]
    include_shadow: bool
    limit: int


class ToolsSelectInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    run_id: str
    context: Dict[str, Any]
    candidates: List[str]
    include_shadow: bool
    rules_limit: int
    strict: bool


class ToolsDecisionInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    decision_id: str


class ToolsFeedbackInput(TypedDict, total=False):
    tenant_id: str
    scope: str
    actor: str
    run_id: str
    decision_id: str
    outcome: FeedbackOutcome
    context: Dict[str, Any]
    candidates: List[str]
    selected_tool: str
    include_shadow: bool
    rules_limit: int
    target: Literal["tool", "all"]
    note: str
    input_text: str
    input_sha256: str


class ToolsSelectDeniedItem(TypedDict, total=False):
    name: str
    reason: str


class ToolsSelectDecision(TypedDict, total=False):
    decision_id: str
    run_id: Optional[str]
    selected_tool: Optional[str]
    policy_sha256: str
    source_rule_ids: List[str]
    created_at: Optional[str]


class ToolsSelectSelection(TypedDict, total=False):
    candidates: List[str]
    selected: Optional[str]
    ordered: List[str]
    denied: List[ToolsSelectDeniedItem]
    fallback: Dict[str, Any]


class ToolsSelectResponse(TypedDict, total=False):
    tenant_id: str
    scope: str
    candidates: List[str]
    selection: ToolsSelectSelection
    rules: Dict[str, Any]
    decision: ToolsSelectDecision


class ToolsFeedbackResponse(TypedDict, total=False):
    ok: bool
    tenant_id: str
    scope: str
    updated_rules: int
    rule_node_ids: List[str]
    commit_id: Optional[str]
    commit_hash: Optional[str]
    decision_id: str
    decision_link_mode: DecisionLinkMode
    decision_policy_sha256: str


class ToolsDecisionPayload(TypedDict, total=False):
    decision_id: str
    decision_kind: Literal["tools_select"]
    run_id: Optional[str]
    selected_tool: Optional[str]
    candidates: List[str]
    context_sha256: str
    policy_sha256: str
    source_rule_ids: List[str]
    metadata: Dict[str, Any]
    created_at: str
    commit_id: Optional[str]


class ToolsDecisionResponse(TypedDict, total=False):
    tenant_id: str
    scope: str
    decision: ToolsDecisionPayload


class ControlTenantInput(TypedDict, total=False):
    tenant_id: str
    display_name: Optional[str]
    status: Literal["active", "suspended"]
    metadata: Dict[str, Any]


class ControlTenantsQuery(TypedDict, total=False):
    status: Literal["active", "suspended"]
    limit: int
    offset: int


class ControlProjectInput(TypedDict, total=False):
    project_id: str
    tenant_id: str
    display_name: Optional[str]
    status: Literal["active", "archived"]
    metadata: Dict[str, Any]


class ControlApiKeyInput(TypedDict, total=False):
    tenant_id: str
    project_id: Optional[str]
    label: Optional[str]
    role: Optional[str]
    agent_id: Optional[str]
    team_id: Optional[str]
    metadata: Dict[str, Any]


class ControlApiKeysQuery(TypedDict, total=False):
    tenant_id: str
    project_id: str
    status: Literal["active", "revoked"]
    limit: int
    offset: int


class ControlApiKeysStaleQuery(TypedDict, total=False):
    max_age_days: int
    warn_age_days: int
    rotation_window_days: int
    limit: int


class ControlApiKeyRotateInput(TypedDict, total=False):
    label: Optional[str]
    metadata: Dict[str, Any]


class ControlAlertRouteInput(TypedDict, total=False):
    tenant_id: str
    channel: Literal["webhook", "slack_webhook", "pagerduty_events"]
    label: Optional[str]
    events: List[str]
    status: Literal["active", "disabled"]
    target: str
    secret: Optional[str]
    headers: Dict[str, str]
    metadata: Dict[str, Any]


class ControlAlertRoutesQuery(TypedDict, total=False):
    tenant_id: str
    channel: Literal["webhook", "slack_webhook", "pagerduty_events"]
    status: Literal["active", "disabled"]
    limit: int
    offset: int


class ControlAlertRouteStatusInput(TypedDict, total=False):
    status: Literal["active", "disabled"]


class ControlAlertDeliveriesQuery(TypedDict, total=False):
    tenant_id: str
    event_type: str
    status: Literal["sent", "failed", "skipped"]
    limit: int
    offset: int


class ControlIncidentPublishJobInput(TypedDict, total=False):
    tenant_id: str
    run_id: str
    source_dir: str
    target: str
    max_attempts: int
    metadata: Dict[str, Any]


class ControlIncidentPublishJobsQuery(TypedDict, total=False):
    tenant_id: str
    status: Literal["pending", "processing", "succeeded", "failed", "dead_letter"]
    limit: int
    offset: int


class ControlIncidentPublishReplayInput(TypedDict, total=False):
    tenant_id: str
    statuses: List[Literal["failed", "dead_letter"]]
    ids: List[str]
    limit: int
    reset_attempts: bool
    reason: str
    dry_run: bool
    allow_all_tenants: bool


class ControlTenantQuotaInput(TypedDict, total=False):
    recall_rps: float
    recall_burst: int
    write_rps: float
    write_burst: int
    write_max_wait_ms: int
    debug_embed_rps: float
    debug_embed_burst: int
    recall_text_embed_rps: float
    recall_text_embed_burst: int
    recall_text_embed_max_wait_ms: int


class ControlAuditEventsQuery(TypedDict, total=False):
    tenant_id: str
    action: str
    limit: int
    offset: int


class ControlTenantDiagnosticsQuery(TypedDict, total=False):
    scope: str
    window_minutes: int


class ControlIncidentPublishRollupQuery(TypedDict, total=False):
    window_hours: int
    sample_limit: int


class ControlIncidentPublishSloQuery(TypedDict, total=False):
    window_hours: int
    baseline_hours: int
    min_jobs: int
    adaptive_multiplier: float
    failure_rate_floor: float
    dead_letter_rate_floor: float
    backlog_warning_abs: int
    dead_letter_backlog_warning_abs: int
    dead_letter_backlog_critical_abs: int


class ControlTenantTimeseriesQuery(TypedDict, total=False):
    endpoint: Literal["write", "recall", "recall_text"]
    window_hours: int
    limit: int
    offset: int
    cursor: str


class ControlTenantKeyUsageQuery(TypedDict, total=False):
    endpoint: Literal["write", "recall", "recall_text"]
    window_hours: int
    baseline_hours: int
    min_requests: int
    zscore_threshold: float
    limit: int
    offset: int
    cursor: str


__all__ = [
    "AionisResponse",
    "ControlAlertDeliveriesQuery",
    "ControlAlertRouteInput",
    "ControlAlertRoutesQuery",
    "ControlAlertRouteStatusInput",
    "ControlApiKeyInput",
    "ControlApiKeysQuery",
    "ControlApiKeysStaleQuery",
    "ControlApiKeyRotateInput",
    "ControlAuditEventsQuery",
    "ControlIncidentPublishJobInput",
    "ControlIncidentPublishJobsQuery",
    "ControlIncidentPublishReplayInput",
    "ControlIncidentPublishRollupQuery",
    "ControlIncidentPublishSloQuery",
    "ControlProjectInput",
    "ControlTenantDiagnosticsQuery",
    "ControlTenantInput",
    "ControlTenantKeyUsageQuery",
    "ControlTenantQuotaInput",
    "ControlTenantsQuery",
    "ControlTenantTimeseriesQuery",
    "DecisionLinkMode",
    "FeedbackOutcome",
    "MemoryEdgeInput",
    "MemoryEventWriteInput",
    "MemoryFindInput",
    "MemoryLane",
    "MemoryNodeInput",
    "MemoryPackExportInput",
    "MemoryPackImportInput",
    "MemoryPackV1",
    "MemoryRecallInput",
    "MemoryRecallTextInput",
    "MemorySessionCreateInput",
    "MemorySessionEventsListInput",
    "MemoryWriteInput",
    "RulesEvaluateInput",
    "Tier",
    "ToolsDecisionInput",
    "ToolsDecisionPayload",
    "ToolsDecisionResponse",
    "ToolsFeedbackInput",
    "ToolsFeedbackResponse",
    "ToolsSelectDecision",
    "ToolsSelectInput",
    "ToolsSelectResponse",
]
