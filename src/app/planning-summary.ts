export type PlanningSummary = {
  summary_version: "planning_summary_v1";
  planner_explanation: string | null;
  selected_tool: string | null;
  decision_id: string | null;
  rules_considered: number;
  rules_matched: number;
  context_est_tokens: number;
  layered_output: boolean;
  forgotten_items: number;
  static_blocks_selected: number;
  selected_memory_layers: string[];
  optimization_profile: "balanced" | "aggressive" | null;
  context_compaction_profile: "balanced" | "aggressive";
  recall_mode?: string | null;
  trusted_pattern_count: number;
  contested_pattern_count: number;
  trusted_pattern_tools: string[];
  contested_pattern_tools: string[];
  workflow_signal_summary: WorkflowSignalSummary;
  action_packet_summary: ActionPacketSummary;
  workflow_lifecycle_summary: WorkflowLifecycleSummary;
  workflow_maintenance_summary: WorkflowMaintenanceSummary;
  pattern_lifecycle_summary: PatternLifecycleSummary;
  pattern_maintenance_summary: PatternMaintenanceSummary;
  primary_savings_levers: string[];
};

export type AssemblySummary = {
  summary_version: "assembly_summary_v1";
  planner_explanation: string | null;
  selected_tool: string | null;
  decision_id: string | null;
  rules_considered: number;
  rules_matched: number;
  include_rules: boolean;
  context_est_tokens: number;
  layered_output: boolean;
  forgotten_items: number;
  static_blocks_selected: number;
  selected_memory_layers: string[];
  optimization_profile: "balanced" | "aggressive" | null;
  context_compaction_profile: "balanced" | "aggressive";
  recall_mode?: string | null;
  trusted_pattern_count: number;
  contested_pattern_count: number;
  trusted_pattern_tools: string[];
  contested_pattern_tools: string[];
  workflow_signal_summary: WorkflowSignalSummary;
  action_packet_summary: ActionPacketSummary;
  workflow_lifecycle_summary: WorkflowLifecycleSummary;
  workflow_maintenance_summary: WorkflowMaintenanceSummary;
  pattern_lifecycle_summary: PatternLifecycleSummary;
  pattern_maintenance_summary: PatternMaintenanceSummary;
  primary_savings_levers: string[];
};

type PatternSignalSummary = {
  candidate_pattern_count: number;
  candidate_pattern_tools: string[];
  trusted_pattern_count: number;
  contested_pattern_count: number;
  trusted_pattern_tools: string[];
  contested_pattern_tools: string[];
};

export type WorkflowSignalSummary = {
  stable_workflow_count: number;
  promotion_ready_workflow_count: number;
  observing_workflow_count: number;
  stable_workflow_titles: string[];
  promotion_ready_workflow_titles: string[];
  observing_workflow_titles: string[];
};

type PlannerPacketSummarySurface = {
  action_recall_packet?: unknown;
  pattern_signals?: unknown;
  workflow_signals?: unknown;
  recommended_workflows?: unknown;
  candidate_workflows?: unknown;
  candidate_patterns?: unknown;
  trusted_patterns?: unknown;
  contested_patterns?: unknown;
  rehydration_candidates?: unknown;
  supporting_knowledge?: unknown;
};

export type PatternLifecycleSummary = {
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

export type PatternMaintenanceSummary = {
  model: "lazy_online_v1";
  observe_count: number;
  retain_count: number;
  review_count: number;
  promote_candidate_count: number;
  review_counter_evidence_count: number;
  retain_trusted_count: number;
};

export type WorkflowLifecycleSummary = {
  candidate_count: number;
  stable_count: number;
  replay_source_count: number;
  rehydration_ready_count: number;
  promotion_ready_count: number;
  transition_counts: {
    candidate_observed: number;
    promoted_to_stable: number;
    normalized_latest_stable: number;
  };
};

export type WorkflowMaintenanceSummary = {
  model: "lazy_online_v1";
  observe_count: number;
  retain_count: number;
  promote_candidate_count: number;
  retain_workflow_count: number;
};

export type ActionPacketSummary = {
  recommended_workflow_count: number;
  candidate_workflow_count: number;
  candidate_pattern_count: number;
  trusted_pattern_count: number;
  contested_pattern_count: number;
  rehydration_candidate_count: number;
  supporting_knowledge_count: number;
  workflow_anchor_ids: string[];
  candidate_workflow_anchor_ids: string[];
  candidate_pattern_anchor_ids: string[];
  trusted_pattern_anchor_ids: string[];
  contested_pattern_anchor_ids: string[];
  rehydration_anchor_ids: string[];
};

export type ExecutionMemorySummaryBundle = {
  pattern_signal_summary: PatternSignalSummary;
  workflow_signal_summary: WorkflowSignalSummary;
  workflow_lifecycle_summary: WorkflowLifecycleSummary;
  workflow_maintenance_summary: WorkflowMaintenanceSummary;
  pattern_lifecycle_summary: PatternLifecycleSummary;
  pattern_maintenance_summary: PatternMaintenanceSummary;
  action_packet_summary: ActionPacketSummary;
};

function uniqueStrings(values: unknown[], limit = 16): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const next = typeof value === "string" ? value.trim() : "";
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    if (out.length >= limit) break;
  }
  return out;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function safeRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function summarizePacketEntryLabels(entries: Array<Record<string, unknown>>, field: "title" | "summary", limit = 3): string[] {
  return uniqueStrings(
    entries.map((entry) => {
      const primary = typeof entry[field] === "string" ? entry[field] : "";
      const fallback = typeof entry.title === "string" ? entry.title : typeof entry.summary === "string" ? entry.summary : "";
      return (primary || fallback).trim();
    }),
    limit,
  );
}

