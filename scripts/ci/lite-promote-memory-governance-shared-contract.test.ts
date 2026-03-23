import test from "node:test";
import assert from "node:assert/strict";
import { MemoryPromoteRequest } from "../../src/memory/schemas.ts";
import { runPromoteMemoryGovernancePreview } from "../../src/memory/promote-memory-governance-shared.ts";

test("shared promote-memory runner keeps packet-only preview stable without review", () => {
  const preview = runPromoteMemoryGovernancePreview({
    input: MemoryPromoteRequest.parse({
      candidate_node_ids: ["node-1"],
      target_kind: "workflow",
      target_level: "L2",
      input_text: "promote workflow",
    }),
    candidateExamples: [{ node_id: "node-1", workflow_signature: "wf:1" }],
    derivePolicyEffect: ({ review, admissibility }) => ({
      applies: false,
      saw_review: review != null,
      saw_admissibility: admissibility != null,
    }),
    buildDecisionTrace: ({ reviewResult, admissibility, policyEffect }) => ({
      review_supplied: reviewResult != null,
      admissibility_evaluated: admissibility != null,
      policy_effect_applies: policyEffect.applies,
    }),
  });

  assert.equal(preview.review_packet.operation, "promote_memory");
  assert.equal(preview.review_result, null);
  assert.equal(preview.admissibility, null);
  assert.deepEqual(preview.policy_effect, {
    applies: false,
    saw_review: false,
    saw_admissibility: false,
  });
  assert.deepEqual(preview.decision_trace, {
    review_supplied: false,
    admissibility_evaluated: false,
    policy_effect_applies: false,
  });
});

test("shared promote-memory runner evaluates admissibility before delegating policy effect", () => {
  const reviewResult = {
    review_version: "promote_memory_semantic_review_v1",
    adjudication: {
      operation: "promote_memory",
      disposition: "recommend",
      target_kind: "workflow",
      target_level: "L2",
      confidence: 0.91,
      strategic_value: "high",
      reason: "stable workflow pattern",
    },
  } as const;

  const preview = runPromoteMemoryGovernancePreview({
    input: MemoryPromoteRequest.parse({
      candidate_node_ids: ["node-1"],
      target_kind: "workflow",
      target_level: "L2",
      input_text: "promote workflow",
    }),
    candidateExamples: [{ node_id: "node-1", workflow_signature: "wf:1" }],
    reviewResult,
    derivePolicyEffect: ({ review, admissibility }) => ({
      applies: admissibility?.admissible ?? false,
      saw_review: review?.adjudication.disposition ?? null,
      saw_admissibility: admissibility?.admissible ?? null,
    }),
    buildDecisionTrace: ({ reviewPacket, reviewResult, admissibility, policyEffect }) => ({
      operation: reviewPacket.operation,
      review_supplied: reviewResult != null,
      admissible: admissibility?.admissible ?? null,
      policy_effect_applies: policyEffect.applies,
    }),
  });

  assert.equal(preview.review_result?.adjudication.disposition, "recommend");
  assert.equal(preview.admissibility?.admissible, true);
  assert.deepEqual(preview.policy_effect, {
    applies: true,
    saw_review: "recommend",
    saw_admissibility: true,
  });
  assert.deepEqual(preview.decision_trace, {
    operation: "promote_memory",
    review_supplied: true,
    admissible: true,
    policy_effect_applies: true,
  });
});

test("shared promote-memory runner accepts provider-supplied review results", () => {
  const preview = runPromoteMemoryGovernancePreview({
    input: MemoryPromoteRequest.parse({
      candidate_node_ids: ["node-1"],
      target_kind: "workflow",
      target_level: "L2",
      input_text: "promote workflow",
    }),
    candidateExamples: [{ node_id: "node-1", workflow_signature: "wf:1" }],
    reviewProvider: {
      resolveReviewResult: ({ suppliedReviewResult }) => {
        assert.equal(suppliedReviewResult, null);
        return {
          review_version: "promote_memory_semantic_review_v1",
          adjudication: {
            operation: "promote_memory",
            disposition: "recommend",
            target_kind: "workflow",
            target_level: "L2",
            confidence: 0.91,
            strategic_value: "high",
            reason: "provider supplied review",
          },
        };
      },
    },
    derivePolicyEffect: ({ review, admissibility }) => ({
      applies: admissibility?.admissible ?? false,
      saw_review: review?.adjudication.reason ?? null,
      saw_admissibility: admissibility?.admissible ?? null,
    }),
    buildDecisionTrace: ({ reviewResult, admissibility, policyEffect }) => ({
      review_supplied: reviewResult != null,
      admissibility_evaluated: admissibility != null,
      policy_effect_applies: policyEffect.applies,
    }),
  });

  assert.equal(preview.review_result?.adjudication.reason, "provider supplied review");
  assert.equal(preview.admissibility?.admissible, true);
  assert.deepEqual(preview.policy_effect, {
    applies: true,
    saw_review: "provider supplied review",
    saw_admissibility: true,
  });
});
