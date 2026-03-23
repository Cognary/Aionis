import test from "node:test";
import assert from "node:assert/strict";
import { buildLiteGovernanceRuntimeProviders } from "../../src/app/governance-runtime-providers.ts";

function buildEnv(overrides: Record<string, unknown> = {}) {
  return {
    REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: false,
    ...overrides,
  } as any;
}

test("lite governance runtime builder returns empty groups when all gates are off", () => {
  const providers = buildLiteGovernanceRuntimeProviders(buildEnv());
  assert.deepEqual(providers, {});
});

test("lite governance runtime builder returns replay workflow and tools provider groups when gates are on", () => {
  const providers = buildLiteGovernanceRuntimeProviders(buildEnv({
    REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
    WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
    TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: true,
  }));

  assert.equal(typeof providers.replayRepairReview?.promote_memory?.resolveReviewResult, "function");
  assert.equal(typeof providers.workflowProjection?.promote_memory?.resolveReviewResult, "function");
  assert.equal(typeof providers.toolsFeedback?.form_pattern?.resolveReviewResult, "function");
});
