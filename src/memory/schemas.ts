import { z } from "zod";

export const UUID = z.string().uuid();

export const NodeType = z.enum(["event", "entity", "topic", "rule", "evidence", "concept", "procedure", "self_model"]);
export const EdgeType = z.enum(["part_of", "related_to", "derived_from"]);

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
  // Optional: same as MemoryRecallRequest.rules_* but for recall_text.
  rules_context: z.any().optional(),
  rules_include_shadow: z.boolean().optional().default(false),
  rules_limit: z.number().int().positive().max(200).optional().default(50),
});

export type MemoryRecallInput = z.infer<typeof MemoryRecallRequest>;
export type MemoryRecallTextInput = z.infer<typeof MemoryRecallTextRequest>;
export type MemoryWriteInput = z.infer<typeof MemoryWriteRequest>;

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

export const ToolsFeedbackRequest = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    run_id: z.string().min(1).optional(),
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
