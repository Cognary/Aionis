import { z } from "zod";

import type { CompileResult } from "./compile.js";
import {
  AIONIS_DOC_COMPILE_RESULT_VERSION,
  AionisDocCompileEnvelopeSchema,
  type AionisDocCompileEnvelope,
} from "./contracts.js";
import type { DocumentNode } from "./ast/types.js";
import type { ExecutionGraph } from "./graph/types.js";
import type { AionisDocIR } from "./ir/types.js";
import type { ExecutionResultV1 } from "./execute/types.js";
import { buildExecutionPlanV1 } from "./plan/buildExecutionPlan.js";

export const AIONIS_DOC_RUNTIME_HANDOFF_VERSION = "aionis_doc_runtime_handoff_v1" as const;

const RuntimeExecutionStageSchema = z.enum(["triage", "patch", "review", "resume"]);
const RuntimeExecutionRoleSchema = z.enum(["orchestrator", "triage", "patch", "review", "resume"]);

const RuntimeStringListSchema = z.array(z.string().min(1));

export const RuntimeReviewerContractSchema = z.object({
  standard: z.string().trim().min(1),
  required_outputs: RuntimeStringListSchema,
  acceptance_checks: RuntimeStringListSchema,
  rollback_required: z.boolean(),
});

export const RuntimeResumeAnchorSchema = z.object({
  anchor: z.string().trim().min(1),
  file_path: z.string().trim().min(1).nullable(),
  symbol: z.string().trim().min(1).nullable(),
  repo_root: z.string().trim().min(1).nullable(),
});

export const RuntimeExecutionStateSchema = z.object({
  state_id: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  task_brief: z.string().trim().min(1),
  current_stage: RuntimeExecutionStageSchema,
  active_role: RuntimeExecutionRoleSchema,
  owned_files: z.array(z.string()),
  modified_files: z.array(z.string()),
  pending_validations: z.array(z.string()),
  completed_validations: z.array(z.string()),
  last_accepted_hypothesis: z.string().trim().min(1).nullable(),
  rejected_paths: z.array(z.string()),
  unresolved_blockers: z.array(z.string()),
  rollback_notes: z.array(z.string()),
  reviewer_contract: RuntimeReviewerContractSchema.nullable(),
  resume_anchor: RuntimeResumeAnchorSchema.nullable(),
  updated_at: z.string().min(1),
  version: z.literal(1),
});

export const RuntimeExecutionPacketSchema = z.object({
  version: z.literal(1),
  state_id: z.string().trim().min(1),
  current_stage: RuntimeExecutionStageSchema,
  active_role: RuntimeExecutionRoleSchema,
  task_brief: z.string().trim().min(1),
  target_files: z.array(z.string()),
  next_action: z.string().trim().min(1).nullable(),
  hard_constraints: z.array(z.string()),
  accepted_facts: z.array(z.string()),
  rejected_paths: z.array(z.string()),
  pending_validations: z.array(z.string()),
  unresolved_blockers: z.array(z.string()),
  rollback_notes: z.array(z.string()),
  review_contract: RuntimeReviewerContractSchema.nullable(),
  resume_anchor: RuntimeResumeAnchorSchema.nullable(),
  artifact_refs: z.array(z.string()),
  evidence_refs: z.array(z.string()),
});

export const RuntimeExecutionReadyHandoffSchema = z.object({
  anchor: z.string().trim().min(1),
  handoff_kind: z.literal("task_handoff"),
  summary: z.string().trim().min(1).nullable(),
  handoff_text: z.string().trim().min(1),
  acceptance_checks: z.array(z.string()),
  target_files: z.array(z.string()),
  next_action: z.string().trim().min(1).nullable(),
});

export const RuntimeGraphSummarySchema = z.object({
  graph_id: z.string().trim().min(1).nullable(),
  execution_count: z.number().int().nonnegative(),
  graph_node_count: z.number().int().nonnegative(),
  graph_edge_count: z.number().int().nonnegative(),
  module_refs: z.array(z.string()),
  output_refs: z.array(z.string()),
  expected_outputs: z.array(z.string()),
  artifact_count: z.number().int().nonnegative(),
  evidence_count: z.number().int().nonnegative(),
});

export const RuntimeExecutionArtifactSchema = z.object({
  ref: z.string().trim().min(1),
  execution_id: z.string().trim().min(1),
  module: z.string().trim().min(1).optional(),
  value: z.unknown(),
});

