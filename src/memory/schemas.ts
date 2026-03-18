import { z } from "zod";
import { ControlProfileV1Schema, ExecutionPacketV1Schema, ExecutionStateV1Schema } from "../execution/types.js";
import { ExecutionStateTransitionV1Schema } from "../execution/transitions.js";

export const UUID = z.string().uuid();

export const NodeType = z.enum(["event", "entity", "topic", "rule", "evidence", "concept", "procedure", "self_model"]);
export const EdgeType = z.enum(["part_of", "related_to", "derived_from"]);
export const MemoryLayerId = z.enum(["L0", "L1", "L2", "L3", "L4", "L5"]);
export const MemoryLayerPreference = z
  .object({
    allowed_layers: z.array(MemoryLayerId).min(1).max(6),
  })
  .strict();

const QueryBoolean = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
    return v;
  }
  if (typeof v === "string") {
    const raw = v.trim().toLowerCase();
    if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
    if (raw === "0" || raw === "false" || raw === "no" || raw === "off" || raw === "") return false;
    return v;
  }
  return v;
}, z.boolean());

export const WriteNode = z.object({
  id: UUID.optional(),
  client_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  type: NodeType,
  tier: z.enum(["hot", "warm", "cold", "archive"]).optional(),
  memory_lane: z.enum(["private", "shared"]).optional(),
  producer_agent_id: z.string().min(1).optional(),
  owner_agent_id: z.string().min(1).optional(),
  owner_team_id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  text_summary: z.string().min(1).optional(),
  slots: z.record(z.any()).optional(),
  raw_ref: z.string().min(1).optional(),
  evidence_ref: z.string().min(1).optional(),
  embedding: z.array(z.number()).optional(),
  // Optional: label the embedding's generating model/provider for auditability.
  // If omitted and `embedding` is client-supplied, the server may default this to "client".
  embedding_model: z.string().min(1).optional(),
  salience: z.number().min(0).max(1).optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const WriteEdgeEndpoint = z.object({
  id: UUID.optional(),
  client_id: z.string().min(1).optional(),
  ref: z
    .object({
      id: UUID.optional(),
      client_id: z.string().min(1).optional(),
    })
    .refine((v) => !!v.id || !!v.client_id, { message: "must set id or client_id" }),
});

export const WriteEdge = z.object({
  id: UUID.optional(),
  scope: z.string().min(1).optional(),
  type: EdgeType,
  src: z.object({ id: UUID.optional(), client_id: z.string().min(1).optional() }).refine((v) => !!v.id || !!v.client_id, {
    message: "src must set id or client_id",
  }),
  dst: z.object({ id: UUID.optional(), client_id: z.string().min(1).optional() }).refine((v) => !!v.id || !!v.client_id, {
    message: "dst must set id or client_id",
  }),
  weight: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  decay_rate: z.number().min(0).max(1).optional(),
});

export const MemoryWriteRequest = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    parent_commit_id: UUID.optional(),
    input_text: z.string().min(1).optional(),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    model_version: z.string().min(1).optional(),
    prompt_version: z.string().min(1).optional(),
    // Tri-state: if omitted, server defaults may apply.
    auto_embed: z.boolean().optional(),
    memory_lane: z.enum(["private", "shared"]).optional(),
    producer_agent_id: z.string().min(1).optional(),
    owner_agent_id: z.string().min(1).optional(),
    owner_team_id: z.string().min(1).optional(),
    // If true, re-embed nodes even if they already have READY embeddings (for model upgrades).
    // This never blocks /write; it only affects the derived embed backfill job behavior.
    force_reembed: z.boolean().optional(),
    trigger_topic_cluster: z.boolean().optional(),
    topic_cluster_async: z.boolean().optional(),
    distill: z
      .object({
        enabled: z.boolean().default(true),
        sources: z.array(z.enum(["input_text", "event_nodes", "evidence_nodes"])).min(1).max(3).default([
          "input_text",
          "event_nodes",
          "evidence_nodes",
        ]),
        max_evidence_nodes: z.number().int().positive().max(20).default(4),
        max_fact_nodes: z.number().int().positive().max(20).default(6),
        min_sentence_chars: z.number().int().min(12).max(500).default(24),
        attach_edges: z.boolean().default(true),
      })
      .optional(),
    nodes: z.array(WriteNode).default([]),
    edges: z.array(WriteEdge).default([]),
  })
  .refine((v) => !!v.input_text || !!v.input_sha256, { message: "must set input_text or input_sha256" });

export const MemoryRecallRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_embedding: z.array(z.number()),
  recall_strategy: z.enum(["local", "balanced", "global"]).optional(),
  recall_mode: z.enum(["dense_edge"]).optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).default(30),
  neighborhood_hops: z.number().int().min(1).max(2).default(2),
  return_debug: z.boolean().default(false),
  include_embeddings: z.boolean().default(false),
  include_meta: z.boolean().default(false),
  include_slots: z.boolean().default(false),
  include_slots_preview: z.boolean().default(false),
  slots_preview_keys: z.number().int().positive().max(50).default(10),
  max_nodes: z.number().int().positive().max(200).default(50),
  // Hard contract: always cap returned edges to avoid response explosion.
  max_edges: z.number().int().positive().max(100).default(100),
  ranked_limit: z.number().int().positive().max(500).default(100),
  // Optional neighborhood quality filters (applied in stage-2 edge fetch).
  min_edge_weight: z.number().min(0).max(1).default(0),
  min_edge_confidence: z.number().min(0).max(1).default(0),
  // Optional context compaction budgets (for context.text only).
  context_token_budget: z.number().int().positive().max(256000).optional(),
  context_char_budget: z.number().int().positive().max(1000000).optional(),
  // Optional context compaction policy preset.
  context_compaction_profile: z.enum(["balanced", "aggressive"]).optional(),
  // Optional caller-controlled layer tightening. The server always preserves trust anchors.
  memory_layer_preference: MemoryLayerPreference.optional(),
  // Optional: evaluate SHADOW/ACTIVE rules alongside recall to produce an applied policy patch for the planner.
  // Use the normalized "Planner Context" shape (see docs/PLANNER_CONTEXT.md).
  rules_context: z.any().optional(),
  // Default to ACTIVE-only for safety; callers can opt into SHADOW visibility explicitly.
  rules_include_shadow: z.boolean().optional().default(false),
  // Hard cap for how many rules the server may scan.
  rules_limit: z.number().int().positive().max(200).optional().default(50),
});