function collectPatternEntriesFromSurface(surface: PlannerPacketSummarySurface) {
  const packet =
    surface.action_recall_packet && typeof surface.action_recall_packet === "object"
      ? (surface.action_recall_packet as Record<string, unknown>)
      : {};
  const candidatePatterns = Array.isArray(surface.candidate_patterns)
    ? surface.candidate_patterns
    : Array.isArray(packet.candidate_patterns)
      ? packet.candidate_patterns
      : [];
  const trustedPatterns = Array.isArray(surface.trusted_patterns)
    ? surface.trusted_patterns
    : Array.isArray(packet.trusted_patterns)
      ? packet.trusted_patterns
      : [];
  const contestedPatterns = Array.isArray(surface.contested_patterns)
    ? surface.contested_patterns
    : Array.isArray(packet.contested_patterns)
      ? packet.contested_patterns
      : [];
  return { candidatePatterns, trustedPatterns, contestedPatterns };
}

function collectWorkflowEntriesFromSurface(surface: PlannerPacketSummarySurface) {
  const packet =
    surface.action_recall_packet && typeof surface.action_recall_packet === "object"
      ? (surface.action_recall_packet as Record<string, unknown>)
      : {};
  const recommendedWorkflows = Array.isArray(surface.recommended_workflows)
    ? surface.recommended_workflows
    : Array.isArray(packet.recommended_workflows)
      ? packet.recommended_workflows
      : [];
  const candidateWorkflows = Array.isArray(surface.candidate_workflows)
    ? surface.candidate_workflows
    : Array.isArray(packet.candidate_workflows)
      ? packet.candidate_workflows
      : [];
  return { recommendedWorkflows, candidateWorkflows };
}

function isPromotionReadyWorkflowSignal(entry: Record<string, unknown>): boolean {
  if (entry.promotion_ready === true) return true;
  const promotionState = typeof entry.promotion_state === "string" ? entry.promotion_state.trim() : "";
  const observedCount = Number(entry.observed_count ?? NaN);
  const requiredObservations = Number(entry.required_observations ?? NaN);
  return (
    promotionState === "candidate"
    && Number.isFinite(observedCount)
    && Number.isFinite(requiredObservations)
    && observedCount >= requiredObservations
  );
}

