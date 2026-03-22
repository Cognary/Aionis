import type {
  MemoryAdmissibilityResult,
  MemoryPromoteInput,
  MemoryPromoteSemanticReviewPacket,
  MemoryPromoteSemanticReviewResult,
} from "./schemas.js";
import {
  buildPromoteMemorySemanticReviewPacket,
  type PromoteMemoryCandidateExample,
  evaluatePromoteMemorySemanticReview,
} from "./promote-memory-governance.js";
import { runGovernedSemanticPreview } from "./governance-operation-runner.js";

export function runPromoteMemoryGovernancePreview<TPolicyEffect, TDecisionTrace>(args: {
  input: MemoryPromoteInput;
  candidateExamples: PromoteMemoryCandidateExample[];
  reviewResult?: MemoryPromoteSemanticReviewResult | null;
  derivePolicyEffect: (args: {
    review: MemoryPromoteSemanticReviewResult | null;
    admissibility: MemoryAdmissibilityResult | null;
  }) => TPolicyEffect;
  buildDecisionTrace: (args: {
    reviewPacket: MemoryPromoteSemanticReviewPacket;
    reviewResult: MemoryPromoteSemanticReviewResult | null;
    admissibility: MemoryAdmissibilityResult | null;
    policyEffect: TPolicyEffect;
  }) => TDecisionTrace;
}): {
  review_packet: MemoryPromoteSemanticReviewPacket;
  review_result: MemoryPromoteSemanticReviewResult | null;
  admissibility: MemoryAdmissibilityResult | null;
  policy_effect: TPolicyEffect;
  decision_trace: TDecisionTrace;
} {
  return runGovernedSemanticPreview({
    buildPacket: () =>
      buildPromoteMemorySemanticReviewPacket({
        input: args.input,
        candidateExamples: args.candidateExamples,
      }),
    reviewResult: args.reviewResult ?? null,
    evaluateAdmissibility: ({ packet, review }) =>
      evaluatePromoteMemorySemanticReview({
        packet,
        review,
      }),
    derivePolicyEffect: args.derivePolicyEffect,
    buildDecisionTrace: args.buildDecisionTrace,
  });
}