export const MemoryRecallTextRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  recall_strategy: z.enum(["local", "balanced", "global"]).optional(),
  recall_mode: z.enum(["dense_edge"]).optional(),
  recall_class_aware: z.boolean().optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).default(30),
  neighborhood_hops: z.number().int().min(1).max(2).default(2),
  return_debug: z.boolean().default(false),
  include_embeddings: z.boolean().default(false),
  include_meta: z.boolean().default(false),
  include_slots: z.boolean().default(false),
  include_slots_preview: z.boolean().default(false),
  slots_preview_keys: z.number().int().positive().max(50).default(10),
  max_nodes: z.number().int().positive().max(200).default(50),
  // Hard contract: always cap returned edges to avoid response explosion.
  max_edges: z.number().int().positive().max(100).default(100),
  ranked_limit: z.number().int().positive().max(500).default(100),
  // Optional neighborhood quality filters (applied in stage-2 edge fetch).
  min_edge_weight: z.number().min(0).max(1).default(0),
  min_edge_confidence: z.number().min(0).max(1).default(0),
  // Optional context compaction budgets (for context.text only).
  context_token_budget: z.number().int().positive().max(256000).optional(),
  context_char_budget: z.number().int().positive().max(1000000).optional(),
  // Optional context compaction policy preset.
  context_compaction_profile: z.enum(["balanced", "aggressive"]).optional(),
  memory_layer_preference: MemoryLayerPreference.optional(),
  // Optional: same as MemoryRecallRequest.rules_* but for recall_text.
  rules_context: z.any().optional(),
  rules_include_shadow: z.boolean().optional().default(false),
  rules_limit: z.number().int().positive().max(200).optional().default(50),
});

export type MemoryRecallInput = z.infer<typeof MemoryRecallRequest>;
export type MemoryRecallTextInput = z.infer<typeof MemoryRecallTextRequest>;
export type MemoryWriteInput = z.infer<typeof MemoryWriteRequest>;

export const ContextLayerName = z.enum(["facts", "episodes", "rules", "static", "decisions", "tools", "citations"]);
export const MemoryTier = z.enum(["hot", "warm", "cold", "archive"]);

export const ContextForgettingPolicy = z.object({
  enabled: z.boolean().default(true),
  allowed_tiers: z.array(MemoryTier).min(1).max(4).default(["hot", "warm"]),
  exclude_archived: z.boolean().default(true),
  min_salience: z.number().min(0).max(1).optional(),
});

export const ContextLayerConfig = z.object({
  enabled: z.array(ContextLayerName).min(1).max(7).optional(),
  char_budget_total: z.number().int().positive().max(200000).optional(),
  char_budget_by_layer: z.record(z.string(), z.number().int().positive().max(200000)).optional(),
  max_items_by_layer: z.record(z.string(), z.number().int().positive().max(500)).optional(),
  include_merge_trace: z.boolean().default(true),
  forgetting_policy: ContextForgettingPolicy.optional(),
});

export const StaticContextBlock = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(20000),
  tags: z.array(z.string().min(1).max(64)).max(32).optional(),
  intents: z.array(z.string().min(1).max(64)).max(32).optional(),
  tools: z.array(z.string().min(1).max(128)).max(64).optional(),
  priority: z.number().int().min(0).max(100).default(50),
  always_include: z.boolean().default(false),
});

export const StaticInjectionPolicy = z.object({
  enabled: z.boolean().default(true),
  max_blocks: z.number().int().positive().max(32).default(4),
  min_score: z.number().int().min(0).max(500).default(50),
  include_selection_trace: z.boolean().default(true),
});

export const PlanningContextRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  recall_strategy: z.enum(["local", "balanced", "global"]).optional(),
  recall_mode: z.enum(["dense_edge"]).optional(),
  recall_class_aware: z.boolean().optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  // Planner/runtime execution context used by rules + tool selection.
  context: z.any(),
  include_shadow: z.boolean().default(false),
  rules_limit: z.number().int().positive().max(200).default(50),
  run_id: z.string().min(1).optional(),
  tool_candidates: z.array(z.string().min(1)).max(200).optional(),
  tool_strict: z.boolean().default(true),
  limit: z.number().int().positive().max(200).default(30),
  neighborhood_hops: z.number().int().min(1).max(2).default(2),
  return_debug: z.boolean().default(false),
  include_embeddings: z.boolean().default(false),
  include_meta: z.boolean().default(false),
  include_slots: z.boolean().default(false),
  include_slots_preview: z.boolean().default(false),
  slots_preview_keys: z.number().int().positive().max(50).default(10),
  max_nodes: z.number().int().positive().max(200).default(50),
  max_edges: z.number().int().positive().max(100).default(100),
  ranked_limit: z.number().int().positive().max(500).default(100),
  min_edge_weight: z.number().min(0).max(1).default(0),
  min_edge_confidence: z.number().min(0).max(1).default(0),
  context_token_budget: z.number().int().positive().max(256000).optional(),
  context_char_budget: z.number().int().positive().max(1000000).optional(),
  context_compaction_profile: z.enum(["balanced", "aggressive"]).optional(),
  context_optimization_profile: z.enum(["balanced", "aggressive"]).optional(),
  memory_layer_preference: MemoryLayerPreference.optional(),
  // Experimental: return explicit multi-layer context assembly (facts/episodes/rules/decisions/tools/citations).
  return_layered_context: z.boolean().default(false),
  context_layers: ContextLayerConfig.optional(),
  static_context_blocks: z.array(StaticContextBlock).max(100).optional(),
  static_injection: StaticInjectionPolicy.optional(),
  execution_result_summary: z.record(z.unknown()).optional(),
  execution_artifacts: z.array(z.record(z.unknown())).optional(),
  execution_evidence: z.array(z.record(z.unknown())).optional(),
  execution_state_v1: ExecutionStateV1Schema.optional(),
  execution_packet_v1: ExecutionPacketV1Schema.optional(),
});

export type ContextLayerConfigInput = z.infer<typeof ContextLayerConfig>;
export type PlanningContextInput = z.infer<typeof PlanningContextRequest>;