function buildPlannerExplanation(args: {
  selectedTool: string | null;
  decision: Record<string, unknown>;
  patternSignalSummary: PatternSignalSummary;
  plannerSurface: PlannerPacketSummarySurface;
  actionPacketSummary: ActionPacketSummary;
  workflowLifecycleSummary: WorkflowLifecycleSummary;
}): string | null {
  const patternSummary =
    args.decision.pattern_summary && typeof args.decision.pattern_summary === "object"
      ? (args.decision.pattern_summary as Record<string, unknown>)
      : {};
  const actionPacket =
    args.plannerSurface.action_recall_packet && typeof args.plannerSurface.action_recall_packet === "object"
      ? (args.plannerSurface.action_recall_packet as Record<string, unknown>)
      : {};
  const workflowLabels = summarizePacketEntryLabels(safeRecordArray(actionPacket.recommended_workflows), "title");
  const candidateWorkflowEntries = safeRecordArray(actionPacket.candidate_workflows);
  const candidateWorkflowLabels = summarizePacketEntryLabels(candidateWorkflowEntries, "title");
  const readyCandidateWorkflowLabels = summarizePacketEntryLabels(
    candidateWorkflowEntries.filter((entry) => isPromotionReadyWorkflowSignal(entry)),
    "title",
  );
  const rehydrationLabels = summarizePacketEntryLabels(safeRecordArray(actionPacket.rehydration_candidates), "title");
  const usedTrustedPatternTools = uniqueStrings(safeStringArray(patternSummary.used_trusted_pattern_tools));
  const skippedContestedPatternTools = uniqueStrings(safeStringArray(patternSummary.skipped_contested_pattern_tools));
  const selectedTool = args.selectedTool;
  if (
    !selectedTool
    && usedTrustedPatternTools.length === 0
    && skippedContestedPatternTools.length === 0
    && args.actionPacketSummary.recommended_workflow_count === 0
    && args.actionPacketSummary.candidate_workflow_count === 0
    && args.actionPacketSummary.rehydration_candidate_count === 0
    && args.actionPacketSummary.supporting_knowledge_count === 0
  ) {
    return null;
  }
  const parts: string[] = [];
  if (args.actionPacketSummary.recommended_workflow_count > 0) {
    const workflowLead =
      workflowLabels.length > 0
        ? `workflow guidance: ${workflowLabels.join(", ")}`
        : `workflow guidance: ${args.actionPacketSummary.recommended_workflow_count} recommended`;
    parts.push(workflowLead);
  }
  if (args.actionPacketSummary.candidate_workflow_count > 0) {
    if (args.workflowLifecycleSummary.promotion_ready_count > 0) {
      const readyWorkflowLead =
        readyCandidateWorkflowLabels.length > 0
          ? `promotion-ready workflow candidates: ${readyCandidateWorkflowLabels.join(", ")}`
          : `promotion-ready workflow candidates: ${args.workflowLifecycleSummary.promotion_ready_count}`;
      parts.push(readyWorkflowLead);
    }
    const remainingCandidateCount = Math.max(
      0,
      args.actionPacketSummary.candidate_workflow_count - args.workflowLifecycleSummary.promotion_ready_count,
    );
    if (remainingCandidateCount > 0) {
      const nonReadyCandidateLabels = summarizePacketEntryLabels(
        candidateWorkflowEntries.filter((entry) => !isPromotionReadyWorkflowSignal(entry)),
        "title",
      );
      const candidateWorkflowLead =
        nonReadyCandidateLabels.length > 0
          ? `candidate workflows visible but not yet promoted: ${nonReadyCandidateLabels.join(", ")}`
          : candidateWorkflowLabels.length > 0
            ? `candidate workflows visible but not yet promoted: ${candidateWorkflowLabels.join(", ")}`
            : `candidate workflows visible but not yet promoted: ${remainingCandidateCount}`;
      parts.push(candidateWorkflowLead);
    }
  }
  if (selectedTool) {
    parts.push(`selected tool: ${selectedTool}`);
  }
  if (usedTrustedPatternTools.length > 0) {
    parts.push(`trusted pattern support: ${usedTrustedPatternTools.join(", ")}`);
  } else if (args.patternSignalSummary.trusted_pattern_count > 0) {
    parts.push(`trusted patterns available but not used: ${args.patternSignalSummary.trusted_pattern_tools.join(", ")}`);
  }
  if (args.patternSignalSummary.candidate_pattern_count > 0) {
    parts.push(`candidate patterns visible but not yet trusted: ${args.patternSignalSummary.candidate_pattern_tools.join(", ")}`);
  }
  if (skippedContestedPatternTools.length > 0) {
    parts.push(`contested patterns visible but not trusted: ${skippedContestedPatternTools.join(", ")}`);
  } else if (args.patternSignalSummary.contested_pattern_count > 0) {
    parts.push(`contested patterns visible but not trusted: ${args.patternSignalSummary.contested_pattern_tools.join(", ")}`);
  }
  if (args.actionPacketSummary.rehydration_candidate_count > 0) {
    const rehydrationLead =
      rehydrationLabels.length > 0
        ? `rehydration available: ${rehydrationLabels.join(", ")}`
        : `rehydration available: ${args.actionPacketSummary.rehydration_candidate_count} candidate`;
    parts.push(rehydrationLead);
  }
  if (args.actionPacketSummary.supporting_knowledge_count > 0) {
    parts.push(`supporting knowledge appended: ${args.actionPacketSummary.supporting_knowledge_count}`);
  }
  if (parts.length === 0) return null;
  return parts.join("; ");
}

export function summarizePatternSignals(layeredContext: unknown): PatternSignalSummary {
  const layered =
    layeredContext && typeof layeredContext === "object"
      ? (layeredContext as Record<string, unknown>)
      : {};
  return summarizePatternSignalSurface({
    action_recall_packet: layered.action_recall_packet,
    pattern_signals: layered.pattern_signals,
    candidate_patterns: layered.candidate_patterns,
    trusted_patterns: layered.trusted_patterns,
    contested_patterns: layered.contested_patterns,
  });
}

