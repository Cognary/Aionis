import type { GovernanceReviewResolver } from "./governance-model-provider.js";
import type {
  MemoryFormPatternSemanticReviewPacket,
  MemoryFormPatternSemanticReviewResult,
  MemoryPromoteSemanticReviewPacket,
  MemoryPromoteSemanticReviewResult,
} from "./schemas.js";

export type GovernanceModelClientOperation = "promote_memory" | "form_pattern";
export type GovernanceModelClientMode = "off" | "mock" | "builtin" | "custom";

export type GovernanceModelClient = {
  reviewPromoteMemory?: GovernanceReviewResolver<
    MemoryPromoteSemanticReviewPacket,
    MemoryPromoteSemanticReviewResult
  >;
  reviewFormPattern?: GovernanceReviewResolver<
    MemoryFormPatternSemanticReviewPacket,
    MemoryFormPatternSemanticReviewResult
  >;
};

export type GovernanceModelClientFactoryRequest = {
  operation: GovernanceModelClientOperation;
  mode: GovernanceModelClientMode;
  confidence?: number;
  reason?: string;
};

export type GovernanceModelClientFactory = (
  args: GovernanceModelClientFactoryRequest,
) => GovernanceModelClient | undefined;