export const ContextAssembleRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  recall_strategy: z.enum(["local", "balanced", "global"]).optional(),
  recall_mode: z.enum(["dense_edge"]).optional(),
  recall_class_aware: z.boolean().optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  context: z.any().optional(),
  include_rules: z.boolean().default(true),
  include_shadow: z.boolean().default(false),
  rules_limit: z.number().int().positive().max(200).default(50),
  tool_candidates: z.array(z.string().min(1)).max(200).optional(),
  tool_strict: z.boolean().default(true),
  limit: z.number().int().positive().max(200).default(30),
  neighborhood_hops: z.number().int().min(1).max(2).default(2),
  return_debug: z.boolean().default(false),
  include_embeddings: z.boolean().default(false),
  include_meta: z.boolean().default(false),
  include_slots: z.boolean().default(false),
  include_slots_preview: z.boolean().default(false),
  slots_preview_keys: z.number().int().positive().max(50).default(10),
  max_nodes: z.number().int().positive().max(200).default(50),
  max_edges: z.number().int().positive().max(100).default(100),
  ranked_limit: z.number().int().positive().max(500).default(100),
  min_edge_weight: z.number().min(0).max(1).default(0),
  min_edge_confidence: z.number().min(0).max(1).default(0),
  context_token_budget: z.number().int().positive().max(256000).optional(),
  context_char_budget: z.number().int().positive().max(1000000).optional(),
  context_compaction_profile: z.enum(["balanced", "aggressive"]).optional(),
  context_optimization_profile: z.enum(["balanced", "aggressive"]).optional(),
  memory_layer_preference: MemoryLayerPreference.optional(),
  return_layered_context: z.boolean().default(true),
  context_layers: ContextLayerConfig.optional(),
  static_context_blocks: z.array(StaticContextBlock).max(100).optional(),
  static_injection: StaticInjectionPolicy.optional(),
  execution_result_summary: z.record(z.unknown()).optional(),
  execution_artifacts: z.array(z.record(z.unknown())).optional(),
  execution_evidence: z.array(z.record(z.unknown())).optional(),
  execution_state_v1: ExecutionStateV1Schema.optional(),
  execution_packet_v1: ExecutionPacketV1Schema.optional(),
});

export type ContextAssembleInput = z.infer<typeof ContextAssembleRequest>;

export const MemoryFindRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  // Canonical object locator: aionis://tenant/scope/type/id
  uri: z.string().min(1).optional(),
  id: UUID.optional(),
  client_id: z.string().min(1).optional(),
  type: NodeType.optional(),
  title_contains: z.string().min(1).optional(),
  text_contains: z.string().min(1).optional(),
  memory_lane: z.enum(["private", "shared"]).optional(),
  slots_contains: z.record(z.any()).optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  include_meta: z.boolean().default(false),
  include_slots: z.boolean().default(false),
  include_slots_preview: z.boolean().default(false),
  slots_preview_keys: z.number().int().positive().max(50).default(10),
  limit: z.number().int().positive().max(200).default(20),
  offset: z.number().int().min(0).max(200000).default(0),
});

export type MemoryFindInput = z.infer<typeof MemoryFindRequest>;

export const MemoryResolveRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  uri: z.string().min(1),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  include_meta: z.boolean().default(false),
  include_slots: z.boolean().default(false),
  include_slots_preview: z.boolean().default(false),
  slots_preview_keys: z.number().int().positive().max(50).default(10),
});

export type MemoryResolveInput = z.infer<typeof MemoryResolveRequest>;

export const HandoffKind = z.enum(["patch_handoff", "review_handoff", "task_handoff"]);

export const HandoffStoreRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  memory_lane: z.enum(["private", "shared"]).default("shared"),
  anchor: z.string().min(1),
  file_path: z.string().min(1).optional(),
  repo_root: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  handoff_kind: HandoffKind.default("patch_handoff"),
  title: z.string().min(1).optional(),
  summary: z.string().min(1),
  handoff_text: z.string().min(1),
  risk: z.string().min(1).optional(),
  acceptance_checks: z.array(z.string().min(1)).max(50).optional(),
  tags: z.array(z.string().min(1)).max(50).optional(),
  target_files: z.array(z.string().min(1)).max(50).optional(),
  next_action: z.string().min(1).optional(),
  must_change: z.array(z.string().min(1)).max(100).optional(),
  must_remove: z.array(z.string().min(1)).max(100).optional(),
  must_keep: z.array(z.string().min(1)).max(100).optional(),
  execution_result_summary: z.record(z.unknown()).optional(),
  execution_artifacts: z.array(z.record(z.unknown())).optional(),
  execution_evidence: z.array(z.record(z.unknown())).optional(),
  execution_state_v1: ExecutionStateV1Schema.optional(),
  execution_packet_v1: ExecutionPacketV1Schema.optional(),
  control_profile_v1: ControlProfileV1Schema.optional(),
  execution_transitions_v1: z.array(ExecutionStateTransitionV1Schema).optional(),
}).superRefine((value, ctx) => {
  if (value.handoff_kind !== "task_handoff" && !value.file_path) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["file_path"],
      message: "file_path is required unless handoff_kind is task_handoff",
    });
  }
});

export type HandoffStoreInput = z.infer<typeof HandoffStoreRequest>;

export const HandoffRecoverRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  anchor: z.string().min(1),
  repo_root: z.string().min(1).optional(),
  file_path: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  handoff_kind: HandoffKind.default("patch_handoff"),
  memory_lane: z.enum(["private", "shared"]).optional(),
  limit: z.number().int().positive().max(20).default(5),
});

export type HandoffRecoverInput = z.infer<typeof HandoffRecoverRequest>;

export const MemorySessionCreateRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  session_id: z.string().min(1).max(128),
  title: z.string().min(1).max(512).optional(),
  text_summary: z.string().min(1).max(4000).optional(),
  input_text: z.string().min(1).optional(),
  metadata: z.record(z.any()).optional(),
  auto_embed: z.boolean().optional(),
  memory_lane: z.enum(["private", "shared"]).optional(),
  producer_agent_id: z.string().min(1).optional(),
  owner_agent_id: z.string().min(1).optional(),
  owner_team_id: z.string().min(1).optional(),
});

export type MemorySessionCreateInput = z.infer<typeof MemorySessionCreateRequest>;

export const MemorySessionsListRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  owner_agent_id: z.string().min(1).optional(),
  owner_team_id: z.string().min(1).optional(),
  include_meta: QueryBoolean.default(false),
  limit: z.coerce.number().int().positive().max(200).default(20),
  offset: z.coerce.number().int().min(0).max(200000).default(0),
});

export type MemorySessionsListInput = z.infer<typeof MemorySessionsListRequest>;

