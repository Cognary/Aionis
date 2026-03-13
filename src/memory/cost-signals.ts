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
  retrieved_memory_layers: string[];
  retrieved_unlayered_count: number;
  selected_memory_layers: string[];
  selected_unlayered_count: number;
  retrieval_filtered_by_layer_policy_count: number;
  retrieval_filtered_by_layer: Record<string, number>;
  filtered_by_layer_policy_count: number;
  filtered_by_layer: Record<string, number>;
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

function normalizeSelectionStats(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const retrievedMemoryLayers = Array.isArray(raw.retrieved_memory_layers)
    ? raw.retrieved_memory_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  const selectedLayers = Array.isArray(raw.selected_memory_layers)
    ? raw.selected_memory_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  const filteredByLayer =
    raw.filtered_by_layer && typeof raw.filtered_by_layer === "object" && !Array.isArray(raw.filtered_by_layer)
      ? Object.fromEntries(
          Object.entries(raw.filtered_by_layer as Record<string, unknown>)
            .map(([key, value]) => [String(key), Number(value)])
            .filter(([, value]) => Number.isFinite(value) && Number(value) > 0),
        )
      : {};
  const retrievalFilteredByLayer =
    raw.retrieval_filtered_by_layer &&
    typeof raw.retrieval_filtered_by_layer === "object" &&
    !Array.isArray(raw.retrieval_filtered_by_layer)
      ? Object.fromEntries(
          Object.entries(raw.retrieval_filtered_by_layer as Record<string, unknown>)
            .map(([key, value]) => [String(key), Number(value)])
            .filter(([, value]) => Number.isFinite(value) && Number(value) > 0),
        )
      : {};
  const retrievedUnlayeredCount = Number(raw.retrieved_unlayered_count ?? 0);
  const selectedUnlayeredCount = Number(raw.selected_unlayered_count ?? 0);
  const retrievalFilteredCount = Number(raw.retrieval_filtered_by_layer_policy_count ?? 0);
  const filteredCount = Number(raw.filtered_by_layer_policy_count ?? 0);
  return {
    retrieved_memory_layers: retrievedMemoryLayers,
    retrieved_unlayered_count: Number.isFinite(retrievedUnlayeredCount) ? Math.max(0, Math.trunc(retrievedUnlayeredCount)) : 0,
    selected_memory_layers: selectedLayers,
    selected_unlayered_count: Number.isFinite(selectedUnlayeredCount) ? Math.max(0, Math.trunc(selectedUnlayeredCount)) : 0,
    retrieval_filtered_by_layer_policy_count: Number.isFinite(retrievalFilteredCount)
      ? Math.max(0, Math.trunc(retrievalFilteredCount))
      : 0,
    retrieval_filtered_by_layer: retrievalFilteredByLayer,
    filtered_by_layer_policy_count: Number.isFinite(filteredCount) ? Math.max(0, Math.trunc(filteredCount)) : 0,
    filtered_by_layer: filteredByLayer,
  };
}

export function buildLayeredContextCostSignals(args: {
  layered_context?: any;
  context_items?: any[];
  context_selection_stats?: unknown;
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
  const selectionStats = normalizeSelectionStats(args.context_selection_stats);
  const memoryLayers = selectionStats?.selected_memory_layers ?? selectedMemoryLayers(args.context_items);
  const retrievedMemoryLayers = selectionStats?.retrieved_memory_layers ?? [];
  const filteredByLayerPolicyCount = selectionStats?.filtered_by_layer_policy_count ?? 0;
  const filteredByLayer = selectionStats?.filtered_by_layer ?? {};
  const retrievalFilteredByLayerPolicyCount = selectionStats?.retrieval_filtered_by_layer_policy_count ?? 0;
  const retrievalFilteredByLayer = selectionStats?.retrieval_filtered_by_layer ?? {};
  const levers: string[] = [];
  if (optimizationProfile) levers.push(`optimization_profile:${optimizationProfile}`);
  if (forgottenItems > 0) levers.push("forgetting");
  if (staticSelected > 0 || staticRejected > 0) levers.push("static_injection");
  if (compactionProfile === "aggressive") levers.push("aggressive_compaction");
  if (tokenBudget !== null) levers.push("token_budget");
  if (charBudget !== null) levers.push("char_budget");
  if (memoryLayers.length > 0) levers.push(`memory_layers:${memoryLayers.join(",")}`);
  if (retrievalFilteredByLayerPolicyCount > 0) levers.push("retrieval_layer_policy_filtering");
  if (filteredByLayerPolicyCount > 0) levers.push("layer_policy_filtering");

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
    retrieved_memory_layers: retrievedMemoryLayers,
    retrieved_unlayered_count: selectionStats?.retrieved_unlayered_count ?? 0,
    selected_memory_layers: memoryLayers,
    selected_unlayered_count: selectionStats?.selected_unlayered_count ?? 0,
    retrieval_filtered_by_layer_policy_count: retrievalFilteredByLayerPolicyCount,
    retrieval_filtered_by_layer: retrievalFilteredByLayer,
    filtered_by_layer_policy_count: filteredByLayerPolicyCount,
    filtered_by_layer: filteredByLayer,
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
