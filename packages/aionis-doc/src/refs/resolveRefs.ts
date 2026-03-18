import type { Diagnostic } from "../diagnostics/types.js";
import type { AionisDocIR, AionisObject, AionisValue, ExecuteIR } from "../ir/types.js";

export interface RefBinding {
  raw: string;
  scope: string;
  path: string[];
}

export interface RefResolutionResult {
  ir: AionisDocIR;
  bindings: RefBinding[];
  diagnostics: Diagnostic[];
}

const VALID_SCOPES = new Set(["doc", "ctx", "run", "out", "mem"]);

function parseRef(ref: string): RefBinding | null {
  const match = /^([A-Za-z][A-Za-z0-9_-]*)(?:\.([A-Za-z0-9_.-]+))?$/.exec(ref.trim());
  if (!match) return null;
  return {
    raw: ref,
    scope: match[1],
    path: match[2] ? match[2].split(".") : [],
  };
}

function isObject(value: AionisValue | undefined): value is AionisObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getPathValue(source: AionisValue | undefined, path: string[]): AionisValue | undefined {
  let current = source;
  for (const segment of path) {
    if (!isObject(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function buildMergedContext(context: AionisDocIR["context"]): AionisObject {
  const merged: AionisObject = {};
  for (const entry of context) {
    Object.assign(merged, entry.data);
  }
  return merged;
}

function validateBinding(ir: AionisDocIR, binding: RefBinding, execution: ExecuteIR): Diagnostic | null {
  if (!VALID_SCOPES.has(binding.scope)) {
    return {
      severity: "error",
      code: "UNRESOLVED_REF",
      message: `Unknown ref scope '${binding.scope}' in '${binding.raw}'.`,
      loc: execution.loc ?? ir.doc?.loc ?? {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    };
  }

  if (binding.scope === "ctx") {
    const merged = buildMergedContext(ir.context);
    const value = binding.path.length === 0 ? merged : getPathValue(merged, binding.path);
    if (value === undefined) {
      return {
        severity: "error",
        code: "UNRESOLVED_REF",
        message: `Context ref '${binding.raw}' could not be resolved.`,
        loc: execution.loc ?? ir.doc?.loc ?? {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      };
    }
  }

  if (binding.scope === "doc") {
    const docValue = ir.doc?.data;
    const value = binding.path.length === 0 ? docValue : getPathValue(docValue, binding.path);
    if (value === undefined) {
      return {
        severity: "error",
        code: "UNRESOLVED_REF",
        message: `Document ref '${binding.raw}' could not be resolved.`,
        loc: execution.loc ?? ir.doc?.loc ?? {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      };
    }
  }

  return null;
}

export function resolveRefs(ir: AionisDocIR): RefResolutionResult {
  const bindings: RefBinding[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const execution of ir.executions) {
    if (!execution.input_ref) continue;
    const binding = parseRef(execution.input_ref);
    if (!binding) {
      diagnostics.push({
        severity: "error",
        code: "UNRESOLVED_REF",
        message: `Invalid ref syntax '${execution.input_ref}'.`,
        loc: execution.loc ?? ir.doc?.loc ?? {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      });
      continue;
    }
    bindings.push(binding);
    const diagnostic = validateBinding(ir, binding, execution);
    if (diagnostic) diagnostics.push(diagnostic);
  }

  return {
    ir,
    bindings,
    diagnostics,
  };
}
