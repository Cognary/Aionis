import { z } from "zod";

const StringArraySchema = z.array(z.string().min(1)).min(1).max(200);

export const AdapterTaskStartedSchema = z.object({
  event_type: z.literal("task_started"),
  task_id: z.string().min(1),
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  context: z.unknown().default({}),
  tool_candidates: StringArraySchema.optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  rules_limit: z.number().int().positive().max(200).optional(),
  limit: z.number().int().positive().max(200).optional(),
}).strict();

export const AdapterToolSelectionRequestedSchema = z.object({
  event_type: z.literal("tool_selection_requested"),
  task_id: z.string().min(1),
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  context: z.unknown().optional(),
  candidates: StringArraySchema,
  include_shadow: z.boolean().optional(),
  rules_limit: z.number().int().positive().max(200).optional(),
  strict: z.boolean().optional(),
  reorder_candidates: z.boolean().optional(),
}).strict();

export const AdapterToolExecutedSchema = z.object({
  event_type: z.literal("tool_executed"),
  task_id: z.string().min(1),
  step_id: z.string().min(1),
  selected_tool: z.string().min(1),
  candidates: StringArraySchema,
  context: z.unknown(),
  command_exit_code: z.number().int().optional(),
  validated: z.boolean().optional(),
  reverted: z.boolean().optional(),
  note: z.string().min(1).optional(),
}).strict();

export const AdapterTaskTerminalOutcomeSchema = z.object({
  event_type: z.enum(["task_completed", "task_blocked", "task_failed", "task_abandoned"]),
  task_id: z.string().min(1),
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  selected_tool: z.string().min(1).optional(),
  candidates: StringArraySchema.optional(),
  context: z.unknown().optional(),
  note: z.string().min(1).optional(),
}).strict();

export type AdapterTaskStarted = z.infer<typeof AdapterTaskStartedSchema>;
export type AdapterToolSelectionRequested = z.infer<typeof AdapterToolSelectionRequestedSchema>;
export type AdapterToolExecuted = z.infer<typeof AdapterToolExecutedSchema>;
export type AdapterTaskTerminalOutcome = z.infer<typeof AdapterTaskTerminalOutcomeSchema>;

export type AdapterTaskEvent =
  | AdapterTaskStarted
  | AdapterToolSelectionRequested
  | AdapterToolExecuted
  | AdapterTaskTerminalOutcome;
