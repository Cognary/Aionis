export const MEMORY_LAYER_IDS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;

export type MemoryLayerId = (typeof MEMORY_LAYER_IDS)[number];

export type MemoryLayerPolicyName = "factual_recall" | "planning_context";
export type MemoryLayerPolicySource = "endpoint_default" | "request_override";

export type MemoryLayerPreferenceInput = {
  allowed_layers?: MemoryLayerId[] | null;
};

export type MemoryLayerPolicy = {
  name: MemoryLayerPolicyName;
  preferred_layers: MemoryLayerId[];
  fallback_layers: MemoryLayerId[];
  trust_anchor_layers: MemoryLayerId[];
  source: MemoryLayerPolicySource;
  requested_allowed_layers?: MemoryLayerId[];
};

function dedupeLayers(input: readonly MemoryLayerId[]): MemoryLayerId[] {
  return Array.from(new Set(input));
}

function defaultPolicyForEndpoint(
  endpoint: "recall" | "recall_text" | "planning_context" | "context_assemble",
): MemoryLayerPolicy {
  if (endpoint === "planning_context" || endpoint === "context_assemble") {
    return {
      name: "planning_context",
      preferred_layers: dedupeLayers(["L3", "L0", "L1", "L2"]),
      fallback_layers: dedupeLayers(["L1", "L2"]),
      trust_anchor_layers: dedupeLayers(["L3", "L0"]),
      source: "endpoint_default",
    };
  }
  return {
    name: "factual_recall",
    preferred_layers: dedupeLayers(["L3", "L0", "L1", "L2"]),
    fallback_layers: dedupeLayers(["L0", "L1"]),
    trust_anchor_layers: dedupeLayers(["L3", "L0"]),
    source: "endpoint_default",
  };
}

export function resolveMemoryLayerPolicy(
  endpoint: "recall" | "recall_text" | "planning_context" | "context_assemble",
  preference?: MemoryLayerPreferenceInput | null,
): MemoryLayerPolicy {
  const base = defaultPolicyForEndpoint(endpoint);
  const requestedAllowedLayers = dedupeLayers(
    Array.isArray(preference?.allowed_layers) ? preference.allowed_layers.filter((layer): layer is MemoryLayerId => MEMORY_LAYER_IDS.includes(layer)) : [],
  );
  if (requestedAllowedLayers.length === 0) return base;

  const effectiveAllowed = new Set<MemoryLayerId>([...requestedAllowedLayers, ...base.trust_anchor_layers]);
  const preferredLayers = base.preferred_layers.filter((layer) => effectiveAllowed.has(layer));
  const fallbackLayers = base.fallback_layers.filter((layer) => effectiveAllowed.has(layer));
  return {
    ...base,
    preferred_layers: preferredLayers,
    fallback_layers: fallbackLayers,
    source: "request_override",
    requested_allowed_layers: requestedAllowedLayers,
  };
}
