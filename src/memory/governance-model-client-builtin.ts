import type { GovernanceModelClient } from "./governance-model-client.js";
import type {
  MemoryFormPatternSemanticReviewPacket,
  MemoryPromoteSemanticReviewPacket,
} from "./schemas.js";

function hasWorkflowSignature(packet: MemoryPromoteSemanticReviewPacket): boolean {
  return packet.candidate_examples.some((example) =>
    typeof example.workflow_signature === "string" && example.workflow_signature.trim().length > 0
  );
}

export function createBuiltinPromoteMemoryGovernanceModelClient(args?: {
  confidence?: number;
  reason?: string;
}): GovernanceModelClient {
  const confidence = args?.confidence ?? 0.84;
  const reason = args?.reason ?? "mock model found workflow-signature evidence";
  return {
    reviewPromoteMemory: ({ reviewPacket, suppliedReviewResult }) => {
      if (suppliedReviewResult) {
        return suppliedReviewResult;
      }
      if (!reviewPacket.deterministic_gate.gate_satisfied) {
        return null;
      }
      if (reviewPacket.requested_target_kind !== "workflow" || reviewPacket.requested_target_level !== "L2") {
        return null;
      }
      if (!hasWorkflowSignature(reviewPacket)) {
        return null;
      }
      return {
        review_version: "promote_memory_semantic_review_v1",
        adjudication: {
          operation: "promote_memory",
          disposition: "recommend",
          target_kind: "workflow",
          target_level: "L2",
          reason,
          confidence,
          strategic_value: "high",
        },
      };
    },
  };
}

export function createBuiltinFormPatternGovernanceModelClient(args?: {
  confidence?: number;
  reason?: string;
}): GovernanceModelClient {
  const confidence = args?.confidence ?? 0.85;
  const reason = args?.reason ?? "mock model found grouped signature evidence";
  return {
    reviewFormPattern: ({ reviewPacket, suppliedReviewResult }) => {
      if (suppliedReviewResult) {
        return suppliedReviewResult;
      }
      if (!reviewPacket.deterministic_gate.gate_satisfied) {
        return null;
      }
      return {
        review_version: "form_pattern_semantic_review_v1",
        adjudication: {
          operation: "form_pattern",
          disposition: "recommend",
          target_kind: "pattern",
          target_level: "L3",
          reason,
          confidence,
        },
      };
    },
  };
}
