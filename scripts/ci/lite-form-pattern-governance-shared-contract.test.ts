import test from "node:test";
import assert from "node:assert/strict";
import { MemoryFormPatternRequest } from "../../src/memory/schemas.ts";
import { runFormPatternGovernancePreview } from "../../src/memory/form-pattern-governance-shared.ts";

test("shared form-pattern runner accepts provider-supplied review results", () => {
  const preview = runFormPatternGovernancePreview({
    input: MemoryFormPatternRequest.parse({
      source_node_ids: ["node-1", "node-2"],
      task_signature: "task:sig",
      input_text: "form pattern",
    }),
    sourceExamples: [
      { node_id: "node-1", task_signature: "task:sig" },
      { node_id: "node-2", task_signature: "task:sig" },
    ],
    reviewProvider: {
      resolveReviewResult: ({ suppliedReviewResult }) => {
        assert.equal(suppliedReviewResult, null);
        return {
          review_version: "form_pattern_semantic_review_v1",
          adjudication: {
            operation: "form_pattern",
            disposition: "recommend",
            target_kind: "pattern",
            target_level: "L3",
            confidence: 0.9,
            strategic_value: "high",
            reason: "provider supplied form-pattern review",
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

  assert.equal(preview.review_result?.adjudication.reason, "provider supplied form-pattern review");
  assert.equal(preview.admissibility?.admissible, true);
  assert.deepEqual(preview.policy_effect, {
    applies: true,
    saw_review: "provider supplied form-pattern review",
    saw_admissibility: true,
  });
});
