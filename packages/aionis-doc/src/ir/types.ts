import type { Diagnostic, SourceRange } from "../diagnostics/types.js";

export type AionisPrimitive = string | number | boolean | null;

export type AionisValue = AionisPrimitive | AionisObject | AionisValue[];

export interface AionisObject {
  [key: string]: AionisValue;
}

export interface DocMetaIR {
  id: string;
  version: string;
  kind?: string;
  title?: string;
  status?: string;
  tags?: string[];
  data: AionisObject;
  loc?: SourceRange;
}

export interface ContextIR {
  objective?: string;
  audience?: string[];
  constraints?: string[];
  data: AionisObject;
  loc?: SourceRange;
}

export interface PlanIR {
  steps?: string[];
  success_criteria?: string[];
  checkpoints?: string[];
  fallbacks?: string[];
  data: AionisObject;
  loc?: SourceRange;
}

export interface ExecuteIR {
  module?: string;
  tool?: string;
  agent?: string;
  input?: AionisObject;
  input_ref?: string;
  output_ref?: string;
  deterministic?: boolean;
  depends_on?: string[];
  data: AionisObject;
  loc?: SourceRange;
}

export interface DecisionIR {
  decision?: string;
  rationale?: string;
  confidence?: number;
  data: AionisObject;
  loc?: SourceRange;
}

export interface EvidenceIR {
  sources?: AionisValue[];
  confidence?: number;
  claims_supported?: string[];
  data: AionisObject;
  loc?: SourceRange;
}

export interface ReplayIR {
  executable?: boolean;
  mode?: "deterministic" | "assisted" | "advisory";
  workflow_id?: string;
  expected_outputs?: string[];
  data: AionisObject;
  loc?: SourceRange;
}

export interface MemoryIR {
  topics?: string[];
  entities?: string[];
  writeback?: boolean;
  summary_layer?: string;
  data: AionisObject;
  loc?: SourceRange;
}

export interface StateIR {
  phase?: string;
  run_id?: string;
  owner?: string;
  data: AionisObject;
  loc?: SourceRange;
}

export interface AionisDocIR {
  doc: DocMetaIR | null;
  context: ContextIR[];
  plans: PlanIR[];
  executions: ExecuteIR[];
  decisions: DecisionIR[];
  evidence: EvidenceIR[];
  replay: ReplayIR[];
  memory: MemoryIR[];
  state: StateIR[];
  diagnostics: Diagnostic[];
}
