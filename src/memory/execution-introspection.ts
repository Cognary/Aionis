import {
  buildExecutionMemorySummaryBundle,
  summarizePatternSignalSurface,
  summarizeWorkflowMaintenanceSurface,
  summarizeWorkflowSignalSurface,
  summarizePatternMaintenanceSurface,
} from "../app/planning-summary.js";
import {
  ExecutionMemoryIntrospectionRequest,
  type ExecutionMemoryIntrospectionResponse,
} from "./schemas.js";
import type { LiteExecutionNativeNodeRow, LiteWriteStore } from "../store/lite-write-store.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const next = typeof value === "string" ? value.trim() : "";
    if (next) return next;
  }
  return null;
}

function toNodeUri(tenantId: string, scope: string, type: string, id: string): string {
  return `aionis://${tenantId}/${scope}/${type}/${id}`;
}

function dedupeByAnchorId<T extends { anchor_id?: string | null }>(items: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const anchorId = typeof item.anchor_id === "string" ? item.anchor_id.trim() : "";
    if (!anchorId || seen.has(anchorId)) continue;
    seen.add(anchorId);
    out.push(item);
  }
  return out;
}

function toWorkflowEntry(row: LiteExecutionNativeNodeRow, tenantId: string, scope: string) {
  const slots = asRecord(row.slots);
  const execution = asRecord(slots.execution_native_v1);
  const anchor = asRecord(slots.anchor_v1);
  const workflowPromotion = asRecord(execution.workflow_promotion ?? anchor.workflow_promotion);
  const maintenance = asRecord(execution.maintenance ?? anchor.maintenance);
  const rehydration = asRecord(execution.rehydration ?? anchor.rehydration);
  const observedCount = Number(workflowPromotion.observed_count ?? Number.NaN);
  const requiredObservations = Number(workflowPromotion.required_observations ?? Number.NaN);
  const promotionReady =
    firstString(workflowPromotion.promotion_state) === "candidate"
    && Number.isFinite(observedCount)
    && Number.isFinite(requiredObservations)
    && requiredObservations > 0
    && observedCount >= requiredObservations;
  return {
    anchor_id: row.id,
    uri: toNodeUri(tenantId, scope, row.type, row.id),
    type: row.type,
    title: firstString(row.title),
    summary: firstString(row.text_summary, anchor.summary),
    anchor_level: firstString(execution.anchor_level, anchor.anchor_level),
    source_kind: firstString(anchor?.source && asRecord(anchor.source).source_kind),
    promotion_origin: firstString(workflowPromotion.promotion_origin),
    promotion_state: firstString(workflowPromotion.promotion_state),
    observed_count: Number.isFinite(observedCount) ? observedCount : null,
    required_observations: Number.isFinite(requiredObservations) ? requiredObservations : null,
    promotion_ready: promotionReady,
    last_transition: firstString(workflowPromotion.last_transition),
    last_transition_at: firstString(workflowPromotion.last_transition_at),
    rehydration_default_mode: firstString(rehydration.default_mode),
    tool_set: Array.isArray(anchor.tool_set) ? anchor.tool_set.filter((v): v is string => typeof v === "string") : [],
    maintenance_state: firstString(maintenance.maintenance_state),
    offline_priority: firstString(maintenance.offline_priority),
    last_maintenance_at: firstString(maintenance.last_maintenance_at),
    workflow_signature: firstString(execution.workflow_signature, anchor.workflow_signature),
    confidence: row.confidence,
  };
}

