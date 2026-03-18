import type { AionisValue } from "../ir/types.js";
import type { ExecutionPlanV1, ExecutionPlanStep } from "../plan/types.js";
import { validateExecutionModuleManifest } from "../contracts.js";
import {
  AIONIS_DOC_EXECUTION_RESULT_VERSION,
  type ExecutionArtifactRecord,
  type ExecutionModuleContext,
  type ExecutionModuleDefinition,
  type ExecutionModuleManifest,
  type ExecutionModuleRegistry,
  type ExecutionModuleValueContract,
  type ExecutionEvidenceRecord,
  type ExecutionModuleOutcome,
  type ExecutionNodeResult,
  type ExecutionResultV1,
  type ExecutionRuntime,
  type ExecutionRuntimeCapabilities,
} from "./types.js";

function isObject(value: AionisValue): value is Record<string, AionisValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPathValue(root: AionisValue, path: string[]): AionisValue | undefined {
  let current: AionisValue | undefined = root;
  for (const segment of path) {
    if (!isObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

export function resolveExecutionInput(
  plan: ExecutionPlanV1,
  outputs: Record<string, AionisValue>,
  step: ExecutionPlanStep,
): AionisValue {
  if (step.input) return step.input;
  if (!step.input_ref) return {};

  if (step.input_ref === "ctx") return plan.context.merged;
  if (step.input_ref.startsWith("ctx.")) {
    return getPathValue(plan.context.merged, step.input_ref.slice(4).split(".")) ?? null;
  }

  if (step.input_ref in outputs) return outputs[step.input_ref];

  const [rootRef, ...rest] = step.input_ref.split(".");
  if ((rootRef === "run" || rootRef === "out") && rest.length > 1) {
    const candidate = `${rootRef}.${rest[0]}`;
    if (candidate in outputs) {
      return getPathValue(outputs[candidate], rest.slice(1)) ?? null;
    }
  }

  return null;
}

function missingDependency(step: ExecutionPlanStep, outputs: Record<string, AionisValue>): string | null {
  for (const dependency of step.depends_on) {
    if (!(dependency in outputs)) return dependency;
  }
  return null;
}

function contractPath(path: string, segment: string): string {
  return path === "$" ? `$.${segment}` : `${path}.${segment}`;
}

function validateValueAgainstContract(
  value: AionisValue,
  contract: ExecutionModuleValueContract,
  path = "$",
): string[] {
  switch (contract.kind) {
    case "any":
      return [];
    case "string":
      return typeof value === "string" ? [] : [`Expected string at '${path}'.`];
    case "number":
      return typeof value === "number" ? [] : [`Expected number at '${path}'.`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`Expected boolean at '${path}'.`];
    case "null":
      return value === null ? [] : [`Expected null at '${path}'.`];
    case "array": {
      if (!Array.isArray(value)) return [`Expected array at '${path}'.`];
      if (!contract.items) return [];
      return value.flatMap((item, index) => validateValueAgainstContract(item, contract.items!, `${path}[${index}]`));
    }
    case "object": {
      if (!isObject(value)) return [`Expected object at '${path}'.`];
      const errors: string[] = [];
      const properties = contract.properties ?? {};
      const required = new Set(contract.required ?? []);
      for (const key of required) {
        if (!(key in value)) errors.push(`Missing required property '${key}' at '${path}'.`);
      }
      for (const [key, propertyContract] of Object.entries(properties)) {
        if (!(key in value)) continue;
        errors.push(...validateValueAgainstContract(value[key], propertyContract, contractPath(path, key)));
      }
      if (contract.additional_properties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in properties)) errors.push(`Unexpected property '${key}' at '${path}'.`);
        }
      }
      return errors;
    }
  }
}

function missingModuleCapabilities(
  manifest: ExecutionModuleManifest,
  capabilities: ExecutionRuntimeCapabilities,
): string[] {
  return (manifest.required_capabilities ?? []).filter((capability) => !capabilities[capability]);
}

function isModuleOutcome(value: AionisValue | ExecutionModuleOutcome): value is ExecutionModuleOutcome {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === "module_result" &&
    "output" in value
  );
}

