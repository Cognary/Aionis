export type CapabilityId = "sessions_graph" | "packs_export" | "packs_import" | "debug_embeddings" | "shadow_mirror_v2";

export type CapabilityFailureMode = "hard_fail" | "soft_degrade";

export type CapabilityContractSpec = {
  failure_mode: CapabilityFailureMode;
  degraded_modes: readonly string[];
};

export const CAPABILITY_CONTRACT: Record<CapabilityId, CapabilityContractSpec> = {
  sessions_graph: {
    failure_mode: "hard_fail",
    degraded_modes: ["feature_disabled"],
  },
  packs_export: {
    failure_mode: "hard_fail",
    degraded_modes: ["feature_disabled"],
  },
  packs_import: {
    failure_mode: "hard_fail",
    degraded_modes: ["feature_disabled"],
  },
  debug_embeddings: {
    failure_mode: "hard_fail",
    degraded_modes: ["feature_disabled"],
  },
  shadow_mirror_v2: {
    failure_mode: "soft_degrade",
    degraded_modes: ["capability_unsupported", "mirror_failed"],
  },
};

export function capabilityContract(capability: CapabilityId): CapabilityContractSpec {
  return CAPABILITY_CONTRACT[capability];
}
