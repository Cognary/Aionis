import { buildLiteGovernanceModelClient } from "./governance-model-client-factory.js";
import type {
  GovernanceModelClientFactory,
  GovernanceModelClientMode,
} from "./governance-model-client.js";
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
  modelClientMode?: GovernanceModelClientMode;
  staticEnabled?: boolean;
  modelClientFactory?: GovernanceModelClientFactory;
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
    (args.modelClientMode && args.modelClientMode !== "off"
      ? createModelBackedPromoteMemoryGovernanceReviewProvider({
          modelClient: buildLiteGovernanceModelClient({
            promoteMemory: {
              mode: args.modelClientMode,
              confidence: args.mockModel?.confidence,
              reason: args.mockModel?.reason,
            },
          }, {
            modelClientFactory: args.modelClientFactory,
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
  modelClientMode?: GovernanceModelClientMode;
  staticEnabled?: boolean;
  modelClientFactory?: GovernanceModelClientFactory;
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
    (args.modelClientMode && args.modelClientMode !== "off"
      ? createModelBackedFormPatternGovernanceReviewProvider({
          modelClient: buildLiteGovernanceModelClient({
            formPattern: {
              mode: args.modelClientMode,
              confidence: args.mockModel?.confidence,
              reason: args.mockModel?.reason,
            },
          }, {
            modelClientFactory: args.modelClientFactory,
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
