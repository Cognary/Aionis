import { z } from "zod";

export const UUID = z.string().uuid();

export const NodeType = z.enum(["event", "entity", "topic", "rule", "evidence", "concept", "procedure", "self_model"]);
export const EdgeType = z.enum(["part_of", "related_to", "derived_from"]);

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
    nodes: z.array(WriteNode).default([]),
    edges: z.array(WriteEdge).default([]),
  })
  .refine((v) => !!v.input_text || !!v.input_sha256, { message: "must set input_text or input_sha256" });

export const MemoryRecallRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_embedding: z.array(z.number()),
  recall_strategy: z.enum(["local", "balanced", "global"]).optional(),
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
  // Optional: same as MemoryRecallRequest.rules_* but for recall_text.
  rules_context: z.any().optional(),
  rules_include_shadow: z.boolean().optional().default(false),
  rules_limit: z.number().int().positive().max(200).optional().default(50),
});

export type MemoryRecallInput = z.infer<typeof MemoryRecallRequest>;
export type MemoryRecallTextInput = z.infer<typeof MemoryRecallTextRequest>;
export type MemoryWriteInput = z.infer<typeof MemoryWriteRequest>;

export const ContextLayerName = z.enum(["facts", "episodes", "rules", "decisions", "tools", "citations"]);

export const ContextLayerConfig = z.object({
  enabled: z.array(ContextLayerName).min(1).max(6).optional(),
  char_budget_total: z.number().int().positive().max(200000).optional(),
  char_budget_by_layer: z.record(z.string(), z.number().int().positive().max(200000)).optional(),
  max_items_by_layer: z.record(z.string(), z.number().int().positive().max(500)).optional(),
  include_merge_trace: z.boolean().default(true),
});

export const PlanningContextRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  recall_strategy: z.enum(["local", "balanced", "global"]).optional(),
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
  // Experimental: return explicit multi-layer context assembly (facts/episodes/rules/decisions/tools/citations).
  return_layered_context: z.boolean().default(false),
  context_layers: ContextLayerConfig.optional(),
});

export type ContextLayerConfigInput = z.infer<typeof ContextLayerConfig>;
export type PlanningContextInput = z.infer<typeof PlanningContextRequest>;

export const ContextAssembleRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  recall_strategy: z.enum(["local", "balanced", "global"]).optional(),
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
  return_layered_context: z.boolean().default(true),
  context_layers: ContextLayerConfig.optional(),
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
  // Tool names provided by the caller's execution environment.
  candidates: z.array(z.string().min(1)).min(1).max(200),
  // Include SHADOW rules as a non-enforcing preview channel.
  include_shadow: z.boolean().default(false),
  // Hard cap: don't scan unbounded rules.
  rules_limit: z.number().int().positive().max(200).default(50),
  // If true and allow/deny filters eliminate all candidates, return 400 instead of falling back.
  strict: z.boolean().default(true),
});

export type ToolsSelectInput = z.infer<typeof ToolsSelectRequest>;

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

export const ReplayRunStartRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
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
  run_id: UUID,
  include_steps: z.boolean().default(true),
  include_artifacts: z.boolean().default(true),
});

export type ReplayRunGetInput = z.infer<typeof ReplayRunGetRequest>;

export const ReplayPlaybookCompileRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
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
  playbook_id: UUID,
});

export type ReplayPlaybookGetInput = z.infer<typeof ReplayPlaybookGetRequest>;

export const ReplayPlaybookPromoteRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
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
  playbook_id: UUID,
  mode: ReplayRunMode.default("simulate"),
  version: z.number().int().positive().optional(),
  params: z.record(z.any()).optional(),
  max_steps: z.number().int().positive().max(500).default(200),
});

export type ReplayPlaybookRunInput = z.infer<typeof ReplayPlaybookRunRequest>;

export const ReplayPlaybookRepairRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  playbook_id: UUID,
  from_version: z.number().int().positive().optional(),
  patch: z.record(z.any()),
  note: z.string().min(1).max(1000).optional(),
  review_required: z.boolean().default(true),
  target_status: ReplayPlaybookStatus.default("draft"),
  metadata: z.record(z.any()).optional(),
});

export type ReplayPlaybookRepairInput = z.infer<typeof ReplayPlaybookRepairRequest>;

export const ReplayPlaybookRepairReviewRequest = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
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
  metadata: z.record(z.any()).optional(),
});

export type ReplayPlaybookRepairReviewInput = z.infer<typeof ReplayPlaybookRepairReviewRequest>;

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
