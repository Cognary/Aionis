import type { MemoryAdmissibilityResult } from "./schemas.js";

export type GovernanceTraceStage =
  | "review_packet_built"
  | "review_result_received"
  | "admissibility_evaluated"
  | "policy_effect_derived"
  | "runtime_policy_applied";

export function buildGovernanceTraceStageOrder(args: {
  reviewSupplied: boolean;
  admissibilityEvaluated: boolean;
  runtimePolicyApplied?: boolean;
}): GovernanceTraceStage[] {
  const stageOrder: GovernanceTraceStage[] = ["review_packet_built"];
  if (args.reviewSupplied) stageOrder.push("review_result_received");
  if (args.admissibilityEvaluated) stageOrder.push("admissibility_evaluated");
  stageOrder.push("policy_effect_derived");
  if (args.runtimePolicyApplied) stageOrder.push("runtime_policy_applied");
  return stageOrder;
}

export function buildGovernanceReasonCodes(args: {
  admissibility: MemoryAdmissibilityResult | null;
  policyEffectReasonCode?: string | null;
  includePolicyEffectReasonCode: boolean;
}): string[] {
  const reasonCodes: string[] = [...(args.admissibility?.reason_codes ?? [])];
  if (args.includePolicyEffectReasonCode && args.policyEffectReasonCode) {
    reasonCodes.push(args.policyEffectReasonCode);
  }
  return reasonCodes;
}

export function appendGovernanceRuntimePolicyAppliedStage(stages: GovernanceTraceStage[]): GovernanceTraceStage[] {
  return stages.includes("runtime_policy_applied")
    ? stages
    : [...stages, "runtime_policy_applied"];
}

export function buildGovernanceDecisionTraceBase(args: {
  reviewResult: unknown | null;
  admissibility: MemoryAdmissibilityResult | null;
  policyEffectApplies: boolean;
  policyEffectReasonCode?: string | null;
  includePolicyEffectReasonCode: boolean;
  runtimePolicyApplied?: boolean;
}): {
  review_supplied: boolean;
  admissibility_evaluated: boolean;
  admissible: boolean | null;
  policy_effect_applies: boolean;
  stage_order: GovernanceTraceStage[];
  reason_codes: string[];
} {
  const reviewSupplied = args.reviewResult != null;
  const admissibilityEvaluated = args.admissibility != null;
  return {
    review_supplied: reviewSupplied,
    admissibility_evaluated: admissibilityEvaluated,
    admissible: args.admissibility?.admissible ?? null,
    policy_effect_applies: args.policyEffectApplies,
    stage_order: buildGovernanceTraceStageOrder({
      reviewSupplied,
      admissibilityEvaluated,
      runtimePolicyApplied: args.runtimePolicyApplied,
    }),
    reason_codes: buildGovernanceReasonCodes({
      admissibility: args.admissibility,
      policyEffectReasonCode: args.policyEffectReasonCode ?? null,
      includePolicyEffectReasonCode: args.includePolicyEffectReasonCode,
    }),
  };
}
