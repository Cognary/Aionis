import type { Diagnostic } from "../diagnostics/types.js";
import type { ExecutionGraph, ExecutionNode } from "./types.js";
import type { AionisDocIR } from "../ir/types.js";

export interface GraphBuildResult {
  value: ExecutionGraph | null;
  diagnostics: Diagnostic[];
}

export function buildExecutionGraph(ir: AionisDocIR): GraphBuildResult {
  if (!ir.doc) {
    return { value: null, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = [];
  const nodes: ExecutionNode[] = [];
  const edges: ExecutionGraph["edges"] = [];
  const nodeByOutputRef = new Map<string, string>();
  const nodeById = new Map<string, string>();

  ir.executions.forEach((execution, index) => {
    const id = `exec_${index + 1}`;
    const node: ExecutionNode = {
      id,
      type: "execute_node",
      label: execution.module ?? execution.tool ?? execution.agent ?? `execute_${index + 1}`,
      module: execution.module,
      input_ref: execution.input_ref,
      output_ref: execution.output_ref,
      payload: execution.data,
      loc: execution.loc,
    };
    nodes.push(node);
    nodeById.set(id, id);
    if (execution.output_ref) {
      nodeByOutputRef.set(execution.output_ref, id);
    }

    if (execution.input_ref) {
      const upstream = nodeByOutputRef.get(execution.input_ref);
      if (upstream) {
        edges.push({
          from: upstream,
          to: id,
          type: "data_dependency",
        });
      }
    }

    for (const dependency of execution.depends_on ?? []) {
      const upstream = nodeByOutputRef.get(dependency) ?? nodeById.get(dependency);
      if (upstream) {
        edges.push({
          from: upstream,
          to: id,
          type: "sequence_dependency",
        });
      } else {
        diagnostics.push({
          severity: "warning",
          code: "UNKNOWN_DEPENDENCY",
          message: `Dependency '${dependency}' does not match a previous node or output ref.`,
          loc: execution.loc ?? ir.doc?.loc ?? {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 },
          },
        });
      }
    }
  });

  return {
    value: {
      graph_id: `graph:${ir.doc.id}`,
      doc_id: ir.doc.id,
      nodes,
      edges,
      diagnostics,
    },
    diagnostics,
  };
}
