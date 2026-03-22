import {
  MemoryPromoteRequest,
  WorkflowWriteProjectionGovernancePolicyEffectSchema,
  type MemoryAdmissibilityResult,
  type MemoryPromoteSemanticReviewResult,
  type MemoryPromoteSemanticReviewPacket,
  type WorkflowWriteProjectionGovernanceDecisionTrace,
  type WorkflowWriteProjectionGovernancePolicyEffect,
} from "./schemas.js";
import { buildGovernanceDecisionTraceBase } from "./governance-shared.js";
import {
  type PromoteMemoryCandidateExample,
} from "./promote-memory-governance.js";
import { runPromoteMemoryGovernancePreview } from "./promote-memory-governance-shared.js";

type WorkflowPromotionCandidateExample = PromoteMemoryCandidateExample;

export function deriveWorkflowPromotionSemanticPolicyEffect(args: {
  basePromotionState: "candidate" | "stable";
  review: MemoryPromoteSemanticReviewResult | null;
  admissibility: MemoryAdmissibilityResult | null;
  minPromotionConfidence?: number;
}): WorkflowWriteProjectionGovernancePolicyEffect {
  const minPromotionConfidence = args.minPromotionConfidence ?? 0.85;

  if (!args.review) {
    return WorkflowWriteProjectionGovernancePolicyEffectSchema.parse({
      source: "default_workflow_promotion_state",
      applies: false,
      base_promotion_state: args.basePromotionState,
      review_suggested_promotion_state: null,
      effective_promotion_state: args.basePromotionState,
      reason_code: "review_not_supplied",
    });
  }

  if (!args.admissibility?.admissible) {
    return WorkflowWriteProjectionGovernancePolicyEffectSchema.parse({
      source: "default_workflow_promotion_state",
      applies: false,
      base_promotion_state: args.basePromotionState,
      review_suggested_promotion_state: null,
      effective_promotion_state: args.basePromotionState,
      reason_code: "review_not_admissible",
    });
  }

  if (args.basePromotionState === "stable") {
    return WorkflowWriteProjectionGovernancePolicyEffectSchema.parse({
      source: "default_workflow_promotion_state",
      applies: false,
      base_promotion_state: args.basePromotionState,
      review_suggested_promotion_state: "stable",
      effective_promotion_state: args.basePromotionState,
      reason_code: "already_stable",
    });
  }

  const highConfidenceWorkflowPromotion =
    args.review.adjudication.disposition === "recommend"
    && args.review.adjudication.target_kind === "workflow"
    && args.review.adjudication.target_level === "L2"
    && args.review.adjudication.strategic_value === "high"
    && args.review.adjudication.confidence >= minPromotionConfidence;

  if (!highConfidenceWorkflowPromotion) {
    return WorkflowWriteProjectionGovernancePolicyEffectSchema.parse({
      source: "default_workflow_promotion_state",
      applies: false,
      base_promotion_state: args.basePromotionState,
      review_suggested_promotion_state: args.basePromotionState,
      effective_promotion_state: args.basePromotionState,
      reason_code: "review_did_not_raise_promotion_state",
    });
  }

  return WorkflowWriteProjectionGovernancePolicyEffectSchema.parse({
    source: "workflow_promotion_governance_review",
    applies: true,
    base_promotion_state: args.basePromotionState,
    review_suggested_promotion_state: "stable",
    effective_promotion_state: "stable",
    reason_code: "high_confidence_workflow_promotion",
  });
}

export function buildWorkflowPromotionGovernancePreview(args: {
  candidateNodeIds: string[];
  inputText: string;
  inputSha256: string;
  candidateExamples: WorkflowPromotionCandidateExample[];
  reviewResult?: MemoryPromoteSemanticReviewResult | null;
}): {
  promote_memory: {
    review_packet: MemoryPromoteSemanticReviewPacket;
    review_result: MemoryPromoteSemanticReviewResult | null;
    admissibility: MemoryAdmissibilityResult | null;
    policy_effect: WorkflowWriteProjectionGovernancePolicyEffect;
    decision_trace: WorkflowWriteProjectionGovernanceDecisionTrace;
  };
} {
  const input = MemoryPromoteRequest.parse({
    candidate_node_ids: args.candidateNodeIds,
    target_kind: "workflow",
    target_level: "L2",
    write_anchor: true,
    input_text: args.inputText,
    input_sha256: args.inputSha256,
  });

  return {
    promote_memory: runPromoteMemoryGovernancePreview({
      input,
      candidateExamples: args.candidateExamples,
      reviewResult: args.reviewResult ?? null,
      derivePolicyEffect: ({ review, admissibility }) =>
        deriveWorkflowPromotionSemanticPolicyEffect({
          basePromotionState: "candidate",
          review,
          admissibility,
        }),
      buildDecisionTrace: ({ reviewResult, admissibility, policyEffect }) => ({
        ...buildGovernanceDecisionTraceBase({
          reviewResult,
          admissibility,
          policyEffectApplies: policyEffect.applies,
          policyEffectReasonCode: policyEffect.reason_code,
          includePolicyEffectReasonCode: !policyEffect.applies,
        }),
        trace_version: "workflow_promotion_governance_trace_v1",
        base_promotion_state: "candidate",
        effective_promotion_state: policyEffect.effective_promotion_state,
        stage_order: buildGovernanceDecisionTraceBase({
          reviewResult,
          admissibility,
          policyEffectApplies: policyEffect.applies,
          policyEffectReasonCode: policyEffect.reason_code,
          includePolicyEffectReasonCode: !policyEffect.applies,
        }).stage_order as WorkflowWriteProjectionGovernanceDecisionTrace["stage_order"],
        reason_codes: buildGovernanceDecisionTraceBase({
          reviewResult,
          admissibility,
          policyEffectApplies: policyEffect.applies,
          policyEffectReasonCode: policyEffect.reason_code,
          includePolicyEffectReasonCode: !policyEffect.applies,
        }).reason_codes,
      }),
    }),
  };
}
