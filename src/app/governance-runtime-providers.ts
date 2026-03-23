import type { Env } from "../config.js";
import {
  buildFormPatternGovernanceReviewProvider,
  buildPromoteMemoryGovernanceReviewProvider,
} from "../memory/governance-provider-factory.js";
import type {
  FormPatternGovernanceReviewProvider,
  PromoteMemoryGovernanceReviewProvider,
} from "../memory/governance-provider-types.js";

export type LiteGovernanceRuntimeProviders = {
  replayRepairReview?: {
    promote_memory?: PromoteMemoryGovernanceReviewProvider;
  };
  workflowProjection?: {
    promote_memory?: PromoteMemoryGovernanceReviewProvider;
  };
  toolsFeedback?: {
    form_pattern?: FormPatternGovernanceReviewProvider;
  };
};

export function buildLiteGovernanceRuntimeProviders(env: Env): LiteGovernanceRuntimeProviders {
  const replayPromoteMemoryProvider = buildPromoteMemoryGovernanceReviewProvider({
    mockModelEnabled: env.REPLAY_GOVERNANCE_MOCK_MODEL_PROMOTE_MEMORY_PROVIDER_ENABLED,
    staticEnabled: env.REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED,
  });
  const workflowPromoteMemoryProvider = buildPromoteMemoryGovernanceReviewProvider({
    mockModelEnabled: env.WORKFLOW_GOVERNANCE_MOCK_MODEL_PROMOTE_MEMORY_PROVIDER_ENABLED,
    staticEnabled: env.WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED,
    mockModel: {
      confidence: 0.85,
    },
    static: {
      confidence: 0.85,
    },
  });
  const toolsFormPatternProvider = buildFormPatternGovernanceReviewProvider({
    mockModelEnabled: env.TOOLS_GOVERNANCE_MOCK_MODEL_FORM_PATTERN_PROVIDER_ENABLED,
    staticEnabled: env.TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED,
  });

  return {
    ...(replayPromoteMemoryProvider
      ? {
          replayRepairReview: {
            promote_memory: replayPromoteMemoryProvider,
          },
        }
      : {}),
    ...(workflowPromoteMemoryProvider
      ? {
          workflowProjection: {
            promote_memory: workflowPromoteMemoryProvider,
          },
        }
      : {}),
    ...(toolsFormPatternProvider
      ? {
          toolsFeedback: {
            form_pattern: toolsFormPatternProvider,
          },
        }
      : {}),
  };
}
