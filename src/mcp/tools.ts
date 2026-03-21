import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AionisMcpEnv } from "./client.js";
import { AionisMcpHttpError, clipToolText, postAionisJson } from "./client.js";
import { AionisMcpSessionState, type PendingDecision } from "./session-state.js";

type JsonSchema = Record<string, unknown>;

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: McpTextContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
};

type ToolHandler = (args: unknown) => Promise<McpToolResult>;

type PostJsonLike = <TResponse = unknown>(env: AionisMcpEnv, path: string, body: unknown) => Promise<TResponse>;

type CreateToolsArgs = {
  env: AionisMcpEnv;
  state?: AionisMcpSessionState;
  postJson?: PostJsonLike;
};

const PlanningContextArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  context: z.unknown().default({}),
  tool_candidates: z.array(z.string().min(1)).max(200).optional(),
  run_id: z.string().min(1).optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  rules_limit: z.number().int().positive().max(200).optional(),
  limit: z.number().int().positive().max(200).optional(),
}).strict();

const SelectToolArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  context: z.unknown(),
  candidates: z.array(z.string().min(1)).min(1).max(200),
  include_shadow: z.boolean().optional(),
  rules_limit: z.number().int().positive().max(200).optional(),
  strict: z.boolean().optional(),
  reorder_candidates: z.boolean().optional(),
}).strict();

const IntrospectArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  limit: z.number().int().positive().max(50).optional(),
}).strict();

const FinalizeTaskArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  outcome: z.enum(["success", "failed", "blocked"]),
  selected_tool: z.string().min(1).optional(),
  candidates: z.array(z.string().min(1)).min(1).max(200).optional(),
  context: z.unknown().optional(),
  note: z.string().min(1).optional(),
}).strict();

const FeedbackSignalKind = z.enum([
  "step_succeeded",
  "step_failed",
  "tool_reverted",
  "task_completed",
  "task_blocked",
  "user_confirmed",
  "user_rejected",
  "unknown",
]);

const RecordFeedbackArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  decision_id: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  signal_kind: FeedbackSignalKind,
  selected_tool: z.string().min(1).optional(),
  candidates: z.array(z.string().min(1)).min(1).max(200).optional(),
  context: z.unknown().optional(),
  note: z.string().min(1).optional(),
  command_exit_code: z.number().int().optional(),
  validated: z.boolean().optional(),
  reverted: z.boolean().optional(),
});

type FeedbackClassification = {
  classification: "positive" | "negative" | "abstain";
  reason: string;
  shouldRecord: boolean;
  retainPendingDecision: boolean;
};

function textResult(env: AionisMcpEnv, structuredContent: unknown, fallbackText: string, isError = false): McpToolResult {
  const out: McpToolResult = {
    structuredContent,
    content: [
      {
        type: "text",
        text: clipToolText(fallbackText, env.AIONIS_MAX_TOOL_TEXT_CHARS),
      },
    ],
  };
  if (isError) out.isError = true;
  return out;
}

function formatHttpError(error: AionisMcpHttpError): string {
  return `aionis_http_error: ${error.status}\n${JSON.stringify(error.body, null, 2)}`;
}

function summarizePlanningContext(response: any): { text: string; data: Record<string, unknown> } {
  const recommended = Array.isArray(response?.planner_packet?.sections?.recommended_workflows)
    ? response.planner_packet.sections.recommended_workflows.length
    : 0;
  const candidate = Array.isArray(response?.planner_packet?.sections?.candidate_workflows)
    ? response.planner_packet.sections.candidate_workflows.length
    : 0;
  const trustedPatterns = Number(response?.planning_summary?.trusted_pattern_count ?? 0);
  const contestedPatterns = Number(response?.planning_summary?.contested_pattern_count ?? 0);
  const explanation = typeof response?.planning_summary?.planner_explanation === "string"
    ? response.planning_summary.planner_explanation
    : null;
  const data = {
    tenant_id: response?.tenant_id ?? null,
    scope: response?.scope ?? null,
    recommended_workflow_count: recommended,
    candidate_workflow_count: candidate,
    trusted_pattern_count: trustedPatterns,
    contested_pattern_count: contestedPatterns,
    planner_explanation: explanation,
    workflow_signals: Array.isArray(response?.workflow_signals) ? response.workflow_signals : [],
    pattern_signals: Array.isArray(response?.pattern_signals) ? response.pattern_signals : [],
    execution_kernel: response?.execution_kernel ?? {},
  };
  const text = [
    "planning context ready",
    `recommended_workflows: ${recommended}`,
    `candidate_workflows: ${candidate}`,
    `trusted_patterns: ${trustedPatterns}`,
    `contested_patterns: ${contestedPatterns}`,
    explanation ? `planner_explanation: ${explanation}` : null,
  ].filter(Boolean).join("\n");
  return { text, data };
}

