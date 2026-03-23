import type {
  MemoryAdmissibilityResult,
  MemoryPromoteInput,
  MemoryPromoteSemanticReviewPacket,
  MemoryPromoteSemanticReviewResult,
} from "./schemas.js";
import type { GovernanceReviewProvider } from "./governance-model-provider.js";
import {
  buildPromoteMemorySemanticReviewPacket,
  type PromoteMemoryCandidateExample,
  evaluatePromoteMemorySemanticReview,
} from "./promote-memory-governance.js";
import { runGovernedSemanticPreview } from "./governance-operation-runner.js";

export function runPromoteMemoryGovernancePreview<
  TPolicyEffect extends { applies: boolean; reason_code?: string | null },
  TDecisionTrace,
>(args: {
  input: MemoryPromoteInput;
  candidateExamples: PromoteMemoryCandidateExample[];
  reviewResult?: MemoryPromoteSemanticReviewResult | null;
  reviewProvider?: GovernanceReviewProvider<MemoryPromoteSemanticReviewPacket, MemoryPromoteSemanticReviewResult>;
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
    resolveReviewResult: args.reviewProvider?.resolveReviewResult,
    evaluateAdmissibility: ({ packet, review }) =>
      evaluatePromoteMemorySemanticReview({
        packet,
        review,
      }),
    derivePolicyEffect: args.derivePolicyEffect,
    buildDecisionTrace: args.buildDecisionTrace,
  });
}
