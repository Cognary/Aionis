import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFormPatternGovernanceReviewProvider,
  buildPromoteMemoryGovernanceReviewProvider,
} from "../../src/memory/governance-provider-factory.ts";

test("promote_memory provider factory returns undefined when both paths are disabled", () => {
  const provider = buildPromoteMemoryGovernanceReviewProvider({});
  assert.equal(provider, undefined);
});

test("promote_memory provider factory falls back to static provider", () => {
  const provider = buildPromoteMemoryGovernanceReviewProvider({
    staticEnabled: true,
  });
  const review = provider?.resolveReviewResult({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
      requested_target_kind: "workflow",
      requested_target_level: "L2",
      candidate_examples: [{ workflow_signature: "wf:test" }],
    } as any,
    suppliedReviewResult: null,
  });

  assert.equal(review?.adjudication.reason, "static provider found workflow-signature evidence");
});

test("promote_memory provider factory prefers mock-model-backed provider", () => {
  const provider = buildPromoteMemoryGovernanceReviewProvider({
    modelClientMode: "builtin",
    staticEnabled: true,
  });
  const review = provider?.resolveReviewResult({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
      requested_target_kind: "workflow",
      requested_target_level: "L2",
      candidate_examples: [{ workflow_signature: "wf:test" }],
    } as any,
    suppliedReviewResult: null,
  });

  assert.equal(review?.adjudication.reason, "mock model found workflow-signature evidence");
});

test("form_pattern provider factory prefers mock-model-backed provider", () => {
  const provider = buildFormPatternGovernanceReviewProvider({
    modelClientMode: "builtin",
    staticEnabled: true,
  });
  const review = provider?.resolveReviewResult({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
    } as any,
    suppliedReviewResult: null,
  });

  assert.equal(review?.adjudication.reason, "mock model found grouped signature evidence");
});
