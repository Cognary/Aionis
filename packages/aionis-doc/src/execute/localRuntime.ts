import {
  type ExecutionModuleDefinition,
} from "./types.js";
import {
  ModuleRegistryExecutionRuntime,
  StaticModuleRegistry,
  createExecutionRuntimeCapabilities,
} from "./moduleRuntime.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const LOCAL_DEMO_MODULES: ExecutionModuleDefinition[] = [
  {
    manifest: {
      module: "demo.hello.v1",
      version: "1.0.0",
      description: "Return a greeting payload from document context.",
      deterministic: true,
      required_capabilities: ["direct_execution"],
      input_contract: {
        kind: "object",
        properties: {
          objective: { kind: "string" },
        },
        additional_properties: true,
      },
      output_contract: {
        kind: "object",
        properties: {
          message: { kind: "string" },
        },
        required: ["message"],
        additional_properties: false,
      },
    },
    handler: (input) => {
      const objective = isObject(input) && typeof input.objective === "string" ? input.objective : null;
      return {
        message: objective ? `Hello from Aionis Doc: ${objective}` : "Hello from Aionis Doc.",
      };
    },
  },
  {
    manifest: {
      module: "research.claims.v1",
      version: "1.0.0",
      description: "Generate short product claims from context fields.",
      deterministic: true,
      required_capabilities: ["direct_execution"],
      input_contract: {
        kind: "object",
        properties: {
          product: { kind: "string" },
          audience: {
            kind: "array",
            items: { kind: "string" },
          },
        },
        additional_properties: true,
      },
      output_contract: {
        kind: "object",
        properties: {
          claims: {
            kind: "array",
            items: { kind: "string" },
          },
        },
        required: ["claims"],
        additional_properties: false,
      },
    },
    handler: (input) => {
      const product = isObject(input) && typeof input.product === "string" ? input.product : "Aionis";
      const audience =
        isObject(input) && Array.isArray(input.audience)
          ? input.audience.filter((item): item is string => typeof item === "string")
          : [];
      const audienceText = audience.length > 0 ? audience.join(" and ") : "teams";
      return {
        claims: [
          `${product} helps ${audienceText} continue work without rediscovery.`,
          `${product} turns executable documents into continuity-aware workflows.`,
        ],
      };
    },
  },
  {
    manifest: {
      module: "copy.hero.v1",
      version: "1.0.0",
      description: "Map a claims array into a single hero line.",
      deterministic: true,
      required_capabilities: ["direct_execution"],
      input_contract: {
        kind: "object",
        properties: {
          claims: {
            kind: "array",
            items: { kind: "string" },
          },
        },
        additional_properties: true,
      },
      output_contract: {
        kind: "object",
        properties: {
          hero: { kind: "string" },
        },
        required: ["hero"],
        additional_properties: false,
      },
    },
    handler: (input) => {
      const claims =
        isObject(input) && Array.isArray(input.claims)
          ? input.claims.filter((item): item is string => typeof item === "string")
          : [];
      return {
        hero: claims[0] ?? "Portable execution starts with one document.",
      };
    },
  },
  {
    manifest: {
      module: "copy.summary.v1",
      version: "1.0.0",
      description: "Map a claims array into a summary paragraph.",
      deterministic: true,
      required_capabilities: ["direct_execution"],
      input_contract: {
        kind: "object",
        properties: {
          claims: {
            kind: "array",
            items: { kind: "string" },
          },
        },
        additional_properties: true,
      },
      output_contract: {
        kind: "object",
        properties: {
          summary: { kind: "string" },
        },
        required: ["summary"],
        additional_properties: false,
      },
    },
    handler: (input) => {
      const claims =
        isObject(input) && Array.isArray(input.claims)
          ? input.claims.filter((item): item is string => typeof item === "string")
          : [];
      return {
        summary: claims.join(" ") || "Aionis Doc produced an execution summary.",
      };
    },
  },
];

export function createLocalDemoModuleRegistry(): StaticModuleRegistry {
  return new StaticModuleRegistry(LOCAL_DEMO_MODULES);
}

export class LocalExecutionRuntime extends ModuleRegistryExecutionRuntime {
  constructor() {
    super({
      runtime_id: "local_demo_runtime_v1",
      registry: createLocalDemoModuleRegistry(),
      capabilities: createExecutionRuntimeCapabilities({
        direct_execution: true,
        module_registry: true,
      }),
    });
  }
}
