import type { Diagnostic, SourceRange } from "../diagnostics/types.js";
import type { AionisObject } from "../ir/types.js";

export interface ExecutionGraph {
  graph_id: string;
  doc_id: string;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  diagnostics?: Diagnostic[];
}

export interface ExecutionNode {
  id: string;
  type:
    | "context_node"
    | "execute_node"
    | "decision_node"
    | "evidence_node"
    | "output_node"
    | "memory_write_node"
    | "replay_node";
  label?: string;
  module?: string;
  input_ref?: string;
  output_ref?: string;
  payload?: AionisObject;
  loc?: SourceRange;
}

export interface ExecutionEdge {
  from: string;
  to: string;
  type:
    | "data_dependency"
    | "sequence_dependency"
    | "evidence_attachment"
    | "memory_writeback"
    | "replay_anchor";
}
