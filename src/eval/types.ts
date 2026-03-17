import { z } from "zod";

export const ExecutionEvalDimensionScoresSchema = z.object({
  completion: z.number().min(0).max(1),
  reviewer_readiness: z.number().min(0).max(1),
  continuity: z.number().min(0).max(1),
  recovery: z.number().min(0).max(1),
  control_quality: z.number().min(0).max(1),
});

export const ExecutionEvalSecondaryMetricsSchema = z.object({
  avg_total_tokens: z.number().nullable(),
  avg_wall_clock_ms: z.number().nullable(),
  avg_tool_call_count: z.number().nullable(),
  avg_broad_tool_call_count: z.number().nullable(),
  avg_rediscovery_reads: z.number().nullable(),
  avg_handoff_store_count: z.number().nullable(),
  avg_context_assemble_count: z.number().nullable(),
  avg_tools_select_count: z.number().nullable(),
});

export const ExecutionEvalDecisionSummarySchema = z.object({
  continuity_mode: z.string().nullable(),
  continuity_carrier_rate: z.number().min(0).max(1),
  recovery_eligible_runs: z.number().int().min(0),
  handoff_usage_rate: z.number().min(0).max(1),
  context_assemble_usage_rate: z.number().min(0).max(1),
  tools_select_usage_rate: z.number().min(0).max(1),
});

export const ExecutionEvalArtifactRefsSchema = z.object({
  summary_json: z.string().min(1),
  cases_jsonl: z.string().min(1).nullable(),
});

export const ExecutionEvalVariantRecordSchema = z.object({
  eval_version: z.literal("execution_eval_v1"),
  suite_id: z.string().min(1),
  case_group_id: z.string().min(1),
  variant: z.string().min(1),
  result: z.enum(["pass", "fail"]),
  dimension_scores: ExecutionEvalDimensionScoresSchema,
  secondary_metrics: ExecutionEvalSecondaryMetricsSchema,
  decision_summary: ExecutionEvalDecisionSummarySchema,
  artifact_refs: ExecutionEvalArtifactRefsSchema,
  operator_notes: z.array(z.string()).default([]),
});

export const ExecutionEvalSummarySchema = z.object({
  summary_version: z.literal("execution_eval_summary_v1"),
  created_at: z.string().min(1),
  benchmark: z.string().min(1),
  suite_id: z.string().min(1),
  case_group_id: z.string().min(1),
  continuity_mode: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  repetitions: z.number().int().min(0).nullable(),
  cases: z.number().int().min(0).nullable(),
  variants: z.record(ExecutionEvalVariantRecordSchema),
  delta: z.object({
    completion_gain: z.number(),
    reviewer_readiness_gain: z.number(),
    continuity_gain: z.number(),
    recovery_gain: z.number(),
    control_quality_gain: z.number(),
  }),
  artifact_refs: ExecutionEvalArtifactRefsSchema,
});

export const OpenClawRealWorkflowVariantSummarySchema = z.object({
  reviewer_ready_rate: z.number().min(0).max(1),
  workflow_completed_rate: z.number().min(0).max(1),
  avg_total_tokens: z.number().nullable().optional(),
  avg_wall_clock_ms: z.number().nullable().optional(),
  avg_tool_call_count: z.number().nullable().optional(),
  avg_broad_tool_call_count: z.number().nullable().optional(),
  avg_rediscovery_reads: z.number().nullable().optional(),
  avg_handoff_store_count: z.number().nullable().optional(),
  avg_context_assemble_count: z.number().nullable().optional(),
  avg_tools_select_count: z.number().nullable().optional(),
  tokens_per_reviewer_ready_run: z.number().nullable().optional(),
}).passthrough();

export const OpenClawRealWorkflowSummarySchema = z.object({
  benchmark: z.literal("openclaw_real_workflow_scenario_v1"),
  continuity_mode: z.string().optional().nullable(),
  arm_selection: z.string().optional(),
  provider: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  repetitions: z.number().int().min(0).optional().nullable(),
  cases: z.number().int().min(0).optional().nullable(),
  baseline: OpenClawRealWorkflowVariantSummarySchema,
  treatment: OpenClawRealWorkflowVariantSummarySchema,
}).passthrough();

export const OpenClawRealWorkflowCaseArmSchema = z.object({
  workflow_completed: z.boolean(),
  reviewer_ready: z.boolean(),
  total_tokens: z.number().nullable().optional(),
  tool_call_count: z.number().int().min(0).optional(),
  broad_tool_call_count: z.number().int().min(0).optional(),
  rediscovery_reads: z.number().int().min(0).optional(),
  handoff_store_count: z.number().int().min(0).optional(),
  context_assemble_count: z.number().int().min(0).optional(),
  tools_select_count: z.number().int().min(0).optional(),
  wall_clock_ms: z.number().nullable().optional(),
  final_review_artifact: z.unknown().nullable().optional(),
}).passthrough();

export const OpenClawRealWorkflowCaseSchema = z.object({
  scenario_id: z.string().min(1),
  repetition: z.number().int().min(1),
  baseline: OpenClawRealWorkflowCaseArmSchema,
  treatment: OpenClawRealWorkflowCaseArmSchema,
});

export const OpenClawRealWorkflowCaseListSchema = z.array(OpenClawRealWorkflowCaseSchema);

export type ExecutionEvalSummary = z.infer<typeof ExecutionEvalSummarySchema>;
export type ExecutionEvalVariantRecord = z.infer<typeof ExecutionEvalVariantRecordSchema>;
export type OpenClawRealWorkflowSummary = z.infer<typeof OpenClawRealWorkflowSummarySchema>;
export type OpenClawRealWorkflowCase = z.infer<typeof OpenClawRealWorkflowCaseSchema>;
