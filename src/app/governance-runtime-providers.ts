import type { Env } from "../config.js";
import {
  createStaticFormPatternGovernanceReviewProvider,
  createStaticPromoteMemoryGovernanceReviewProvider,
} from "../memory/governance-provider-static.js";
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
  const replayPromoteMemoryProvider = env.REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED
    ? createStaticPromoteMemoryGovernanceReviewProvider()
    : undefined;
  const workflowPromoteMemoryProvider = env.WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED
    ? createStaticPromoteMemoryGovernanceReviewProvider({
        confidence: 0.85,
      })
    : undefined;
  const toolsFormPatternProvider = env.TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED
    ? createStaticFormPatternGovernanceReviewProvider()
    : undefined;

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
