import {
  MemoryAdmissibilityResultSchema,
  MemoryFormPatternSemanticReviewPacketSchema,
  MemoryFormPatternSemanticReviewResultSchema,
  type MemoryAdmissibilityResult,
  type MemoryFormPatternInput,
  type MemoryFormPatternSemanticReviewPacket,
  type MemoryFormPatternSemanticReviewResult,
} from "./schemas.js";

type FormPatternSourceExample = {
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

function compactExamples(examples: FormPatternSourceExample[]): FormPatternSourceExample[] {
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

export function buildFormPatternSemanticReviewPacket(args: {
  input: MemoryFormPatternInput;
  sourceExamples: FormPatternSourceExample[];
}): MemoryFormPatternSemanticReviewPacket {
  const signaturePresent = !!(
    normalizeString(args.input.task_signature)
    || normalizeString(args.input.error_signature)
    || normalizeString(args.input.workflow_signature)
  );
  const sourceCountSatisfied = args.input.source_node_ids.length >= 2;

  return MemoryFormPatternSemanticReviewPacketSchema.parse({
    review_version: "form_pattern_semantic_review_v1",
    operation: "form_pattern",
    target_level: "L3",
    source_count: args.input.source_node_ids.length,
    deterministic_gate: {
      source_count_satisfied: sourceCountSatisfied,
      signature_present: signaturePresent,
      gate_satisfied: sourceCountSatisfied && signaturePresent,
    },
    signatures: {
      task_signature: normalizeString(args.input.task_signature),
      error_signature: normalizeString(args.input.error_signature),
      workflow_signature: normalizeString(args.input.workflow_signature),
    },
    source_examples: compactExamples(args.sourceExamples),
  });
}

export function evaluateFormPatternSemanticReview(args: {
  packet: MemoryFormPatternSemanticReviewPacket;
  review: MemoryFormPatternSemanticReviewResult;
  minConfidence?: number;
}): MemoryAdmissibilityResult {
  const packet = MemoryFormPatternSemanticReviewPacketSchema.parse(args.packet);
  const review = MemoryFormPatternSemanticReviewResultSchema.parse(args.review);
  const minConfidence = args.minConfidence ?? 0.7;

  if (!packet.deterministic_gate.gate_satisfied) {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "form_pattern",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: ["threshold_not_met"],
      notes: { stage: "deterministic_gate" },
    });
  }

  if (review.adjudication.disposition !== "recommend") {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "form_pattern",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: [],
      notes: { disposition: review.adjudication.disposition },
    });
  }

  if (
    review.adjudication.target_kind !== "pattern"
    || review.adjudication.target_level !== "L3"
  ) {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "form_pattern",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: ["schema_invalid"],
      notes: { target_kind: review.adjudication.target_kind, target_level: review.adjudication.target_level ?? null },
    });
  }

  if (review.adjudication.confidence < minConfidence) {
    return MemoryAdmissibilityResultSchema.parse({
      operation: "form_pattern",
      admissible: false,
      accepted_mutation_count: 0,
      reason_codes: ["confidence_too_low"],
      notes: { confidence: review.adjudication.confidence, min_confidence: minConfidence },
    });
  }

  return MemoryAdmissibilityResultSchema.parse({
    operation: "form_pattern",
    admissible: true,
    accepted_mutation_count: 1,
    reason_codes: [],
    notes: {
      review_version: review.review_version,
      confidence: review.adjudication.confidence,
    },
  });
}
