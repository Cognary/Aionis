import type {
  GovernanceModelClient,
  GovernanceModelClientFactory,
  GovernanceModelClientMode,
} from "./governance-model-client.js";
import {
  createBuiltinFormPatternGovernanceModelClient,
  createBuiltinPromoteMemoryGovernanceModelClient,
} from "./governance-model-client-builtin.js";
import {
  createMockFormPatternGovernanceModelClient,
  createMockPromoteMemoryGovernanceModelClient,
} from "./governance-model-client-mock.js";

export type LiteGovernanceModelClientSelection = {
  mode?: GovernanceModelClientMode;
  confidence?: number;
  reason?: string;
};

export function buildLiteGovernanceModelClient(args: {
  promoteMemory?: LiteGovernanceModelClientSelection;
  formPattern?: LiteGovernanceModelClientSelection;
}, options?: {
  modelClientFactory?: GovernanceModelClientFactory;
}): GovernanceModelClient {
  const client: GovernanceModelClient = {};

  if (args.promoteMemory?.mode === "custom") {
    const customClient = options?.modelClientFactory?.({
      operation: "promote_memory",
      mode: "custom",
      confidence: args.promoteMemory.confidence,
      reason: args.promoteMemory.reason,
    });
    client.reviewPromoteMemory = customClient?.reviewPromoteMemory;
  } else if (args.promoteMemory?.mode === "builtin") {
    const builtinClient = createBuiltinPromoteMemoryGovernanceModelClient({
      confidence: args.promoteMemory.confidence,
      reason: args.promoteMemory.reason,
    });
    client.reviewPromoteMemory = builtinClient.reviewPromoteMemory;
  } else if (args.promoteMemory?.mode === "mock") {
    const mockClient = createMockPromoteMemoryGovernanceModelClient({
      confidence: args.promoteMemory.confidence,
      reason: args.promoteMemory.reason,
    });
    client.reviewPromoteMemory = mockClient.reviewPromoteMemory;
  }

  if (args.formPattern?.mode === "custom") {
    const customClient = options?.modelClientFactory?.({
      operation: "form_pattern",
      mode: "custom",
      confidence: args.formPattern.confidence,
      reason: args.formPattern.reason,
    });
    client.reviewFormPattern = customClient?.reviewFormPattern;
  } else if (args.formPattern?.mode === "builtin") {
    const builtinClient = createBuiltinFormPatternGovernanceModelClient({
      confidence: args.formPattern.confidence,
      reason: args.formPattern.reason,
    });
    client.reviewFormPattern = builtinClient.reviewFormPattern;
  } else if (args.formPattern?.mode === "mock") {
    const mockClient = createMockFormPatternGovernanceModelClient({
      confidence: args.formPattern.confidence,
      reason: args.formPattern.reason,
    });
    client.reviewFormPattern = mockClient.reviewFormPattern;
  }

  return client;
}
