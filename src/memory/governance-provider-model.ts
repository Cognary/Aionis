import type { GovernanceModelClient } from "./governance-model-client.js";
import type {
  FormPatternGovernanceReviewProvider,
  PromoteMemoryGovernanceReviewProvider,
} from "./governance-provider-types.js";

export function createModelBackedPromoteMemoryGovernanceReviewProvider(args: {
  modelClient: GovernanceModelClient;
}): PromoteMemoryGovernanceReviewProvider | undefined {
  const resolver = args.modelClient.reviewPromoteMemory;
  if (!resolver) {
    return undefined;
  }
  return {
    resolveReviewResult: ({ reviewPacket, suppliedReviewResult }) =>
      suppliedReviewResult
      ?? resolver({
        reviewPacket,
        suppliedReviewResult,
      })
      ?? null,
  };
}

export function createModelBackedFormPatternGovernanceReviewProvider(args: {
  modelClient: GovernanceModelClient;
}): FormPatternGovernanceReviewProvider | undefined {
  const resolver = args.modelClient.reviewFormPattern;
  if (!resolver) {
    return undefined;
  }
  return {
    resolveReviewResult: ({ reviewPacket, suppliedReviewResult }) =>
      suppliedReviewResult
      ?? resolver({
        reviewPacket,
        suppliedReviewResult,
      })
      ?? null,
  };
}
