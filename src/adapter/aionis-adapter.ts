import type { AionisMcpEnv } from "../mcp/client.js";
import { postAionisJson } from "../mcp/client.js";
import {
  AdapterTaskStartedSchema,
  AdapterTaskTerminalOutcomeSchema,
  AdapterToolExecutedSchema,
  AdapterToolSelectionRequestedSchema,
  type AdapterTaskStarted,
  type AdapterTaskTerminalOutcome,
  type AdapterToolExecuted,
  type AdapterToolSelectionRequested,
} from "./contracts.js";
import {
  AionisAdapterSessionState,
  type AdapterPlanningSnapshot,
  type AdapterSelectionSnapshot,
  type AdapterTaskSession,
} from "./session-state.js";

type PostJsonLike = <TResponse = unknown>(env: AionisMcpEnv, path: string, body: unknown) => Promise<TResponse>;

export type CreateAionisExecutionAdapterArgs = {
  env: AionisMcpEnv;
  state?: AionisAdapterSessionState;
  postJson?: PostJsonLike;
};

function summarizePlanningContext(response: any): AdapterPlanningSnapshot {
  return {
    tenant_id: response?.tenant_id ?? null,
    scope: response?.scope ?? null,
    recommended_workflow_count: Array.isArray(response?.planner_packet?.sections?.recommended_workflows)
      ? response.planner_packet.sections.recommended_workflows.length
      : 0,
    candidate_workflow_count: Array.isArray(response?.planner_packet?.sections?.candidate_workflows)
      ? response.planner_packet.sections.candidate_workflows.length
      : 0,
    trusted_pattern_count: Number(response?.planning_summary?.trusted_pattern_count ?? 0),
    contested_pattern_count: Number(response?.planning_summary?.contested_pattern_count ?? 0),
    planner_explanation: typeof response?.planning_summary?.planner_explanation === "string"
      ? response.planning_summary.planner_explanation
      : null,
    workflow_signals: Array.isArray(response?.workflow_signals) ? response.workflow_signals : [],
    pattern_signals: Array.isArray(response?.pattern_signals) ? response.pattern_signals : [],
    execution_kernel: response?.execution_kernel ?? {},
  };
}

function summarizeToolSelection(response: any): AdapterSelectionSnapshot {
  return {
    tenant_id: response?.tenant_id ?? null,
    scope: response?.scope ?? null,
    selected_tool: typeof response?.selection?.selected === "string" ? response.selection.selected : null,
    ordered: Array.isArray(response?.selection?.ordered) ? response.selection.ordered : [],
    preferred: Array.isArray(response?.selection?.preferred) ? response.selection.preferred : [],
    decision_id: typeof response?.decision?.decision_id === "string" ? response.decision.decision_id : null,
    decision_uri: typeof response?.decision?.decision_uri === "string" ? response.decision.decision_uri : null,
    run_id: typeof response?.decision?.run_id === "string" ? response.decision.run_id : null,
    provenance_explanation: typeof response?.selection_summary?.provenance_explanation === "string"
      ? response.selection_summary.provenance_explanation
      : null,
    used_trusted_pattern_tools: Array.isArray(response?.selection_summary?.used_trusted_pattern_tools)
      ? response.selection_summary.used_trusted_pattern_tools
      : [],
    used_trusted_pattern_affinity_levels: Array.isArray(response?.selection_summary?.used_trusted_pattern_affinity_levels)
      ? response.selection_summary.used_trusted_pattern_affinity_levels
      : [],
  };
}

export class AionisExecutionAdapter {
  readonly env: AionisMcpEnv;
  readonly state: AionisAdapterSessionState;
  private readonly postJson: PostJsonLike;

  constructor(args: CreateAionisExecutionAdapterArgs) {
    this.env = args.env;
    this.state = args.state ?? new AionisAdapterSessionState();
    this.postJson = args.postJson ?? postAionisJson;
  }

