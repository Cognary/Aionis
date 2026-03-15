import { ExecutionPacketV1Schema, ExecutionStateV1Schema, type ExecutionPacketV1, type ExecutionStateV1 } from "./types.js";

export type ExecutionPacketBuildInput = {
  state: ExecutionStateV1;
  hard_constraints?: string[] | null;
  accepted_facts?: string[] | null;
  evidence_refs?: string[] | null;
};

export function buildExecutionPacketV1(input: ExecutionPacketBuildInput): ExecutionPacketV1 {
  const state = ExecutionStateV1Schema.parse(input.state);
  return ExecutionPacketV1Schema.parse({
    version: 1,
    state_id: state.state_id,
    task_brief: state.task_brief,
    hard_constraints: input.hard_constraints ?? [],
    accepted_facts: input.accepted_facts ?? compactAcceptedFacts(state),
    rejected_paths: state.rejected_paths,
    pending_validations: state.pending_validations,
    rollback_notes: state.rollback_notes,
    review_contract: state.reviewer_contract,
    resume_anchor: state.resume_anchor,
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