export function summarizePatternSignalSurface(surface: PlannerPacketSummarySurface): PatternSignalSummary {
  const { candidatePatterns, trustedPatterns, contestedPatterns } = collectPatternEntriesFromSurface(surface);
  if (
    candidatePatterns.length > 0
    || trustedPatterns.length > 0
    || contestedPatterns.length > 0
    || !!surface.action_recall_packet
  ) {
    return {
      candidate_pattern_count: candidatePatterns.length,
      candidate_pattern_tools: uniqueStrings(candidatePatterns.map((entry: any) => entry?.selected_tool)),
      trusted_pattern_count: trustedPatterns.length,
      contested_pattern_count: contestedPatterns.length,
      trusted_pattern_tools: uniqueStrings(trustedPatterns.map((entry: any) => entry?.selected_tool)),
      contested_pattern_tools: uniqueStrings(contestedPatterns.map((entry: any) => entry?.selected_tool)),
    };
  }
  const patternSignals = Array.isArray(surface.pattern_signals) && surface.pattern_signals.length > 0
    ? surface.pattern_signals
    : null;
  if (!patternSignals) {
    return {
      candidate_pattern_count: candidatePatterns.length,
      candidate_pattern_tools: uniqueStrings(candidatePatterns.map((entry: any) => entry?.selected_tool)),
      trusted_pattern_count: trustedPatterns.length,
      contested_pattern_count: contestedPatterns.length,
      trusted_pattern_tools: uniqueStrings(trustedPatterns.map((entry: any) => entry?.selected_tool)),
      contested_pattern_tools: uniqueStrings(contestedPatterns.map((entry: any) => entry?.selected_tool)),
    };
  }
  const mergedSignals = patternSignals.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  const candidate = mergedSignals.filter(
    (entry) =>
      (entry as Record<string, unknown>).trusted !== true
      && (
        (entry as Record<string, unknown>).credibility_state === "candidate"
        || (
          (entry as Record<string, unknown>).credibility_state == null
          && (entry as Record<string, unknown>).counter_evidence_open !== true
        )
      ),
  ) as Array<Record<string, unknown>>;
  const trusted = mergedSignals.filter(
    (entry) => (entry as Record<string, unknown>).trusted === true,
  ) as Array<Record<string, unknown>>;
  const contested = mergedSignals.filter(
    (entry) =>
      (
        (entry as Record<string, unknown>).credibility_state === "contested"
        || (entry as Record<string, unknown>).counter_evidence_open === true
      ),
  ) as Array<Record<string, unknown>>;
  return {
    candidate_pattern_count: candidate.length,
    candidate_pattern_tools: uniqueStrings(candidate.map((entry) => entry.selected_tool)),
    trusted_pattern_count: trusted.length,
    contested_pattern_count: contested.length,
    trusted_pattern_tools: uniqueStrings(trusted.map((entry) => entry.selected_tool)),
    contested_pattern_tools: uniqueStrings(contested.map((entry) => entry.selected_tool)),
  };
}

export function summarizeWorkflowSignalSurface(surface: PlannerPacketSummarySurface): WorkflowSignalSummary {
  const { recommendedWorkflows, candidateWorkflows } = collectWorkflowEntriesFromSurface(surface);
  const stable = recommendedWorkflows.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  const candidate = candidateWorkflows.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  const ready = candidate.filter((entry) => isPromotionReadyWorkflowSignal(entry));
  const observing = candidate.filter((entry) => !isPromotionReadyWorkflowSignal(entry));
  return {
    stable_workflow_count: stable.length,
    promotion_ready_workflow_count: ready.length,
    observing_workflow_count: observing.length,
    stable_workflow_titles: summarizePacketEntryLabels(stable, "title", 6),
    promotion_ready_workflow_titles: summarizePacketEntryLabels(ready, "title", 6),
    observing_workflow_titles: summarizePacketEntryLabels(observing, "title", 6),
  };
}

