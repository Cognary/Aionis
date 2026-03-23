import type { GovernanceModelClient } from "./governance-model-client.js";
import {
  createStaticFormPatternGovernanceReviewProvider,
  createStaticPromoteMemoryGovernanceReviewProvider,
} from "./governance-provider-static.js";

export function buildLiteGovernanceModelClient(args: {
  promoteMemory?: {
    mode?: "off" | "mock";
    confidence?: number;
    reason?: string;
  };
  formPattern?: {
    mode?: "off" | "mock";
    confidence?: number;
    reason?: string;
  };
}): GovernanceModelClient {
  const client: GovernanceModelClient = {};

  if (args.promoteMemory?.mode === "mock") {
    const provider = createStaticPromoteMemoryGovernanceReviewProvider({
      confidence: args.promoteMemory.confidence,
      reason: args.promoteMemory.reason ?? "mock model found workflow-signature evidence",
    });
    client.reviewPromoteMemory = provider.resolveReviewResult;
  }

  if (args.formPattern?.mode === "mock") {
    const provider = createStaticFormPatternGovernanceReviewProvider({
      confidence: args.formPattern.confidence,
      reason: args.formPattern.reason ?? "mock model found grouped signature evidence",
    });
    client.reviewFormPattern = provider.resolveReviewResult;
  }

  return client;
}
