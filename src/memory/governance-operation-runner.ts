export function runGovernedSemanticPreview<TPacket, TReview, TAdmissibility, TPolicyEffect, TDecisionTrace>(args: {
  buildPacket: () => TPacket;
  reviewResult?: TReview | null;
  evaluateAdmissibility: (args: { packet: TPacket; review: TReview }) => TAdmissibility;
  derivePolicyEffect: (args: {
    review: TReview | null;
    admissibility: TAdmissibility | null;
  }) => TPolicyEffect;
  buildDecisionTrace: (args: {
    reviewPacket: TPacket;
    reviewResult: TReview | null;
    admissibility: TAdmissibility | null;
    policyEffect: TPolicyEffect;
  }) => TDecisionTrace;
}): {
  review_packet: TPacket;
  review_result: TReview | null;
  admissibility: TAdmissibility | null;
  policy_effect: TPolicyEffect;
  decision_trace: TDecisionTrace;
} {
  const reviewPacket = args.buildPacket();
  const reviewResult = args.reviewResult ?? null;
  const admissibility = reviewResult
    ? args.evaluateAdmissibility({
        packet: reviewPacket,
        review: reviewResult,
      })
    : null;
  const policyEffect = args.derivePolicyEffect({
    review: reviewResult,
    admissibility,
  });
  const decisionTrace = args.buildDecisionTrace({
    reviewPacket,
    reviewResult,
    admissibility,
    policyEffect,
  });

  return {
    review_packet: reviewPacket,
    review_result: reviewResult,
    admissibility,
    policy_effect: policyEffect,
    decision_trace: decisionTrace,
  };
}
