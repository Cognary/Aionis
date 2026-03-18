import { validateCompileEnvelope, ExecutionPlanSchema } from "./contracts.js";
import { compileAionisDoc, type CompileResult } from "./compile.js";
import { LocalExecutionRuntime } from "./execute/localRuntime.js";
import type { ExecuteAionisDocOptions, ExecutionResultV1, ExecutionRuntime } from "./execute/types.js";
import type { ExecutionGraph } from "./graph/types.js";
import type { AionisDocIR } from "./ir/types.js";
import { buildExecutionPlanV1 } from "./plan/buildExecutionPlan.js";
import type { ExecutionPlanV1 } from "./plan/types.js";

export class AionisDocExecutionError extends Error {}

function resolveRuntime(options?: ExecuteAionisDocOptions): ExecutionRuntime {
  return options?.runtime ?? new LocalExecutionRuntime();
}

function planFromCompileResult(result: CompileResult): ExecutionPlanV1 {
  return result.plan;
}

function asExecutionPlan(value: unknown): ExecutionPlanV1 {
  return value as ExecutionPlanV1;
}

function asAionisDocIr(value: unknown): AionisDocIR {
  return value as AionisDocIR;
}

function asExecutionGraph(value: unknown): ExecutionGraph | null {
  return (value as ExecutionGraph | null | undefined) ?? null;
}

function planFromEnvelope(value: unknown): ExecutionPlanV1 {
  const envelope = validateCompileEnvelope(value);
  if (envelope.artifacts.plan) return asExecutionPlan(envelope.artifacts.plan);
  if (!envelope.artifacts.ir) {
    throw new AionisDocExecutionError(
      `Execution requires a plan or IR artifact. Re-run compile-aionis-doc with --emit all, --emit ir, or --emit plan; current selected_artifact is '${envelope.selected_artifact}'.`,
    );
  }

  return buildExecutionPlanV1({
    ir: asAionisDocIr(envelope.artifacts.ir),
    graph: asExecutionGraph(envelope.artifacts.graph),
    diagnostics: envelope.diagnostics,
  });
}

export function compileAndExecuteAionisDoc(
  source: string,
  options: ExecuteAionisDocOptions = {},
): Promise<ExecutionResultV1> {
  const result = compileAionisDoc(source);
  return executeExecutionPlan(planFromCompileResult(result), options);
}

export function executeCompileEnvelope(
  value: unknown,
  options: ExecuteAionisDocOptions = {},
): Promise<ExecutionResultV1> {
  return executeExecutionPlan(planFromEnvelope(value), options);
}

export function executeExecutionPlan(
  value: unknown,
  options: ExecuteAionisDocOptions = {},
): Promise<ExecutionResultV1> {
  const plan = asExecutionPlan(ExecutionPlanSchema.parse(value));
  const runtime = resolveRuntime(options);
  return runtime.execute(plan);
}