export const RuntimeExecutionEvidenceSchema = z.object({
  ref: z.string().trim().min(1),
  execution_id: z.string().trim().min(1),
  module: z.string().trim().min(1).optional(),
  value: z.unknown(),
});

export const RuntimeExecutionResultSummarySchema = z.object({
  runtime_id: z.string().trim().min(1),
  status: z.enum(["success", "failed"]),
  output_refs: z.array(z.string()),
  artifact_count: z.number().int().nonnegative(),
  evidence_count: z.number().int().nonnegative(),
});

export const AionisDocRuntimeHandoffSchema = z.object({
  runtime_handoff_version: z.literal(AIONIS_DOC_RUNTIME_HANDOFF_VERSION),
  source_compile_result_version: z.literal(AIONIS_DOC_COMPILE_RESULT_VERSION),
  generated_at: z.string().min(1),
  source_doc_id: z.string().trim().min(1),
  source_doc_version: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  task_brief: z.string().trim().min(1),
  graph_summary: RuntimeGraphSummarySchema,
  execution_result_summary: RuntimeExecutionResultSummarySchema.nullable(),
  execution_artifacts: z.array(RuntimeExecutionArtifactSchema),
  execution_evidence: z.array(RuntimeExecutionEvidenceSchema),
  execution_state_v1: RuntimeExecutionStateSchema,
  execution_packet_v1: RuntimeExecutionPacketSchema,
  execution_ready_handoff: RuntimeExecutionReadyHandoffSchema,
});

export type AionisDocRuntimeHandoffV1 = z.infer<typeof AionisDocRuntimeHandoffSchema>;

export class AionisDocRuntimeHandoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AionisDocRuntimeHandoffError";
  }
}

type RuntimeHandoffOptions = {
  executionResult?: ExecutionResultV1 | null;
  scope?: string;
  generatedAt?: string;
  currentStage?: z.infer<typeof RuntimeExecutionStageSchema>;
  activeRole?: z.infer<typeof RuntimeExecutionRoleSchema>;
  repoRoot?: string | null;
  filePath?: string | null;
  symbol?: string | null;
  requireErrorFree?: boolean;
};

function inferTaskBrief(result: CompileResult): string {
  const title = result.ir.doc?.title?.trim();
  if (title) return title;
  const objective = result.ir.context.find((entry) => typeof entry.objective === "string" && entry.objective.trim().length > 0)?.objective?.trim();
  if (objective) return objective;
  if (result.ir.doc?.kind) return `Execute Aionis Doc ${result.ir.doc.kind}`;
  return `Execute Aionis Doc ${result.ir.doc?.id ?? "unknown"}`;
}

function inferStage(result: CompileResult): z.infer<typeof RuntimeExecutionStageSchema> {
  if (result.ir.executions.length > 0) return "patch";
  return "triage";
}

function inferRole(stage: z.infer<typeof RuntimeExecutionStageSchema>): z.infer<typeof RuntimeExecutionRoleSchema> {
  if (stage === "patch") return "patch";
  if (stage === "review") return "review";
  if (stage === "resume") return "resume";
  return "triage";
}

function collectContextConstraints(result: CompileResult): string[] {
  return result.ir.context.flatMap((entry) => entry.constraints ?? []);
}

function collectExpectedOutputs(result: CompileResult): string[] {
  return result.ir.replay.flatMap((entry) => entry.expected_outputs ?? []);
}

function collectEvidenceRefs(result: CompileResult): string[] {
  const refs: string[] = [];
  for (const evidence of result.ir.evidence) {
    for (const source of evidence.sources ?? []) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const ref = "ref" in source && typeof (source as Record<string, unknown>).ref === "string"
        ? String((source as Record<string, unknown>).ref)
        : null;
      if (ref) refs.push(ref);
    }
  }
  return refs;
}

function buildExecutionArtifactRecords(executionResult?: ExecutionResultV1 | null) {
  const records = executionResult?.artifacts ?? [];
  return records.map((record, index) =>
    RuntimeExecutionArtifactSchema.parse({
      ref: `artifact:${record.execution_id}:${index + 1}`,
      execution_id: record.execution_id,
      module: record.module,
      value: record.value,
    }),
  );
}

