import type {
  ExecutionEvalVariantRecord,
  OpenClawRealWorkflowCase,
  OpenClawRealWorkflowSummary,
} from "./types.js";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasContinuityCarrier(caseArm: OpenClawRealWorkflowCase["baseline"]): boolean {
  return (caseArm.handoff_store_count ?? 0) > 0
    || (caseArm.context_assemble_count ?? 0) > 0
    || (caseArm.tools_select_count ?? 0) > 0;
}

function scoreControlQuality(caseArm: OpenClawRealWorkflowCase["baseline"]): number {
  const broad = caseArm.broad_tool_call_count ?? 0;
  const rediscovery = caseArm.rediscovery_reads ?? 0;
  const extraTools = Math.max(0, (caseArm.tool_call_count ?? 0) - 4);
  return clamp01(1 - (0.35 * broad) - (0.2 * rediscovery) - (0.05 * extraTools));
}

function deriveVariantSecondaryMetrics(summaryArm: OpenClawRealWorkflowSummary["baseline"]) {
  return {
    avg_total_tokens: asNumber(summaryArm.avg_total_tokens ?? null),
    avg_wall_clock_ms: asNumber(summaryArm.avg_wall_clock_ms ?? null),
    avg_tool_call_count: asNumber(summaryArm.avg_tool_call_count ?? null),
    avg_broad_tool_call_count: asNumber(summaryArm.avg_broad_tool_call_count ?? null),
    avg_rediscovery_reads: asNumber(summaryArm.avg_rediscovery_reads ?? null),
    avg_handoff_store_count: asNumber(summaryArm.avg_handoff_store_count ?? null),
    avg_context_assemble_count: asNumber(summaryArm.avg_context_assemble_count ?? null),
    avg_tools_select_count: asNumber(summaryArm.avg_tools_select_count ?? null),
  };
}

export function buildOpenClawWorkflowVariantEval(args: {
  suiteId: string;
  caseGroupId: string;
  variant: "baseline" | "treatment";
  summary: OpenClawRealWorkflowSummary;
  cases: OpenClawRealWorkflowCase[];
  artifactRefs: {
    summary_json: string;
    cases_jsonl: string | null;
  };
}): ExecutionEvalVariantRecord {
  const summaryArm = args.summary[args.variant];
  const caseArms = args.cases.map((entry) => entry[args.variant]);
  const continuityCarrierRate = average(caseArms.map((caseArm) => (hasContinuityCarrier(caseArm) ? 1 : 0)));
  const recoveryEligible = caseArms.filter((caseArm) => hasContinuityCarrier(caseArm));
  const recoveryScore = recoveryEligible.length === 0
    ? 0
    : average(recoveryEligible.map((caseArm) => ((caseArm.workflow_completed || caseArm.reviewer_ready) ? 1 : 0)));
  const handoffUsageRate = average(caseArms.map((caseArm) => ((caseArm.handoff_store_count ?? 0) > 0 ? 1 : 0)));
  const contextAssembleUsageRate = average(caseArms.map((caseArm) => ((caseArm.context_assemble_count ?? 0) > 0 ? 1 : 0)));
  const toolsSelectUsageRate = average(caseArms.map((caseArm) => ((caseArm.tools_select_count ?? 0) > 0 ? 1 : 0)));
  const controlQuality = average(caseArms.map((caseArm) => scoreControlQuality(caseArm)));

  const dimensionScores = {
    completion: round(clamp01(summaryArm.workflow_completed_rate)),
    reviewer_readiness: round(clamp01(summaryArm.reviewer_ready_rate)),
    continuity: round(clamp01(continuityCarrierRate)),
    recovery: round(clamp01(recoveryScore)),
    control_quality: round(clamp01(controlQuality)),
  };

  return {
    eval_version: "execution_eval_v1",
    suite_id: args.suiteId,
    case_group_id: args.caseGroupId,
    variant: args.variant,
    result: (dimensionScores.completion >= 0.5 || dimensionScores.reviewer_readiness >= 0.5) ? "pass" : "fail",
    dimension_scores: dimensionScores,
    secondary_metrics: deriveVariantSecondaryMetrics(summaryArm),
    decision_summary: {
      continuity_mode: args.summary.continuity_mode ?? null,
      continuity_carrier_rate: round(clamp01(continuityCarrierRate)),
      recovery_eligible_runs: recoveryEligible.length,
      handoff_usage_rate: round(clamp01(handoffUsageRate)),
      context_assemble_usage_rate: round(clamp01(contextAssembleUsageRate)),
      tools_select_usage_rate: round(clamp01(toolsSelectUsageRate)),
    },
    artifact_refs: args.artifactRefs,
    operator_notes: [
      "Phase 1 execution eval uses artifact-derived heuristics for continuity, recovery, and control quality.",
      "Completion and reviewer-readiness remain the top-line pass/fail gate.",
    ],
  };
}