export function createExecutionRuntimeCapabilities(
  overrides: Partial<ExecutionRuntimeCapabilities> = {},
): ExecutionRuntimeCapabilities {
  return {
    direct_execution: true,
    deterministic_replay: false,
    state_persistence: false,
    memory_publish: false,
    handoff_recover: false,
    module_registry: true,
    evidence_capture: false,
    ...overrides,
  };
}

export class StaticModuleRegistry implements ExecutionModuleRegistry {
  readonly #modules: Map<string, ExecutionModuleDefinition>;

  constructor(modules: ExecutionModuleDefinition[]) {
    this.#modules = new Map(
      modules.map((definition) => {
        validateExecutionModuleManifest(definition.manifest);
        return [definition.manifest.module, definition];
      }),
    );
  }

  has(moduleName: string): boolean {
    return this.#modules.has(moduleName);
  }

  get(moduleName: string): ExecutionModuleDefinition | undefined {
    return this.#modules.get(moduleName);
  }

  getManifest(moduleName: string): ExecutionModuleManifest | undefined {
    return this.#modules.get(moduleName)?.manifest;
  }

  list(): ExecutionModuleDefinition[] {
    return [...this.#modules.values()];
  }

  listManifests(): ExecutionModuleManifest[] {
    return this.list().map((definition) => definition.manifest);
  }
}

export class ModuleRegistryExecutionRuntime implements ExecutionRuntime {
  readonly runtime_id: string;
  readonly #registry: ExecutionModuleRegistry;
  readonly #capabilities: ExecutionRuntimeCapabilities;

  constructor(args: {
    runtime_id: string;
    registry: ExecutionModuleRegistry;
    capabilities?: Partial<ExecutionRuntimeCapabilities>;
  }) {
    this.runtime_id = args.runtime_id;
    this.#registry = args.registry;
    this.#capabilities = createExecutionRuntimeCapabilities(args.capabilities);
  }

  capabilities(): ExecutionRuntimeCapabilities {
    return this.#capabilities;
  }

