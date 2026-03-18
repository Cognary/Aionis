import type { Diagnostic } from "../diagnostics/types.js";
import type { AionisDocIR } from "../ir/types.js";

export function validateIrSchemas(ir: AionisDocIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!ir.doc) {
    diagnostics.push({
      severity: "error",
      code: "MISSING_DOC",
      message: "Document is missing a @doc directive.",
      loc: ir.executions[0]?.loc ?? ir.context[0]?.loc ?? ir.replay[0]?.loc ?? ir.diagnostics[0]?.loc ?? {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    });
    return diagnostics;
  }

  if (ir.doc.id.trim().length === 0) {
    diagnostics.push({
      severity: "error",
      code: "INVALID_SCHEMA",
      message: "@doc.id must be a non-empty string.",
      loc: ir.doc.loc ?? {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    });
  }

  if (ir.doc.version.trim().length === 0) {
    diagnostics.push({
      severity: "error",
      code: "INVALID_SCHEMA",
      message: "@doc.version must be a non-empty string.",
      loc: ir.doc.loc ?? {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    });
  }

  for (const execution of ir.executions) {
    if (!execution.module && !execution.tool && !execution.agent) {
      diagnostics.push({
        severity: "error",
        code: "INVALID_SCHEMA",
        message: "@execute requires at least one of module, tool, or agent.",
        loc: execution.loc ?? ir.doc.loc ?? {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      });
    }
  }

  for (const replay of ir.replay) {
    if (replay.mode && !["deterministic", "assisted", "advisory"].includes(replay.mode)) {
      diagnostics.push({
        severity: "error",
        code: "INVALID_SCHEMA",
        message: `Unsupported replay mode '${replay.mode}'.`,
        loc: replay.loc ?? ir.doc.loc ?? {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      });
    }
  }

  return diagnostics;
}
