import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ExecutionEvalDimensionScores = {
  completion: number;
  reviewer_readiness: number;
  continuity: number;
  recovery: number;
  control_quality: number;
};

export type ExecutionEvalSecondaryMetrics = {
  avg_total_tokens: number | null;
  avg_wall_clock_ms: number | null;
  avg_tool_call_count: number | null;
  avg_broad_tool_call_count: number | null;
  avg_rediscovery_reads: number | null;
  avg_handoff_store_count: number | null;
  avg_context_assemble_count: number | null;
  avg_tools_select_count: number | null;
};

export type ExecutionEvalDecisionSummary = {
  continuity_mode: string | null;
  continuity_carrier_rate: number;
  recovery_eligible_runs: number;
  handoff_usage_rate: number;
  context_assemble_usage_rate: number;
  tools_select_usage_rate: number;
};

export type ExecutionEvalArtifactRefs = {
  summary_json: string;
  cases_jsonl: string | null;
};

export type ExecutionEvalVariantRecord = {
  eval_version: "execution_eval_v1";
  suite_id: string;
  case_group_id: string;
  variant: string;
  result: "pass" | "fail";
  dimension_scores: ExecutionEvalDimensionScores;
  secondary_metrics: ExecutionEvalSecondaryMetrics;
  decision_summary: ExecutionEvalDecisionSummary;
  artifact_refs: ExecutionEvalArtifactRefs;
  operator_notes: string[];
};

export type ExecutionEvalSummary = {
  summary_version: "execution_eval_summary_v1";
  created_at: string;
  benchmark: string;
  suite_id: string;
  case_group_id: string;
  continuity_mode: string | null;
  provider: string | null;
  model: string | null;
  repetitions: number | null;
  cases: number | null;
  variants: Record<string, ExecutionEvalVariantRecord>;
  delta: {
    completion_gain: number;
    reviewer_readiness_gain: number;
    continuity_gain: number;
    recovery_gain: number;
    control_quality_gain: number;
  };
  artifact_refs: ExecutionEvalArtifactRefs;
};

type WorkflowVariantSummary = {
  reviewer_ready_rate: number;
  workflow_completed_rate: number;
  avg_total_tokens?: number | null;
  avg_wall_clock_ms?: number | null;
  avg_tool_call_count?: number | null;
  avg_broad_tool_call_count?: number | null;
  avg_rediscovery_reads?: number | null;
  avg_handoff_store_count?: number | null;
  avg_context_assemble_count?: number | null;
  avg_tools_select_count?: number | null;
};

type WorkflowSummary = {
  benchmark: "openclaw_real_workflow_scenario_v1";
  continuity_mode?: string | null;
  provider?: string | null;
  model?: string | null;
  repetitions?: number | null;
  cases?: number | null;
  baseline: WorkflowVariantSummary;
  treatment: WorkflowVariantSummary;
};

type WorkflowCaseArm = {
  workflow_completed: boolean;
  reviewer_ready: boolean;
  total_tokens?: number | null;
  tool_call_count?: number;
  broad_tool_call_count?: number;
  rediscovery_reads?: number;
  handoff_store_count?: number;
  context_assemble_count?: number;
  tools_select_count?: number;
  wall_clock_ms?: number | null;
};

type WorkflowCase = {
  scenario_id: string;
  repetition: number;
  baseline: WorkflowCaseArm;
  treatment: WorkflowCaseArm;
};

export type ExecutionEvalComparison = {
  baseline_ref: string;
  treatment_ref: string;
  baseline: {
    suite_id: string;
    case_group_id: string;
    treatment_result: "pass" | "fail";
    treatment_scores: ExecutionEvalDimensionScores;
    delta: ExecutionEvalSummary["delta"];
  };
  treatment: {
    suite_id: string;
    case_group_id: string;
    treatment_result: "pass" | "fail";
    treatment_scores: ExecutionEvalDimensionScores;
    delta: ExecutionEvalSummary["delta"];
  };
  changes: {
    completion: number;
    reviewer_readiness: number;
    continuity: number;
    recovery: number;
    control_quality: number;
    completion_gain: number;
    reviewer_readiness_gain: number;
    continuity_gain: number;
    recovery_gain: number;
    control_quality_gain: number;
  };
};

