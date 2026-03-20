import type { MemoryAdjudicationProposal, MemoryGovernedOperationName } from "./schemas.js";

export const MEMORY_GOVERNED_OPERATIONS_REQUIRING_ADMISSIBILITY: ReadonlySet<MemoryGovernedOperationName> = new Set([
  "promote_memory",
  "compress_memory",
  "form_pattern",
  "derive_policy_hint",
  "rehydrate_payload",
]);

export function requiresMemoryAdmissibilityCheck(operation: MemoryGovernedOperationName): boolean {
  return MEMORY_GOVERNED_OPERATIONS_REQUIRING_ADMISSIBILITY.has(operation);
}

export function proposalRequiresMemoryAdmissibilityCheck(proposal: Pick<MemoryAdjudicationProposal, "operation">): boolean {
  return requiresMemoryAdmissibilityCheck(proposal.operation);
}

export function proposalTargetsGovernedMemoryMutation(
  proposal: Pick<MemoryAdjudicationProposal, "disposition" | "target_kind">,
): boolean {
  if (proposal.disposition !== "recommend") return false;
  return proposal.target_kind !== "none";
}

