import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernanceDecisionTraceBase } from "../../src/memory/governance-shared.ts";

test("shared governance decision trace base stays stable for preview-only flows", () => {
  assert.deepEqual(
    buildGovernanceDecisionTraceBase({
      reviewResult: null,
      admissibility: null,
      policyEffectApplies: false,
      policyEffectReasonCode: "review_not_supplied",
      includePolicyEffectReasonCode: true,
    }),
    {
      review_supplied: false,
      admissibility_evaluated: false,
      admissible: null,
      policy_effect_applies: false,
      stage_order: ["review_packet_built", "policy_effect_derived"],
      reason_codes: ["review_not_supplied"],
    },
  );
});

test("shared governance decision trace base appends runtime apply stage when requested", () => {
  assert.deepEqual(
    buildGovernanceDecisionTraceBase({
      reviewResult: { supplied: true },
      admissibility: {
        operation: "promote_memory",
        admissible: true,
        accepted_mutation_count: 1,
        reason_codes: [],
        notes: {},
      },
      policyEffectApplies: true,
      policyEffectReasonCode: "high_strategic_value_workflow_promotion",
      includePolicyEffectReasonCode: false,
      runtimePolicyApplied: true,
    }),
    {
      review_supplied: true,
      admissibility_evaluated: true,
      admissible: true,
      policy_effect_applies: true,
      stage_order: [
        "review_packet_built",
        "review_result_received",
        "admissibility_evaluated",
        "policy_effect_derived",
        "runtime_policy_applied",
      ],
      reason_codes: [],
    },
  );
});
