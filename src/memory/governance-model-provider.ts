export type GovernanceReviewResolver<TPacket, TReview> = (args: {
  reviewPacket: TPacket;
  suppliedReviewResult: TReview | null;
}) => TReview | null;

export type GovernanceReviewProvider<TPacket, TReview> = {
  resolveReviewResult: GovernanceReviewResolver<TPacket, TReview>;
};
