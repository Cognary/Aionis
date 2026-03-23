import test from "node:test";
import assert from "node:assert/strict";
import { deriveGovernedStateRaisePreview } from "../../src/memory/governance-shared.ts";

test("shared policy-effect helper returns no-review and no-raise previews deterministically", () => {
  assert.deepEqual(
    deriveGovernedStateRaisePreview({
      baseState: "candidate",
      review: null,
      admissibility: null,
      defaultSource: "default",
      reviewSource: "review",
      noReviewReason: "review_not_supplied",
      notAdmissibleReason: "review_not_admissible",
      noRaiseReason: "review_did_not_raise",
      applyReason: "raised",
      noRaiseSuggestedState: "candidate",
      appliedState: "stable",
      shouldApply: () => false,
    }),
    {
      source: "default",
      applies: false,
      baseState: "candidate",
      reviewSuggestedState: null,
      effectiveState: "candidate",
      reasonCode: "review_not_supplied",
    },
  );

  assert.deepEqual(
    deriveGovernedStateRaisePreview({
      baseState: "candidate",
      review: { ok: true },
      admissibility: { operation: "promote_memory", admissible: true, accepted_mutation_count: 1, reason_codes: [], notes: {} },
      defaultSource: "default",
      reviewSource: "review",
      noReviewReason: "review_not_supplied",
      notAdmissibleReason: "review_not_admissible",
      noRaiseReason: "review_did_not_raise",
      applyReason: "raised",
      noRaiseSuggestedState: "candidate",
      appliedState: "stable",
      shouldApply: () => false,
    }),
    {
      source: "default",
      applies: false,
      baseState: "candidate",
      reviewSuggestedState: "candidate",
      effectiveState: "candidate",
      reasonCode: "review_did_not_raise",
    },
  );
});

test("shared policy-effect helper honors ordered guards and applied state", () => {
  assert.deepEqual(
    deriveGovernedStateRaisePreview({
      baseState: "draft",
      review: { ok: true },
      admissibility: { operation: "promote_memory", admissible: true, accepted_mutation_count: 1, reason_codes: [], notes: {} },
      defaultSource: "default",
      reviewSource: "review",
      noReviewReason: "review_not_supplied",
      notAdmissibleReason: "review_not_admissible",
      noRaiseReason: "review_did_not_raise",
      applyReason: "raised",
      noRaiseSuggestedState: null,
      appliedState: "shadow",
      extraNoApplyGuards: [{
        when: true,
        reason: "explicit_preserved",
        reviewSuggestedState: null,
      }],
      shouldApply: () => true,
    }),
    {
      source: "default",
      applies: false,
      baseState: "draft",
      reviewSuggestedState: null,
      effectiveState: "draft",
      reasonCode: "explicit_preserved",
    },
  );

  assert.deepEqual(
    deriveGovernedStateRaisePreview({
      baseState: "draft",
      review: { ok: true },
      admissibility: { operation: "promote_memory", admissible: true, accepted_mutation_count: 1, reason_codes: [], notes: {} },
      defaultSource: "default",
      reviewSource: "review",
      noReviewReason: "review_not_supplied",
      notAdmissibleReason: "review_not_admissible",
      noRaiseReason: "review_did_not_raise",
      applyReason: "raised",
      noRaiseSuggestedState: null,
      appliedState: "shadow",
      shouldApply: () => true,
    }),
    {
      source: "review",
      applies: true,
      baseState: "draft",
      reviewSuggestedState: "shadow",
      effectiveState: "shadow",
      reasonCode: "raised",
    },
  );
});
