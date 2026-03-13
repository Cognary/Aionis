export type PlanningSummary = {
  summary_version: "planning_summary_v1";
  selected_tool: string | null;
  decision_id: string | null;
  rules_considered: number;
  rules_matched: number;
  context_est_tokens: number;
  layered_output: boolean;
  forgotten_items: number;
  static_blocks_selected: number;
  selected_memory_layers: string[];
  optimization_profile: "balanced" | "aggressive" | null;
  context_compaction_profile: "balanced" | "aggressive";
  recall_mode?: string | null;
  primary_savings_levers: string[];
};

export type AssemblySummary = {
  summary_version: "assembly_summary_v1";
  selected_tool: string | null;
  decision_id: string | null;
  rules_considered: number;
  rules_matched: number;
  include_rules: boolean;
  context_est_tokens: number;
  layered_output: boolean;
  forgotten_items: number;
  static_blocks_selected: number;
  selected_memory_layers: string[];
  optimization_profile: "balanced" | "aggressive" | null;
  context_compaction_profile: "balanced" | "aggressive";
  recall_mode?: string | null;
  primary_savings_levers: string[];
};

export function buildPlanningSummary(args: {
  rules?: unknown;
  tools?: unknown;
  layered_context?: unknown;
  cost_signals?: unknown;
  context_est_tokens: number;
  context_compaction_profile: "balanced" | "aggressive";
  optimization_profile: "balanced" | "aggressive" | null;
  recall_mode?: string | null;
}): PlanningSummary {
  const rules = args.rules && typeof args.rules === "object" ? (args.rules as Record<string, unknown>) : {};
  const tools = args.tools && typeof args.tools === "object" ? (args.tools as Record<string, unknown>) : {};
  const decision = tools.decision && typeof tools.decision === "object" ? (tools.decision as Record<string, unknown>) : {};
  const layeredContext =
    args.layered_context && typeof args.layered_context === "object"
      ? (args.layered_context as Record<string, unknown>)
      : {};
  const layeredStats =
    layeredContext.stats && typeof layeredContext.stats === "object"
      ? (layeredContext.stats as Record<string, unknown>)
      : {};
  const staticInjection =
    layeredContext.static_injection && typeof layeredContext.static_injection === "object"
      ? (layeredContext.static_injection as Record<string, unknown>)
      : {};
  const costSignals =
    args.cost_signals && typeof args.cost_signals === "object" ? (args.cost_signals as Record<string, unknown>) : {};

  return {
    summary_version: "planning_summary_v1",
    selected_tool: typeof tools.selection === "object" && tools.selection && typeof (tools.selection as any).selected === "string"
      ? (tools.selection as any).selected
      : null,
    decision_id: typeof decision.decision_id === "string" ? decision.decision_id : null,
    rules_considered: Number(rules.considered ?? 0),
    rules_matched: Number(rules.matched ?? 0),
    context_est_tokens: args.context_est_tokens,
    layered_output: Boolean(args.layered_context),
    forgotten_items: Number(costSignals.forgotten_items ?? layeredStats.forgotten_items ?? 0),
    static_blocks_selected: Number(costSignals.static_blocks_selected ?? staticInjection.selected_blocks ?? 0),
    selected_memory_layers: Array.isArray(costSignals.selected_memory_layers)
      ? costSignals.selected_memory_layers.filter((entry): entry is string => typeof entry === "string")
      : [],
    optimization_profile: args.optimization_profile,
    context_compaction_profile: args.context_compaction_profile,
    recall_mode: args.recall_mode ?? null,
    primary_savings_levers: Array.isArray(costSignals.primary_savings_levers)
      ? costSignals.primary_savings_levers.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

export function buildAssemblySummary(args: {
  rules?: unknown;
  tools?: unknown;
  layered_context?: unknown;
  cost_signals?: unknown;
  context_est_tokens: number;
  context_compaction_profile: "balanced" | "aggressive";
  optimization_profile: "balanced" | "aggressive" | null;
  recall_mode?: string | null;
  include_rules: boolean;
}): AssemblySummary {
  const planning = buildPlanningSummary({
    rules: args.rules,
    tools: args.tools,
    layered_context: args.layered_context,
    cost_signals: args.cost_signals,
    context_est_tokens: args.context_est_tokens,
    context_compaction_profile: args.context_compaction_profile,
    optimization_profile: args.optimization_profile,
    recall_mode: args.recall_mode,
  });
  return {
    summary_version: "assembly_summary_v1",
    selected_tool: planning.selected_tool,
    decision_id: planning.decision_id,
    rules_considered: planning.rules_considered,
    rules_matched: planning.rules_matched,
    include_rules: args.include_rules,
    context_est_tokens: planning.context_est_tokens,
    layered_output: planning.layered_output,
    forgotten_items: planning.forgotten_items,
    static_blocks_selected: planning.static_blocks_selected,
    selected_memory_layers: planning.selected_memory_layers,
    optimization_profile: planning.optimization_profile,
    context_compaction_profile: planning.context_compaction_profile,
    recall_mode: planning.recall_mode,
    primary_savings_levers: planning.primary_savings_levers,
  };
}
