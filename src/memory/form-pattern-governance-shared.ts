import type {
  MemoryAdmissibilityResult,
  MemoryFormPatternInput,
  MemoryFormPatternSemanticReviewPacket,
  MemoryFormPatternSemanticReviewResult,
} from "./schemas.js";
import {
  buildFormPatternSemanticReviewPacket,
  evaluateFormPatternSemanticReview,
  type FormPatternSourceExample,
} from "./form-pattern-governance.js";
import { runGovernedSemanticPreview } from "./governance-operation-runner.js";

export function runFormPatternGovernancePreview<TPolicyEffect, TDecisionTrace>(args: {
  input: MemoryFormPatternInput;
  sourceExamples: FormPatternSourceExample[];
  reviewResult?: MemoryFormPatternSemanticReviewResult | null;
  derivePolicyEffect: (args: {
    review: MemoryFormPatternSemanticReviewResult | null;
    admissibility: MemoryAdmissibilityResult | null;
  }) => TPolicyEffect;
  buildDecisionTrace: (args: {
    reviewPacket: MemoryFormPatternSemanticReviewPacket;
    reviewResult: MemoryFormPatternSemanticReviewResult | null;
    admissibility: MemoryAdmissibilityResult | null;
    policyEffect: TPolicyEffect;
  }) => TDecisionTrace;
}): {
  review_packet: MemoryFormPatternSemanticReviewPacket;
  review_result: MemoryFormPatternSemanticReviewResult | null;
  admissibility: MemoryAdmissibilityResult | null;
  policy_effect: TPolicyEffect;
  decision_trace: TDecisionTrace;
} {
  return runGovernedSemanticPreview({
    buildPacket: () =>
      buildFormPatternSemanticReviewPacket({
        input: args.input,
        sourceExamples: args.sourceExamples,
      }),
    reviewResult: args.reviewResult ?? null,
    evaluateAdmissibility: ({ packet, review }) =>
      evaluateFormPatternSemanticReview({
        packet,
        review,
      }),
    derivePolicyEffect: args.derivePolicyEffect,
    buildDecisionTrace: args.buildDecisionTrace,
  });
}
