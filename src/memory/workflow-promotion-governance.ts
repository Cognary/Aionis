import {
  MemoryPromoteRequest,
  WorkflowWriteProjectionGovernancePolicyEffectSchema,
  type MemoryAdmissibilityResult,
  type MemoryPromoteSemanticReviewResult,
  type MemoryPromoteSemanticReviewPacket,
  type WorkflowWriteProjectionGovernanceDecisionTrace,
  type WorkflowWriteProjectionGovernancePolicyEffect,
} from "./schemas.js";
import { buildGovernanceReasonCodes, buildGovernanceTraceStageOrder } from "./governance-shared.js";
import {
  buildPromoteMemorySemanticReviewPacket,
  evaluatePromoteMemorySemanticReview,
} from "./promote-memory-governance.js";

type WorkflowPromotionCandidateExample = {
  node_id: string;
  title?: string | null;
  summary?: string | null;
  task_signature?: string | null;
  workflow_signature?: string | null;
  outcome_status?: string | null;
  success_score?: number | null;
};

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

  const reviewPacket = buildPromoteMemorySemanticReviewPacket({
    input,
    candidateExamples: args.candidateExamples,
  });
  const reviewResult = args.reviewResult ?? null;
  const admissibility = reviewResult
    ? evaluatePromoteMemorySemanticReview({
        packet: reviewPacket,
        review: reviewResult,
      })
    : null;

  const policyEffect = deriveWorkflowPromotionSemanticPolicyEffect({
    basePromotionState: "candidate",
    review: reviewResult,
    admissibility,
  });

  return {
    promote_memory: {
      review_packet: reviewPacket,
      review_result: reviewResult,
      admissibility,
      policy_effect: policyEffect,
      decision_trace: {
        trace_version: "workflow_promotion_governance_trace_v1",
        review_supplied: !!reviewResult,
        admissibility_evaluated: admissibility != null,
        admissible: admissibility?.admissible ?? null,
        policy_effect_applies: policyEffect.applies,
        base_promotion_state: "candidate",
        effective_promotion_state: policyEffect.effective_promotion_state,
        stage_order: buildGovernanceTraceStageOrder({
          reviewSupplied: !!reviewResult,
          admissibilityEvaluated: admissibility != null,
        }) as WorkflowWriteProjectionGovernanceDecisionTrace["stage_order"],
        reason_codes: buildGovernanceReasonCodes({
          admissibility,
          policyEffectReasonCode: policyEffect.reason_code,
          includePolicyEffectReasonCode: !policyEffect.applies,
        }),
      },
    },
  };
}
