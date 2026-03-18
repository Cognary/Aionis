import type { Diagnostic } from "../diagnostics/types.js";
import type { ExecutionGraph } from "../graph/types.js";
import type { AionisDocIR, AionisObject, ExecuteIR } from "../ir/types.js";
import {
  EXECUTION_PLAN_V1,
  type ExecutionPlanContext,
  type ExecutionPlanDeterminism,
  type ExecutionPlanStep,
  type ExecutionPlanV1,
} from "./types.js";

function mergeContextFrames(frames: AionisObject[]): AionisObject {
  const merged: AionisObject = {};
  for (const frame of frames) {
    for (const [key, value] of Object.entries(frame)) {
      merged[key] = value;
    }
  }
  return merged;
}

function buildExecutionId(step: ExecuteIR, index: number): string {
  if (step.output_ref) return step.output_ref;
  if (step.module) return `run.${step.module}.${index + 1}`;
  if (step.tool) return `run.${step.tool}.${index + 1}`;
  if (step.agent) return `run.${step.agent}.${index + 1}`;
  return `run.execution_${index + 1}`;
}

function buildExecutionStep(step: ExecuteIR, index: number): ExecutionPlanStep {
  return {
    execution_id: buildExecutionId(step, index),
    module: step.module,
    tool: step.tool,
    agent: step.agent,
    input: step.input,
    input_ref: step.input_ref,
    output_ref: step.output_ref,
    depends_on: step.depends_on ?? [],
    deterministic: step.deterministic,
    loc: step.loc,
  };
}

function collectExpectedOutputs(ir: AionisDocIR): string[] {
  const replayOutputs = ir.replay.flatMap((entry) => entry.expected_outputs ?? []);
  if (replayOutputs.length > 0) return replayOutputs;
  return ir.executions
    .map((execution) => execution.output_ref)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function collectRequiredCapabilities(ir: AionisDocIR): string[] {
  const capabilities = new Set<string>();

  if (ir.executions.length > 0) {
    capabilities.add("direct_execution");
    capabilities.add("module_registry");
  }

  for (const replay of ir.replay) {
    if (replay.mode === "deterministic") capabilities.add("deterministic_replay");
    if (replay.mode === "assisted") capabilities.add("assisted_replay");
    if (replay.executable) capabilities.add("state_persistence");
  }

  if (ir.memory.some((entry) => entry.writeback)) {
    capabilities.add("memory_writeback");
  }

  return [...capabilities];
}

function buildDeterminism(ir: AionisDocIR): ExecutionPlanDeterminism {
  const primaryReplay = ir.replay[0];
  const executable = ir.replay.some((entry) => entry.executable === true) || ir.executions.length > 0;

  return {
    executable,
    replay_mode: primaryReplay?.mode,
    requires_resume_support: ir.replay.some((entry) => entry.executable === true),
  };
}

export function buildExecutionPlanV1(args: {
  ir: AionisDocIR;
  graph: ExecutionGraph | null;
  diagnostics?: Diagnostic[];
}): ExecutionPlanV1 {
  const contextFrames = args.ir.context.map((entry) => entry.data);
  const context: ExecutionPlanContext = {
    merged: mergeContextFrames(contextFrames),
    frames: contextFrames,
  };

  return {
    plan_version: EXECUTION_PLAN_V1,
    doc: args.ir.doc
      ? {
          id: args.ir.doc.id,
          version: args.ir.doc.version,
          kind: args.ir.doc.kind,
          title: args.ir.doc.title,
          status: args.ir.doc.status,
          tags: args.ir.doc.tags,
        }
      : null,
    context,
    executions: args.ir.executions.map(buildExecutionStep),
    graph: args.graph,
    expected_outputs: collectExpectedOutputs(args.ir),
    required_capabilities: collectRequiredCapabilities(args.ir),
    determinism: buildDeterminism(args.ir),
    diagnostics: args.diagnostics ?? args.ir.diagnostics,
  };
}