export const MemoryEventWriteRequest = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    session_id: z.string().min(1).max(128),
    event_id: z.string().min(1).max(128).optional(),
    title: z.string().min(1).max(512).optional(),
    text_summary: z.string().min(1).max(4000).optional(),
    input_text: z.string().min(1).optional(),
    metadata: z.record(z.any()).optional(),
    auto_embed: z.boolean().optional(),
    memory_lane: z.enum(["private", "shared"]).optional(),
    producer_agent_id: z.string().min(1).optional(),
    owner_agent_id: z.string().min(1).optional(),
    owner_team_id: z.string().min(1).optional(),
    edge_weight: z.number().min(0).max(1).optional(),
    edge_confidence: z.number().min(0).max(1).optional(),
  })
  .refine((v) => !!v.text_summary || !!v.title || !!v.input_text, {
    message: "must set text_summary, title, or input_text",
  });

export type MemoryEventWriteInput = z.infer<typeof MemoryEventWriteRequest>;

export const MemorySessionEventsListRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  session_id: z.string().min(1).max(128),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  include_meta: QueryBoolean.default(false),
  include_slots: QueryBoolean.default(false),
  include_slots_preview: QueryBoolean.default(false),
  slots_preview_keys: z.coerce.number().int().positive().max(50).default(10),
  limit: z.coerce.number().int().positive().max(200).default(20),
  offset: z.coerce.number().int().min(0).max(200000).default(0),
});

export type MemorySessionEventsListInput = z.infer<typeof MemorySessionEventsListRequest>;

export const MemoryPackExportRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  include_nodes: z.boolean().default(true),
  include_edges: z.boolean().default(true),
  include_commits: z.boolean().default(true),
  include_decisions: z.boolean().default(false),
  include_meta: z.boolean().default(true),
  max_rows: z.number().int().positive().max(50000).default(5000),
});

export type MemoryPackExportInput = z.infer<typeof MemoryPackExportRequest>;

export const MemoryPackImportRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  verify_only: z.boolean().default(false),
  auto_embed: z.boolean().default(false),
  manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  pack: z.object({
    version: z.literal("aionis_pack_v1"),
    tenant_id: z.string().min(1),
    scope: z.string().min(1),
    nodes: z
      .array(
        z.object({
          id: UUID,
          client_id: z.string().min(1).nullish(),
          type: NodeType,
          tier: z.enum(["hot", "warm", "cold", "archive"]).optional(),
          memory_lane: z.enum(["private", "shared"]).optional(),
          producer_agent_id: z.string().min(1).nullish(),
          owner_agent_id: z.string().min(1).nullish(),
          owner_team_id: z.string().min(1).nullish(),
          title: z.string().nullish(),
          text_summary: z.string().nullish(),
          slots: z.record(z.any()).optional(),
          raw_ref: z.string().nullish(),
          evidence_ref: z.string().nullish(),
          salience: z.number().min(0).max(1).optional(),
          importance: z.number().min(0).max(1).optional(),
          confidence: z.number().min(0).max(1).optional(),
        }).passthrough(),
      )
      .default([]),
    edges: z
      .array(
        z.object({
          id: UUID,
          type: EdgeType,
          src_id: UUID,
          dst_id: UUID,
          src_client_id: z.string().min(1).nullish(),
          dst_client_id: z.string().min(1).nullish(),
          weight: z.number().min(0).max(1).optional(),
          confidence: z.number().min(0).max(1).optional(),
          decay_rate: z.number().min(0).max(1).optional(),
        }).passthrough(),
      )
      .default([]),
    commits: z
      .array(
        z.object({
          id: UUID,
          parent_id: UUID.nullable().optional(),
          input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
          actor: z.string().optional(),
          model_version: z.string().nullable().optional(),
          prompt_version: z.string().nullable().optional(),
          created_at: z.string().optional(),
          commit_hash: z.string().optional(),
        }).passthrough(),
      )
      .default([]),
    decisions: z
      .array(
        z
          .object({
            id: UUID.optional(),
            decision_id: UUID.optional(),
            decision_uri: z.string().min(1).optional(),
            decision_kind: z.string().min(1).optional(),
            run_id: z.string().nullish(),
            selected_tool: z.string().nullish(),
            candidates_json: z.array(z.any()).optional(),
            context_sha256: z.string().optional(),
            policy_sha256: z.string().optional(),
            source_rule_ids: z.array(UUID).optional(),
            metadata_json: z.record(z.any()).optional(),
            metadata: z.record(z.any()).optional(),
            created_at: z.string().optional(),
            commit_id: UUID.nullish(),
            commit_uri: z.string().nullish(),
          })
          .passthrough(),
      )
      .default([]),
  }).passthrough(),
});

export type MemoryPackImportInput = z.infer<typeof MemoryPackImportRequest>;

export const MemoryArchiveRehydrateRequest = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    node_ids: z.array(UUID).min(1).max(200).optional(),
    client_ids: z.array(z.string().min(1)).min(1).max(200).optional(),
    target_tier: z.enum(["warm", "hot"]).default("warm"),
    reason: z.string().min(1).optional(),
    input_text: z.string().min(1).optional(),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .refine((v) => (v.node_ids?.length ?? 0) > 0 || (v.client_ids?.length ?? 0) > 0, {
    message: "must set node_ids or client_ids",
  })
  .refine((v) => !!v.input_text || !!v.input_sha256, { message: "must set input_text or input_sha256" });

export type MemoryArchiveRehydrateInput = z.infer<typeof MemoryArchiveRehydrateRequest>;

export const MemoryNodesActivateRequest = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    node_ids: z.array(UUID).min(1).max(200).optional(),
    client_ids: z.array(z.string().min(1)).min(1).max(200).optional(),
    run_id: z.string().min(1).optional(),
    outcome: z.enum(["positive", "negative", "neutral"]).default("neutral"),
    activate: z.boolean().default(true),
    reason: z.string().min(1).optional(),
    input_text: z.string().min(1).optional(),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .refine((v) => (v.node_ids?.length ?? 0) > 0 || (v.client_ids?.length ?? 0) > 0, {
    message: "must set node_ids or client_ids",
  })
  .refine((v) => !!v.input_text || !!v.input_sha256, { message: "must set input_text or input_sha256" });

export type MemoryNodesActivateInput = z.infer<typeof MemoryNodesActivateRequest>;
export type RuleFeedbackInput = z.infer<typeof RuleFeedbackRequest>;
export type RuleStateUpdateInput = z.infer<typeof RuleStateUpdateRequest>;

