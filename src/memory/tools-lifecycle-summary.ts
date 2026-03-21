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
  trusted_pattern_count: number;
  contested_pattern_count: number;
  suppressed_pattern_count: number;
  used_trusted_pattern_tools: string[];
  skipped_contested_pattern_tools: string[];
  skipped_suppressed_pattern_tools: string[];
  fallback_applied: boolean;
  fallback_reason: string | null;
  provenance_explanation: string | null;
  pattern_lifecycle_summary: {
    candidate_count: number;
    trusted_count: number;
    contested_count: number;
    near_promotion_count: number;
    counter_evidence_open_count: number;
    transition_counts: {
      candidate_observed: number;
      promoted_to_trusted: number;
      counter_evidence_opened: number;
      revalidated_to_trusted: number;
    };
  };
  pattern_maintenance_summary: {
    model: "lazy_online_v1";
    observe_count: number;
    retain_count: number;
    review_count: number;
    promote_candidate_count: number;
    review_counter_evidence_count: number;
    retain_trusted_count: number;
  };
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

function uniqueStrings(values: Array<string | null | undefined>, limit = 16): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

function buildSelectionProvenanceExplanation(args: {
  selectedTool: string | null;
  trustedPatternTools: string[];
  candidatePatternTools: string[];
  contestedPatternTools: string[];
  suppressedPatternTools: string[];
  fallbackApplied: boolean;
  fallbackReason: string | null;
}): string | null {
  const parts: string[] = [];
  if (args.selectedTool) {
    parts.push(`selected tool: ${args.selectedTool}`);
  }
  if (args.selectedTool && args.trustedPatternTools.includes(args.selectedTool)) {
    parts.push(`trusted pattern support: ${args.selectedTool}`);
  } else if (args.trustedPatternTools.length > 0) {
    parts.push(`trusted patterns available but not used: ${args.trustedPatternTools.join(", ")}`);
  }
  if (args.candidatePatternTools.length > 0) {
    parts.push(`candidate patterns visible but not yet trusted: ${args.candidatePatternTools.join(", ")}`);
  }
  if (args.contestedPatternTools.length > 0) {
    parts.push(`contested patterns visible but not trusted: ${args.contestedPatternTools.join(", ")}`);
  }
  if (args.suppressedPatternTools.length > 0) {
    parts.push(`suppressed patterns visible but operator-blocked: ${args.suppressedPatternTools.join(", ")}`);
  }
  if (args.fallbackApplied) {
    parts.push(`fallback applied${args.fallbackReason ? `: ${args.fallbackReason}` : ""}`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
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
  pattern_matches?: {
    trusted?: number;
    anchors?: Array<{
      selected_tool?: string | null;
      trusted?: boolean;
      suppressed?: boolean;
      credibility_state?: "candidate" | "trusted" | "contested" | null;
    }>;
  } | null;
  source_rule_ids?: unknown;
}): ToolsSelectionSummary {
  const selection = args.selection ?? {};
  const rules = args.rules ?? {};
  const selectedTool = typeof selection.selected === "string" ? selection.selected : null;
  const patternAnchors = Array.isArray(args.pattern_matches?.anchors) ? args.pattern_matches?.anchors : [];
  const trustedPatternTools = safeStringArray(
    patternAnchors
      .filter((anchor) => anchor?.trusted === true)
      .map((anchor) => anchor?.selected_tool ?? null),
  );
  const candidatePatternTools = uniqueStrings(
    patternAnchors
      .filter((anchor) => anchor?.trusted !== true && anchor?.credibility_state === "candidate")
      .map((anchor) => anchor?.selected_tool ?? null),
  );
  const candidatePatternCount = patternAnchors
    .filter((anchor) => anchor?.trusted !== true && anchor?.credibility_state === "candidate")
    .length;
  const contestedPatternTools = uniqueStrings(
    patternAnchors
      .filter((anchor) => anchor?.trusted !== true && anchor?.suppressed !== true && anchor?.credibility_state === "contested")
      .map((anchor) => anchor?.selected_tool ?? null),
  );
  const contestedPatternCount = patternAnchors
    .filter((anchor) => anchor?.trusted !== true && anchor?.suppressed !== true && anchor?.credibility_state === "contested")
    .length;
  const suppressedPatternTools = uniqueStrings(
    patternAnchors
      .filter((anchor) => anchor?.suppressed === true)
      .map((anchor) => anchor?.selected_tool ?? null),
  );
  const suppressedPatternCount = patternAnchors
    .filter((anchor) => anchor?.suppressed === true)
    .length;
  const fallbackApplied = Boolean(selection.fallback?.applied);
  const fallbackReason = selection.fallback?.reason ?? null;
  const transitionCounts = {
    candidate_observed: 0,
    promoted_to_trusted: 0,
    counter_evidence_opened: 0,
    revalidated_to_trusted: 0,
  };
  let nearPromotionCount = 0;
  let counterEvidenceOpenCount = 0;
  let observeCount = 0;
  let retainCount = 0;
  let reviewCount = 0;
  let promoteCandidateCount = 0;
  let reviewCounterEvidenceCount = 0;
  let retainTrustedCount = 0;
  for (const rawAnchor of patternAnchors) {
    const anchor = rawAnchor && typeof rawAnchor === "object" ? rawAnchor as Record<string, unknown> : {};
    const lastTransition = typeof anchor.last_transition === "string" ? anchor.last_transition.trim() : "";
    if (lastTransition === "candidate_observed") transitionCounts.candidate_observed += 1;
    else if (lastTransition === "promoted_to_trusted") transitionCounts.promoted_to_trusted += 1;
    else if (lastTransition === "counter_evidence_opened") transitionCounts.counter_evidence_opened += 1;
    else if (lastTransition === "revalidated_to_trusted") transitionCounts.revalidated_to_trusted += 1;
    if (anchor.counter_evidence_open === true) counterEvidenceOpenCount += 1;
    const maintenanceStateRaw = typeof anchor.maintenance_state === "string" ? anchor.maintenance_state.trim() : "";
    const offlinePriorityRaw = typeof anchor.offline_priority === "string" ? anchor.offline_priority.trim() : "";
    const credibilityState = typeof anchor.credibility_state === "string" ? anchor.credibility_state.trim() : "";
    const maintenanceState = maintenanceStateRaw || (
      credibilityState === "trusted"
        ? "retain"
        : credibilityState === "contested"
          ? "review"
          : "observe"
    );
    const offlinePriority = offlinePriorityRaw || (
      credibilityState === "trusted"
        ? "retain_trusted"
        : credibilityState === "contested"
          ? "review_counter_evidence"
          : "none"
    );
    if (maintenanceState === "observe") observeCount += 1;
    else if (maintenanceState === "retain") retainCount += 1;
    else if (maintenanceState === "review") reviewCount += 1;
    if (offlinePriority === "promote_candidate") promoteCandidateCount += 1;
    else if (offlinePriority === "review_counter_evidence") reviewCounterEvidenceCount += 1;
    else if (offlinePriority === "retain_trusted") retainTrustedCount += 1;
    const isCandidate = anchor.trusted !== true && anchor.credibility_state === "candidate";
    const distinctRunCount = Number(anchor.distinct_run_count);
    const requiredDistinctRuns = Number(anchor.required_distinct_runs);
    if (
      isCandidate
      && Number.isFinite(distinctRunCount)
      && Number.isFinite(requiredDistinctRuns)
      && requiredDistinctRuns > 0
      && distinctRunCount < requiredDistinctRuns
      && distinctRunCount >= (requiredDistinctRuns - 1)
    ) {
      nearPromotionCount += 1;
    }
  }
  return {
    summary_version: "tools_selection_summary_v1",
    selected_tool: selectedTool,
    candidate_count: safeStringArray(selection.candidates).length,
    allowed_count: safeStringArray(selection.allowed).length,
    denied_count: Array.isArray(selection.denied) ? selection.denied.length : 0,
    preferred_count: safeStringArray(selection.preferred).length,
    matched_rules: Number(rules.matched ?? 0),
    source_rule_count: safeStringArray(args.source_rule_ids).length,
    trusted_pattern_count: Number(args.pattern_matches?.trusted ?? trustedPatternTools.length ?? 0),
    contested_pattern_count: contestedPatternTools.length,
    suppressed_pattern_count: suppressedPatternCount,
    used_trusted_pattern_tools: selectedTool && trustedPatternTools.includes(selectedTool) ? [selectedTool] : [],
    skipped_contested_pattern_tools: contestedPatternTools,
    skipped_suppressed_pattern_tools: suppressedPatternTools,
    fallback_applied: fallbackApplied,
    fallback_reason: fallbackReason,
    provenance_explanation: buildSelectionProvenanceExplanation({
      selectedTool,
      trustedPatternTools,
      candidatePatternTools,
      contestedPatternTools,
      suppressedPatternTools,
      fallbackApplied,
      fallbackReason,
    }),
    pattern_lifecycle_summary: {
      candidate_count: candidatePatternCount,
      trusted_count: Number(args.pattern_matches?.trusted ?? trustedPatternTools.length ?? 0),
      contested_count: contestedPatternCount,
      near_promotion_count: nearPromotionCount,
      counter_evidence_open_count: counterEvidenceOpenCount,
      transition_counts: transitionCounts,
    },
    pattern_maintenance_summary: {
      model: "lazy_online_v1",
      observe_count: observeCount,
      retain_count: retainCount,
      review_count: reviewCount,
      promote_candidate_count: promoteCandidateCount,
      review_counter_evidence_count: reviewCounterEvidenceCount,
      retain_trusted_count: retainTrustedCount,
    },
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