function toPatternEntry(row: LiteExecutionNativeNodeRow, tenantId: string, scope: string) {
  const slots = asRecord(row.slots);
  const execution = asRecord(slots.execution_native_v1);
  const anchor = asRecord(slots.anchor_v1);
  const promotion = asRecord(execution.promotion ?? anchor.promotion);
  const maintenance = asRecord(execution.maintenance ?? anchor.maintenance);
  const credibilityState = firstString(execution.credibility_state, anchor.credibility_state, promotion.credibility_state) ?? "candidate";
  const distinctRunCount = Number(promotion.distinct_run_count ?? Number.NaN);
  const requiredDistinctRuns = Number(promotion.required_distinct_runs ?? Number.NaN);
  const counterEvidenceCount = Number(promotion.counter_evidence_count ?? Number.NaN);
  const counterEvidenceOpen = promotion.counter_evidence_open === true;
  return {
    anchor_id: row.id,
    uri: toNodeUri(tenantId, scope, row.type, row.id),
    type: row.type,
    title: firstString(row.title),
    summary: firstString(row.text_summary, anchor.summary),
    anchor_level: firstString(execution.anchor_level, anchor.anchor_level),
    selected_tool: firstString(execution.selected_tool, anchor.selected_tool),
    pattern_state: firstString(execution.pattern_state, anchor.pattern_state) ?? "provisional",
    credibility_state: credibilityState,
    trusted: credibilityState === "trusted",
    distinct_run_count: Number.isFinite(distinctRunCount) ? distinctRunCount : null,
    required_distinct_runs: Number.isFinite(requiredDistinctRuns) ? requiredDistinctRuns : null,
    counter_evidence_count: Number.isFinite(counterEvidenceCount) ? counterEvidenceCount : null,
    counter_evidence_open: counterEvidenceOpen,
    last_transition: firstString(promotion.last_transition),
    maintenance_state: firstString(maintenance.maintenance_state),
    offline_priority: firstString(maintenance.offline_priority),
    last_maintenance_at: firstString(maintenance.last_maintenance_at),
    confidence: row.confidence,
  };
}

function toPatternSignal(entry: ReturnType<typeof toPatternEntry>) {
  return {
    anchor_id: entry.anchor_id,
    anchor_level: entry.anchor_level,
    selected_tool: entry.selected_tool,
    pattern_state: entry.pattern_state,
    credibility_state: entry.credibility_state,
    trusted: entry.trusted,
    distinct_run_count: entry.distinct_run_count,
    required_distinct_runs: entry.required_distinct_runs,
    counter_evidence_count: entry.counter_evidence_count,
    counter_evidence_open: entry.counter_evidence_open,
    last_transition: entry.last_transition,
    summary: entry.summary,
  };
}

function toWorkflowSignal(entry: ReturnType<typeof toWorkflowEntry>) {
  return {
    anchor_id: entry.anchor_id,
    anchor_level: entry.anchor_level,
    title: entry.title,
    summary: entry.summary,
    promotion_state: entry.promotion_state === "stable" ? "stable" : "candidate",
    promotion_ready: entry.promotion_ready,
    observed_count: entry.observed_count,
    required_observations: entry.required_observations,
    source_kind: entry.source_kind,
    promotion_origin: entry.promotion_origin,
    last_transition: entry.last_transition,
    maintenance_state: entry.maintenance_state,
    offline_priority: entry.offline_priority,
    last_maintenance_at: entry.last_maintenance_at,
  };
}

