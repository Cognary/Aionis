import { z } from "zod";

export const ExecutionStage = z.enum(["triage", "patch", "review", "resume"]);
export type ExecutionStage = z.infer<typeof ExecutionStage>;

export const ExecutionRole = z.enum(["orchestrator", "triage", "patch", "review", "resume"]);
export type ExecutionRole = z.infer<typeof ExecutionRole>;

const StringList = z.array(z.string().min(1)).default([]);

export const ReviewerContractSchema = z.object({
  standard: z.string().trim().min(1),
  required_outputs: StringList,
  acceptance_checks: StringList,
  rollback_required: z.boolean().default(false),
});
export type ReviewerContract = z.infer<typeof ReviewerContractSchema>;

export const ResumeAnchorSchema = z.object({
  anchor: z.string().trim().min(1),
  file_path: z.string().trim().min(1).nullable().default(null),
  symbol: z.string().trim().min(1).nullable().default(null),
  repo_root: z.string().trim().min(1).nullable().default(null),
});
export type ResumeAnchor = z.infer<typeof ResumeAnchorSchema>;

export const ExecutionStateV1Schema = z.object({
  state_id: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  task_brief: z.string().trim().min(1),
  current_stage: ExecutionStage,
  active_role: ExecutionRole,
  owned_files: StringList,
  modified_files: StringList,
  pending_validations: StringList,
  completed_validations: StringList,
  last_accepted_hypothesis: z.string().trim().min(1).nullable().default(null),
  rejected_paths: StringList,
  unresolved_blockers: StringList,
  rollback_notes: StringList,
  reviewer_contract: ReviewerContractSchema.nullable().default(null),
  resume_anchor: ResumeAnchorSchema.nullable().default(null),
  updated_at: z.string().datetime(),
  version: z.literal(1),
});
export type ExecutionStateV1 = z.infer<typeof ExecutionStateV1Schema>;

export const ExecutionPacketV1Schema = z.object({
  version: z.literal(1),
  state_id: z.string().trim().min(1),
  current_stage: ExecutionStage,
  active_role: ExecutionRole,
  task_brief: z.string().trim().min(1),
  target_files: StringList,
  next_action: z.string().trim().min(1).nullable().default(null),
  hard_constraints: StringList,
  accepted_facts: StringList,
  rejected_paths: StringList,
  pending_validations: StringList,
  unresolved_blockers: StringList,
  rollback_notes: StringList,
  review_contract: ReviewerContractSchema.nullable().default(null),
  resume_anchor: ResumeAnchorSchema.nullable().default(null),
  artifact_refs: StringList,
  evidence_refs: StringList,
});
export type ExecutionPacketV1 = z.infer<typeof ExecutionPacketV1Schema>;

export const ControlProfileName = z.enum(["triage", "patch", "review", "resume"]);
export type ControlProfileName = z.infer<typeof ControlProfileName>;

export const ControlProfileV1Schema = z.object({
  version: z.literal(1),
  profile: ControlProfileName,
  max_same_tool_streak: z.number().int().positive(),
  max_no_progress_streak: z.number().int().positive(),
  max_duplicate_observation_streak: z.number().int().positive(),
  max_steps: z.number().int().positive(),
  allow_broad_scan: z.boolean(),
  allow_broad_test: z.boolean(),
  escalate_on_blocker: z.boolean(),
  reviewer_ready_required: z.boolean(),
});
export type ControlProfileV1 = z.infer<typeof ControlProfileV1Schema>;
