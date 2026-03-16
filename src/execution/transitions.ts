import { z } from "zod";
import {
  ExecutionRole,
  ExecutionStage,
  ExecutionStateV1Schema,
  ResumeAnchorSchema,
  ReviewerContractSchema,
  type ExecutionStateV1,
} from "./types.js";

const StringList = z.array(z.string().trim().min(1)).default([]);

export const ExecutionTransitionType = z.enum([
  "stage_started",
  "stage_completed",
  "validation_added",
  "validation_completed",
  "hypothesis_accepted",
  "path_rejected",
  "blocker_recorded",
  "blocker_cleared",
  "reviewer_contract_updated",
  "resume_anchor_updated",
]);
export type ExecutionTransitionType = z.infer<typeof ExecutionTransitionType>;

const BaseExecutionTransitionSchema = z.object({
  transition_id: z.string().trim().min(1),
  state_id: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  actor_role: ExecutionRole,
  at: z.string().datetime(),
  expected_revision: z.number().int().positive().optional(),
});

export const StageStartedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("stage_started"),
  next_stage: ExecutionStage,
  next_role: ExecutionRole,
});

export const StageCompletedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("stage_completed"),
  completed_stage: ExecutionStage,
  completed_role: ExecutionRole.optional(),
});

export const ValidationAddedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("validation_added"),
  validations: StringList,
});

export const ValidationCompletedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("validation_completed"),
  validations: StringList,
});

export const HypothesisAcceptedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("hypothesis_accepted"),
  hypothesis: z.string().trim().min(1),
});

export const PathRejectedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("path_rejected"),
  path: z.string().trim().min(1),
});

export const BlockerRecordedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("blocker_recorded"),
  blockers: StringList,
});

export const BlockerClearedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("blocker_cleared"),
  blockers: StringList,
});

export const ReviewerContractUpdatedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("reviewer_contract_updated"),
  reviewer_contract: ReviewerContractSchema.nullable(),
});

export const ResumeAnchorUpdatedTransitionSchema = BaseExecutionTransitionSchema.extend({
  type: z.literal("resume_anchor_updated"),
  resume_anchor: ResumeAnchorSchema.nullable(),
});

export const ExecutionStateTransitionV1Schema = z.discriminatedUnion("type", [
  StageStartedTransitionSchema,
  StageCompletedTransitionSchema,
  ValidationAddedTransitionSchema,
  ValidationCompletedTransitionSchema,
  HypothesisAcceptedTransitionSchema,
  PathRejectedTransitionSchema,
  BlockerRecordedTransitionSchema,
  BlockerClearedTransitionSchema,
  ReviewerContractUpdatedTransitionSchema,
  ResumeAnchorUpdatedTransitionSchema,
]);
export type ExecutionStateTransitionV1 = z.infer<typeof ExecutionStateTransitionV1Schema>;

function uniqKeepOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function without(values: readonly string[], removals: readonly string[]): string[] {
  const removeSet = new Set(removals.map((value) => String(value).trim()).filter(Boolean));
  return values.filter((value) => !removeSet.has(String(value).trim()));
}

export function applyExecutionStateTransition(
  stateInput: ExecutionStateV1,
  transitionInput: ExecutionStateTransitionV1,
): ExecutionStateV1 {
  const state = ExecutionStateV1Schema.parse(stateInput);
  const transition = ExecutionStateTransitionV1Schema.parse(transitionInput);

  if (state.state_id !== transition.state_id) {
    throw new Error(`execution state transition state_id mismatch: expected ${state.state_id}, got ${transition.state_id}`);
  }
  if (state.scope !== transition.scope) {
    throw new Error(`execution state transition scope mismatch: expected ${state.scope}, got ${transition.scope}`);
  }

  const next: ExecutionStateV1 = {
    ...state,
    owned_files: [...state.owned_files],
    modified_files: [...state.modified_files],
    pending_validations: [...state.pending_validations],
    completed_validations: [...state.completed_validations],
    rejected_paths: [...state.rejected_paths],
    unresolved_blockers: [...state.unresolved_blockers],
    rollback_notes: [...state.rollback_notes],
    updated_at: transition.at,
  };

  switch (transition.type) {
    case "stage_started":
      next.current_stage = transition.next_stage;
      next.active_role = transition.next_role;
      break;
    case "stage_completed":
      if (next.current_stage === transition.completed_stage) {
        next.current_stage = "resume";
      }
      if (transition.completed_role && next.active_role === transition.completed_role) {
        next.active_role = "resume";
      }
      break;
    case "validation_added":
      next.pending_validations = uniqKeepOrder(next.pending_validations.concat(transition.validations));
      next.completed_validations = without(next.completed_validations, transition.validations);
      break;
    case "validation_completed":
      next.pending_validations = without(next.pending_validations, transition.validations);
      next.completed_validations = uniqKeepOrder(next.completed_validations.concat(transition.validations));
      break;
    case "hypothesis_accepted":
      next.last_accepted_hypothesis = transition.hypothesis;
      break;
    case "path_rejected":
      next.rejected_paths = uniqKeepOrder(next.rejected_paths.concat([transition.path]));
      break;
    case "blocker_recorded":
      next.unresolved_blockers = uniqKeepOrder(next.unresolved_blockers.concat(transition.blockers));
      break;
    case "blocker_cleared":
      next.unresolved_blockers = without(next.unresolved_blockers, transition.blockers);
      break;
    case "reviewer_contract_updated":
      next.reviewer_contract = transition.reviewer_contract;
      break;
    case "resume_anchor_updated":
      next.resume_anchor = transition.resume_anchor;
      break;
    default: {
      const exhaustive: never = transition;
      throw new Error(`unsupported execution state transition: ${JSON.stringify(exhaustive)}`);
    }
  }

  return ExecutionStateV1Schema.parse(next);
}