export const RuleFeedbackRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  rule_node_id: UUID,
  run_id: z.string().min(1).optional(),
  outcome: z.enum(["positive", "negative", "neutral"]),
  note: z.string().min(1).optional(),
  input_text: z.string().min(1).optional(),
  input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).refine((v) => !!v.input_text || !!v.input_sha256, { message: "must set input_text or input_sha256" });

export const RuleStateUpdateRequest = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    rule_node_id: UUID,
    state: z.enum(["draft", "shadow", "active", "disabled"]),
    input_text: z.string().min(1).optional(),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .refine((v) => !!v.input_text || !!v.input_sha256, { message: "must set input_text or input_sha256" });

export const RulesEvaluateRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  // Arbitrary execution context from the caller (planner/tool selector), used to match rule conditions.
  context: z.any(),
  // By default, both ACTIVE and SHADOW rules are returned (separately).
  include_shadow: z.boolean().default(true),
  // Hard cap: don't scan/return unbounded rules.
  limit: z.number().int().positive().max(200).default(50),
});

export type RulesEvaluateInput = z.infer<typeof RulesEvaluateRequest>;

export const ToolsSelectRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  // Optional execution run correlation id for provenance.
  run_id: z.string().min(1).optional(),
  context: z.any(),
  execution_result_summary: z.record(z.unknown()).optional(),
  execution_artifacts: z.array(z.record(z.unknown())).optional(),
  execution_evidence: z.array(z.record(z.unknown())).optional(),
  execution_state_v1: ExecutionStateV1Schema.optional(),
  // Tool names provided by the caller's execution environment.
  candidates: z.array(z.string().min(1)).min(1).max(200),
  // Include SHADOW rules as a non-enforcing preview channel.
  include_shadow: z.boolean().default(false),
  // Hard cap: don't scan unbounded rules.
  rules_limit: z.number().int().positive().max(200).default(50),
  // If true and allow/deny filters eliminate all candidates, return 400 instead of falling back.
  strict: z.boolean().default(true),
  // Experimental: if true, Aionis may reorder candidates before final selection.
  reorder_candidates: z.boolean().default(false),
});

export type ToolsSelectInput = z.input<typeof ToolsSelectRequest>;

export const ToolsDecisionRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  decision_id: UUID.optional(),
  decision_uri: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
}).refine((v) => !!v.decision_id || !!v.decision_uri || !!v.run_id, {
  message: "must set decision_id, decision_uri, or run_id",
});

export type ToolsDecisionInput = z.infer<typeof ToolsDecisionRequest>;

export const ToolsRunRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: z.string().min(1),
  decision_limit: z.number().int().positive().max(200).default(10),
  include_feedback: z.boolean().default(true),
  feedback_limit: z.number().int().positive().max(200).default(50),
});

export type ToolsRunInput = z.infer<typeof ToolsRunRequest>;

export const ToolsRunsListRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).default(20),
});

export type ToolsRunsListInput = z.infer<typeof ToolsRunsListRequest>;

export const ToolsFeedbackRequest = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    run_id: z.string().min(1).optional(),
    // Optional direct link to the persisted tools/select decision record.
    decision_id: UUID.optional(),
    decision_uri: z.string().min(1).optional(),
    // Feedback for the tool selection decision.
    outcome: z.enum(["positive", "negative", "neutral"]),
    // Same execution context used for tool selection.
    context: z.any(),
    // Candidate tools shown to the selector.
    candidates: z.array(z.string().min(1)).min(1).max(200),
    // The tool that was actually used (selected/executed) by the caller.
    selected_tool: z.string().min(1),
    // Whether to include SHADOW rules for attribution; by default feedback applies to ACTIVE tool rules only.
    include_shadow: z.boolean().default(false),
    rules_limit: z.number().int().positive().max(200).default(50),
    // Attribution target:
    // - tool: only rules that touched tool.* paths
    // - all: all applied rules (rare; use with care)
    target: z.enum(["tool", "all"]).default("tool"),
    note: z.string().min(1).optional(),
    input_text: z.string().min(1).optional(),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .refine((v) => !!v.input_text || !!v.input_sha256, { message: "must set input_text or input_sha256" });

export type ToolsFeedbackInput = z.infer<typeof ToolsFeedbackRequest>;

export const ReplaySafetyLevel = z.enum(["auto_ok", "needs_confirm", "manual_only"]);
export type ReplaySafetyLevelInput = z.infer<typeof ReplaySafetyLevel>;

export const ReplayRunStatus = z.enum(["success", "failed", "partial"]);
export type ReplayRunStatusInput = z.infer<typeof ReplayRunStatus>;
export const ReplayPlaybookStatus = z.enum(["draft", "shadow", "active", "disabled"]);
export type ReplayPlaybookStatusInput = z.infer<typeof ReplayPlaybookStatus>;
export const ReplayRunMode = z.enum(["strict", "guided", "simulate"]);
export type ReplayRunModeInput = z.infer<typeof ReplayRunMode>;

const ReplayCondition = z.record(z.any());
const ReplayConsumerIdentityFields = {
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
} as const;
const ReplayWriteIdentityFields = {
  memory_lane: z.enum(["private", "shared"]).optional(),
  producer_agent_id: z.string().min(1).optional(),
  owner_agent_id: z.string().min(1).optional(),
  owner_team_id: z.string().min(1).optional(),
} as const;

export const ReplayRunStartRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  run_id: UUID.optional(),
  goal: z.string().min(1),
  context_snapshot_ref: z.string().min(1).optional(),
  context_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  metadata: z.record(z.any()).optional(),
});

export type ReplayRunStartInput = z.infer<typeof ReplayRunStartRequest>;

export const ReplayStepBeforeRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  run_id: UUID,
  step_id: UUID.optional(),
  decision_id: UUID.optional(),
  step_index: z.number().int().positive(),
  tool_name: z.string().min(1),
  tool_input: z.any(),
  expected_output_signature: z.any().optional(),
  preconditions: z.array(ReplayCondition).max(200).default([]),
  retry_policy: z.record(z.any()).optional(),
  safety_level: ReplaySafetyLevel.default("needs_confirm"),
  metadata: z.record(z.any()).optional(),
});

export type ReplayStepBeforeInput = z.infer<typeof ReplayStepBeforeRequest>;

export const ReplayStepAfterRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  run_id: UUID,
  step_id: UUID.optional(),
  step_index: z.number().int().positive().optional(),
  status: z.enum(["success", "failed", "skipped", "partial"]),
  output_signature: z.any().optional(),
  postconditions: z.array(ReplayCondition).max(200).default([]),
  artifact_refs: z.array(z.string().min(1)).max(200).default([]),
  repair_applied: z.boolean().default(false),
  repair_note: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  metadata: z.record(z.any()).optional(),
});

