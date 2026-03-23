import test from "node:test";
import assert from "node:assert/strict";
import { runGovernedSemanticPreview } from "../../src/memory/governance-operation-runner.ts";

test("generic governed operation runner keeps packet-only preview stable without review", async () => {
  const preview = await runGovernedSemanticPreview({
    buildPacket: () => ({ operation: "x", gate: true }),
    derivePolicyEffect: ({ review, admissibility }) => ({
      applies: false,
      saw_review: review != null,
      saw_admissibility: admissibility != null,
    }),
    buildDecisionTrace: ({ reviewPacket, reviewResult, admissibility, policyEffect }) => ({
      operation: reviewPacket.operation,
      review_supplied: reviewResult != null,
      admissibility_evaluated: admissibility != null,
      policy_effect_applies: policyEffect.applies,
    }),
    evaluateAdmissibility: () => ({ admissible: true }),
  });

  assert.deepEqual(preview, {
    review_packet: { operation: "x", gate: true },
    review_result: null,
    admissibility: null,
    policy_effect: {
      applies: false,
      saw_review: false,
      saw_admissibility: false,
    },
    decision_trace: {
      operation: "x",
      review_supplied: false,
      admissibility_evaluated: false,
      policy_effect_applies: false,
    },
  });
});

test("generic governed operation runner evaluates admissibility before policy derivation", async () => {
  const preview = await runGovernedSemanticPreview({
    buildPacket: () => ({ operation: "x", gate: true }),
    reviewResult: { disposition: "recommend" },
    evaluateAdmissibility: ({ packet, review }) => ({
      operation: packet.operation,
      admissible: review.disposition === "recommend",
    }),
    derivePolicyEffect: ({ review, admissibility }) => ({
      applies: admissibility?.admissible ?? false,
      disposition: review?.disposition ?? null,
    }),
    buildDecisionTrace: ({ reviewPacket, reviewResult, admissibility, policyEffect }) => ({
      operation: reviewPacket.operation,
      review_supplied: reviewResult != null,
      admissible: admissibility?.admissible ?? null,
      policy_effect_applies: policyEffect.applies,
    }),
  });

  assert.deepEqual(preview, {
    review_packet: { operation: "x", gate: true },
    review_result: { disposition: "recommend" },
    admissibility: { operation: "x", admissible: true },
    policy_effect: {
      applies: true,
      disposition: "recommend",
    },
    decision_trace: {
      operation: "x",
      review_supplied: true,
      admissible: true,
      policy_effect_applies: true,
    },
  });
});

test("generic governed operation runner can resolve review results from an internal provider", async () => {
  const preview = await runGovernedSemanticPreview({
    buildPacket: () => ({ operation: "x", gate: true }),
    resolveReviewResult: ({ reviewPacket, suppliedReviewResult }) => {
      assert.equal(suppliedReviewResult, null);
      return { disposition: reviewPacket.operation === "x" ? "recommend" : "reject" };
    },
    evaluateAdmissibility: ({ packet, review }) => ({
      operation: packet.operation,
      admissible: review.disposition === "recommend",
    }),
    derivePolicyEffect: ({ review, admissibility }) => ({
      applies: admissibility?.admissible ?? false,
      disposition: review?.disposition ?? null,
    }),
    buildDecisionTrace: ({ reviewPacket, reviewResult, admissibility, policyEffect }) => ({
      operation: reviewPacket.operation,
      review_supplied: reviewResult != null,
      admissible: admissibility?.admissible ?? null,
      policy_effect_applies: policyEffect.applies,
    }),
  });

  assert.deepEqual(preview, {
    review_packet: { operation: "x", gate: true },
    review_result: { disposition: "recommend" },
    admissibility: { operation: "x", admissible: true },
    policy_effect: {
      applies: true,
      disposition: "recommend",
    },
    decision_trace: {
      operation: "x",
      review_supplied: true,
      admissible: true,
      policy_effect_applies: true,
    },
  });
});

test("generic governed operation runner preserves explicit review result over provider output", async () => {
  const preview = await runGovernedSemanticPreview({
    buildPacket: () => ({ operation: "x", gate: true }),
    reviewResult: { disposition: "reject" },
    resolveReviewResult: () => ({ disposition: "recommend" }),
    evaluateAdmissibility: ({ packet, review }) => ({
      operation: packet.operation,
      admissible: review.disposition === "recommend",
    }),
    derivePolicyEffect: ({ review, admissibility }) => ({
      applies: admissibility?.admissible ?? false,
      disposition: review?.disposition ?? null,
    }),
    buildDecisionTrace: ({ reviewPacket, reviewResult, admissibility, policyEffect }) => ({
      operation: reviewPacket.operation,
      review_supplied: reviewResult != null,
      admissible: admissibility?.admissible ?? null,
      policy_effect_applies: policyEffect.applies,
    }),
  });

  assert.deepEqual(preview, {
    review_packet: { operation: "x", gate: true },
    review_result: { disposition: "reject" },
    admissibility: { operation: "x", admissible: false },
    policy_effect: {
      applies: false,
      disposition: "reject",
    },
    decision_trace: {
      operation: "x",
      review_supplied: true,
      admissible: false,
      policy_effect_applies: false,
    },
  });
});
