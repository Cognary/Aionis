import type { Env } from "../config.js";
import type {
  GovernanceModelClientFactory,
  GovernanceModelClientMode,
} from "../memory/governance-model-client.js";
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

export type LiteGovernanceRuntimeProviderBuilderOptions = {
  modelClientFactory?: GovernanceModelClientFactory;
  modelClientModes?: {
    replayRepairReview?: {
      promote_memory?: GovernanceModelClientMode;
    };
    workflowProjection?: {
      promote_memory?: GovernanceModelClientMode;
    };
    toolsFeedback?: {
      form_pattern?: GovernanceModelClientMode;
    };
  };
};

export function buildLiteGovernanceRuntimeProviders(
  env: Env,
  options?: LiteGovernanceRuntimeProviderBuilderOptions,
): LiteGovernanceRuntimeProviders {
  const replayPromoteMemoryProvider = buildPromoteMemoryGovernanceReviewProvider({
    modelClientMode:
      options?.modelClientModes?.replayRepairReview?.promote_memory
      ?? (env.REPLAY_GOVERNANCE_MOCK_MODEL_PROMOTE_MEMORY_PROVIDER_ENABLED ? "builtin" : "off"),
    staticEnabled: env.REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED,
    modelClientFactory: options?.modelClientFactory,
  });
  const workflowPromoteMemoryProvider = buildPromoteMemoryGovernanceReviewProvider({
    modelClientMode:
      options?.modelClientModes?.workflowProjection?.promote_memory
      ?? (env.WORKFLOW_GOVERNANCE_MOCK_MODEL_PROMOTE_MEMORY_PROVIDER_ENABLED ? "builtin" : "off"),
    staticEnabled: env.WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED,
    modelClientFactory: options?.modelClientFactory,
    mockModel: {
      confidence: 0.85,
    },
    static: {
      confidence: 0.85,
    },
  });
  const toolsFormPatternProvider = buildFormPatternGovernanceReviewProvider({
    modelClientMode:
      options?.modelClientModes?.toolsFeedback?.form_pattern
      ?? (env.TOOLS_GOVERNANCE_MOCK_MODEL_FORM_PATTERN_PROVIDER_ENABLED ? "builtin" : "off"),
    staticEnabled: env.TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED,
    modelClientFactory: options?.modelClientFactory,
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
