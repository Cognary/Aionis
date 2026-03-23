import { buildLiteGovernanceModelClient } from "./governance-model-client-factory.js";
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
          modelClient: buildLiteGovernanceModelClient({
            promoteMemory: {
              mode: "mock",
              confidence: args.mockModel?.confidence,
              reason: args.mockModel?.reason,
            },
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
          modelClient: buildLiteGovernanceModelClient({
            formPattern: {
              mode: "mock",
              confidence: args.mockModel?.confidence,
              reason: args.mockModel?.reason,
            },
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