export type ReplayStepAfterInput = z.infer<typeof ReplayStepAfterRequest>;

export const ReplayRunEndRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  run_id: UUID,
  status: ReplayRunStatus,
  summary: z.string().min(1).optional(),
  success_criteria: z.record(z.any()).optional(),
  metrics: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type ReplayRunEndInput = z.infer<typeof ReplayRunEndRequest>;

export const ReplayRunGetRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  run_id: UUID,
  include_steps: z.boolean().default(true),
  include_artifacts: z.boolean().default(true),
});

export type ReplayRunGetInput = z.infer<typeof ReplayRunGetRequest>;

export const ReplayPlaybookCompileRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  run_id: UUID,
  playbook_id: UUID.optional(),
  name: z.string().min(1).optional(),
  version: z.number().int().positive().default(1),
  matchers: z.record(z.any()).optional(),
  success_criteria: z.record(z.any()).optional(),
  risk_profile: z.enum(["low", "medium", "high"]).default("medium"),
  allow_partial: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

export type ReplayPlaybookCompileInput = z.infer<typeof ReplayPlaybookCompileRequest>;

export const ReplayPlaybookGetRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  playbook_id: UUID,
});

export type ReplayPlaybookGetInput = z.infer<typeof ReplayPlaybookGetRequest>;

export const ReplayPlaybookCandidateRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  playbook_id: UUID,
  version: z.number().int().positive().optional(),
  deterministic_gate: z.object({
    enabled: z.boolean().default(true),
    prefer_deterministic_execution: z.boolean().default(true),
    on_mismatch: z.enum(["fallback", "reject"]).default("fallback"),
    required_statuses: z.array(ReplayPlaybookStatus).min(1).max(4).default(["shadow", "active"]),
    matchers: z.record(z.any()).optional(),
    policy_constraints: z.record(z.any()).optional(),
  }).optional(),
});

export type ReplayPlaybookCandidateInput = z.infer<typeof ReplayPlaybookCandidateRequest>;

export const ReplayPlaybookPromoteRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  playbook_id: UUID,
  from_version: z.number().int().positive().optional(),
  target_status: ReplayPlaybookStatus,
  note: z.string().min(1).max(1000).optional(),
  metadata: z.record(z.any()).optional(),
});

export type ReplayPlaybookPromoteInput = z.infer<typeof ReplayPlaybookPromoteRequest>;

export const ReplayPlaybookRunRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project_id: z.string().min(1).max(128).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  playbook_id: UUID,
  mode: ReplayRunMode.default("simulate"),
  version: z.number().int().positive().optional(),
  deterministic_gate: z.object({
    enabled: z.boolean().default(true),
    prefer_deterministic_execution: z.boolean().default(true),
    on_mismatch: z.enum(["fallback", "reject"]).default("fallback"),
    required_statuses: z.array(ReplayPlaybookStatus).min(1).max(4).default(["shadow", "active"]),
    matchers: z.record(z.any()).optional(),
    policy_constraints: z.record(z.any()).optional(),
  }).optional(),
  params: z.record(z.any()).optional(),
  max_steps: z.number().int().positive().max(500).default(200),
});

export type ReplayPlaybookRunInput = z.infer<typeof ReplayPlaybookRunRequest>;

export const ReplayPlaybookDispatchRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project_id: z.string().min(1).max(128).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  playbook_id: UUID,
  version: z.number().int().positive().optional(),
  deterministic_gate: z.object({
    enabled: z.boolean().default(true),
    prefer_deterministic_execution: z.boolean().default(true),
    on_mismatch: z.enum(["fallback", "reject"]).default("fallback"),
    required_statuses: z.array(ReplayPlaybookStatus).min(1).max(4).default(["shadow", "active"]),
    matchers: z.record(z.any()).optional(),
    policy_constraints: z.record(z.any()).optional(),
  }).optional(),
  fallback_mode: ReplayRunMode.default("simulate"),
  execute_fallback: z.boolean().default(true),
  params: z.record(z.any()).optional(),
  max_steps: z.number().int().positive().max(500).default(200),
});

export type ReplayPlaybookDispatchInput = z.infer<typeof ReplayPlaybookDispatchRequest>;

export const ReplayPlaybookRepairRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  playbook_id: UUID,
  from_version: z.number().int().positive().optional(),
  patch: z.record(z.any()),
  note: z.string().min(1).max(1000).optional(),
  review_required: z.boolean().default(true),
  target_status: ReplayPlaybookStatus.default("draft"),
  metadata: z.record(z.any()).optional(),
});

export type ReplayPlaybookRepairInput = z.infer<typeof ReplayPlaybookRepairRequest>;

export const ReplayLearningProjectionRequest = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["rule_and_episode", "episode_only"]).default("rule_and_episode"),
  delivery: z.enum(["async_outbox", "sync_inline"]).default("async_outbox"),
  target_rule_state: z.enum(["draft", "shadow"]).default("draft"),
  min_total_steps: z.number().int().min(0).max(500).default(1),
  min_success_ratio: z.number().min(0).max(1).default(1),
});

export type ReplayLearningProjectionInput = z.infer<typeof ReplayLearningProjectionRequest>;

export const ReplayPlaybookRepairReviewRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  ...ReplayConsumerIdentityFields,
  ...ReplayWriteIdentityFields,
  playbook_id: UUID,
  version: z.number().int().positive().optional(),
  action: z.enum(["approve", "reject"]),
  note: z.string().min(1).max(1000).optional(),
  auto_shadow_validate: z.boolean().default(true),
  shadow_validation_mode: z.enum(["readiness", "execute", "execute_sandbox"]).default("readiness"),
  shadow_validation_max_steps: z.number().int().positive().max(500).default(200),
  shadow_validation_params: z.record(z.any()).optional(),
  target_status_on_approve: ReplayPlaybookStatus.default("shadow"),
  auto_promote_on_pass: z.boolean().default(false),
  auto_promote_target_status: ReplayPlaybookStatus.default("active"),
  auto_promote_gate: z
    .object({
      require_shadow_pass: z.boolean().default(true),
      min_total_steps: z.number().int().min(0).max(500).default(0),
      max_failed_steps: z.number().int().min(0).max(500).default(0),
      max_blocked_steps: z.number().int().min(0).max(500).default(0),
      max_unknown_steps: z.number().int().min(0).max(500).default(0),
      min_success_ratio: z.number().min(0).max(1).default(1),
    })
    .default({}),
  learning_projection: ReplayLearningProjectionRequest.optional(),
  metadata: z.record(z.any()).optional(),
});