function summarizeToolSelection(response: any): { text: string; data: Record<string, unknown>; pendingDecision: PendingDecision | null } {
  const decisionId = typeof response?.decision?.decision_id === "string" ? response.decision.decision_id : null;
  const runId = typeof response?.decision?.run_id === "string" ? response.decision.run_id : null;
  const selectedTool = typeof response?.selection?.selected === "string" ? response.selection.selected : null;
  const provenance = typeof response?.selection_summary?.provenance_explanation === "string"
    ? response.selection_summary.provenance_explanation
    : null;
  const data = {
    tenant_id: response?.tenant_id ?? null,
    scope: response?.scope ?? null,
    selected_tool: selectedTool,
    ordered: Array.isArray(response?.selection?.ordered) ? response.selection.ordered : [],
    preferred: Array.isArray(response?.selection?.preferred) ? response.selection.preferred : [],
    decision_id: decisionId,
    decision_uri: typeof response?.decision?.decision_uri === "string" ? response.decision.decision_uri : null,
    run_id: runId,
    provenance_explanation: provenance,
    used_trusted_pattern_tools: Array.isArray(response?.selection_summary?.used_trusted_pattern_tools)
      ? response.selection_summary.used_trusted_pattern_tools
      : [],
    used_trusted_pattern_affinity_levels: Array.isArray(response?.selection_summary?.used_trusted_pattern_affinity_levels)
      ? response.selection_summary.used_trusted_pattern_affinity_levels
      : [],
  };
  const pendingDecision = decisionId
    ? {
        decision_id: decisionId,
        decision_uri: data.decision_uri as string | null,
        run_id: runId,
        selected_tool: selectedTool,
        candidates: Array.isArray(response?.candidates) ? response.candidates : [],
        context: response?.execution_kernel?.decision_context ?? response?.decision?.context ?? {},
        created_at: new Date().toISOString(),
      }
    : null;
  const text = [
    "tool selection ready",
    selectedTool ? `selected_tool: ${selectedTool}` : "selected_tool: none",
    decisionId ? `decision_id: ${decisionId}` : null,
    provenance ? `provenance: ${provenance}` : null,
  ].filter(Boolean).join("\n");
  return { text, data, pendingDecision };
}

function summarizeIntrospection(response: any): { text: string; data: Record<string, unknown> } {
  const workflowSummary = response?.workflow_signal_summary ?? {};
  const patternSummary = response?.pattern_signal_summary ?? {};
  const data = {
    tenant_id: response?.tenant_id ?? null,
    scope: response?.scope ?? null,
    stable_workflow_count: Number(workflowSummary?.stable_workflow_count ?? 0),
    promotion_ready_workflow_count: Number(workflowSummary?.promotion_ready_workflow_count ?? 0),
    observing_workflow_count: Number(workflowSummary?.observing_workflow_count ?? 0),
    candidate_pattern_count: Number(patternSummary?.candidate_pattern_count ?? 0),
    trusted_pattern_count: Number(patternSummary?.trusted_pattern_count ?? 0),
    contested_pattern_count: Number(patternSummary?.contested_pattern_count ?? 0),
    recommended_workflows: Array.isArray(response?.recommended_workflows) ? response.recommended_workflows : [],
    trusted_patterns: Array.isArray(response?.trusted_patterns) ? response.trusted_patterns : [],
    contested_patterns: Array.isArray(response?.contested_patterns) ? response.contested_patterns : [],
    continuity_projection_report: response?.continuity_projection_report ?? null,
  };
  const text = [
    "execution memory introspection ready",
    `stable_workflows: ${data.stable_workflow_count}`,
    `promotion_ready_workflows: ${data.promotion_ready_workflow_count}`,
    `observing_workflows: ${data.observing_workflow_count}`,
    `candidate_patterns: ${data.candidate_pattern_count}`,
    `trusted_patterns: ${data.trusted_pattern_count}`,
    `contested_patterns: ${data.contested_pattern_count}`,
  ].join("\n");
  return { text, data };
}

