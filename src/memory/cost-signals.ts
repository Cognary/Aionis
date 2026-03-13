type ContextOptimizationProfileName = "balanced" | "aggressive";

export type LayeredContextCostSignals = {
  summary_version: "context_cost_signals_v1";
  layered_output: boolean;
  context_est_tokens: number;
  context_token_budget: number | null;
  context_char_budget: number | null;
  within_token_budget: boolean | null;
  within_char_budget: boolean | null;
  context_compaction_profile: ContextOptimizationProfileName;
  optimization_profile: ContextOptimizationProfileName | null;
  forgotten_items: number;
  forgotten_by_reason: Record<string, number>;
  static_blocks_selected: number;
  static_blocks_rejected: number;
  selected_memory_layers: string[];
  primary_savings_levers: string[];
};

export type ReplayCostSignals = {
  summary_version: "replay_cost_signals_v1";
  deterministic_replay_eligible: boolean;
  primary_inference_skipped: boolean;
  estimated_primary_model_calls_avoided: number;
  fallback_executed: boolean;
  requested_mode: "simulate" | "strict" | "guided";
  effective_mode: "simulate" | "strict" | "guided";
  mismatch_reasons: string[];
  primary_savings_levers: string[];
};

function asNonNegativeNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function normalizeProfile(value: unknown): ContextOptimizationProfileName | null {
  return value === "aggressive" || value === "balanced" ? value : null;
}

function selectedMemoryLayers(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const layer = String((item as Record<string, unknown>).compression_layer ?? "").trim();
    if (!layer) continue;
    out.add(layer);
  }
  return Array.from(out).sort();
}

export function buildLayeredContextCostSignals(args: {
  layered_context?: any;
  context_items?: any[];
  context_est_tokens: number;
  context_token_budget?: number | null;
  context_char_budget?: number | null;
  context_compaction_profile?: unknown;
  context_optimization_profile?: unknown;
}): LayeredContextCostSignals {
  const tokenBudget = Number.isFinite(args.context_token_budget ?? NaN) ? Number(args.context_token_budget) : null;
  const charBudget = Number.isFinite(args.context_char_budget ?? NaN) ? Number(args.context_char_budget) : null;
  const forgottenItems = asNonNegativeNumber(args.layered_context?.forgetting?.dropped_items);
  const forgottenByReason =
    args.layered_context?.forgetting && typeof args.layered_context.forgetting.dropped_by_reason === "object"
      ? { ...(args.layered_context.forgetting.dropped_by_reason as Record<string, number>) }
      : {};
  const staticSelected = asNonNegativeNumber(args.layered_context?.static_injection?.selected_blocks);
  const staticRejected = asNonNegativeNumber(args.layered_context?.static_injection?.rejected_blocks);
  const compactionProfile = normalizeProfile(args.context_compaction_profile) ?? "balanced";
  const optimizationProfile = normalizeProfile(args.context_optimization_profile);
  const memoryLayers = selectedMemoryLayers(args.context_items);
  const levers: string[] = [];
  if (optimizationProfile) levers.push(`optimization_profile:${optimizationProfile}`);
  if (forgottenItems > 0) levers.push("forgetting");
  if (staticSelected > 0 || staticRejected > 0) levers.push("static_injection");
  if (compactionProfile === "aggressive") levers.push("aggressive_compaction");
  if (tokenBudget !== null) levers.push("token_budget");
  if (charBudget !== null) levers.push("char_budget");
  if (memoryLayers.length > 0) levers.push(`memory_layers:${memoryLayers.join(",")}`);

  return {
    summary_version: "context_cost_signals_v1",
    layered_output: !!args.layered_context,
    context_est_tokens: asNonNegativeNumber(args.context_est_tokens),
    context_token_budget: tokenBudget,
    context_char_budget: charBudget,
    within_token_budget: tokenBudget !== null ? asNonNegativeNumber(args.context_est_tokens) <= tokenBudget : null,
    within_char_budget:
      charBudget !== null
        ? asNonNegativeNumber(args.layered_context?.budget?.used_chars) <= charBudget
        : null,
    context_compaction_profile: compactionProfile,
    optimization_profile: optimizationProfile,
    forgotten_items: forgottenItems,
    forgotten_by_reason: forgottenByReason,
    static_blocks_selected: staticSelected,
    static_blocks_rejected: staticRejected,
    selected_memory_layers: memoryLayers,
    primary_savings_levers: levers,
  };
}

export function buildReplayCostSignals(args: {
  deterministic_gate?: any;
  dispatch?: { fallback_executed?: boolean } | null;
}): ReplayCostSignals {
  const requestedMode =
    args.deterministic_gate?.requested_mode === "strict" || args.deterministic_gate?.requested_mode === "guided"
      ? args.deterministic_gate.requested_mode
      : "simulate";
  const effectiveMode =
    args.deterministic_gate?.effective_mode === "strict" || args.deterministic_gate?.effective_mode === "guided"
      ? args.deterministic_gate.effective_mode
      : "simulate";
  const primaryInferenceSkipped = args.deterministic_gate?.inference_skipped === true;
  const deterministicReplayEligible = args.deterministic_gate?.matched === true;
  const fallbackExecuted = args.dispatch?.fallback_executed === true;
  const mismatchReasons = Array.isArray(args.deterministic_gate?.mismatch_reasons)
    ? args.deterministic_gate.mismatch_reasons.map((entry: unknown) => String(entry))
    : [];
  const levers: string[] = [];
  if (deterministicReplayEligible) levers.push("deterministic_replay_match");
  if (primaryInferenceSkipped) levers.push("primary_inference_skipped");
  if (fallbackExecuted) levers.push("fallback_replay");
  if (mismatchReasons.length > 0) levers.push("deterministic_gate_mismatch");

  return {
    summary_version: "replay_cost_signals_v1",
    deterministic_replay_eligible: deterministicReplayEligible,
    primary_inference_skipped: primaryInferenceSkipped,
    estimated_primary_model_calls_avoided: primaryInferenceSkipped ? 1 : 0,
    fallback_executed: fallbackExecuted,
    requested_mode: requestedMode,
    effective_mode: effectiveMode,
    mismatch_reasons: mismatchReasons,
    primary_savings_levers: levers,
  };
}