export function summarizePatternLifecycleSurface(surface: PlannerPacketSummarySurface): PatternLifecycleSummary {
  const { candidatePatterns, trustedPatterns, contestedPatterns } = collectPatternEntriesFromSurface(surface);
  const all = [...candidatePatterns, ...trustedPatterns, ...contestedPatterns]
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  const transitionCounts = {
    candidate_observed: 0,
    promoted_to_trusted: 0,
    counter_evidence_opened: 0,
    revalidated_to_trusted: 0,
  };
  let nearPromotionCount = 0;
  let counterEvidenceOpenCount = 0;
  for (const entry of all) {
    const lastTransition = typeof entry.last_transition === "string" ? entry.last_transition.trim() : "";
    if (lastTransition === "candidate_observed") transitionCounts.candidate_observed += 1;
    else if (lastTransition === "promoted_to_trusted") transitionCounts.promoted_to_trusted += 1;
    else if (lastTransition === "counter_evidence_opened") transitionCounts.counter_evidence_opened += 1;
    else if (lastTransition === "revalidated_to_trusted") transitionCounts.revalidated_to_trusted += 1;
    if (entry.counter_evidence_open === true) counterEvidenceOpenCount += 1;
  }
  for (const rawEntry of candidatePatterns) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;
    const distinctRunCount = Number(entry.distinct_run_count);
    const requiredDistinctRuns = Number(entry.required_distinct_runs);
    if (
      Number.isFinite(distinctRunCount)
      && Number.isFinite(requiredDistinctRuns)
      && requiredDistinctRuns > 0
      && distinctRunCount < requiredDistinctRuns
      && distinctRunCount >= (requiredDistinctRuns - 1)
    ) {
      nearPromotionCount += 1;
    }
  }
  return {
    candidate_count: candidatePatterns.length,
    trusted_count: trustedPatterns.length,
    contested_count: contestedPatterns.length,
    near_promotion_count: nearPromotionCount,
    counter_evidence_open_count: counterEvidenceOpenCount,
    transition_counts: transitionCounts,
  };
}

export function summarizePatternMaintenanceSurface(surface: PlannerPacketSummarySurface): PatternMaintenanceSummary {
  const { candidatePatterns, trustedPatterns, contestedPatterns } = collectPatternEntriesFromSurface(surface);
  const all = [...candidatePatterns, ...trustedPatterns, ...contestedPatterns]
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  let observeCount = 0;
  let retainCount = 0;
  let reviewCount = 0;
  let promoteCandidateCount = 0;
  let reviewCounterEvidenceCount = 0;
  let retainTrustedCount = 0;
  for (const entry of all) {
    const maintenanceStateRaw = typeof entry.maintenance_state === "string" ? entry.maintenance_state.trim() : "";
    const offlinePriorityRaw = typeof entry.offline_priority === "string" ? entry.offline_priority.trim() : "";
    const credibilityState = typeof entry.credibility_state === "string" ? entry.credibility_state.trim() : "";
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
  }
  return {
    model: "lazy_online_v1",
    observe_count: observeCount,
    retain_count: retainCount,
    review_count: reviewCount,
    promote_candidate_count: promoteCandidateCount,
    review_counter_evidence_count: reviewCounterEvidenceCount,
    retain_trusted_count: retainTrustedCount,
  };
}

export function summarizeWorkflowLifecycleSurface(surface: PlannerPacketSummarySurface): WorkflowLifecycleSummary {
  const packet =
    surface.action_recall_packet && typeof surface.action_recall_packet === "object"
      ? (surface.action_recall_packet as Record<string, unknown>)
      : {};
  const candidateWorkflows = Array.isArray(surface.candidate_workflows)
    ? surface.candidate_workflows
    : Array.isArray(packet.candidate_workflows)
      ? packet.candidate_workflows
      : [];
  const recommendedWorkflows = Array.isArray(surface.recommended_workflows)
    ? surface.recommended_workflows
    : Array.isArray(packet.recommended_workflows)
      ? packet.recommended_workflows
      : [];
  const workflows = [...candidateWorkflows, ...recommendedWorkflows]
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  let replaySourceCount = 0;
  let rehydrationReadyCount = 0;
  let promotionReadyCount = 0;
  const transitionCounts = {
    candidate_observed: 0,
    promoted_to_stable: 0,
    normalized_latest_stable: 0,
  };
  for (const entry of workflows) {
    const sourceKind = typeof entry.source_kind === "string" ? entry.source_kind.trim() : "";
    const defaultMode = typeof entry.rehydration_default_mode === "string" ? entry.rehydration_default_mode.trim() : "";
    const lastTransition = typeof entry.last_transition === "string" ? entry.last_transition.trim() : "";
    const promotionState = typeof entry.promotion_state === "string" ? entry.promotion_state.trim() : "";
    const observedCount = Number(entry.observed_count ?? NaN);
    const requiredObservations = Number(entry.required_observations ?? NaN);
    if (sourceKind === "playbook") replaySourceCount += 1;
    if (defaultMode === "summary_only" || defaultMode === "partial" || defaultMode === "full") rehydrationReadyCount += 1;
    if (
      promotionState === "candidate"
      && Number.isFinite(observedCount)
      && Number.isFinite(requiredObservations)
      && observedCount >= requiredObservations
    ) {
      promotionReadyCount += 1;
    }
    if (lastTransition === "candidate_observed") transitionCounts.candidate_observed += 1;
    else if (lastTransition === "promoted_to_stable") transitionCounts.promoted_to_stable += 1;
    else if (lastTransition === "normalized_latest_stable") transitionCounts.normalized_latest_stable += 1;
  }
  return {
    candidate_count: candidateWorkflows.length,
    stable_count: recommendedWorkflows.length,
    replay_source_count: replaySourceCount,
    rehydration_ready_count: rehydrationReadyCount,
    promotion_ready_count: promotionReadyCount,
    transition_counts: transitionCounts,
  };
}