export function classifyFeedbackSignal(input: z.infer<typeof RecordFeedbackArgs>, pending: PendingDecision): FeedbackClassification {
  const selectedTool = String(pending.selected_tool ?? "").trim();
  const isEdit = selectedTool === "edit";
  const isCommandLike = selectedTool === "bash" || selectedTool === "test";

  switch (input.signal_kind) {
    case "unknown":
      return {
        classification: "abstain",
        reason: "signal is ambiguous; thin MCP abstains",
        shouldRecord: false,
        retainPendingDecision: false,
      };
    case "tool_reverted":
      return {
        classification: "negative",
        reason: "selected tool path was explicitly reverted",
        shouldRecord: true,
        retainPendingDecision: false,
      };
    case "user_rejected":
      return {
        classification: "negative",
        reason: "user explicitly rejected the selected tool path",
        shouldRecord: true,
        retainPendingDecision: false,
      };
    case "task_blocked":
      return {
        classification: "negative",
        reason: "task was explicitly blocked after the selected tool path",
        shouldRecord: true,
        retainPendingDecision: false,
      };
    case "task_completed":
    case "user_confirmed":
      return {
        classification: "positive",
        reason: "task reached a high-confidence successful boundary",
        shouldRecord: true,
        retainPendingDecision: false,
      };
    case "step_failed":
      if (isEdit && input.reverted !== true) {
        return {
          classification: "abstain",
          reason: "edit step failed without explicit revert; thin MCP abstains",
          shouldRecord: false,
          retainPendingDecision: false,
        };
      }
      return {
        classification: "negative",
        reason: isCommandLike
          ? "command-like step explicitly failed"
          : "selected tool path explicitly failed",
        shouldRecord: true,
        retainPendingDecision: false,
      };
    case "step_succeeded":
      if (isEdit && input.validated !== true) {
        return {
          classification: "abstain",
          reason: "edit succeeded locally but is waiting for validation or completion",
          shouldRecord: false,
          retainPendingDecision: true,
        };
      }
      if (isCommandLike && typeof input.command_exit_code === "number" && input.command_exit_code !== 0) {
        return {
          classification: "abstain",
          reason: "non-zero exit alone is not enough for automatic negative feedback",
          shouldRecord: false,
          retainPendingDecision: false,
        };
      }
      return {
        classification: "positive",
        reason: "step reached a high-confidence success boundary",
        shouldRecord: true,
        retainPendingDecision: false,
      };
  }
}

function buildFeedbackInputText(classification: FeedbackClassification, signalKind: string, note?: string): string {
  const base = `thin_mcp ${classification.classification} feedback via ${signalKind}`;
  return note ? `${base}: ${note}` : base;
}

function hasExplicitExecutionEvidence(input: z.infer<typeof RecordFeedbackArgs>): boolean {
  return typeof input.selected_tool === "string"
    && Array.isArray(input.candidates)
    && input.candidates.length > 0
    && Object.prototype.hasOwnProperty.call(input, "context");
}

function synthesizePendingDecisionFromFeedback(input: z.infer<typeof RecordFeedbackArgs>): PendingDecision | null {
  if (!hasExplicitExecutionEvidence(input)) return null;
  return {
    decision_id: `feedback-derived:${randomUUID()}`,
    run_id: input.run_id ?? null,
    selected_tool: input.selected_tool ?? null,
    candidates: input.candidates ?? [],
    context: input.context,
    created_at: new Date().toISOString(),
  };
}

