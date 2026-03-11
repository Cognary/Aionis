export type ToolsLifecycleSummary = {
  summary_version: "tools_lifecycle_summary_v1";
  kind: "decision" | "run_lifecycle";
  lookup_mode?: "decision_id" | "run_id_latest";
  decision_id?: string | null;
  run_id?: string | null;
  decision_kind?: "tools_select";
  selected_tool?: string | null;
  candidate_count?: number;
  source_rule_count?: number;
  metadata_source?: string | null;
  created_at?: string | null;
  tool_conflicts?: string[];
  status?: "decision_recorded" | "feedback_linked";
  decision_count?: number;
  feedback_total?: number;
  tools_feedback_count?: number;
  latest_decision_at?: string | null;
  latest_feedback_at?: string | null;
  recent_decisions?: string[];
};

export type ToolsSelectionSummary = {
  summary_version: "tools_selection_summary_v1";
  selected_tool: string | null;
  candidate_count: number;
  allowed_count: number;
  denied_count: number;
  preferred_count: number;
  matched_rules: number;
  source_rule_count: number;
  fallback_applied: boolean;
  fallback_reason: string | null;
  shadow_selected_tool?: string | null;
  tool_conflicts?: string[];
};

export type RulesEvaluationSummary = {
  summary_version: "rules_evaluation_summary_v1";
  considered: number;
  matched: number;
  active_count: number;
  shadow_count: number;
  skipped_invalid_then: number;
  filtered_by_scope: number;
  filtered_by_lane: number;
  filtered_by_condition: number;
  lane_enforced: boolean;
  lane_reason: string | null;
  selected_tool?: string | null;
  allowed_tool_count?: number;
  denied_tool_count?: number;
  preferred_tool_count?: number;
  tool_conflicts?: string[];
};

type DecisionShape = {
  decision_id?: string | null;
  decision_kind?: "tools_select";
  run_id?: string | null;
  selected_tool?: string | null;
  candidates?: unknown;
  source_rule_ids?: unknown;
  metadata?: unknown;
  created_at?: string | null;
};

type RunLifecycleShape = {
  status?: "decision_recorded" | "feedback_linked";
  decision_count?: number;
  latest_decision_at?: string | null;
  latest_feedback_at?: string | null;
};

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function buildToolsDecisionLifecycleSummary(args: {
  lookup_mode?: "decision_id" | "run_id_latest";
  decision: DecisionShape;
}): ToolsLifecycleSummary {
  const decision = args.decision ?? {};
  const metadata = decision.metadata && typeof decision.metadata === "object" ? (decision.metadata as Record<string, unknown>) : {};
  const toolConflicts = safeStringArray(metadata.tool_conflicts_summary).slice(0, 3);
  return {
    summary_version: "tools_lifecycle_summary_v1",
    kind: "decision",
    lookup_mode: args.lookup_mode,
    decision_id: decision.decision_id ?? null,
    run_id: decision.run_id ?? null,
    decision_kind: decision.decision_kind,
    selected_tool: decision.selected_tool ?? null,
    candidate_count: safeStringArray(decision.candidates).length,
    source_rule_count: safeStringArray(decision.source_rule_ids).length,
    metadata_source: typeof metadata.source === "string" ? metadata.source : null,
    created_at: decision.created_at ?? null,
    tool_conflicts: toolConflicts,
  };
}

export function buildToolsRunLifecycleSummary(args: {
  run_id: string;
  lifecycle: RunLifecycleShape;
  decisions?: unknown;
  feedback?: unknown;
}): ToolsLifecycleSummary {
  const decisions = Array.isArray(args.decisions) ? args.decisions : [];
  const feedback = args.feedback && typeof args.feedback === "object" ? (args.feedback as Record<string, unknown>) : null;
  const recentDecisions = decisions
    .slice(0, 3)
    .map((decision) => {
      const item = decision && typeof decision === "object" ? (decision as Record<string, unknown>) : {};
      const selectedTool = typeof item.selected_tool === "string" ? item.selected_tool : "<none>";
      const createdAt = typeof item.created_at === "string" ? item.created_at : null;
      return createdAt ? `${selectedTool} @ ${createdAt}` : selectedTool;
    })
    .filter((entry) => entry.length > 0);

  return {
    summary_version: "tools_lifecycle_summary_v1",
    kind: "run_lifecycle",
    run_id: args.run_id,
    status: args.lifecycle.status,
    decision_count: Number(args.lifecycle.decision_count ?? decisions.length ?? 0),
    feedback_total: feedback ? Number(feedback.total ?? 0) : undefined,
    tools_feedback_count: feedback ? Number(feedback.tools_feedback_count ?? 0) : undefined,
    latest_decision_at: args.lifecycle.latest_decision_at ?? null,
    latest_feedback_at: args.lifecycle.latest_feedback_at ?? null,
    recent_decisions: recentDecisions,
  };
}

