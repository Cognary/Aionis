import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFormPatternSemanticReviewPacket,
  evaluateFormPatternSemanticReview,
} from "../../src/memory/form-pattern-governance.ts";
import {
  MemoryFormPatternRequest,
  MemoryFormPatternSemanticReviewResultSchema,
} from "../../src/memory/schemas.ts";

test("form_pattern semantic review packet exposes only bounded grouped context", () => {
  const input = MemoryFormPatternRequest.parse({
    source_node_ids: ["node_1", "node_2"],
    task_signature: "fix-node-test-failure",
    error_signature: "node-test-export-mismatch",
    workflow_signature: "inspect-patch-rerun-targeted-test",
    input_text: "form stable pattern from repeated successful workflows",
  });

  const packet = buildFormPatternSemanticReviewPacket({
    input,
    sourceExamples: [
      {
        node_id: "node_1",
        title: "Repair export mismatch",
        summary: "Inspect failing test, patch export, rerun test",
        selected_tool: "edit",
        outcome_status: "success",
        success_score: 1,
      },
      {
        node_id: "node_2",
        title: "Repair export mismatch again",
        summary: "Inspect failing test, patch export, rerun test",
        selected_tool: "edit",
        outcome_status: "success",
        success_score: 1,
      },
    ],
  });

  assert.equal(packet.operation, "form_pattern");
  assert.equal(packet.target_level, "L3");
  assert.equal(packet.source_count, 2);
  assert.equal(packet.deterministic_gate.gate_satisfied, true);
  assert.equal(packet.signatures.workflow_signature, "inspect-patch-rerun-targeted-test");
  assert.equal(packet.source_examples.length, 2);
});

test("form_pattern semantic review packet marks deterministic gate unsatisfied without grouped signatures", () => {
  const input = MemoryFormPatternRequest.parse({
    source_node_ids: ["node_1", "node_2"],
    input_text: "form pattern from sources",
  });

  const packet = buildFormPatternSemanticReviewPacket({
    input,
    sourceExamples: [{ node_id: "node_1" }, { node_id: "node_2" }],
  });

  assert.equal(packet.deterministic_gate.signature_present, false);
  assert.equal(packet.deterministic_gate.gate_satisfied, false);
});

test("form_pattern semantic review admits a high-confidence bounded recommendation", () => {
  const input = MemoryFormPatternRequest.parse({
    source_node_ids: ["node_1", "node_2"],
    workflow_signature: "inspect-patch-rerun-targeted-test",
    input_text: "form stable pattern from repeated successful workflows",
  });
  const packet = buildFormPatternSemanticReviewPacket({
    input,
    sourceExamples: [{ node_id: "node_1" }, { node_id: "node_2" }],
  });
  const review = MemoryFormPatternSemanticReviewResultSchema.parse({
    review_version: "form_pattern_semantic_review_v1",
    adjudication: {
      operation: "form_pattern",
      disposition: "recommend",
      target_kind: "pattern",
      target_level: "L3",
      reason: "Grouped sources share the same reusable repair shape",
      confidence: 0.84,
    },
  });

  const result = evaluateFormPatternSemanticReview({ packet, review });
  assert.equal(result.admissible, true);
  assert.equal(result.accepted_mutation_count, 1);
});

test("form_pattern semantic review rejects low-confidence recommendation and unsatisfied gate", () => {
  const input = MemoryFormPatternRequest.parse({
    source_node_ids: ["node_1", "node_2"],
    workflow_signature: "inspect-patch-rerun-targeted-test",
    input_text: "form stable pattern from repeated successful workflows",
  });
  const packet = buildFormPatternSemanticReviewPacket({
    input,
    sourceExamples: [{ node_id: "node_1" }, { node_id: "node_2" }],
  });
  const lowConfidenceReview = MemoryFormPatternSemanticReviewResultSchema.parse({
    review_version: "form_pattern_semantic_review_v1",
    adjudication: {
      operation: "form_pattern",
      disposition: "recommend",
      target_kind: "pattern",
      target_level: "L3",
      reason: "Maybe the same pattern",
      confidence: 0.55,
    },
  });

  const lowConfidenceResult = evaluateFormPatternSemanticReview({ packet, review: lowConfidenceReview });
  assert.equal(lowConfidenceResult.admissible, false);
  assert.deepEqual(lowConfidenceResult.reason_codes, ["confidence_too_low"]);

  const unsatisfiedPacket = buildFormPatternSemanticReviewPacket({
    input: MemoryFormPatternRequest.parse({
      source_node_ids: ["node_1", "node_2"],
      input_text: "form pattern from sources",
    }),
    sourceExamples: [{ node_id: "node_1" }, { node_id: "node_2" }],
  });
  const validReview = MemoryFormPatternSemanticReviewResultSchema.parse({
    review_version: "form_pattern_semantic_review_v1",
    adjudication: {
      operation: "form_pattern",
      disposition: "recommend",
      target_kind: "pattern",
      target_level: "L3",
      reason: "Looks stable",
      confidence: 0.9,
    },
  });

  const gateResult = evaluateFormPatternSemanticReview({ packet: unsatisfiedPacket, review: validReview });
  assert.equal(gateResult.admissible, false);
  assert.deepEqual(gateResult.reason_codes, ["threshold_not_met"]);
});
