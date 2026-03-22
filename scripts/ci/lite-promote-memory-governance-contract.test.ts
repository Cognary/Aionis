import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPromoteMemorySemanticReviewPacket,
  evaluatePromoteMemorySemanticReview,
} from "../../src/memory/promote-memory-governance.ts";
import {
  MemoryPromoteRequest,
  MemoryPromoteSemanticReviewResultSchema,
} from "../../src/memory/schemas.ts";

test("promote_memory semantic review packet exposes only bounded candidate context", () => {
  const input = MemoryPromoteRequest.parse({
    candidate_node_ids: ["node_1", "node_2"],
    target_kind: "workflow",
    target_level: "L2",
    input_text: "promote stable repair trace",
  });

  const packet = buildPromoteMemorySemanticReviewPacket({
    input,
    candidateExamples: [
      {
        node_id: "node_1",
        title: "Repair export mismatch",
        summary: "Inspect failing test, patch export, rerun test",
        workflow_signature: "inspect-patch-rerun-targeted-test",
        selected_tool: "edit",
        outcome_status: "success",
        success_score: 1,
      },
      {
        node_id: "node_2",
        title: "Repair export mismatch again",
        summary: "Inspect failing test, patch export, rerun test",
        workflow_signature: "inspect-patch-rerun-targeted-test",
        selected_tool: "edit",
        outcome_status: "success",
        success_score: 1,
      },
    ],
  });

  assert.equal(packet.operation, "promote_memory");
  assert.equal(packet.requested_target_kind, "workflow");
  assert.equal(packet.requested_target_level, "L2");
  assert.equal(packet.candidate_count, 2);
  assert.equal(packet.deterministic_gate.gate_satisfied, true);
  assert.equal(packet.candidate_examples.length, 2);
});

test("promote_memory semantic review packet marks deterministic gate unsatisfied without candidates", () => {
  const packet = buildPromoteMemorySemanticReviewPacket({
    input: {
      candidate_node_ids: [],
      target_kind: "workflow",
      target_level: "L2",
      input_text: "promote stable repair trace",
    } as any,
    candidateExamples: [],
  });

  assert.equal(packet.deterministic_gate.candidate_count_satisfied, false);
  assert.equal(packet.deterministic_gate.gate_satisfied, false);
});

test("promote_memory semantic review admits a matching high-confidence recommendation", () => {
  const input = MemoryPromoteRequest.parse({
    candidate_node_ids: ["node_1"],
    target_kind: "workflow",
    target_level: "L2",
    input_text: "promote stable repair trace",
  });
  const packet = buildPromoteMemorySemanticReviewPacket({
    input,
    candidateExamples: [{ node_id: "node_1" }],
  });
  const review = MemoryPromoteSemanticReviewResultSchema.parse({
    review_version: "promote_memory_semantic_review_v1",
    adjudication: {
      operation: "promote_memory",
      disposition: "recommend",
      target_kind: "workflow",
      target_level: "L2",
      reason: "The candidate is stable enough for workflow promotion",
      confidence: 0.82,
    },
  });

  const result = evaluatePromoteMemorySemanticReview({ packet, review });
  assert.equal(result.admissible, true);
  assert.equal(result.accepted_mutation_count, 1);
});

test("promote_memory semantic review rejects target mismatch and low confidence", () => {
  const input = MemoryPromoteRequest.parse({
    candidate_node_ids: ["node_1"],
    target_kind: "workflow",
    target_level: "L2",
    input_text: "promote stable repair trace",
  });
  const packet = buildPromoteMemorySemanticReviewPacket({
    input,
    candidateExamples: [{ node_id: "node_1" }],
  });

  const targetMismatch = MemoryPromoteSemanticReviewResultSchema.parse({
    review_version: "promote_memory_semantic_review_v1",
    adjudication: {
      operation: "promote_memory",
      disposition: "recommend",
      target_kind: "pattern",
      target_level: "L3",
      reason: "Promote as pattern instead",
      confidence: 0.9,
    },
  });
  const mismatchResult = evaluatePromoteMemorySemanticReview({ packet, review: targetMismatch });
  assert.equal(mismatchResult.admissible, false);
  assert.deepEqual(mismatchResult.reason_codes, ["schema_invalid"]);

  const lowConfidence = MemoryPromoteSemanticReviewResultSchema.parse({
    review_version: "promote_memory_semantic_review_v1",
    adjudication: {
      operation: "promote_memory",
      disposition: "recommend",
      target_kind: "workflow",
      target_level: "L2",
      reason: "Maybe promote",
      confidence: 0.55,
    },
  });
  const lowConfidenceResult = evaluatePromoteMemorySemanticReview({ packet, review: lowConfidence });
  assert.equal(lowConfidenceResult.admissible, false);
  assert.deepEqual(lowConfidenceResult.reason_codes, ["confidence_too_low"]);
});