  async execute(plan: ExecutionPlanV1): Promise<ExecutionResultV1> {
    const outputs: Record<string, AionisValue> = {};
    const artifacts: ExecutionArtifactRecord[] = [];
    const evidence: ExecutionEvidenceRecord[] = [];
    const nodeResults: ExecutionNodeResult[] = [];
    const errors: string[] = [];

    for (const step of plan.executions) {
      const unmetDependency = missingDependency(step, outputs);
      if (unmetDependency) {
        const message = `Execution '${step.execution_id}' is blocked on missing dependency '${unmetDependency}'.`;
        nodeResults.push({
          execution_id: step.execution_id,
          module: step.module,
          tool: step.tool,
          agent: step.agent,
          status: "failed",
          input_ref: step.input_ref,
          output_ref: step.output_ref,
          error: message,
        });
        errors.push(message);
        continue;
      }

      if (!step.module) {
        const message = `Execution '${step.execution_id}' has no module and cannot run on runtime '${this.runtime_id}'.`;
        nodeResults.push({
          execution_id: step.execution_id,
          module: step.module,
          tool: step.tool,
          agent: step.agent,
          status: "failed",
          input_ref: step.input_ref,
          output_ref: step.output_ref,
          error: message,
        });
        errors.push(message);
        continue;
      }

      const definition = this.#registry.get(step.module);
      if (!definition) {
        const message = `Module '${step.module}' is not supported by runtime '${this.runtime_id}'.`;
        nodeResults.push({
          execution_id: step.execution_id,
          module: step.module,
          tool: step.tool,
          agent: step.agent,
          status: "failed",
          input_ref: step.input_ref,
          output_ref: step.output_ref,
          error: message,
        });
        errors.push(message);
        continue;
      }

      const missingCapabilities = missingModuleCapabilities(definition.manifest, this.#capabilities);
      if (missingCapabilities.length > 0) {
        const message = `Module '${step.module}' requires unsupported runtime capabilities: ${missingCapabilities.join(", ")}.`;
        nodeResults.push({
          execution_id: step.execution_id,
          module: step.module,
          tool: step.tool,
          agent: step.agent,
          status: "failed",
          input_ref: step.input_ref,
          output_ref: step.output_ref,
          error: message,
        });
        errors.push(message);
        continue;
      }

      const input = resolveExecutionInput(plan, outputs, step);
      if (definition.manifest.input_contract) {
        const inputErrors = validateValueAgainstContract(input, definition.manifest.input_contract);
        if (inputErrors.length > 0) {
          const message = `Input contract validation failed for module '${step.module}': ${inputErrors.join(" ")}`;
          nodeResults.push({
            execution_id: step.execution_id,
            module: step.module,
            tool: step.tool,
            agent: step.agent,
            status: "failed",
            input_ref: step.input_ref,
            output_ref: step.output_ref,
            error: message,
          });
          errors.push(message);
          continue;
        }
      }

      const context: ExecutionModuleContext = {
        plan,
        step,
        outputs,
        runtime_id: this.runtime_id,
      };
      const rawResult = await definition.handler(input, context);
      const normalized = isModuleOutcome(rawResult)
        ? rawResult
        : {
            kind: "module_result" as const,
            output: rawResult,
            artifacts: [],
            evidence: [],
          };
      const output = normalized.output;
      const producedArtifacts = normalized.artifacts ?? [];
      const producedEvidence = normalized.evidence ?? [];
      if (definition.manifest.output_contract) {
        const outputErrors = validateValueAgainstContract(output, definition.manifest.output_contract);
        if (outputErrors.length > 0) {
          const message = `Output contract validation failed for module '${step.module}': ${outputErrors.join(" ")}`;
          nodeResults.push({
            execution_id: step.execution_id,
            module: step.module,
            tool: step.tool,
            agent: step.agent,
            status: "failed",
            input_ref: step.input_ref,
            output_ref: step.output_ref,
            error: message,
          });
          errors.push(message);
          continue;
        }
      }
      if (definition.manifest.artifact_contract) {
        const artifactErrors = producedArtifacts.flatMap((value, index) =>
          validateValueAgainstContract(value, definition.manifest.artifact_contract!, `artifacts[${index}]`),
        );
        if (artifactErrors.length > 0) {
          const message = `Artifact contract validation failed for module '${step.module}': ${artifactErrors.join(" ")}`;
          nodeResults.push({
            execution_id: step.execution_id,
            module: step.module,
            tool: step.tool,
            agent: step.agent,
            status: "failed",
            input_ref: step.input_ref,
            output_ref: step.output_ref,
            error: message,
          });
          errors.push(message);
          continue;
        }
      }
      if (definition.manifest.evidence_contract) {
        const evidenceErrors = producedEvidence.flatMap((value, index) =>
          validateValueAgainstContract(value, definition.manifest.evidence_contract!, `evidence[${index}]`),
        );
        if (evidenceErrors.length > 0) {
          const message = `Evidence contract validation failed for module '${step.module}': ${evidenceErrors.join(" ")}`;
          nodeResults.push({
            execution_id: step.execution_id,
            module: step.module,
            tool: step.tool,
            agent: step.agent,
            status: "failed",
            input_ref: step.input_ref,
            output_ref: step.output_ref,
            error: message,
          });
          errors.push(message);
          continue;
        }
      }
      if (step.output_ref) outputs[step.output_ref] = output;
      artifacts.push(
        ...producedArtifacts.map((value) => ({
          execution_id: step.execution_id,
          module: step.module,
          value,
        })),
      );
      evidence.push(
        ...producedEvidence.map((value) => ({
          execution_id: step.execution_id,
          module: step.module,
          value,
        })),
      );
      nodeResults.push({
        execution_id: step.execution_id,
        module: step.module,
        tool: step.tool,
        agent: step.agent,
        status: "success",
        input_ref: step.input_ref,
        output_ref: step.output_ref,
        output,
        artifacts: producedArtifacts,
        evidence: producedEvidence,
      });
    }

    return {
      execution_result_version: AIONIS_DOC_EXECUTION_RESULT_VERSION,
      runtime_id: this.runtime_id,
      executed_at: new Date().toISOString(),
      plan_version: plan.plan_version,
      doc_id: plan.doc?.id ?? null,
      status: errors.length > 0 ? "failed" : "success",
      outputs,
      artifacts,
      evidence,
      node_results: nodeResults,
      expected_outputs: plan.expected_outputs,
      warnings: [],
      errors,
      diagnostics: plan.diagnostics,
    };
  }
}