export type ReplayPlaybookRepairReviewInput = z.infer<typeof ReplayPlaybookRepairReviewRequest>;

export const AutomationDefStatus = z.enum(["draft", "shadow", "active", "disabled"]);
export type AutomationDefStatusInput = z.infer<typeof AutomationDefStatus>;

export const AutomationRunLifecycleState = z.enum(["queued", "running", "paused", "compensating", "terminal"]);
export type AutomationRunLifecycleStateInput = z.infer<typeof AutomationRunLifecycleState>;

export const AutomationRunPauseReason = z.enum(["approval_required", "repair_required", "dependency_wait", "operator_pause"]);
export type AutomationRunPauseReasonInput = z.infer<typeof AutomationRunPauseReason>;

export const AutomationRunTerminalOutcome = z.enum(["succeeded", "failed", "cancelled", "failed_compensated", "cancelled_compensated"]);
export type AutomationRunTerminalOutcomeInput = z.infer<typeof AutomationRunTerminalOutcome>;

export const AutomationNodeKind = z.enum(["playbook", "approval", "condition", "artifact_gate"]);
export type AutomationNodeKindInput = z.infer<typeof AutomationNodeKind>;

export const AutomationNodeLifecycleState = z.enum(["pending", "ready", "running", "paused", "retrying", "compensating", "terminal"]);
export type AutomationNodeLifecycleStateInput = z.infer<typeof AutomationNodeLifecycleState>;

export const AutomationNodePauseReason = z.enum(["approval_required", "repair_required"]);
export type AutomationNodePauseReasonInput = z.infer<typeof AutomationNodePauseReason>;

export const AutomationNodeTerminalOutcome = z.enum(["succeeded", "failed", "rejected", "skipped", "compensated"]);
export type AutomationNodeTerminalOutcomeInput = z.infer<typeof AutomationNodeTerminalOutcome>;

const AutomationPlaybookNode = z.object({
  node_id: z.string().min(1).max(128),
  kind: z.literal("playbook"),
  name: z.string().min(1).max(200).optional(),
  playbook_id: z.string().min(1),
  version: z.number().int().positive().optional(),
  mode: ReplayRunMode.optional(),
  inputs: z.record(z.any()).optional(),
  policy: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const AutomationApprovalNode = z.object({
  node_id: z.string().min(1).max(128),
  kind: z.literal("approval"),
  name: z.string().min(1).max(200).optional(),
  approval_key: z.string().min(1).max(128).optional(),
  inputs: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const AutomationConditionNode = z.object({
  node_id: z.string().min(1).max(128),
  kind: z.literal("condition"),
  name: z.string().min(1).max(200).optional(),
  expression: z.any(),
  inputs: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const AutomationArtifactGateNode = z.object({
  node_id: z.string().min(1).max(128),
  kind: z.literal("artifact_gate"),
  name: z.string().min(1).max(200).optional(),
  required_artifacts: z.array(z.string().min(1)).max(200).default([]),
  inputs: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const AutomationGraphNode = z.discriminatedUnion("kind", [
  AutomationPlaybookNode,
  AutomationApprovalNode,
  AutomationConditionNode,
  AutomationArtifactGateNode,
]);
export type AutomationGraphNodeInput = z.infer<typeof AutomationGraphNode>;

export const AutomationGraphEdge = z.object({
  from: z.string().min(1).max(128),
  to: z.string().min(1).max(128),
  type: z.enum(["depends_on", "on_success", "on_failure"]).default("on_success"),
  metadata: z.record(z.any()).optional(),
});
export type AutomationGraphEdgeInput = z.infer<typeof AutomationGraphEdge>;

export const AutomationGraph = z.object({
  nodes: z.array(AutomationGraphNode).min(1).max(200),
  edges: z.array(AutomationGraphEdge).max(500).default([]),
});
export type AutomationGraphInput = z.infer<typeof AutomationGraph>;

export const AutomationCreateRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  status: AutomationDefStatus.default("draft"),
  graph: AutomationGraph,
  input_contract: z.record(z.any()).optional(),
  output_contract: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});
export type AutomationCreateInput = z.infer<typeof AutomationCreateRequest>;

export const AutomationValidateRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  graph: AutomationGraph,
});
export type AutomationValidateInput = z.infer<typeof AutomationValidateRequest>;

export const AutomationTelemetryRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128).optional(),
  window_hours: z.number().int().positive().max(24 * 30).default(24),
  incident_limit: z.number().int().positive().max(100).default(10),
});
export type AutomationTelemetryInput = z.infer<typeof AutomationTelemetryRequest>;

export const AutomationGetRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128),
  version: z.number().int().positive().optional(),
});
export type AutomationGetInput = z.infer<typeof AutomationGetRequest>;

export const AutomationShadowReportRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128),
  shadow_version: z.number().int().positive().optional(),
  active_version: z.number().int().positive().optional(),
});
export type AutomationShadowReportInput = z.infer<typeof AutomationShadowReportRequest>;

export const AutomationShadowReviewVerdict = z.enum(["approved", "needs_changes", "rejected"]);

export const AutomationShadowReviewRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128),
  shadow_version: z.number().int().positive().optional(),
  verdict: AutomationShadowReviewVerdict,
  note: z.string().min(1).max(1000).optional(),
});
export type AutomationShadowReviewInput = z.infer<typeof AutomationShadowReviewRequest>;

export const AutomationShadowValidateMode = z.enum(["enqueue", "inline"]);

export const AutomationShadowValidateRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128),
  shadow_version: z.number().int().positive().optional(),
  mode: AutomationShadowValidateMode.default("enqueue"),
  note: z.string().min(1).max(1000).optional(),
  params: z.record(z.any()).optional(),
});
export type AutomationShadowValidateInput = z.infer<typeof AutomationShadowValidateRequest>;

export const AutomationShadowValidateDispatchRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128).optional(),
  limit: z.number().int().positive().max(100).default(10),
  dry_run: z.boolean().default(false),
});
export type AutomationShadowValidateDispatchInput = z.infer<typeof AutomationShadowValidateDispatchRequest>;