  async beginTask(rawInput: AdapterTaskStarted): Promise<{ session: AdapterTaskSession; planning: AdapterPlanningSnapshot }> {
    const input = AdapterTaskStartedSchema.parse(rawInput);
    const session: AdapterTaskSession = {
      task_id: input.task_id,
      tenant_id: input.tenant_id ?? null,
      scope: input.scope ?? this.env.AIONIS_SCOPE,
      query_text: input.query_text,
      context: input.context,
      tool_candidates: input.tool_candidates ?? [],
      planning: null,
      last_selection: null,
      recent_outcomes: [],
      terminal_event_type: null,
    };
    this.state.upsertTask(session);
    const response = await this.postJson<any>(this.env, "/v1/memory/planning/context", {
      tenant_id: input.tenant_id,
      scope: input.scope ?? this.env.AIONIS_SCOPE,
      query_text: input.query_text,
      context: input.context,
      tool_candidates: input.tool_candidates,
      run_id: input.task_id,
      consumer_agent_id: input.consumer_agent_id,
      consumer_team_id: input.consumer_team_id,
      rules_limit: input.rules_limit,
      limit: input.limit,
    });
    const planning = summarizePlanningContext(response);
    const next = this.state.setPlanning(input.task_id, planning) ?? session;
    return { session: next, planning };
  }

  async beforeToolUse(rawInput: AdapterToolSelectionRequested): Promise<{ session: AdapterTaskSession; selection: AdapterSelectionSnapshot }> {
    const input = AdapterToolSelectionRequestedSchema.parse(rawInput);
    const existing = this.state.getTask(input.task_id);
    const context = Object.prototype.hasOwnProperty.call(input, "context")
      ? input.context
      : existing?.context ?? {};
    const response = await this.postJson<any>(this.env, "/v1/memory/tools/select", {
      tenant_id: input.tenant_id ?? existing?.tenant_id ?? undefined,
      scope: input.scope ?? existing?.scope ?? this.env.AIONIS_SCOPE,
      run_id: input.task_id,
      context,
      candidates: input.candidates,
      include_shadow: input.include_shadow,
      rules_limit: input.rules_limit,
      strict: input.strict,
      reorder_candidates: input.reorder_candidates,
    });
    const selection = summarizeToolSelection(response);
    const fallbackSession: AdapterTaskSession = existing ?? {
      task_id: input.task_id,
      tenant_id: input.tenant_id ?? null,
      scope: input.scope ?? this.env.AIONIS_SCOPE,
      query_text: "",
      context,
      tool_candidates: input.candidates,
      planning: null,
      last_selection: null,
      recent_outcomes: [],
      terminal_event_type: null,
    };
    if (!existing) this.state.upsertTask(fallbackSession);
    const next = this.state.setLastSelection(input.task_id, selection) ?? fallbackSession;
    return { session: next, selection };
  }

  async recordToolOutcome(rawInput: AdapterToolExecuted): Promise<{
    session: AdapterTaskSession;
    classification: "positive" | "negative" | "abstain";
    recorded: boolean;
    reason: string;
    pattern_anchor: unknown | null;
  }> {
    const input = AdapterToolExecutedSchema.parse(rawInput);
    const existing = this.state.getTask(input.task_id);
    const scope = existing?.scope ?? this.env.AIONIS_SCOPE;
    const tenant_id = existing?.tenant_id ?? null;
    const selected_tool = input.selected_tool;
    const candidates = input.candidates;
    const context = input.context;
    const decision_id = existing?.last_selection?.decision_id ?? null;

    let classification: "positive" | "negative" | "abstain" = "abstain";
    let reason = "ambiguous execution outcome; adapter abstains";

    if (input.reverted === true) {
      classification = "negative";
      reason = "selected tool path was explicitly reverted";
    } else if (selected_tool === "edit") {
      if (input.validated === true) {
        classification = "positive";
        reason = "edit step reached a validated success boundary";
      } else {
        classification = "abstain";
        reason = "edit step is waiting for validation";
      }
    } else if ((selected_tool === "bash" || selected_tool === "test") && typeof input.command_exit_code === "number") {
      if (input.command_exit_code === 0) {
        classification = "positive";
        reason = "command-like step completed successfully";
      } else {
        classification = "abstain";
        reason = "non-zero exit alone is not enough for automatic negative feedback";
      }
    }

    let pattern_anchor: unknown | null = null;
    let recorded = false;
    if (classification !== "abstain") {
      const response = await this.postJson<any>(this.env, "/v1/memory/tools/feedback", {
        tenant_id: tenant_id ?? undefined,
        scope,
        run_id: input.task_id,
        decision_id: decision_id ?? undefined,
        outcome: classification,
        context,
        candidates,
        selected_tool,
        target: "all",
        note: input.note,
        input_text: `adapter ${classification} feedback via ${input.event_type}${input.note ? `: ${input.note}` : ""}`,
      });
      pattern_anchor = response?.pattern_anchor ?? null;
      recorded = true;
    }

    const baseSession: AdapterTaskSession = existing ?? {
      task_id: input.task_id,
      tenant_id,
      scope,
      query_text: "",
      context,
      tool_candidates: candidates,
      planning: null,
      last_selection: null,
      recent_outcomes: [],
      terminal_event_type: null,
    };
    if (!existing) this.state.upsertTask(baseSession);
    const next = this.state.appendOutcome(input.task_id, {
      step_id: input.step_id,
      selected_tool,
      classification,
      recorded,
    }) ?? baseSession;

    return { session: next, classification, recorded, reason, pattern_anchor };
  }

