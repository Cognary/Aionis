import { z } from "zod";

import type { CompileResult } from "./compile.js";

export const AIONIS_DOC_COMPILE_RESULT_VERSION = "aionis_doc_compile_result_v1" as const;

export const EmitModeSchema = z.enum(["all", "ast", "ir", "graph", "diagnostics"]);
export type EmitMode = z.infer<typeof EmitModeSchema>;

export const SourcePosSchema = z.object({
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
});

export const SourceRangeSchema = z.object({
  start: SourcePosSchema,
  end: SourcePosSchema,
});

export const DiagnosticSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  code: z.string().min(1),
  message: z.string().min(1),
  loc: SourceRangeSchema,
  hint: z.string().optional(),
});

export const AionisValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(AionisValueSchema),
    z.record(AionisValueSchema),
  ]),
);

export const HeadingNodeSchema = z.object({
  type: z.literal("HeadingNode"),
  depth: z.number().int().positive(),
  text: z.string(),
  raw: z.string().optional(),
  loc: SourceRangeSchema,
});

export const ParagraphNodeSchema = z.object({
  type: z.literal("ParagraphNode"),
  text: z.string(),
  raw: z.string().optional(),
  loc: SourceRangeSchema,
});

export const CodeFenceNodeSchema = z.object({
  type: z.literal("CodeFenceNode"),
  fence: z.literal("```"),
  info: z.string().optional(),
  content: z.string(),
  raw: z.string().optional(),
  loc: SourceRangeSchema,
});

export const DirectiveNodeSchema = z.object({
  type: z.literal("DirectiveNode"),
  name: z.string().min(1),
  payload: AionisValueSchema.nullable(),
  diagnostics: z.array(DiagnosticSchema).optional(),
  raw: z.string().optional(),
  loc: SourceRangeSchema,
});

export const AstNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([HeadingNodeSchema, ParagraphNodeSchema, CodeFenceNodeSchema, DirectiveNodeSchema]),
);

export const DocumentNodeSchema = z.object({
  type: z.literal("DocumentNode"),
  children: z.array(AstNodeSchema),
  diagnostics: z.array(DiagnosticSchema),
  raw: z.string().optional(),
  loc: SourceRangeSchema,
});