export const AutomationListRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  status: AutomationDefStatus.optional(),
  promotion_only: z.boolean().default(false),
  reviewer: z.string().min(1).max(256).optional(),
  limit: z.number().int().positive().max(100).default(20),
});
export type AutomationListInput = z.infer<typeof AutomationListRequest>;

export const AutomationAssignReviewerRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128),
  reviewer: z.string().min(1).max(256),
  note: z.string().min(1).max(1000).optional(),
});
export type AutomationAssignReviewerInput = z.infer<typeof AutomationAssignReviewerRequest>;

export const AutomationPromoteRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128),
  from_version: z.number().int().positive().optional(),
  target_status: AutomationDefStatus,
  note: z.string().min(1).max(1000).optional(),
  metadata: z.record(z.any()).optional(),
});
export type AutomationPromoteInput = z.infer<typeof AutomationPromoteRequest>;

export const AutomationRunRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128),
  version: z.number().int().positive().optional(),
  params: z.record(z.any()).optional(),
  options: z
    .object({
      execution_mode: z.enum(["default", "shadow"]).default("default"),
      allow_local_exec: z.boolean().default(false),
      record_run: z.boolean().default(true),
      stop_on_failure: z.boolean().default(true),
    })
    .default({}),
});
export type AutomationRunInput = z.infer<typeof AutomationRunRequest>;

export const AutomationRunGetRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: UUID,
  include_nodes: z.boolean().default(true),
});
export type AutomationRunGetInput = z.infer<typeof AutomationRunGetRequest>;

export const AutomationRunListRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  automation_id: z.string().min(1).max(128).optional(),
  actionable_only: z.boolean().default(false),
  compensation_only: z.boolean().default(false),
  reviewer: z.string().min(1).max(256).optional(),
  compensation_owner: z.string().min(1).max(256).optional(),
  escalation_owner: z.string().min(1).max(256).optional(),
  workflow_bucket: z.enum(["retry", "manual_cleanup", "escalate", "observe", "other"]).optional(),
  sla_status: z.enum(["unset", "on_track", "at_risk", "breached", "met"]).optional(),
  limit: z.number().int().positive().max(100).default(20),
});
export type AutomationRunListInput = z.infer<typeof AutomationRunListRequest>;

export const AutomationRunAssignReviewerRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  reviewer: z.string().min(1).max(256),
  note: z.string().min(1).max(1000).optional(),
});
export type AutomationRunAssignReviewerInput = z.infer<typeof AutomationRunAssignReviewerRequest>;

export const AutomationRunCancelRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  reason: z.string().min(1).max(1000).optional(),
});
export type AutomationRunCancelInput = z.infer<typeof AutomationRunCancelRequest>;

export const AutomationRunResumeRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  reason: z.string().min(1).max(1000).optional(),
});
export type AutomationRunResumeInput = z.infer<typeof AutomationRunResumeRequest>;

export const AutomationRunRejectRepairRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  reason: z.string().min(1).max(1000).optional(),
});
export type AutomationRunRejectRepairInput = z.infer<typeof AutomationRunRejectRepairRequest>;

export const AutomationRunApproveRepairRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  reason: z.string().min(1).max(1000).optional(),
});
export type AutomationRunApproveRepairInput = z.infer<typeof AutomationRunApproveRepairRequest>;

export const AutomationRunCompensationRetryRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  reason: z.string().min(1).max(1000).optional(),
});
export type AutomationRunCompensationRetryInput = z.infer<typeof AutomationRunCompensationRetryRequest>;

export const AutomationRunCompensationWorkflowAction = z.enum([
  "manual_cleanup_started",
  "manual_cleanup_completed",
  "engineering_escalated",
  "observation_noted",
]);

export const AutomationRunCompensationRecordActionRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  action: AutomationRunCompensationWorkflowAction,
  note: z.string().min(1).max(1000).optional(),
  external_ref: z.string().min(1).max(512).optional(),
});
export type AutomationRunCompensationRecordActionInput = z.infer<typeof AutomationRunCompensationRecordActionRequest>;

export const AutomationRunCompensationAssignRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  owner: z.string().min(1).max(256).optional(),
  escalation_owner: z.string().min(1).max(256).optional(),
  sla_target_at: z.string().min(1).max(64).optional(),
  note: z.string().min(1).max(1000).optional(),
});
export type AutomationRunCompensationAssignInput = z.infer<typeof AutomationRunCompensationAssignRequest>;

export const AutomationCompensationPolicyMatrixRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
});
export type AutomationCompensationPolicyMatrixInput = z.infer<typeof AutomationCompensationPolicyMatrixRequest>;

export const SandboxSessionCreateRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  profile: z.enum(["default", "restricted"]).default("default"),
  ttl_seconds: z.number().int().positive().max(7 * 24 * 3600).optional(),
  metadata: z.record(z.any()).optional(),
});

export type SandboxSessionCreateInput = z.infer<typeof SandboxSessionCreateRequest>;

const SandboxCommandAction = z.object({
  kind: z.literal("command"),
  argv: z.array(z.string().min(1)).min(1).max(64),
});

export const SandboxExecuteRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project_id: z.string().min(1).max(128).optional(),
  actor: z.string().min(1).optional(),
  session_id: UUID,
  planner_run_id: z.string().min(1).optional(),
  decision_id: UUID.optional(),
  mode: z.enum(["async", "sync"]).default("async"),
  timeout_ms: z.number().int().positive().max(600000).optional(),
  action: SandboxCommandAction,
  metadata: z.record(z.any()).optional(),
});

export type SandboxExecuteInput = z.infer<typeof SandboxExecuteRequest>;

export const SandboxRunGetRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: UUID,
});

export type SandboxRunGetInput = z.infer<typeof SandboxRunGetRequest>;

export const SandboxRunLogsRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: UUID,
  tail_bytes: z.number().int().positive().max(512000).default(65536),
});

export type SandboxRunLogsInput = z.infer<typeof SandboxRunLogsRequest>;

export const SandboxRunArtifactRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: UUID,
  tail_bytes: z.number().int().positive().max(512000).default(65536),
  include_action: z.boolean().default(true),
  include_output: z.boolean().default(true),
  include_result: z.boolean().default(true),
  include_metadata: z.boolean().default(true),
  bundle_inline: z.boolean().default(true),
});

export type SandboxRunArtifactInput = z.infer<typeof SandboxRunArtifactRequest>;

export const SandboxRunCancelRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: UUID,
  reason: z.string().min(1).max(400).optional(),
});

export type SandboxRunCancelInput = z.infer<typeof SandboxRunCancelRequest>;
