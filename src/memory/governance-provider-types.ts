import type {
  MemoryFormPatternSemanticReviewPacket,
  MemoryFormPatternSemanticReviewResult,
  MemoryPromoteSemanticReviewPacket,
  MemoryPromoteSemanticReviewResult,
} from "./schemas.js";
import type { GovernanceReviewProvider } from "./governance-model-provider.js";

export type PromoteMemoryGovernanceReviewProvider =
  GovernanceReviewProvider<MemoryPromoteSemanticReviewPacket, MemoryPromoteSemanticReviewResult>;

export type FormPatternGovernanceReviewProvider =
  GovernanceReviewProvider<MemoryFormPatternSemanticReviewPacket, MemoryFormPatternSemanticReviewResult>;
