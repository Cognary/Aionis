import {
  MemoryPromoteRequest,
  WorkflowWriteProjectionGovernancePolicyEffectSchema,
  type MemoryAdmissibilityResult,
  type MemoryPromoteSemanticReviewResult,
  type MemoryPromoteSemanticReviewPacket,
  type WorkflowWriteProjectionGovernanceDecisionTrace,
  type WorkflowWriteProjectionGovernancePolicyEffect,
} from "./schemas.js";
import type { PromoteMemoryGovernanceReviewProvider } from "./governance-provider-types.js";
import {
  buildGovernedStateDecisionTrace,
  deriveGovernedStateRaisePreview,
} from "./governance-shared.js";
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
  const derived = deriveGovernedStateRaisePreview({
    baseState: args.basePromotionState,
    review: args.review,
    admissibility: args.admissibility,
    defaultSource: "default_workflow_promotion_state",
    reviewSource: "workflow_promotion_governance_review",
    noReviewReason: "review_not_supplied",
    notAdmissibleReason: "review_not_admissible",
    noRaiseReason: "review_did_not_raise_promotion_state",
    applyReason: "high_confidence_workflow_promotion",
    noRaiseSuggestedState: args.basePromotionState,
    appliedState: "stable",
    extraNoApplyGuards: [{
      when: args.basePromotionState === "stable",
      reason: "already_stable",
      reviewSuggestedState: "stable",
    }],
    shouldApply: (review) =>
      review.adjudication.disposition === "recommend"
      && review.adjudication.target_kind === "workflow"
      && review.adjudication.target_level === "L2"
      && review.adjudication.strategic_value === "high"
      && review.adjudication.confidence >= minPromotionConfidence,
  });

  return WorkflowWriteProjectionGovernancePolicyEffectSchema.parse({
    source: derived.source,
    applies: derived.applies,
    base_promotion_state: derived.baseState,
    review_suggested_promotion_state: derived.reviewSuggestedState,
    effective_promotion_state: derived.effectiveState,
    reason_code: derived.reasonCode,
  });
}

export function buildWorkflowPromotionGovernancePreview(args: {
  candidateNodeIds: string[];
  inputText: string;
  inputSha256: string;
  candidateExamples: WorkflowPromotionCandidateExample[];
  reviewResult?: MemoryPromoteSemanticReviewResult | null;
  reviewProvider?: PromoteMemoryGovernanceReviewProvider | null;
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
      reviewProvider: args.reviewProvider ?? undefined,
      derivePolicyEffect: ({ review, admissibility }) =>
        deriveWorkflowPromotionSemanticPolicyEffect({
          basePromotionState: "candidate",
          review,
          admissibility,
        }),
      buildDecisionTrace: ({ reviewResult, admissibility, policyEffect }) => {
        const trace = buildGovernedStateDecisionTrace({
          reviewResult,
          admissibility,
          policyEffect,
          includePolicyEffectReasonCode: !policyEffect.applies,
          baseState: "candidate",
          effectiveState: policyEffect.effective_promotion_state,
        });
        return {
          ...trace,
          trace_version: "workflow_promotion_governance_trace_v1",
          base_promotion_state: trace.baseState,
          effective_promotion_state: trace.effectiveState,
          stage_order: trace.stage_order as WorkflowWriteProjectionGovernanceDecisionTrace["stage_order"],
          reason_codes: trace.reason_codes,
        };
      },
    }),
  };
}