function buildDemoSurface(args: {
  workflowSignalSummary: ReturnType<typeof summarizeWorkflowSignalSurface>;
  patternSignalSummary: ReturnType<typeof summarizePatternSignalSurface>;
  workflowMaintenanceSummary: ReturnType<typeof summarizeWorkflowMaintenanceSurface>;
  patternMaintenanceSummary: ReturnType<typeof summarizePatternMaintenanceSurface>;
  recommendedWorkflows: Array<ReturnType<typeof toWorkflowEntry>>;
  candidateWorkflows: Array<ReturnType<typeof toWorkflowEntry>>;
  trustedPatterns: Array<ReturnType<typeof toPatternEntry>>;
  candidatePatterns: Array<ReturnType<typeof toPatternEntry>>;
  contestedPatterns: Array<ReturnType<typeof toPatternEntry>>;
}) {
  const workflowLines = [
    ...args.recommendedWorkflows.slice(0, 6).map((entry) => {
      const title = entry.title ?? entry.summary ?? entry.anchor_id;
      return `stable workflow: ${title}; source=${entry.source_kind ?? "unknown"}; transition=${entry.last_transition ?? "unknown"}; maintenance=${entry.maintenance_state ?? "unknown"}`;
    }),
    ...args.candidateWorkflows.slice(0, 6).map((entry) => {
      const title = entry.title ?? entry.summary ?? entry.anchor_id;
      const observed = (
        Number.isFinite(entry.observed_count ?? Number.NaN)
        && Number.isFinite(entry.required_observations ?? Number.NaN)
      )
        ? `observed=${entry.observed_count}/${entry.required_observations}`
        : "observed=unknown";
      return `candidate workflow: ${title}; ${observed}; promotion=${entry.promotion_ready ? "ready" : "observing"}; maintenance=${entry.maintenance_state ?? "unknown"}`;
    }),
  ];
  const patternLines = [
    ...args.trustedPatterns.slice(0, 6).map((entry) => `trusted pattern: prefer ${entry.selected_tool ?? "unknown"}; summary=${entry.summary ?? entry.anchor_id}; maintenance=${entry.maintenance_state ?? "unknown"}`),
    ...args.candidatePatterns.slice(0, 6).map((entry) => `candidate pattern: prefer ${entry.selected_tool ?? "unknown"}; summary=${entry.summary ?? entry.anchor_id}; maintenance=${entry.maintenance_state ?? "unknown"}`),
    ...args.contestedPatterns.slice(0, 6).map((entry) => `contested pattern: prefer ${entry.selected_tool ?? "unknown"}; summary=${entry.summary ?? entry.anchor_id}; maintenance=${entry.maintenance_state ?? "unknown"}`),
  ];
  const maintenanceLines = [
    `workflow maintenance: retain=${args.workflowMaintenanceSummary.retain_count}; observe=${args.workflowMaintenanceSummary.observe_count}; promote_candidate=${args.workflowMaintenanceSummary.promote_candidate_count}`,
    `pattern maintenance: retain=${args.patternMaintenanceSummary.retain_count}; observe=${args.patternMaintenanceSummary.observe_count}; review=${args.patternMaintenanceSummary.review_count}; promote_candidate=${args.patternMaintenanceSummary.promote_candidate_count}`,
  ];
  const headline = [
    `stable workflows=${args.workflowSignalSummary.stable_workflow_count}`,
    `promotion-ready workflows=${args.workflowSignalSummary.promotion_ready_workflow_count}`,
    `trusted patterns=${args.patternSignalSummary.trusted_pattern_count}`,
    `contested patterns=${args.patternSignalSummary.contested_pattern_count}`,
  ].join("; ");
  const mergedText = [
    `# Execution Memory Demo`,
    headline,
    workflowLines.length > 0 ? `# Workflows\n${workflowLines.map((line) => `- ${line}`).join("\n")}` : "",
    patternLines.length > 0 ? `# Patterns\n${patternLines.map((line) => `- ${line}`).join("\n")}` : "",
    `# Maintenance\n${maintenanceLines.map((line) => `- ${line}`).join("\n")}`,
  ].filter(Boolean).join("\n");
  return {
    surface_version: "execution_memory_demo_v1" as const,
    headline,
    sections: {
      workflows: workflowLines,
      patterns: patternLines,
      maintenance: maintenanceLines,
    },
    merged_text: mergedText,
  };
}

