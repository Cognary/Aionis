import {
  createMockFormPatternGovernanceModelClient,
  createMockPromoteMemoryGovernanceModelClient,
} from "./governance-model-client-mock.js";
import {
  createModelBackedFormPatternGovernanceReviewProvider,
  createModelBackedPromoteMemoryGovernanceReviewProvider,
} from "./governance-provider-model.js";
import {
  createStaticFormPatternGovernanceReviewProvider,
  createStaticPromoteMemoryGovernanceReviewProvider,
} from "./governance-provider-static.js";
import type {
  FormPatternGovernanceReviewProvider,
  PromoteMemoryGovernanceReviewProvider,
} from "./governance-provider-types.js";

export function buildPromoteMemoryGovernanceReviewProvider(args: {
  mockModelEnabled?: boolean;
  staticEnabled?: boolean;
  mockModel?: {
    confidence?: number;
    reason?: string;
  };
  static?: {
    confidence?: number;
    reason?: string;
  };
}): PromoteMemoryGovernanceReviewProvider | undefined {
  return (
    (args.mockModelEnabled
      ? createModelBackedPromoteMemoryGovernanceReviewProvider({
          modelClient: createMockPromoteMemoryGovernanceModelClient({
            confidence: args.mockModel?.confidence,
            reason: args.mockModel?.reason,
          }),
        })
      : undefined)
    ?? (args.staticEnabled
      ? createStaticPromoteMemoryGovernanceReviewProvider({
          confidence: args.static?.confidence,
          reason: args.static?.reason,
        })
      : undefined)
  );
}

export function buildFormPatternGovernanceReviewProvider(args: {
  mockModelEnabled?: boolean;
  staticEnabled?: boolean;
  mockModel?: {
    confidence?: number;
    reason?: string;
  };
  static?: {
    confidence?: number;
    reason?: string;
  };
}): FormPatternGovernanceReviewProvider | undefined {
  return (
    (args.mockModelEnabled
      ? createModelBackedFormPatternGovernanceReviewProvider({
          modelClient: createMockFormPatternGovernanceModelClient({
            confidence: args.mockModel?.confidence,
            reason: args.mockModel?.reason,
          }),
        })
      : undefined)
    ?? (args.staticEnabled
      ? createStaticFormPatternGovernanceReviewProvider({
          confidence: args.static?.confidence,
          reason: args.static?.reason,
        })
      : undefined)
  );
}
