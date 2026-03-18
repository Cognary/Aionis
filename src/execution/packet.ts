import { ExecutionPacketV1Schema, ExecutionStateV1Schema, type ExecutionPacketV1, type ExecutionStateV1 } from "./types.js";

export type ExecutionPacketBuildInput = {
  state: ExecutionStateV1;
  hard_constraints?: string[] | null;
  accepted_facts?: string[] | null;
  artifact_refs?: string[] | null;
  evidence_refs?: string[] | null;
};

export function buildExecutionPacketV1(input: ExecutionPacketBuildInput): ExecutionPacketV1 {
  const state = ExecutionStateV1Schema.parse(input.state);
  const targetFiles = state.owned_files.length > 0 ? state.owned_files : state.modified_files;
  return ExecutionPacketV1Schema.parse({
    version: 1,
    state_id: state.state_id,
    current_stage: state.current_stage,
    active_role: state.active_role,
    task_brief: state.task_brief,
    target_files: targetFiles,
    next_action: deriveNextAction(state),
    hard_constraints: input.hard_constraints ?? [],
    accepted_facts: input.accepted_facts ?? compactAcceptedFacts(state),
    rejected_paths: state.rejected_paths,
    pending_validations: state.pending_validations,
    unresolved_blockers: state.unresolved_blockers,
    rollback_notes: state.rollback_notes,
    review_contract: state.reviewer_contract,
    resume_anchor: state.resume_anchor,
    artifact_refs: input.artifact_refs ?? [],
    evidence_refs: input.evidence_refs ?? [],
  });
}

function compactAcceptedFacts(state: ExecutionStateV1): string[] {
  const out: string[] = [];
  if (state.last_accepted_hypothesis) out.push(`accepted_hypothesis:${state.last_accepted_hypothesis}`);
  for (const file of state.modified_files) out.push(`modified_file:${file}`);
  for (const check of state.completed_validations) out.push(`completed_validation:${check}`);
  return out;
}

function deriveNextAction(state: ExecutionStateV1): string | null {
  if (state.pending_validations.length > 0) {
    return `Complete pending validations: ${state.pending_validations.join(" | ")}`;
  }
  if (state.unresolved_blockers.length > 0) {
    return `Resolve blockers: ${state.unresolved_blockers.join(" | ")}`;
  }
  if (state.owned_files.length > 0) {
    return `Continue work on target files: ${state.owned_files.join(" | ")}`;
  }
  return null;
}
