import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ExecutionEvalSummarySchema,
  OpenClawRealWorkflowCaseListSchema,
  OpenClawRealWorkflowSummarySchema,
  type ExecutionEvalSummary,
  type OpenClawRealWorkflowCase,
} from "./types.js";
import { buildOpenClawWorkflowVariantEval } from "./score.js";

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readJsonl(filePath: string): unknown[] {
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function inferCaseGroupId(cases: OpenClawRealWorkflowCase[]): string {
  const scenarioIds = [...new Set(cases.map((entry) => entry.scenario_id))];
  if (scenarioIds.length === 1) return scenarioIds[0]!;
  return `multi_scenario_${scenarioIds.length}`;
}

function buildMarkdown(summary: ExecutionEvalSummary): string {
  const lines: string[] = [];
  lines.push("# Execution Eval Summary");
  lines.push("");
  lines.push(`- Suite: \`${summary.suite_id}\``);
  lines.push(`- Benchmark: \`${summary.benchmark}\``);
  lines.push(`- Case group: \`${summary.case_group_id}\``);
  lines.push(`- Continuity mode: \`${summary.continuity_mode ?? "unknown"}\``);
  lines.push(`- Provider / model: \`${summary.provider ?? "unknown"}\` / \`${summary.model ?? "unknown"}\``);
  lines.push("");
  lines.push("## Variants");
  lines.push("");
  for (const variant of ["baseline", "treatment"]) {
    const record = summary.variants[variant];
    if (!record) continue;
    lines.push(`### ${variant}`);
    lines.push("");
    lines.push(`- Result: \`${record.result}\``);
    lines.push(`- Completion: \`${record.dimension_scores.completion}\``);
    lines.push(`- Reviewer-readiness: \`${record.dimension_scores.reviewer_readiness}\``);
    lines.push(`- Continuity: \`${record.dimension_scores.continuity}\``);
    lines.push(`- Recovery: \`${record.dimension_scores.recovery}\``);
    lines.push(`- Control quality: \`${record.dimension_scores.control_quality}\``);
    lines.push(`- Avg tokens: \`${record.secondary_metrics.avg_total_tokens ?? "n/a"}\``);
    lines.push(`- Avg wall clock ms: \`${record.secondary_metrics.avg_wall_clock_ms ?? "n/a"}\``);
    lines.push("");
  }
  lines.push("## Delta");
  lines.push("");
  lines.push(`- Completion gain: \`${summary.delta.completion_gain}\``);
  lines.push(`- Reviewer-readiness gain: \`${summary.delta.reviewer_readiness_gain}\``);
  lines.push(`- Continuity gain: \`${summary.delta.continuity_gain}\``);
  lines.push(`- Recovery gain: \`${summary.delta.recovery_gain}\``);
  lines.push(`- Control quality gain: \`${summary.delta.control_quality_gain}\``);
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Completion and reviewer-readiness remain the hard gate.");
  lines.push("- Continuity, recovery, and control quality are artifact-derived Phase 1 scores.");
  return `${lines.join("\n")}\n`;
}

export function buildExecutionEvalSummaryFromArtifact(args: {
  artifactDir: string;
  suiteId?: string;
}): { summary: ExecutionEvalSummary; markdown: string } {
  const summaryPath = path.resolve(args.artifactDir, "summary.json");
  const casesPath = path.resolve(args.artifactDir, "cases.jsonl");
  const rawSummary = readJson<unknown>(summaryPath);
  const parsedSummary = OpenClawRealWorkflowSummarySchema.parse(rawSummary);
  if (parsedSummary.benchmark !== "openclaw_real_workflow_scenario_v1") {
    throw new Error(`unsupported execution-eval benchmark: ${parsedSummary.benchmark}`);
  }
  const rawCases = readJsonl(casesPath);
  const parsedCases = OpenClawRealWorkflowCaseListSchema.parse(rawCases);
  const suiteId = args.suiteId ?? "openclaw_real_workflow_core_v1";
  const caseGroupId = inferCaseGroupId(parsedCases);
  const artifactRefs = {
    summary_json: summaryPath,
    cases_jsonl: casesPath,
  };

  const baseline = buildOpenClawWorkflowVariantEval({
    suiteId,
    caseGroupId,
    variant: "baseline",
    summary: parsedSummary,
    cases: parsedCases,
    artifactRefs,
  });
  const treatment = buildOpenClawWorkflowVariantEval({
    suiteId,
    caseGroupId,
    variant: "treatment",
    summary: parsedSummary,
    cases: parsedCases,
    artifactRefs,
  });

  const summary = ExecutionEvalSummarySchema.parse({
    summary_version: "execution_eval_summary_v1",
    created_at: new Date().toISOString(),
    benchmark: parsedSummary.benchmark,
    suite_id: suiteId,
    case_group_id: caseGroupId,
    continuity_mode: parsedSummary.continuity_mode ?? null,
    provider: parsedSummary.provider ?? null,
    model: parsedSummary.model ?? null,
    repetitions: parsedSummary.repetitions ?? null,
    cases: parsedSummary.cases ?? parsedCases.length,
    variants: {
      baseline,
      treatment,
    },
    delta: {
      completion_gain: round(treatment.dimension_scores.completion - baseline.dimension_scores.completion),
      reviewer_readiness_gain: round(treatment.dimension_scores.reviewer_readiness - baseline.dimension_scores.reviewer_readiness),
      continuity_gain: round(treatment.dimension_scores.continuity - baseline.dimension_scores.continuity),
      recovery_gain: round(treatment.dimension_scores.recovery - baseline.dimension_scores.recovery),
      control_quality_gain: round(treatment.dimension_scores.control_quality - baseline.dimension_scores.control_quality),
    },
    artifact_refs: artifactRefs,
  });

  return {
    summary,
    markdown: buildMarkdown(summary),
  };
}
