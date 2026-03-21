import { z } from "zod";

const NullableStringSchema = z.union([z.string(), z.null()]);
const StringArraySchema = z.array(z.string().min(1)).min(1).max(200);
const StringRecordSchema = z.record(z.string(), z.string());

export const CodexCliShellRunRequestSchema = z.object({
  session_id: z.string().min(1),
  turn_id: z.string().min(1),
  transcript_path: NullableStringSchema.optional(),
  cwd: z.string().min(1),
  model: z.string().min(1),
  permission_mode: z.string().min(1),
  prompt: z.string().min(1),
  scope: z.string().min(1).optional(),
  task_kind: z.string().min(1).optional(),
  goal: z.string().min(1).optional(),
  selected_tool: z.string().min(1).optional(),
  candidates: StringArraySchema,
  selection_context: z.unknown().optional(),
  include_shadow: z.boolean().optional(),
  rules_limit: z.number().int().positive().max(200).optional(),
  strict: z.boolean().optional(),
  reorder_candidates: z.boolean().optional(),
  command: z.string().min(1),
  args: z.array(z.string()).max(400).optional(),
  env: StringRecordSchema.optional(),
  note: z.string().min(1).optional(),
  validated: z.boolean().optional(),
  reverted: z.boolean().optional(),
  finalization: z.object({
    outcome: z.enum(["completed", "blocked", "failed", "abandoned"]),
    note: z.string().min(1).optional(),
    context: z.unknown().optional(),
  }).optional(),
  introspect: z.object({
    limit: z.number().int().positive().max(50).optional(),
  }).optional(),
}).strict();

export type CodexCliShellRunRequest = z.infer<typeof CodexCliShellRunRequestSchema>;