export function summarizeWorkflowMaintenanceSurface(surface: PlannerPacketSummarySurface): WorkflowMaintenanceSummary {
  const packet =
    surface.action_recall_packet && typeof surface.action_recall_packet === "object"
      ? (surface.action_recall_packet as Record<string, unknown>)
      : {};
  const candidateWorkflows = Array.isArray(surface.candidate_workflows)
    ? surface.candidate_workflows
    : Array.isArray(packet.candidate_workflows)
      ? packet.candidate_workflows
      : [];
  const recommendedWorkflows = Array.isArray(surface.recommended_workflows)
    ? surface.recommended_workflows
    : Array.isArray(packet.recommended_workflows)
      ? packet.recommended_workflows
      : [];
  const workflows = [...candidateWorkflows, ...recommendedWorkflows]
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  let observeCount = 0;
  let retainCount = 0;
  let promoteCandidateCount = 0;
  let retainWorkflowCount = 0;
  for (const entry of workflows) {
    const maintenanceState = typeof entry.maintenance_state === "string" ? entry.maintenance_state.trim() : "";
    const offlinePriority = typeof entry.offline_priority === "string" ? entry.offline_priority.trim() : "";
    const promotionState = typeof entry.promotion_state === "string" ? entry.promotion_state.trim() : "";
    const normalizedState = maintenanceState || (promotionState === "candidate" ? "observe" : "retain");
    const normalizedPriority = offlinePriority || (promotionState === "candidate" ? "promote_candidate" : "retain_workflow");
    if (normalizedState === "observe") observeCount += 1;
    if (normalizedState === "retain") retainCount += 1;
    if (normalizedPriority === "promote_candidate") promoteCandidateCount += 1;
    if (normalizedPriority === "retain_workflow") retainWorkflowCount += 1;
  }
  return {
    model: "lazy_online_v1",
    observe_count: observeCount,
    retain_count: retainCount,
    promote_candidate_count: promoteCandidateCount,
    retain_workflow_count: retainWorkflowCount,
  };
}

export function summarizeActionRecallPacket(layeredContext: unknown): ActionPacketSummary {
  const layered =
    layeredContext && typeof layeredContext === "object"
      ? (layeredContext as Record<string, unknown>)
      : {};
  return summarizeActionRecallPacketSurface({ action_recall_packet: layered.action_recall_packet });
}

export function summarizeActionRecallPacketSurface(surface: PlannerPacketSummarySurface): ActionPacketSummary {
  const packet =
    surface.action_recall_packet && typeof surface.action_recall_packet === "object"
      ? (surface.action_recall_packet as Record<string, unknown>)
      : {};
  const recommendedWorkflows = Array.isArray(surface.recommended_workflows)
    ? surface.recommended_workflows
    : Array.isArray(packet.recommended_workflows)
      ? packet.recommended_workflows
      : [];
  const candidateWorkflows = Array.isArray(surface.candidate_workflows)
    ? surface.candidate_workflows
    : Array.isArray(packet.candidate_workflows)
      ? packet.candidate_workflows
      : [];
  const candidatePatterns = Array.isArray(surface.candidate_patterns)
    ? surface.candidate_patterns
    : Array.isArray(packet.candidate_patterns)
      ? packet.candidate_patterns
      : [];
  const trustedPatterns = Array.isArray(surface.trusted_patterns)
    ? surface.trusted_patterns
    : Array.isArray(packet.trusted_patterns)
      ? packet.trusted_patterns
      : [];
  const contestedPatterns = Array.isArray(surface.contested_patterns)
    ? surface.contested_patterns
    : Array.isArray(packet.contested_patterns)
      ? packet.contested_patterns
      : [];
  const rehydrationCandidates = Array.isArray(surface.rehydration_candidates)
    ? surface.rehydration_candidates
    : Array.isArray(packet.rehydration_candidates)
      ? packet.rehydration_candidates
      : [];
  const supportingKnowledge = Array.isArray(surface.supporting_knowledge)
    ? surface.supporting_knowledge
    : Array.isArray(packet.supporting_knowledge)
      ? packet.supporting_knowledge
      : [];
  return {
    recommended_workflow_count: recommendedWorkflows.length,
    candidate_workflow_count: candidateWorkflows.length,
    candidate_pattern_count: candidatePatterns.length,
    trusted_pattern_count: trustedPatterns.length,
    contested_pattern_count: contestedPatterns.length,
    rehydration_candidate_count: rehydrationCandidates.length,
    supporting_knowledge_count: supportingKnowledge.length,
    workflow_anchor_ids: uniqueStrings(recommendedWorkflows.map((entry: any) => entry?.anchor_id)),
    candidate_workflow_anchor_ids: uniqueStrings(candidateWorkflows.map((entry: any) => entry?.anchor_id)),
    candidate_pattern_anchor_ids: uniqueStrings(candidatePatterns.map((entry: any) => entry?.anchor_id)),
    trusted_pattern_anchor_ids: uniqueStrings(trustedPatterns.map((entry: any) => entry?.anchor_id)),
    contested_pattern_anchor_ids: uniqueStrings(contestedPatterns.map((entry: any) => entry?.anchor_id)),
    rehydration_anchor_ids: uniqueStrings(rehydrationCandidates.map((entry: any) => entry?.anchor_id)),
  };
}

