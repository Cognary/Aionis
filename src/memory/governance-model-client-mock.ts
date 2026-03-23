import type { GovernanceModelClient } from "./governance-model-client.js";
import {
  createStaticFormPatternGovernanceReviewProvider,
  createStaticPromoteMemoryGovernanceReviewProvider,
} from "./governance-provider-static.js";

export function createMockPromoteMemoryGovernanceModelClient(args?: {
  confidence?: number;
  reason?: string;
}): GovernanceModelClient {
  const provider = createStaticPromoteMemoryGovernanceReviewProvider({
    confidence: args?.confidence,
    reason: args?.reason ?? "mock model found workflow-signature evidence",
  });
  return {
    reviewPromoteMemory: provider.resolveReviewResult,
  };
}

export function createMockFormPatternGovernanceModelClient(args?: {
  confidence?: number;
  reason?: string;
}): GovernanceModelClient {
  const provider = createStaticFormPatternGovernanceReviewProvider({
    confidence: args?.confidence,
    reason: args?.reason ?? "mock model found grouped signature evidence",
  });
  return {
    reviewFormPattern: provider.resolveReviewResult,
  };
}
