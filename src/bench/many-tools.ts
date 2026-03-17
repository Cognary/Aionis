import { z } from "zod";

export const ManyToolsDifficultySchema = z.enum(["easy", "medium", "hard"]);
export const ManyToolsBucketSchema = z.union([
  z.literal(4),
  z.literal(8),
  z.literal(12),
  z.literal(16),
  z.literal(24),
]);
export const ManyToolsExpectedActionSchema = z.literal("call_tool");
export const ManyToolsCandidateRoleSchema = z.enum([
  "correct",
  "same_family_distractor",
  "cross_family_distractor",
  "misleading_name_distractor",
]);
export const ManyToolsQualityTierSchema = z.union([
  z.literal("experimental"),
  z.literal("supported"),
  z.literal("preferred"),
  z.literal("deprecated"),
  z.null(),
]);

export const ManyToolsTaskSchema = z.object({
  instruction: z.string().min(1),
  expected_action: ManyToolsExpectedActionSchema,
  expected_correct_tool: z.string().min(1),
});

export const ManyToolsCandidateSchema = z.object({
  tool_name: z.string().min(1),
  capability_family: z.string().min(1).nullable(),
  quality_tier: ManyToolsQualityTierSchema,
  role: ManyToolsCandidateRoleSchema,
  description: z.string().min(1).optional(),
});

export const ManyToolsAcceptanceSchema = z.object({
  correct_first_tool: z.string().min(1),
  wrong_first_tools: z.array(z.string().min(1)).default([]),
  allow_no_tool: z.boolean(),
});

export const ManyToolsCaseSchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  difficulty: ManyToolsDifficultySchema.default("medium"),
  bucket: ManyToolsBucketSchema,
  task: ManyToolsTaskSchema,
  continuity: z
    .object({
      execution_state_v1: z.record(z.string(), z.unknown()).nullable().optional(),
      execution_packet_v1: z.record(z.string(), z.unknown()).nullable().optional(),
      control_profile_v1: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .passthrough()
    .optional()
    .default({}),
  candidates: z.array(ManyToolsCandidateSchema).min(1),
  acceptance: ManyToolsAcceptanceSchema,
});

export const ManyToolsCaseListSchema = z.array(ManyToolsCaseSchema);

export type ManyToolsCase = z.infer<typeof ManyToolsCaseSchema>;
export type ManyToolsCaseList = z.infer<typeof ManyToolsCaseListSchema>;
export type ManyToolsCandidate = z.infer<typeof ManyToolsCandidateSchema>;

export function validateManyToolsCases(raw: unknown): ManyToolsCaseList {
  const cases = ManyToolsCaseListSchema.parse(raw);
  const seen = new Set<string>();
  for (const item of cases) {
    if (seen.has(item.id)) {
      throw new Error(`duplicate many-tools case id: ${item.id}`);
    }
    seen.add(item.id);
    if (item.candidates.length !== item.bucket) {
      throw new Error(
        `many-tools case ${item.id} declares bucket=${item.bucket} but has ${item.candidates.length} candidates`,
      );
    }
    const correctCandidates = item.candidates.filter((candidate) => candidate.role === "correct");
    if (correctCandidates.length !== 1) {
      throw new Error(`many-tools case ${item.id} must have exactly one correct candidate`);
    }
    const correctTool = correctCandidates[0]!.tool_name;
    if (correctTool !== item.task.expected_correct_tool) {
      throw new Error(
        `many-tools case ${item.id} expected_correct_tool mismatch: task=${item.task.expected_correct_tool} candidate=${correctTool}`,
      );
    }
    if (correctTool !== item.acceptance.correct_first_tool) {
      throw new Error(
        `many-tools case ${item.id} acceptance.correct_first_tool mismatch: expected=${correctTool} actual=${item.acceptance.correct_first_tool}`,
      );
    }
  }
  return cases;
}

export function orderCandidatesFromCase(item: ManyToolsCase): string[] {
  return item.candidates.map((candidate) => candidate.tool_name);
}