function buildExecutionEvidenceRecords(executionResult?: ExecutionResultV1 | null) {
  const records = executionResult?.evidence ?? [];
  return records.map((record, index) =>
    RuntimeExecutionEvidenceSchema.parse({
      ref: `evidence:${record.execution_id}:${index + 1}`,
      execution_id: record.execution_id,
      module: record.module,
      value: record.value,
    }),
  );
}

function collectModuleRefs(result: CompileResult): string[] {
  return result.ir.executions.flatMap((entry) => (entry.module ? [entry.module] : []));
}

function collectOutputRefs(result: CompileResult): string[] {
  return result.ir.executions.flatMap((entry) => (entry.output_ref ? [entry.output_ref] : []));
}

function collectAcceptedFacts(result: CompileResult): string[] {
  const facts = new Set<string>();
  if (result.ir.doc?.id) facts.add(`doc_id:${result.ir.doc.id}`);
  if (result.ir.doc?.version) facts.add(`doc_version:${result.ir.doc.version}`);
  for (const moduleRef of collectModuleRefs(result)) {
    facts.add(`module:${moduleRef}`);
  }
  for (const outputRef of collectOutputRefs(result)) {
    facts.add(`output_ref:${outputRef}`);
  }
  for (const decision of result.ir.decisions) {
    if (decision.decision) facts.add(`decision:${decision.decision}`);
  }
  return [...facts];
}

function inferNextAction(result: CompileResult, expectedOutputs: string[]): string | null {
  if (expectedOutputs.length > 0) {
    return `Produce expected outputs: ${expectedOutputs.join(" | ")}`;
  }
  const firstModule = result.ir.executions.find((entry) => entry.module)?.module;
  if (firstModule) {
    return `Execute module chain starting with ${firstModule}`;
  }
  return null;
}

function buildReviewerContract(result: CompileResult, expectedOutputs: string[], acceptanceChecks: string[]) {
  if (expectedOutputs.length === 0 && acceptanceChecks.length === 0) {
    return null;
  }
  return RuntimeReviewerContractSchema.parse({
    standard: "aionis_doc_runtime_handoff_v1",
    required_outputs: expectedOutputs,
    acceptance_checks: acceptanceChecks,
    rollback_required: false,
  });
}

function ensureRunnable(result: CompileResult, requireErrorFree: boolean): void {
  if (!result.ir.doc) {
    throw new AionisDocRuntimeHandoffError("Runtime handoff requires a compiled document with @doc metadata.");
  }
  if (requireErrorFree && result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new AionisDocRuntimeHandoffError("Runtime handoff requires an error-free compile result.");
  }
}