export function buildExecutionMemorySummaryBundle(surface: PlannerPacketSummarySurface): ExecutionMemorySummaryBundle {
  return {
    pattern_signal_summary: summarizePatternSignalSurface(surface),
    workflow_signal_summary: summarizeWorkflowSignalSurface(surface),
    workflow_lifecycle_summary: summarizeWorkflowLifecycleSurface(surface),
    workflow_maintenance_summary: summarizeWorkflowMaintenanceSurface(surface),
    pattern_lifecycle_summary: summarizePatternLifecycleSurface(surface),
    pattern_maintenance_summary: summarizePatternMaintenanceSurface(surface),
    action_packet_summary: summarizeActionRecallPacketSurface(surface),
  };
}

export function buildPlanningSummary(args: {
  rules?: unknown;
  tools?: unknown;
  layered_context?: unknown;
  planner_surface?: PlannerPacketSummarySurface;
  cost_signals?: unknown;
  context_est_tokens: number;
  context_compaction_profile: "balanced" | "aggressive";
  optimization_profile: "balanced" | "aggressive" | null;
  recall_mode?: string | null;
}): PlanningSummary {
  const rules = args.rules && typeof args.rules === "object" ? (args.rules as Record<string, unknown>) : {};
  const tools = args.tools && typeof args.tools === "object" ? (args.tools as Record<string, unknown>) : {};
  const decision = tools.decision && typeof tools.decision === "object" ? (tools.decision as Record<string, unknown>) : {};
  const layeredContext =
    args.layered_context && typeof args.layered_context === "object"
      ? (args.layered_context as Record<string, unknown>)
      : {};
  const layeredStats =
    layeredContext.stats && typeof layeredContext.stats === "object"
      ? (layeredContext.stats as Record<string, unknown>)
      : {};
  const staticInjection =
    layeredContext.static_injection && typeof layeredContext.static_injection === "object"
      ? (layeredContext.static_injection as Record<string, unknown>)
      : {};
  const costSignals =
    args.cost_signals && typeof args.cost_signals === "object" ? (args.cost_signals as Record<string, unknown>) : {};
  const plannerSurface = args.planner_surface ?? {
    action_recall_packet: layeredContext.action_recall_packet,
    pattern_signals: layeredContext.pattern_signals,
    workflow_signals: layeredContext.workflow_signals,
    recommended_workflows: layeredContext.recommended_workflows,
    candidate_workflows: layeredContext.candidate_workflows,
    candidate_patterns: layeredContext.candidate_patterns,
    trusted_patterns: layeredContext.trusted_patterns,
    contested_patterns: layeredContext.contested_patterns,
    rehydration_candidates: layeredContext.rehydration_candidates,
    supporting_knowledge: layeredContext.supporting_knowledge,
  };
  const summaryBundle = buildExecutionMemorySummaryBundle(plannerSurface);
  const patternSignalSummary = summaryBundle.pattern_signal_summary;
  const workflowSignalSummary = summaryBundle.workflow_signal_summary;
  const actionPacketSummary = summaryBundle.action_packet_summary;
  const workflowLifecycleSummary = summaryBundle.workflow_lifecycle_summary;
  const workflowMaintenanceSummary = summaryBundle.workflow_maintenance_summary;
  const patternLifecycleSummary = summaryBundle.pattern_lifecycle_summary;
  const patternMaintenanceSummary = summaryBundle.pattern_maintenance_summary;

  return {
    summary_version: "planning_summary_v1",
    planner_explanation: buildPlannerExplanation({
      selectedTool:
        typeof tools.selection === "object" && tools.selection && typeof (tools.selection as any).selected === "string"
          ? (tools.selection as any).selected
          : null,
      decision,
      patternSignalSummary,
      plannerSurface,
      actionPacketSummary,
      workflowLifecycleSummary,
    }),
    selected_tool: typeof tools.selection === "object" && tools.selection && typeof (tools.selection as any).selected === "string"
      ? (tools.selection as any).selected
      : null,
    decision_id: typeof decision.decision_id === "string" ? decision.decision_id : null,
    rules_considered: Number(rules.considered ?? 0),
    rules_matched: Number(rules.matched ?? 0),
    context_est_tokens: args.context_est_tokens,
    layered_output: Boolean(args.layered_context),
    forgotten_items: Number(costSignals.forgotten_items ?? layeredStats.forgotten_items ?? 0),
    static_blocks_selected: Number(costSignals.static_blocks_selected ?? staticInjection.selected_blocks ?? 0),
    selected_memory_layers: Array.isArray(costSignals.selected_memory_layers)
      ? costSignals.selected_memory_layers.filter((entry): entry is string => typeof entry === "string")
      : [],
    optimization_profile: args.optimization_profile,
    context_compaction_profile: args.context_compaction_profile,
    recall_mode: args.recall_mode ?? null,
    trusted_pattern_count: patternSignalSummary.trusted_pattern_count,
    contested_pattern_count: patternSignalSummary.contested_pattern_count,
    trusted_pattern_tools: patternSignalSummary.trusted_pattern_tools,
    contested_pattern_tools: patternSignalSummary.contested_pattern_tools,
    workflow_signal_summary: workflowSignalSummary,
    action_packet_summary: actionPacketSummary,
    workflow_lifecycle_summary: workflowLifecycleSummary,
    workflow_maintenance_summary: workflowMaintenanceSummary,
    pattern_lifecycle_summary: patternLifecycleSummary,
    pattern_maintenance_summary: patternMaintenanceSummary,
    primary_savings_levers: Array.isArray(costSignals.primary_savings_levers)
      ? costSignals.primary_savings_levers.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

export function buildAssemblySummary(args: {
  rules?: unknown;
  tools?: unknown;
  layered_context?: unknown;
  planner_surface?: PlannerPacketSummarySurface;
  cost_signals?: unknown;
  context_est_tokens: number;
  context_compaction_profile: "balanced" | "aggressive";
  optimization_profile: "balanced" | "aggressive" | null;
  recall_mode?: string | null;
  include_rules: boolean;
}): AssemblySummary {
  const planning = buildPlanningSummary({
    rules: args.rules,
    tools: args.tools,
    layered_context: args.layered_context,
    planner_surface: args.planner_surface,
    cost_signals: args.cost_signals,
    context_est_tokens: args.context_est_tokens,
    context_compaction_profile: args.context_compaction_profile,
    optimization_profile: args.optimization_profile,
    recall_mode: args.recall_mode,
  });
  return {
    summary_version: "assembly_summary_v1",
    planner_explanation: planning.planner_explanation,
    selected_tool: planning.selected_tool,
    decision_id: planning.decision_id,
    rules_considered: planning.rules_considered,
    rules_matched: planning.rules_matched,
    include_rules: args.include_rules,
    context_est_tokens: planning.context_est_tokens,
    layered_output: planning.layered_output,
    forgotten_items: planning.forgotten_items,
    static_blocks_selected: planning.static_blocks_selected,
    selected_memory_layers: planning.selected_memory_layers,
    optimization_profile: planning.optimization_profile,
    context_compaction_profile: planning.context_compaction_profile,
    recall_mode: planning.recall_mode,
    trusted_pattern_count: planning.trusted_pattern_count,
    contested_pattern_count: planning.contested_pattern_count,
    trusted_pattern_tools: planning.trusted_pattern_tools,
    contested_pattern_tools: planning.contested_pattern_tools,
    workflow_signal_summary: planning.workflow_signal_summary,
    action_packet_summary: planning.action_packet_summary,
    workflow_lifecycle_summary: planning.workflow_lifecycle_summary,
    workflow_maintenance_summary: planning.workflow_maintenance_summary,
    pattern_lifecycle_summary: planning.pattern_lifecycle_summary,
    pattern_maintenance_summary: planning.pattern_maintenance_summary,
    primary_savings_levers: planning.primary_savings_levers,
  };
}