export function buildToolsSelectionSummary(args: {
  selection: {
    selected?: string | null;
    candidates?: unknown;
    allowed?: unknown;
    denied?: unknown;
    preferred?: unknown;
    fallback?: { applied?: boolean; reason?: string | null } | null;
  };
  rules: {
    matched?: number;
    tool_conflicts_summary?: unknown;
    shadow_selection?: { selected?: string | null } | null;
  };
  source_rule_ids?: unknown;
}): ToolsSelectionSummary {
  const selection = args.selection ?? {};
  const rules = args.rules ?? {};
  return {
    summary_version: "tools_selection_summary_v1",
    selected_tool: selection.selected ?? null,
    candidate_count: safeStringArray(selection.candidates).length,
    allowed_count: safeStringArray(selection.allowed).length,
    denied_count: Array.isArray(selection.denied) ? selection.denied.length : 0,
    preferred_count: safeStringArray(selection.preferred).length,
    matched_rules: Number(rules.matched ?? 0),
    source_rule_count: safeStringArray(args.source_rule_ids).length,
    fallback_applied: Boolean(selection.fallback?.applied),
    fallback_reason: selection.fallback?.reason ?? null,
    shadow_selected_tool: rules.shadow_selection?.selected ?? null,
    tool_conflicts: safeStringArray(rules.tool_conflicts_summary).slice(0, 3),
  };
}

export function buildRulesEvaluationSummary(args: {
  considered?: number;
  matched?: number;
  skipped_invalid_then?: number;
  active?: unknown;
  shadow?: unknown;
  agent_visibility_summary?: unknown;
  applied?: unknown;
}): RulesEvaluationSummary {
  const active = Array.isArray(args.active) ? args.active : [];
  const shadow = Array.isArray(args.shadow) ? args.shadow : [];
  const visibility =
    args.agent_visibility_summary && typeof args.agent_visibility_summary === "object"
      ? (args.agent_visibility_summary as Record<string, any>)
      : {};
  const ruleScope =
    visibility.rule_scope && typeof visibility.rule_scope === "object" ? visibility.rule_scope : {};
  const lane = visibility.lane && typeof visibility.lane === "object" ? visibility.lane : {};
  const applied = args.applied && typeof args.applied === "object" ? (args.applied as Record<string, any>) : {};
  const toolPolicy = applied.policy && typeof applied.policy === "object" ? applied.policy.tool ?? {} : {};
  const toolExplain = applied.tool_explain && typeof applied.tool_explain === "object" ? applied.tool_explain : {};

  return {
    summary_version: "rules_evaluation_summary_v1",
    considered: Number(args.considered ?? 0),
    matched: Number(args.matched ?? 0),
    active_count: active.length,
    shadow_count: shadow.length,
    skipped_invalid_then: Number(args.skipped_invalid_then ?? 0),
    filtered_by_scope: Number(ruleScope.filtered_by_scope ?? 0),
    filtered_by_lane: Number(ruleScope.filtered_by_lane ?? 0),
    filtered_by_condition: Number(ruleScope.filtered_by_condition ?? 0),
    lane_enforced: Boolean(lane.applied),
    lane_reason: typeof lane.reason === "string" ? lane.reason : null,
    selected_tool:
      Array.isArray(toolPolicy.prefer) && toolPolicy.prefer.length > 0
        ? String(toolPolicy.prefer[0])
        : Array.isArray(toolPolicy.allow) && toolPolicy.allow.length > 0
          ? String(toolPolicy.allow[0])
          : null,
    allowed_tool_count: Array.isArray(toolPolicy.allow) ? toolPolicy.allow.length : 0,
    denied_tool_count: Array.isArray(toolPolicy.deny) ? toolPolicy.deny.length : 0,
    preferred_tool_count: Array.isArray(toolPolicy.prefer) ? toolPolicy.prefer.length : 0,
    tool_conflicts: safeStringArray(toolExplain.conflicts?.map?.((entry: any) => entry?.message ?? null) ?? []).slice(0, 3),
  };
}
