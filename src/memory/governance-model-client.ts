import type { GovernanceReviewResolver } from "./governance-model-provider.js";
import type {
  MemoryFormPatternSemanticReviewPacket,
  MemoryFormPatternSemanticReviewResult,
  MemoryPromoteSemanticReviewPacket,
  MemoryPromoteSemanticReviewResult,
} from "./schemas.js";

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
