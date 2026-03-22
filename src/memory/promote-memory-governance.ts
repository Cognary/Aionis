import {
  MemoryAdmissibilityResultSchema,
  MemoryPromoteSemanticReviewPacketSchema,
  MemoryPromoteSemanticReviewResultSchema,
  type MemoryAdmissibilityResult,
  type MemoryPromoteInput,
  type MemoryPromoteSemanticReviewPacket,
  type MemoryPromoteSemanticReviewResult,
} from "./schemas.js";

type PromoteMemoryCandidateExample = {
  node_id: string;
  title?: string | null;
  summary?: string | null;
  task_signature?: string | null;
  error_signature?: string | null;
  workflow_signature?: string | null;
  selected_tool?: string | null;
  outcome_status?: string | null;
  success_score?: number | null;
};

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compactExamples(examples: PromoteMemoryCandidateExample[]): PromoteMemoryCandidateExample[] {
  return examples.slice(0, 6).map((example) => ({
    node_id: example.node_id,
    ...(normalizeString(example.title) ? { title: normalizeString(example.title) } : {}),
    ...(normalizeString(example.summary) ? { summary: normalizeString(example.summary) } : {}),
    ...(normalizeString(example.task_signature) ? { task_signature: normalizeString(example.task_signature) } : {}),
    ...(normalizeString(example.error_signature) ? { error_signature: normalizeString(example.error_signature) } : {}),
    ...(normalizeString(example.workflow_signature) ? { workflow_signature: normalizeString(example.workflow_signature) } : {}),
    ...(normalizeString(example.selected_tool) ? { selected_tool: normalizeString(example.selected_tool) } : {}),
    ...(normalizeString(example.outcome_status) ? { outcome_status: normalizeString(example.outcome_status) } : {}),
    ...(typeof example.success_score === "number" ? { success_score: example.success_score } : {}),
  }));
}

export function buildPromoteMemorySemanticReviewPacket(args: {
  input: MemoryPromoteInput;
  candidateExamples: PromoteMemoryCandidateExample[];
}): MemoryPromoteSemanticReviewPacket {
  const candidateCountSatisfied = args.input.candidate_node_ids.length >= 1;
  const targetKindPresent = !!normalizeString(args.input.target_kind);
  const targetLevelPresent = !!normalizeString(args.input.target_level);

  return MemoryPromoteSemanticReviewPacketSchema.parse({
    review_version: "promote_memory_semantic_review_v1",
    operation: "promote_memory",
    requested_target_kind: args.input.target_kind,
    requested_target_level: args.input.target_level,
    candidate_count: args.input.candidate_node_ids.length,
    deterministic_gate: {
      candidate_count_satisfied: candidateCountSatisfied,
      target_kind_present: targetKindPresent,
      target_level_present: targetLevelPresent,
      gate_satisfied: candidateCountSatisfied && targetKindPresent && targetLevelPresent,
    },
    candidate_examples: compactExamples(args.candidateExamples),
  });
}

export function evaluatePromoteMemorySemanticReview(args: {
  packet: MemoryPromoteSemanticReviewPacket;
  review: MemoryPromoteSemanticReviewResult;
  minConfidence?: number;
}): MemoryAdmissibilityResult {
  const packet = MemoryPromoteSemanticReviewPacketSchema.parse(args.packet);
  const review = MemoryPromoteSemanticReviewResultSchema.parse(args.review);
  const minConfidence = args.minConfidence ?? 0.7;

  if (!packet.deterministic_gate.gate_satisfied) {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "promote_memory",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: ["threshold_not_met"],
      notes: { stage: "deterministic_gate" },
    });
  }

  if (review.adjudication.disposition !== "recommend") {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "promote_memory",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: [],
      notes: { disposition: review.adjudication.disposition },
    });
  }

  if (review.adjudication.target_kind !== packet.requested_target_kind) {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "promote_memory",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: ["schema_invalid"],
      notes: {
        target_kind: review.adjudication.target_kind,
        requested_target_kind: packet.requested_target_kind,
      },
    });
  }

  if (review.adjudication.target_level !== packet.requested_target_level) {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "promote_memory",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: ["schema_invalid"],
      notes: {
        target_level: review.adjudication.target_level ?? null,
        requested_target_level: packet.requested_target_level,
      },
    });
  }

  if (review.adjudication.confidence < minConfidence) {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "promote_memory",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: ["confidence_too_low"],
      notes: { confidence: review.adjudication.confidence, min_confidence: minConfidence },
    });
  }

  return MemoryAdmissibilityResultSchema.parse({
    operation: "promote_memory",
    admissible: true,
    accepted_mutation_count: 1,
    reason_codes: [],
    notes: {
      review_version: review.review_version,
      confidence: review.adjudication.confidence,
    },
  });
}