export function buildRuntimeHandoffV1(args: {
  inputPath: string;
  result: CompileResult;
} & RuntimeHandoffOptions): AionisDocRuntimeHandoffV1 {
  const scope = args.scope?.trim() || "default";
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const requireErrorFree = args.requireErrorFree ?? true;

  ensureRunnable(args.result, requireErrorFree);

  const doc = args.result.ir.doc!;
  const taskBrief = inferTaskBrief(args.result);
  const currentStage = args.currentStage ?? inferStage(args.result);
  const activeRole = args.activeRole ?? inferRole(currentStage);
  const expectedOutputs = collectExpectedOutputs(args.result);
  const hardConstraints = collectContextConstraints(args.result);
  const executionArtifacts = buildExecutionArtifactRecords(args.executionResult);
  const executionEvidence = buildExecutionEvidenceRecords(args.executionResult);
  const artifactRefs = executionArtifacts.map((record) => record.ref);
  const evidenceRefs = [
    ...collectEvidenceRefs(args.result),
    ...executionEvidence.map((record) => record.ref),
  ];
  const acceptedFacts = collectAcceptedFacts(args.result);
  const nextAction = inferNextAction(args.result, expectedOutputs);
  const reviewerContract = buildReviewerContract(args.result, expectedOutputs, hardConstraints);
  const executionResultSummary = args.executionResult
    ? RuntimeExecutionResultSummarySchema.parse({
        runtime_id: args.executionResult.runtime_id,
        status: args.executionResult.status,
        output_refs: Object.keys(args.executionResult.outputs),
        artifact_count: executionArtifacts.length,
        evidence_count: executionEvidence.length,
      })
    : null;

  const stateId = `aionis-doc:${doc.id}`;
  const resumeAnchor = RuntimeResumeAnchorSchema.parse({
    anchor: stateId,
    file_path: args.filePath ?? null,
    symbol: args.symbol ?? null,
    repo_root: args.repoRoot ?? null,
  });

  const executionState = RuntimeExecutionStateSchema.parse({
    state_id: stateId,
    scope,
    task_brief: taskBrief,
    current_stage: currentStage,
    active_role: activeRole,
    owned_files: [],
    modified_files: [],
    pending_validations: expectedOutputs,
    completed_validations: [],
    last_accepted_hypothesis: null,
    rejected_paths: [],
    unresolved_blockers: [],
    rollback_notes: [],
    reviewer_contract: reviewerContract,
    resume_anchor: resumeAnchor,
    updated_at: generatedAt,
    version: 1,
  });

  const executionPacket = RuntimeExecutionPacketSchema.parse({
    version: 1,
    state_id: stateId,
    current_stage: currentStage,
    active_role: activeRole,
    task_brief: taskBrief,
    target_files: [],
    next_action: nextAction,
    hard_constraints: hardConstraints,
    accepted_facts: acceptedFacts,
    rejected_paths: [],
    pending_validations: expectedOutputs,
    unresolved_blockers: [],
    rollback_notes: [],
    review_contract: reviewerContract,
    resume_anchor: resumeAnchor,
    artifact_refs: artifactRefs,
    evidence_refs: evidenceRefs,
  });

  const executionReadyHandoff = RuntimeExecutionReadyHandoffSchema.parse({
    anchor: stateId,
    handoff_kind: "task_handoff",
    summary: doc.title ?? taskBrief,
    handoff_text: taskBrief,
    acceptance_checks: reviewerContract?.acceptance_checks ?? [],
    target_files: [],
    next_action: nextAction,
  });

  return AionisDocRuntimeHandoffSchema.parse({
    runtime_handoff_version: AIONIS_DOC_RUNTIME_HANDOFF_VERSION,
    source_compile_result_version: AIONIS_DOC_COMPILE_RESULT_VERSION,
    generated_at: generatedAt,
    source_doc_id: doc.id,
    source_doc_version: doc.version,
    scope,
    task_brief: taskBrief,
    graph_summary: {
      graph_id: args.result.graph?.graph_id ?? null,
      execution_count: args.result.ir.executions.length,
      graph_node_count: args.result.graph?.nodes.length ?? 0,
      graph_edge_count: args.result.graph?.edges.length ?? 0,
      module_refs: collectModuleRefs(args.result),
      output_refs: collectOutputRefs(args.result),
      expected_outputs: expectedOutputs,
      artifact_count: executionArtifacts.length,
      evidence_count: executionEvidence.length,
    },
    execution_result_summary: executionResultSummary,
    execution_artifacts: executionArtifacts,
    execution_evidence: executionEvidence,
    execution_state_v1: executionState,
    execution_packet_v1: executionPacket,
    execution_ready_handoff: executionReadyHandoff,
  });
}

export function buildRuntimeHandoffV1FromEnvelope(args: {
  envelope: unknown;
} & RuntimeHandoffOptions): AionisDocRuntimeHandoffV1 {
  const envelope = AionisDocCompileEnvelopeSchema.parse(args.envelope);
  if (!envelope.artifacts.ir) {
    throw new AionisDocRuntimeHandoffError(
      `Runtime handoff requires an envelope with IR artifacts. Re-run compile-aionis-doc with --emit all or --emit ir; current selected_artifact is '${envelope.selected_artifact}'.`,
    );
  }

  const result = compileResultFromEnvelope(envelope);
  return buildRuntimeHandoffV1({
    inputPath: envelope.input_path,
    result,
    ...args,
  });
}

function compileResultFromEnvelope(envelope: AionisDocCompileEnvelope): CompileResult {
  const ir = envelope.artifacts.ir as unknown as AionisDocIR;
  const graph = envelope.artifacts.graph as unknown as ExecutionGraph | null;
  return {
    ast: (envelope.artifacts.ast ??
      {
      type: "DocumentNode",
      children: [],
      diagnostics: envelope.diagnostics,
      loc: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    }) as unknown as DocumentNode,
    ir,
    graph,
    plan: (envelope.artifacts.plan ??
      buildExecutionPlanV1({
        ir,
        graph,
        diagnostics: envelope.diagnostics,
      })) as CompileResult["plan"],
    diagnostics: envelope.diagnostics,
  };
}
