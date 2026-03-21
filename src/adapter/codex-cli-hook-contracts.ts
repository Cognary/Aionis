import { z } from "zod";

const NullableStringSchema = z.union([z.string(), z.null()]);

const HookUniversalInputSchema = z.object({
  session_id: z.string().min(1),
  transcript_path: NullableStringSchema.optional(),
  cwd: z.string().min(1),
  model: z.string().min(1),
  permission_mode: z.string().min(1),
});

export const CodexSessionStartInputSchema = HookUniversalInputSchema.extend({
  hook_event_name: z.literal("SessionStart"),
  source: z.enum(["startup", "resume"]),
});

export const CodexUserPromptSubmitInputSchema = HookUniversalInputSchema.extend({
  hook_event_name: z.literal("UserPromptSubmit"),
  turn_id: z.string().min(1),
  prompt: z.string(),
});

export const CodexStopInputSchema = HookUniversalInputSchema.extend({
  hook_event_name: z.literal("Stop"),
  turn_id: z.string().min(1),
  stop_hook_active: z.boolean(),
  last_assistant_message: NullableStringSchema.optional(),
});

export const CodexHookInputSchema = z.union([
  CodexSessionStartInputSchema,
  CodexUserPromptSubmitInputSchema,
  CodexStopInputSchema,
]);

export type CodexSessionStartInput = z.infer<typeof CodexSessionStartInputSchema>;
export type CodexUserPromptSubmitInput = z.infer<typeof CodexUserPromptSubmitInputSchema>;
export type CodexStopInput = z.infer<typeof CodexStopInputSchema>;
export type CodexHookInput = z.infer<typeof CodexHookInputSchema>;

export type CodexHookOutput = {
  continue: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: "SessionStart" | "UserPromptSubmit" | "Stop";
    additionalContext?: string;
  };
};

export function createContinueOutput(args?: {
  eventName?: "SessionStart" | "UserPromptSubmit" | "Stop";
  additionalContext?: string | null;
  suppressOutput?: boolean;
  systemMessage?: string;
}): CodexHookOutput {
  const additionalContext = typeof args?.additionalContext === "string"
    ? args.additionalContext.trim()
    : "";
  return {
    continue: true,
    ...(args?.suppressOutput ? { suppressOutput: true } : {}),
    ...(args?.systemMessage ? { systemMessage: args.systemMessage } : {}),
    ...(args?.eventName && additionalContext
      ? {
          hookSpecificOutput: {
            hookEventName: args.eventName,
            additionalContext,
          },
        }
      : {}),
  };
}

export function parseHookEventName(value: unknown): "SessionStart" | "UserPromptSubmit" | "Stop" | null {
  if (value === "SessionStart" || value === "UserPromptSubmit" || value === "Stop") return value;
  return null;
}
