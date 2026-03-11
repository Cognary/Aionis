export type ContextOptimizationProfileName = "balanced" | "aggressive";

type ContextOptimizationProfileInput = {
  context_optimization_profile?: unknown;
  context_compaction_profile?: unknown;
  context_layers?: unknown;
  static_injection?: unknown;
};

type ContextOptimizationProfileResult = {
  requested: ContextOptimizationProfileName | null;
  applied: boolean;
  context_compaction_profile: ContextOptimizationProfileName | null;
  forgetting_policy_applied: boolean;
  static_injection_applied: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeProfileName(value: unknown): ContextOptimizationProfileName | null {
  return value === "aggressive" || value === "balanced" ? value : null;
}

export function applyContextOptimizationProfile<T extends ContextOptimizationProfileInput>(
  parsed: T,
): { parsed: T; optimization_profile: ContextOptimizationProfileResult } {
  const requested = normalizeProfileName(parsed.context_optimization_profile);
  const existingCompaction = normalizeProfileName(parsed.context_compaction_profile);
  if (!requested) {
    return {
      parsed,
      optimization_profile: {
        requested: null,
        applied: false,
        context_compaction_profile: existingCompaction,
        forgetting_policy_applied: false,
        static_injection_applied: false,
      },
    };
  }

  const next: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  let applied = false;
  let forgettingPolicyApplied = false;
  let staticInjectionApplied = false;

  if (!existingCompaction) {
    next.context_compaction_profile = requested;
    applied = true;
  }

  const contextLayers = isRecord(parsed.context_layers) ? { ...parsed.context_layers } : {};
  if (!isRecord(contextLayers.forgetting_policy)) {
    contextLayers.forgetting_policy =
      requested === "aggressive"
        ? {
            enabled: true,
            allowed_tiers: ["hot"],
            exclude_archived: true,
            min_salience: 0.35,
          }
        : {
            enabled: true,
            allowed_tiers: ["hot", "warm"],
            exclude_archived: true,
            min_salience: 0.15,
          };
    next.context_layers = contextLayers;
    applied = true;
    forgettingPolicyApplied = true;
  }

  if (!isRecord(parsed.static_injection)) {
    next.static_injection =
      requested === "aggressive"
        ? {
            enabled: true,
            max_blocks: 2,
            min_score: 80,
            include_selection_trace: true,
          }
        : {
            enabled: true,
            max_blocks: 4,
            min_score: 50,
            include_selection_trace: true,
          };
    applied = true;
    staticInjectionApplied = true;
  }

  return {
    parsed: next as T,
    optimization_profile: {
      requested,
      applied,
      context_compaction_profile: normalizeProfileName(next.context_compaction_profile) ?? requested,
      forgetting_policy_applied: forgettingPolicyApplied,
      static_injection_applied: staticInjectionApplied,
    },
  };
}
