import type { HostCapabilityHandler } from "./host-integration-contracts.js";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function readSurfaceLabels(values: unknown, limit = 3): string[] {
  const out: string[] = [];
  for (const value of asArray(values)) {
    const label = typeof value === "string"
      ? value.trim()
      : firstString([
          asRecord(value)?.title,
          asRecord(value)?.name,
          asRecord(value)?.label,
          asRecord(value)?.summary,
        ]);
    if (!label || out.includes(label)) continue;
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

function buildPlanningAdditionalContext(response: any): string | null {
  const recommended = readSurfaceLabels(response?.planner_packet?.sections?.recommended_workflows, 3);
  const candidates = readSurfaceLabels(response?.planner_packet?.sections?.candidate_workflows, 3);
  const trusted = Number(response?.planning_summary?.trusted_pattern_count ?? 0);
  const contested = Number(response?.planning_summary?.contested_pattern_count ?? 0);
  const explanation = firstString([response?.planning_summary?.planner_explanation]);

  const lines: string[] = [];
  if (recommended.length > 0) lines.push(`Recommended workflows: ${recommended.join("; ")}`);
  if (candidates.length > 0) lines.push(`Candidate workflows: ${candidates.join("; ")}`);
  if (trusted > 0) lines.push(`Trusted tool patterns available: ${trusted}`);
  if (contested > 0) lines.push(`Contested tool patterns open: ${contested}`);
  if (explanation) lines.push(`Planner note: ${explanation}`);

  if (lines.length === 0) return null;

  return [
    "Aionis execution guidance for this task:",
    ...lines.map((line) => `- ${line}`),
  ].join("\n");
}

function normalizeStringArray(value: unknown, limit = 16): string[] {
  const out: string[] = [];
  for (const entry of asArray(value)) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

function classifyToolExecution(args: {
  selected_tool: string;
  command_exit_code?: number;
  validated?: boolean;
  reverted?: boolean;
}) {
  if (args.reverted === true) {
    return {
      classification: "negative" as const,
      reason: "selected tool path was explicitly reverted",
    };
  }
  if (args.selected_tool === "edit") {
    if (args.validated === true) {
      return {
        classification: "positive" as const,
        reason: "edit step reached a validated success boundary",
      };
    }
    return {
      classification: "abstain" as const,
      reason: "edit step is waiting for validation",
    };
  }
  if ((args.selected_tool === "bash" || args.selected_tool === "test") && typeof args.command_exit_code === "number") {
    if (args.command_exit_code === 0) {
      return {
        classification: "positive" as const,
        reason: "command-like step completed successfully",
      };
    }
    return {
      classification: "abstain" as const,
      reason: "non-zero exit alone is not enough for automatic negative feedback",
    };
  }
  return {
    classification: "abstain" as const,
    reason: "ambiguous execution outcome; capability abstains",
  };
}

function classifyTaskTerminal(outcome: "completed" | "blocked" | "failed" | "abandoned" | "stopped") {
  if (outcome === "completed") {
    return {
      classification: "positive" as const,
      reason: "task reached a successful terminal boundary",
    };
  }
  if (outcome === "blocked" || outcome === "failed") {
    return {
      classification: "negative" as const,
      reason: "task reached a negative terminal boundary",
    };
  }
  return {
    classification: "abstain" as const,
    reason: "terminal outcome does not auto-record feedback",
  };
}

export function createCodexCliCapabilityHandlers(): HostCapabilityHandler[] {
  return [
    {
      id: "planning_guidance",
      subscribed_events: ["prompt_submitted"],
      async handle(event, runtime) {
        if (event.event_type !== "prompt_submitted") return [];
        const response = await runtime.postJson<any>(runtime.env, "/v1/memory/planning/context", {
          scope: event.context.scope,
          query_text: event.prompt,
          run_id: event.context.task_id ?? `codex:${event.context.session_id}:${event.context.turn_id ?? "turn"}`,
          context: {
            task_kind: "codex_cli_prompt",
            goal: event.prompt,
            client: {
              name: event.context.host_name,
              event_type: event.event_type,
            },
            codex: event.context.host_metadata,
          },
        });
        const text = buildPlanningAdditionalContext(response);
        return text ? [{ channel: "context_injection", text }] : [];
      },
    },
    {
      id: "tool_selection",
      subscribed_events: ["tool_selection_requested"],
      async handle(event, runtime) {
        if (event.event_type !== "tool_selection_requested") return [];
        const response = await runtime.postJson<any>(runtime.env, "/v1/memory/tools/select", {
          scope: event.context.scope,
          run_id: event.context.task_id ?? `codex:${event.context.session_id}:${event.context.turn_id ?? "turn"}`,
          context: event.selection_context,
          candidates: event.candidates,
          include_shadow: event.include_shadow,
          rules_limit: event.rules_limit,
          strict: event.strict,
          reorder_candidates: event.reorder_candidates,
        });
        return [{
          channel: "tool_ordering",
          selected_tool: firstString([response?.selection?.selected]),
          ordered: normalizeStringArray(response?.selection?.ordered),
          preferred: normalizeStringArray(response?.selection?.preferred),
          provenance_explanation: firstString([response?.selection_summary?.provenance_explanation]),
          used_trusted_pattern_tools: normalizeStringArray(response?.selection_summary?.used_trusted_pattern_tools),
          used_trusted_pattern_affinity_levels: normalizeStringArray(response?.selection_summary?.used_trusted_pattern_affinity_levels),
        }];
      },
    },
    {
      id: "execution_feedback",
      subscribed_events: ["tool_executed"],
      async handle(event, runtime) {
        if (event.event_type !== "tool_executed") return [];
        const classification = classifyToolExecution({
          selected_tool: event.selected_tool,
          command_exit_code: event.command_exit_code,
          validated: event.validated,
          reverted: event.reverted,
        });
        if (classification.classification === "abstain") {
          return [{
            channel: "task_feedback_recorded",
            classification: "abstain",
            recorded: false,
            reason: classification.reason,
          }];
        }
        await runtime.postJson<any>(runtime.env, "/v1/memory/tools/feedback", {
          scope: event.context.scope,
          run_id: event.context.task_id ?? `codex:${event.context.session_id}:${event.context.turn_id ?? "turn"}`,
          outcome: classification.classification,
          context: event.execution_context,
          candidates: event.candidates,
          selected_tool: event.selected_tool,
          target: "all",
          note: event.note,
          input_text: `host capability ${classification.classification} feedback via tool_executed${event.note ? `: ${event.note}` : ""}`,
        });
        return [{
          channel: "task_feedback_recorded",
          classification: classification.classification,
          recorded: true,
          reason: classification.reason,
        }];
      },
    },
    {
      id: "task_finalization",
      subscribed_events: ["task_terminal"],
      async handle(event, runtime) {
        if (event.event_type !== "task_terminal") return [];
        const classification = classifyTaskTerminal(event.outcome);
        if (
          classification.classification === "abstain"
          || !event.selected_tool
          || !event.candidates
          || event.terminal_context === undefined
        ) {
          return [{
            channel: "task_finalized",
            classification: classification.classification,
            recorded: false,
            reason: classification.classification === "abstain"
              ? classification.reason
              : "task reached a terminal boundary but explicit execution evidence was insufficient",
          }];
        }
        await runtime.postJson<any>(runtime.env, "/v1/memory/tools/feedback", {
          scope: event.context.scope,
          run_id: event.context.task_id ?? `codex:${event.context.session_id}:${event.context.turn_id ?? "turn"}`,
          outcome: classification.classification,
          context: event.terminal_context,
          candidates: event.candidates,
          selected_tool: event.selected_tool,
          target: "all",
          note: event.note ?? event.last_assistant_message ?? undefined,
          input_text: `host capability ${classification.classification} finalization via ${event.outcome}${event.note ? `: ${event.note}` : ""}`,
        });
        return [{
          channel: "task_finalized",
          classification: classification.classification,
          recorded: true,
          reason: classification.reason,
        }];
      },
    },
  ];
}
