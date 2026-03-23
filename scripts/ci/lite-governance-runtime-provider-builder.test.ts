import test from "node:test";
import assert from "node:assert/strict";
import { buildLiteGovernanceRuntimeProviders } from "../../src/app/governance-runtime-providers.ts";

function buildEnv(overrides: Record<string, unknown> = {}) {
  return {
    REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    REPLAY_GOVERNANCE_MOCK_MODEL_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    WORKFLOW_GOVERNANCE_MOCK_MODEL_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: false,
    TOOLS_GOVERNANCE_MOCK_MODEL_FORM_PATTERN_PROVIDER_ENABLED: false,
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

test("lite governance runtime builder prefers mock-model-backed providers over static fallback", () => {
  const providers = buildLiteGovernanceRuntimeProviders(buildEnv({
    REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
    REPLAY_GOVERNANCE_MOCK_MODEL_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
    WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
    WORKFLOW_GOVERNANCE_MOCK_MODEL_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
    TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: true,
    TOOLS_GOVERNANCE_MOCK_MODEL_FORM_PATTERN_PROVIDER_ENABLED: true,
  }));

  const replayReview = providers.replayRepairReview?.promote_memory?.resolveReviewResult({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
      requested_target_kind: "workflow",
      requested_target_level: "L2",
      candidate_examples: [{ workflow_signature: "wf:test" }],
    } as any,
    suppliedReviewResult: null,
  });
  const workflowReview = providers.workflowProjection?.promote_memory?.resolveReviewResult({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
      requested_target_kind: "workflow",
      requested_target_level: "L2",
      candidate_examples: [{ workflow_signature: "wf:test" }],
    } as any,
    suppliedReviewResult: null,
  });
  const toolsReview = providers.toolsFeedback?.form_pattern?.resolveReviewResult({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
    } as any,
    suppliedReviewResult: null,
  });

  assert.equal(replayReview?.adjudication.reason, "mock model found workflow-signature evidence");
  assert.equal(workflowReview?.adjudication.reason, "mock model found workflow-signature evidence");
  assert.equal(toolsReview?.adjudication.reason, "mock model found grouped signature evidence");
});