export const DocMetaIRSchema = z.object({
  id: z.string(),
  version: z.string(),
  kind: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const ContextIRSchema = z.object({
  objective: z.string().optional(),
  audience: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const PlanIRSchema = z.object({
  steps: z.array(z.string()).optional(),
  success_criteria: z.array(z.string()).optional(),
  checkpoints: z.array(z.string()).optional(),
  fallbacks: z.array(z.string()).optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const ExecuteIRSchema = z.object({
  module: z.string().optional(),
  tool: z.string().optional(),
  agent: z.string().optional(),
  input: z.record(AionisValueSchema).optional(),
  input_ref: z.string().optional(),
  output_ref: z.string().optional(),
  deterministic: z.boolean().optional(),
  depends_on: z.array(z.string()).optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const DecisionIRSchema = z.object({
  decision: z.string().optional(),
  rationale: z.string().optional(),
  confidence: z.number().optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const EvidenceIRSchema = z.object({
  sources: z.array(AionisValueSchema).optional(),
  confidence: z.number().optional(),
  claims_supported: z.array(z.string()).optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const ReplayIRSchema = z.object({
  executable: z.boolean().optional(),
  mode: z.enum(["deterministic", "assisted", "advisory"]).optional(),
  workflow_id: z.string().optional(),
  expected_outputs: z.array(z.string()).optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const MemoryIRSchema = z.object({
  topics: z.array(z.string()).optional(),
  entities: z.array(z.string()).optional(),
  writeback: z.boolean().optional(),
  summary_layer: z.string().optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const StateIRSchema = z.object({
  phase: z.string().optional(),
  run_id: z.string().optional(),
  owner: z.string().optional(),
  data: z.record(AionisValueSchema),
  loc: SourceRangeSchema.optional(),
});

export const AionisDocIRSchema = z.object({
  doc: DocMetaIRSchema.nullable(),
  context: z.array(ContextIRSchema),
  plans: z.array(PlanIRSchema),
  executions: z.array(ExecuteIRSchema),
  decisions: z.array(DecisionIRSchema),
  evidence: z.array(EvidenceIRSchema),
  replay: z.array(ReplayIRSchema),
  memory: z.array(MemoryIRSchema),
  state: z.array(StateIRSchema),
  diagnostics: z.array(DiagnosticSchema),
});

export const ExecutionNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "context_node",
    "execute_node",
    "decision_node",
    "evidence_node",
    "output_node",
    "memory_write_node",
    "replay_node",
  ]),
  label: z.string().optional(),
  module: z.string().optional(),
  input_ref: z.string().optional(),
  output_ref: z.string().optional(),
  payload: z.record(AionisValueSchema).optional(),
  loc: SourceRangeSchema.optional(),
});

export const ExecutionEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum([
    "data_dependency",
    "sequence_dependency",
    "evidence_attachment",
    "memory_writeback",
    "replay_anchor",
  ]),
});

export const ExecutionGraphSchema = z.object({
  graph_id: z.string().min(1),
  doc_id: z.string().min(1),
  nodes: z.array(ExecutionNodeSchema),
  edges: z.array(ExecutionEdgeSchema),
  diagnostics: z.array(DiagnosticSchema).optional(),
});

export const CompileArtifactsSchema = z.object({
  ast: DocumentNodeSchema.nullable(),
  ir: AionisDocIRSchema.nullable(),
  graph: ExecutionGraphSchema.nullable(),
});

export const CompileSummarySchema = z.object({
  has_errors: z.boolean(),
  error_count: z.number().int().nonnegative(),
  warning_count: z.number().int().nonnegative(),
  info_count: z.number().int().nonnegative(),
  ast_node_count: z.number().int().nonnegative(),
  execution_count: z.number().int().nonnegative(),
  graph_node_count: z.number().int().nonnegative(),
  graph_edge_count: z.number().int().nonnegative(),
});

export const AionisDocCompileEnvelopeSchema = z.object({
  command: z.literal("compile-aionis-doc"),
  compile_result_version: z.literal(AIONIS_DOC_COMPILE_RESULT_VERSION),
  generated_at: z.string().min(1),
  input_path: z.string().min(1),
  selected_artifact: EmitModeSchema,
  diagnostics: z.array(DiagnosticSchema),
  summary: CompileSummarySchema,
  artifacts: CompileArtifactsSchema,
});

export type AionisDocCompileEnvelope = z.infer<typeof AionisDocCompileEnvelopeSchema>;

function selectArtifacts(result: CompileResult, emit: EmitMode) {
  if (emit === "all") {
    return {
      ast: result.ast,
      ir: result.ir,
      graph: result.graph,
    };
  }
  return {
    ast: emit === "ast" ? result.ast : null,
    ir: emit === "ir" ? result.ir : null,
    graph: emit === "graph" ? result.graph : null,
  };
}

function summarizeCompileResult(result: CompileResult) {
  const errorCount = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const infoCount = result.diagnostics.filter((diagnostic) => diagnostic.severity === "info").length;

  return {
    has_errors: errorCount > 0,
    error_count: errorCount,
    warning_count: warningCount,
    info_count: infoCount,
    ast_node_count: result.ast.children.length,
    execution_count: result.ir.executions.length,
    graph_node_count: result.graph?.nodes.length ?? 0,
    graph_edge_count: result.graph?.edges.length ?? 0,
  };
}

export function buildCompileEnvelope(args: {
  inputPath: string;
  emit: EmitMode;
  result: CompileResult;
  generatedAt?: string;
}): AionisDocCompileEnvelope {
  const envelope = {
    command: "compile-aionis-doc",
    compile_result_version: AIONIS_DOC_COMPILE_RESULT_VERSION,
    generated_at: args.generatedAt ?? new Date().toISOString(),
    input_path: args.inputPath,
    selected_artifact: args.emit,
    diagnostics: args.result.diagnostics,
    summary: summarizeCompileResult(args.result),
    artifacts: selectArtifacts(args.result, args.emit),
  };

  return AionisDocCompileEnvelopeSchema.parse(envelope);
}

export function validateCompileEnvelope(value: unknown): AionisDocCompileEnvelope {
  return AionisDocCompileEnvelopeSchema.parse(value);
}
