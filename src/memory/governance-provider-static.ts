import type { PromoteMemoryGovernanceReviewProvider } from "./governance-provider-types.js";

function hasWorkflowSignature(packet: {
  candidate_examples: Array<{ workflow_signature?: string | null }>;
}): boolean {
  return packet.candidate_examples.some((example) =>
    typeof example.workflow_signature === "string" && example.workflow_signature.trim().length > 0
  );
}

export function createStaticPromoteMemoryGovernanceReviewProvider(): PromoteMemoryGovernanceReviewProvider {
  return {
    resolveReviewResult: ({ reviewPacket, suppliedReviewResult }) => {
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
          reason: "static provider found workflow-signature evidence",
          confidence: 0.84,
          strategic_value: "high",
        },
      };
    },
  };
}
