import type { Diagnostic } from "../diagnostics/types.js";
import type { AionisValue } from "../ir/types.js";
import type { ExecutionPlanStep, ExecutionPlanV1 } from "../plan/types.js";

export const AIONIS_DOC_EXECUTION_RESULT_VERSION = "aionis_doc_execution_result_v1" as const;

export interface ExecutionNodeResult {
  execution_id: string;
  module?: string;
  tool?: string;
  agent?: string;
  status: "success" | "failed" | "skipped";
  input_ref?: string;
  output_ref?: string;
  output?: AionisValue;
  artifacts?: AionisValue[];
  evidence?: AionisValue[];
  error?: string;
}

export interface ExecutionArtifactRecord {
  execution_id: string;
  module?: string;
  value: AionisValue;
}

export interface ExecutionEvidenceRecord {
  execution_id: string;
  module?: string;
  value: AionisValue;
}

export type ExecutionRuntimeCapability =
  | "direct_execution"
  | "deterministic_replay"
  | "state_persistence"
  | "memory_publish"
  | "handoff_recover"
  | "module_registry"
  | "evidence_capture";

export interface ExecutionRuntimeCapabilities {
  direct_execution: boolean;
  deterministic_replay: boolean;
  state_persistence: boolean;
  memory_publish: boolean;
  handoff_recover: boolean;
  module_registry: boolean;
  evidence_capture: boolean;
}

export interface ExecutionModuleContext {
  plan: ExecutionPlanV1;
  step: ExecutionPlanStep;
  outputs: Record<string, AionisValue>;
  runtime_id: string;
}

export type ExecutionModuleValueContractKind = "any" | "string" | "number" | "boolean" | "null" | "array" | "object";

export interface ExecutionModuleValueContract {
  kind: ExecutionModuleValueContractKind;
  description?: string;
  properties?: Record<string, ExecutionModuleValueContract>;
  required?: string[];
  items?: ExecutionModuleValueContract;
  additional_properties?: boolean;
}

export interface ExecutionModuleManifest {
  module: string;
  version: string;
  title?: string;
  description?: string;
  deterministic?: boolean;
  required_capabilities?: ExecutionRuntimeCapability[];
  input_contract?: ExecutionModuleValueContract;
  output_contract?: ExecutionModuleValueContract;
  artifact_contract?: ExecutionModuleValueContract;
  evidence_contract?: ExecutionModuleValueContract;
}

export interface ExecutionModuleOutcome {
  kind: "module_result";
  output: AionisValue;
  artifacts?: AionisValue[];
  evidence?: AionisValue[];
}

export type ExecutionModuleHandler = (
  input: AionisValue,
  context: ExecutionModuleContext,
) => Promise<AionisValue | ExecutionModuleOutcome> | AionisValue | ExecutionModuleOutcome;

export interface ExecutionModuleDefinition {
  manifest: ExecutionModuleManifest;
  handler: ExecutionModuleHandler;
}

export interface ExecutionModuleRegistry {
  has(moduleName: string): boolean;
  get(moduleName: string): ExecutionModuleDefinition | undefined;
  getManifest(moduleName: string): ExecutionModuleManifest | undefined;
  list(): ExecutionModuleDefinition[];
  listManifests(): ExecutionModuleManifest[];
}

export interface ExecutionResultV1 {
  execution_result_version: typeof AIONIS_DOC_EXECUTION_RESULT_VERSION;
  runtime_id: string;
  executed_at: string;
  plan_version: ExecutionPlanV1["plan_version"];
  doc_id: string | null;
  status: "success" | "failed";
  outputs: Record<string, AionisValue>;
  artifacts: ExecutionArtifactRecord[];
  evidence: ExecutionEvidenceRecord[];
  node_results: ExecutionNodeResult[];
  expected_outputs: string[];
  warnings: string[];
  errors: string[];
  diagnostics: Diagnostic[];
}

export interface ExecutionRuntime {
  runtime_id: string;
  capabilities(): ExecutionRuntimeCapabilities;
  execute(plan: ExecutionPlanV1): Promise<ExecutionResultV1>;
}

export interface ExecuteAionisDocOptions {
  runtime?: ExecutionRuntime;
}