export function createAionisMcpTools(args: CreateToolsArgs): {
  definitions: McpToolDefinition[];
  callTool: (name: string, rawArgs: unknown) => Promise<McpToolResult>;
  state: AionisMcpSessionState;
} {
  const env = args.env;
  const state = args.state ?? new AionisMcpSessionState();
  const postJson = args.postJson ?? postAionisJson;

  const handlers = new Map<string, ToolHandler>();

  const definitions: McpToolDefinition[] = [
    {
      name: "aionis_get_planning_context",
      title: "Get Planning Context",
      description: "Get compact workflow and pattern guidance at task start.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query_text"],
        properties: {
          tenant_id: { type: "string" },
          scope: { type: "string" },
          query_text: { type: "string" },
          context: { type: "object" },
          tool_candidates: { type: "array", items: { type: "string" } },
          run_id: { type: "string" },
          consumer_agent_id: { type: "string" },
          consumer_team_id: { type: "string" },
          rules_limit: { type: "integer" },
          limit: { type: "integer" },
        },
      },
    },
    {
      name: "aionis_select_tool",
      title: "Select Tool",
      description: "Choose among concrete tools with trusted pattern support.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["context", "candidates"],
        properties: {
          tenant_id: { type: "string" },
          scope: { type: "string" },
          run_id: { type: "string" },
          context: { type: "object" },
          candidates: { type: "array", items: { type: "string" } },
          include_shadow: { type: "boolean" },
          rules_limit: { type: "integer" },
          strict: { type: "boolean" },
          reorder_candidates: { type: "boolean" },
        },
      },
    },
    {
      name: "aionis_record_feedback",
      title: "Record Feedback",
      description: "Record high-confidence execution feedback using the thin MCP signal protocol.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["signal_kind"],
        properties: {
          tenant_id: { type: "string" },
          scope: { type: "string" },
          decision_id: { type: "string" },
          run_id: { type: "string" },
          signal_kind: { type: "string", enum: FeedbackSignalKind.options },
          selected_tool: { type: "string" },
          candidates: { type: "array", items: { type: "string" } },
          context: { type: "object" },
          note: { type: "string" },
          command_exit_code: { type: "integer" },
          validated: { type: "boolean" },
          reverted: { type: "boolean" },
        },
      },
    },
    {
      name: "aionis_finalize_task",
      title: "Finalize Task",
      description: "Record one high-confidence task outcome without requiring user confirmation loops.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["outcome"],
        properties: {
          tenant_id: { type: "string" },
          scope: { type: "string" },
          run_id: { type: "string" },
          outcome: { type: "string", enum: ["success", "failed", "blocked"] },
          selected_tool: { type: "string" },
          candidates: { type: "array", items: { type: "string" } },
          context: { type: "object" },
          note: { type: "string" },
        },
      },
    },
    {
      name: "aionis_introspect",
      title: "Introspect Execution Memory",
      description: "Inspect what Aionis has learned so far.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          tenant_id: { type: "string" },
          scope: { type: "string" },
          consumer_agent_id: { type: "string" },
          consumer_team_id: { type: "string" },
          limit: { type: "integer" },
        },
      },
    },
  ];

  handlers.set("aionis_get_planning_context", async (rawArgs) => {
    const parsed = PlanningContextArgs.safeParse(rawArgs);
    if (!parsed.success) {
      return textResult(env, { error: parsed.error.flatten() }, `invalid_args: ${parsed.error.message}`, true);
    }
    try {
      const body = {
        ...parsed.data,
        scope: parsed.data.scope ?? env.AIONIS_SCOPE,
      };
      const response = await postJson<any>(env, "/v1/memory/planning/context", body);
      const summary = summarizePlanningContext(response);
      return textResult(env, summary.data, summary.text);
    } catch (error) {
      if (error instanceof AionisMcpHttpError) {
        return textResult(env, { error: error.body }, formatHttpError(error), true);
      }
      return textResult(env, { error: String(error) }, `aionis_error: ${String(error)}`, true);
    }
  });

  handlers.set("aionis_select_tool", async (rawArgs) => {
    const parsed = SelectToolArgs.safeParse(rawArgs);
    if (!parsed.success) {
      return textResult(env, { error: parsed.error.flatten() }, `invalid_args: ${parsed.error.message}`, true);
    }
    try {
      const body = {
        ...parsed.data,
        scope: parsed.data.scope ?? env.AIONIS_SCOPE,
      };
      const response = await postJson<any>(env, "/v1/memory/tools/select", body);
      const summary = summarizeToolSelection(response);
      if (summary.pendingDecision) {
        const pendingDecision = {
          ...summary.pendingDecision,
          context: parsed.data.context,
        };
        state.setPendingDecision(pendingDecision);
      }
      return textResult(env, summary.data, summary.text);
    } catch (error) {
      if (error instanceof AionisMcpHttpError) {
        return textResult(env, { error: error.body }, formatHttpError(error), true);
      }
      return textResult(env, { error: String(error) }, `aionis_error: ${String(error)}`, true);
    }
  });

  handlers.set("aionis_record_feedback", async (rawArgs) => {
    const parsed = RecordFeedbackArgs.safeParse(rawArgs);
    if (!parsed.success) {
      return textResult(env, { error: parsed.error.flatten() }, `invalid_args: ${parsed.error.message}`, true);
    }
    const storedPending = state.resolvePendingDecision({
      decision_id: parsed.data.decision_id ?? null,
      run_id: parsed.data.run_id ?? null,
    });
    const feedbackMode = storedPending ? "pending_decision" : "feedback_derived";
    const pending = storedPending ?? synthesizePendingDecisionFromFeedback(parsed.data);
    if (!pending) {
      return textResult(
        env,
        {
          error: "missing_feedback_context",
          feedback_recorded: false,
          classification: "abstain",
          reason: "record_feedback requires a prior aionis_select_tool decision or explicit selected_tool+candidates+context",
        },
        "invalid_args: record_feedback requires a prior aionis_select_tool decision or explicit selected_tool+candidates+context",
        true,
      );
    }
    const classification = classifyFeedbackSignal(parsed.data, pending);
    if (!classification.shouldRecord) {
      if (!classification.retainPendingDecision && storedPending) {
        state.clearPendingDecision({
          decision_id: pending.decision_id,
          run_id: pending.run_id,
        });
      }
      return textResult(
        env,
        {
          feedback_recorded: false,
          classification: classification.classification,
          reason: classification.reason,
          pending_retained: classification.retainPendingDecision,
          feedback_mode: feedbackMode,
        },
        `feedback ${classification.classification}: ${classification.reason}`,
      );
    }
    try {
      const body = {
        tenant_id: parsed.data.tenant_id,
        scope: parsed.data.scope ?? env.AIONIS_SCOPE,
        run_id: pending.run_id ?? parsed.data.run_id,
        decision_id: storedPending ? pending.decision_id : undefined,
        outcome: classification.classification,
        context: pending.context,
        candidates: pending.candidates,
        selected_tool: pending.selected_tool,
        target: "all",
        note: parsed.data.note,
        input_text: buildFeedbackInputText(classification, parsed.data.signal_kind, parsed.data.note),
      };
      const response = await postJson<any>(env, "/v1/memory/tools/feedback", body);
      if (storedPending) {
        state.clearPendingDecision({
          decision_id: pending.decision_id,
          run_id: pending.run_id,
        });
      }
      const result = {
        feedback_recorded: true,
        classification: classification.classification,
        reason: classification.reason,
        decision_id: storedPending ? pending.decision_id : null,
        feedback_mode: feedbackMode,
        pattern_anchor: response?.pattern_anchor ?? null,
      };
      return textResult(
        env,
        result,
        [
          `feedback ${classification.classification} recorded`,
          `decision_id: ${pending.decision_id}`,
          response?.pattern_anchor?.credibility_state
            ? `pattern_state: ${response.pattern_anchor.credibility_state}`
            : null,
        ].filter(Boolean).join("\n"),
      );
    } catch (error) {
      if (error instanceof AionisMcpHttpError) {
        return textResult(env, { error: error.body }, formatHttpError(error), true);
      }
      return textResult(env, { error: String(error) }, `aionis_error: ${String(error)}`, true);
    }
  });

  handlers.set("aionis_finalize_task", async (rawArgs) => {
    const parsed = FinalizeTaskArgs.safeParse(rawArgs);
    if (!parsed.success) {
      return textResult(env, { error: parsed.error.flatten() }, `invalid_args: ${parsed.error.message}`, true);
    }
    const signal_kind = parsed.data.outcome === "success" ? "task_completed" : "task_blocked";
    return handlers.get("aionis_record_feedback")!({
      tenant_id: parsed.data.tenant_id,
      scope: parsed.data.scope,
      run_id: parsed.data.run_id,
      signal_kind,
      selected_tool: parsed.data.selected_tool,
      candidates: parsed.data.candidates,
      context: parsed.data.context,
      note: parsed.data.note,
    });
  });

  handlers.set("aionis_introspect", async (rawArgs) => {
    const parsed = IntrospectArgs.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return textResult(env, { error: parsed.error.flatten() }, `invalid_args: ${parsed.error.message}`, true);
    }
    try {
      const body = {
        ...parsed.data,
        scope: parsed.data.scope ?? env.AIONIS_SCOPE,
      };
      const response = await postJson<any>(env, "/v1/memory/execution/introspect", body);
      const summary = summarizeIntrospection(response);
      return textResult(env, summary.data, summary.text);
    } catch (error) {
      if (error instanceof AionisMcpHttpError) {
        return textResult(env, { error: error.body }, formatHttpError(error), true);
      }
      return textResult(env, { error: String(error) }, `aionis_error: ${String(error)}`, true);
    }
  });

  return {
    definitions,
    callTool: async (name: string, rawArgs: unknown) => {
      const handler = handlers.get(name);
      if (!handler) {
        return textResult(env, { error: "tool_not_found", tool_name: name }, `tool_not_found: ${name}`, true);
      }
      return await handler(rawArgs);
    },
    state,
  };
}