export async function buildExecutionMemoryIntrospectionLite(
  liteWriteStore: LiteWriteStore,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  defaultActorId: string,
): Promise<ExecutionMemoryIntrospectionResponse> {
  const parsed = ExecutionMemoryIntrospectionRequest.parse(body);
  const scope = parsed.scope ?? defaultScope;
  const tenantId = parsed.tenant_id ?? defaultTenantId;
  const consumerAgentId = parsed.consumer_agent_id ?? defaultActorId;
  const consumerTeamId = parsed.consumer_team_id ?? null;
  const limit = parsed.limit;

  const [workflowAnchors, workflowCandidates, patternAnchors] = await Promise.all([
    liteWriteStore.findExecutionNativeNodes({
      scope,
      executionKind: "workflow_anchor",
      consumerAgentId,
      consumerTeamId,
      limit,
      offset: 0,
    }),
    liteWriteStore.findExecutionNativeNodes({
      scope,
      executionKind: "workflow_candidate",
      consumerAgentId,
      consumerTeamId,
      limit,
      offset: 0,
    }),
    liteWriteStore.findExecutionNativeNodes({
      scope,
      executionKind: "pattern_anchor",
      consumerAgentId,
      consumerTeamId,
      limit,
      offset: 0,
    }),
  ]);

  const recommendedWorkflows = dedupeByAnchorId(
    workflowAnchors.rows.map((row) => toWorkflowEntry(row, tenantId, scope)),
  );
  const stableWorkflowSignatures = new Set(
    recommendedWorkflows
      .map((entry) => entry.workflow_signature)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const rawCandidateWorkflows = dedupeByAnchorId(
    workflowCandidates.rows.map((row) => toWorkflowEntry(row, tenantId, scope)),
  );
  const candidateWorkflows = rawCandidateWorkflows.filter((entry) => !entry.workflow_signature || !stableWorkflowSignatures.has(entry.workflow_signature));
  const suppressedCandidateWorkflowCount = rawCandidateWorkflows.length - candidateWorkflows.length;

  const patternEntries = dedupeByAnchorId(
    patternAnchors.rows.map((row) => toPatternEntry(row, tenantId, scope)),
  );
  const candidatePatterns = patternEntries.filter((entry) => entry.credibility_state === "candidate");
  const trustedPatterns = patternEntries.filter((entry) => entry.credibility_state === "trusted");
  const contestedPatterns = patternEntries.filter((entry) => entry.credibility_state === "contested" || entry.counter_evidence_open === true);

  const rehydrationCandidates = recommendedWorkflows
    .filter((entry) => entry.rehydration_default_mode)
    .map((entry) => ({
      anchor_id: entry.anchor_id,
      anchor_uri: entry.uri,
      anchor_kind: "workflow",
      anchor_level: entry.anchor_level,
      title: entry.title,
      summary: entry.summary,
      mode: entry.rehydration_default_mode,
      payload_cost_hint: "medium",
      recommended_when: [],
      trusted: false,
      selected_tool: null,
      example_call: `rehydrate_payload(anchor_id='${entry.anchor_id}', mode='${entry.rehydration_default_mode}')`,
    }));
  const patternSignals = patternEntries.map((entry) => toPatternSignal(entry));
  const workflowSignals = [
    ...recommendedWorkflows.map((entry) => toWorkflowSignal(entry)),
    ...candidateWorkflows.map((entry) => toWorkflowSignal(entry)),
  ];
  const surface = {
    action_recall_packet: {
      packet_version: "action_recall_v1" as const,
      recommended_workflows: recommendedWorkflows,
      candidate_workflows: candidateWorkflows,
      candidate_patterns: candidatePatterns,
      trusted_patterns: trustedPatterns,
      contested_patterns: contestedPatterns,
      rehydration_candidates: rehydrationCandidates,
      supporting_knowledge: [],
    },
    recommended_workflows: recommendedWorkflows,
    candidate_workflows: candidateWorkflows,
    candidate_patterns: candidatePatterns,
    trusted_patterns: trustedPatterns,
    contested_patterns: contestedPatterns,
    rehydration_candidates: rehydrationCandidates,
    supporting_knowledge: [],
    pattern_signals: patternSignals,
    workflow_signals: workflowSignals,
  };
  const summaryBundle = buildExecutionMemorySummaryBundle(surface);
  const demoSurface = buildDemoSurface({
    workflowSignalSummary: summaryBundle.workflow_signal_summary,
    patternSignalSummary: summaryBundle.pattern_signal_summary,
    workflowMaintenanceSummary: summaryBundle.workflow_maintenance_summary,
    patternMaintenanceSummary: summaryBundle.pattern_maintenance_summary,
    recommendedWorkflows,
    candidateWorkflows,
    trustedPatterns,
    candidatePatterns,
    contestedPatterns,
  });

  return {
    summary_version: "execution_memory_introspection_v1",
    tenant_id: tenantId,
    scope,
    inventory: {
      raw_workflow_anchor_count: workflowAnchors.rows.length,
      raw_workflow_candidate_count: rawCandidateWorkflows.length,
      suppressed_candidate_workflow_count: suppressedCandidateWorkflowCount,
      raw_pattern_anchor_count: patternAnchors.rows.length,
    },
    demo_surface: demoSurface,
    recommended_workflows: recommendedWorkflows,
    candidate_workflows: candidateWorkflows,
    candidate_patterns: candidatePatterns,
    trusted_patterns: trustedPatterns,
    contested_patterns: contestedPatterns,
    rehydration_candidates: rehydrationCandidates,
    pattern_signals: patternSignals,
    workflow_signals: workflowSignals,
    ...summaryBundle,
  };
}