  async finalizeTask(rawInput: AdapterTaskTerminalOutcome): Promise<{
    session: AdapterTaskSession;
    classification: "positive" | "negative" | "abstain";
    recorded: boolean;
    reason: string;
    pattern_anchor: unknown | null;
    skipped_duplicate_finalization: boolean;
  }> {
    const input = AdapterTaskTerminalOutcomeSchema.parse(rawInput);
    const existing = this.state.getTask(input.task_id);
    const scope = input.scope ?? existing?.scope ?? this.env.AIONIS_SCOPE;
    const tenant_id = input.tenant_id ?? existing?.tenant_id ?? null;
    const selected_tool = input.selected_tool ?? existing?.last_selection?.selected_tool ?? undefined;
    const candidates = input.candidates ?? existing?.tool_candidates;
    const context = Object.prototype.hasOwnProperty.call(input, "context")
      ? input.context
      : existing?.context;

    const baseSession: AdapterTaskSession = existing ?? {
      task_id: input.task_id,
      tenant_id,
      scope,
      query_text: "",
      context: context ?? {},
      tool_candidates: candidates ?? [],
      planning: null,
      last_selection: null,
      recent_outcomes: [],
      terminal_event_type: null,
    };
    if (!existing) this.state.upsertTask(baseSession);

    if (this.state.isTerminal(input.task_id)) {
      return {
        session: this.state.getTask(input.task_id) ?? baseSession,
        classification: "abstain",
        recorded: false,
        reason: "task already finalized",
        pattern_anchor: null,
        skipped_duplicate_finalization: true,
      };
    }

    let classification: "positive" | "negative" | "abstain" = "abstain";
    let reason = "abandoned tasks do not auto-record feedback";
    if (input.event_type === "task_completed") {
      classification = "positive";
      reason = "task reached a successful terminal boundary";
    } else if (input.event_type === "task_blocked" || input.event_type === "task_failed") {
      classification = "negative";
      reason = "task reached a negative terminal boundary";
    }

    let pattern_anchor: unknown | null = null;
    let recorded = false;
    if (classification !== "abstain" && selected_tool && candidates && context !== undefined) {
      const response = await this.postJson<any>(this.env, "/v1/memory/tools/feedback", {
        tenant_id: tenant_id ?? undefined,
        scope,
        run_id: input.task_id,
        decision_id: existing?.last_selection?.decision_id ?? undefined,
        outcome: classification,
        context,
        candidates,
        selected_tool,
        target: "all",
        note: input.note,
        input_text: `adapter ${classification} finalization via ${input.event_type}${input.note ? `: ${input.note}` : ""}`,
      });
      pattern_anchor = response?.pattern_anchor ?? null;
      recorded = true;
    } else if (classification !== "abstain") {
      reason = "task reached a terminal boundary but explicit execution evidence was insufficient";
    }

    const next = this.state.markTerminal(input.task_id, input.event_type) ?? baseSession;
    return { session: next, classification, recorded, reason, pattern_anchor, skipped_duplicate_finalization: false };
  }
}

export function createAionisExecutionAdapter(args: CreateAionisExecutionAdapterArgs): AionisExecutionAdapter {
  return new AionisExecutionAdapter(args);
}