export type ExecutionEvalGateVerdict = {
  verdict: "pass" | "fail";
  reasons: string[];
};

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readJsonl<T>(filePath: string): T[] {
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function hasContinuityCarrier(caseArm: WorkflowCaseArm): boolean {
  return (caseArm.handoff_store_count ?? 0) > 0
    || (caseArm.context_assemble_count ?? 0) > 0
    || (caseArm.tools_select_count ?? 0) > 0;
}

function scoreControlQuality(caseArm: WorkflowCaseArm): number {
  const broad = caseArm.broad_tool_call_count ?? 0;
  const rediscovery = caseArm.rediscovery_reads ?? 0;
  const extraTools = Math.max(0, (caseArm.tool_call_count ?? 0) - 4);
  return clamp01(1 - (0.35 * broad) - (0.2 * rediscovery) - (0.05 * extraTools));
}

function inferCaseGroupId(cases: WorkflowCase[]): string {
  const scenarioIds = [...new Set(cases.map((entry) => entry.scenario_id))];
  if (scenarioIds.length === 1) return scenarioIds[0]!;
  return `multi_scenario_${scenarioIds.length}`;
}

function assertWorkflowSummary(value: unknown): asserts value is WorkflowSummary {
  if (!value || typeof value !== "object") throw new Error("invalid summary.json payload");
  const record = value as Record<string, unknown>;
  if (record.benchmark !== "openclaw_real_workflow_scenario_v1") {
    throw new Error(`unsupported execution-eval benchmark: ${String(record.benchmark ?? "unknown")}`);
  }
  if (!record.baseline || !record.treatment) {
    throw new Error("summary.json missing baseline/treatment");
  }
}

function assertWorkflowCases(value: unknown): asserts value is WorkflowCase[] {
  if (!Array.isArray(value)) throw new Error("cases.jsonl payload is not an array");
  for (const item of value) {
    if (!item || typeof item !== "object") throw new Error("invalid cases.jsonl record");
    const record = item as Record<string, unknown>;
    if (typeof record.scenario_id !== "string") throw new Error("cases.jsonl record missing scenario_id");
    if (!record.baseline || !record.treatment) throw new Error("cases.jsonl record missing baseline/treatment");
  }
}

function assertExecutionEvalSummary(value: unknown): asserts value is ExecutionEvalSummary {
  if (!value || typeof value !== "object") throw new Error("invalid execution eval summary payload");
  const record = value as Record<string, unknown>;
  if (record.summary_version !== "execution_eval_summary_v1") {
    throw new Error("unsupported execution eval summary version");
  }
  if (!record.variants || typeof record.variants !== "object") {
    throw new Error("execution eval summary missing variants");
  }
}

function deriveVariantSecondaryMetrics(summaryArm: WorkflowVariantSummary): ExecutionEvalSecondaryMetrics {
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

function buildVariantEval(args: {
  suiteId: string;
  caseGroupId: string;
  variant: "baseline" | "treatment";
  summary: WorkflowSummary;
  cases: WorkflowCase[];
  artifactRefs: ExecutionEvalArtifactRefs;
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

  const dimensionScores: ExecutionEvalDimensionScores = {
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

export function buildExecutionEvalSummaryFromArtifact(args: {
  artifactDir: string;
  suiteId?: string;
}): ExecutionEvalSummary {
  const artifactDir = path.resolve(args.artifactDir);
  const summaryPath = path.join(artifactDir, "summary.json");
  const casesPath = path.join(artifactDir, "cases.jsonl");
  const rawSummary = readJson<unknown>(summaryPath);
  assertWorkflowSummary(rawSummary);
  const rawCases = readJsonl<unknown>(casesPath);
  assertWorkflowCases(rawCases);

  const suiteId = args.suiteId ?? "openclaw_real_workflow_core_v1";
  const caseGroupId = inferCaseGroupId(rawCases);
  const artifactRefs: ExecutionEvalArtifactRefs = {
    summary_json: summaryPath,
    cases_jsonl: casesPath,
  };

  const baseline = buildVariantEval({
    suiteId,
    caseGroupId,
    variant: "baseline",
    summary: rawSummary,
    cases: rawCases,
    artifactRefs,
  });
  const treatment = buildVariantEval({
    suiteId,
    caseGroupId,
    variant: "treatment",
    summary: rawSummary,
    cases: rawCases,
    artifactRefs,
  });

  return {
    summary_version: "execution_eval_summary_v1",
    created_at: new Date().toISOString(),
    benchmark: rawSummary.benchmark,
    suite_id: suiteId,
    case_group_id: caseGroupId,
    continuity_mode: rawSummary.continuity_mode ?? null,
    provider: rawSummary.provider ?? null,
    model: rawSummary.model ?? null,
    repetitions: rawSummary.repetitions ?? null,
    cases: rawSummary.cases ?? rawCases.length,
    variants: { baseline, treatment },
    delta: {
      completion_gain: round(treatment.dimension_scores.completion - baseline.dimension_scores.completion),
      reviewer_readiness_gain: round(treatment.dimension_scores.reviewer_readiness - baseline.dimension_scores.reviewer_readiness),
      continuity_gain: round(treatment.dimension_scores.continuity - baseline.dimension_scores.continuity),
      recovery_gain: round(treatment.dimension_scores.recovery - baseline.dimension_scores.recovery),
      control_quality_gain: round(treatment.dimension_scores.control_quality - baseline.dimension_scores.control_quality),
    },
    artifact_refs: artifactRefs,
  };
}

export function resolveExecutionEvalSummary(args: {
  inputPath: string;
  suiteId?: string;
}): ExecutionEvalSummary {
  const resolved = path.resolve(args.inputPath);
  if (!existsSync(resolved)) {
    throw Object.assign(new Error(`path not found: ${resolved}`), { code: "ENOENT" });
  }

  const stats = path.parse(resolved);
  if (stats.ext === ".json") {
    const raw = readJson<unknown>(resolved);
    assertExecutionEvalSummary(raw);
    return raw;
  }

  const precomputedPath = path.join(resolved, "execution_eval_summary.json");
  if (existsSync(precomputedPath)) {
    const raw = readJson<unknown>(precomputedPath);
    assertExecutionEvalSummary(raw);
    return raw;
  }

  return buildExecutionEvalSummaryFromArtifact({
    artifactDir: resolved,
    suiteId: args.suiteId,
  });
}

export function buildExecutionEvalComparison(args: {
  baselinePath: string;
  treatmentPath: string;
  suiteId?: string;
}): ExecutionEvalComparison {
  const baseline = resolveExecutionEvalSummary({
    inputPath: args.baselinePath,
    suiteId: args.suiteId,
  });
  const treatment = resolveExecutionEvalSummary({
    inputPath: args.treatmentPath,
    suiteId: args.suiteId,
  });
  const baselineTreatment = baseline.variants.treatment;
  const treatmentTreatment = treatment.variants.treatment;
  if (!baselineTreatment || !treatmentTreatment) {
    throw new Error("missing treatment variant in execution eval summary");
  }

  return {
    baseline_ref: path.resolve(args.baselinePath),
    treatment_ref: path.resolve(args.treatmentPath),
    baseline: {
      suite_id: baseline.suite_id,
      case_group_id: baseline.case_group_id,
      treatment_result: baselineTreatment.result,
      treatment_scores: baselineTreatment.dimension_scores,
      delta: baseline.delta,
    },
    treatment: {
      suite_id: treatment.suite_id,
      case_group_id: treatment.case_group_id,
      treatment_result: treatmentTreatment.result,
      treatment_scores: treatmentTreatment.dimension_scores,
      delta: treatment.delta,
    },
    changes: {
      completion: round(treatmentTreatment.dimension_scores.completion - baselineTreatment.dimension_scores.completion),
      reviewer_readiness: round(treatmentTreatment.dimension_scores.reviewer_readiness - baselineTreatment.dimension_scores.reviewer_readiness),
      continuity: round(treatmentTreatment.dimension_scores.continuity - baselineTreatment.dimension_scores.continuity),
      recovery: round(treatmentTreatment.dimension_scores.recovery - baselineTreatment.dimension_scores.recovery),
      control_quality: round(treatmentTreatment.dimension_scores.control_quality - baselineTreatment.dimension_scores.control_quality),
      completion_gain: round(treatment.delta.completion_gain - baseline.delta.completion_gain),
      reviewer_readiness_gain: round(treatment.delta.reviewer_readiness_gain - baseline.delta.reviewer_readiness_gain),
      continuity_gain: round(treatment.delta.continuity_gain - baseline.delta.continuity_gain),
      recovery_gain: round(treatment.delta.recovery_gain - baseline.delta.recovery_gain),
      control_quality_gain: round(treatment.delta.control_quality_gain - baseline.delta.control_quality_gain),
    },
  };
}

export function buildExecutionEvalGateVerdict(summary: ExecutionEvalSummary): ExecutionEvalGateVerdict {
  const reasons: string[] = [];
  const baseline = summary.variants.baseline;
  const treatment = summary.variants.treatment;
  if (!baseline || !treatment) {
    return { verdict: "fail", reasons: ["missing baseline or treatment variant"] };
  }

  if (treatment.result !== "pass") reasons.push("treatment result is not pass");
  if (summary.delta.completion_gain < 0) reasons.push("completion_gain is negative");
  if (summary.delta.reviewer_readiness_gain < 0) reasons.push("reviewer_readiness_gain is negative");
  if (treatment.dimension_scores.completion < baseline.dimension_scores.completion) {
    reasons.push("treatment completion is below baseline");
  }
  if (treatment.dimension_scores.reviewer_readiness < baseline.dimension_scores.reviewer_readiness) {
    reasons.push("treatment reviewer_readiness is below baseline");
  }

  return {
    verdict: reasons.length === 0 ? "pass" : "fail",
    reasons,
  };
}
