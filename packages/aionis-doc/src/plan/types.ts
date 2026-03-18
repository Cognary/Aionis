import type { Diagnostic, SourceRange } from "../diagnostics/types.js";
import type { ExecutionGraph } from "../graph/types.js";
import type { AionisObject, ReplayIR } from "../ir/types.js";

export const EXECUTION_PLAN_V1 = "execution_plan_v1" as const;

export interface ExecutionPlanDocMeta {
  id: string;
  version: string;
  kind?: string;
  title?: string;
  status?: string;
  tags?: string[];
}

export interface ExecutionPlanContext {
  merged: AionisObject;
  frames: AionisObject[];
}

export interface ExecutionPlanStep {
  execution_id: string;
  module?: string;
  tool?: string;
  agent?: string;
  input?: AionisObject;
  input_ref?: string;
  output_ref?: string;
  depends_on: string[];
  deterministic?: boolean;
  loc?: SourceRange;
}

export interface ExecutionPlanDeterminism {
  executable: boolean;
  replay_mode?: ReplayIR["mode"];
  requires_resume_support: boolean;
}

export interface ExecutionPlanV1 {
  plan_version: typeof EXECUTION_PLAN_V1;
  doc: ExecutionPlanDocMeta | null;
  context: ExecutionPlanContext;
  executions: ExecutionPlanStep[];
  graph: ExecutionGraph | null;
  expected_outputs: string[];
  required_capabilities: string[];
  determinism: ExecutionPlanDeterminism;
  diagnostics: Diagnostic[];
}
