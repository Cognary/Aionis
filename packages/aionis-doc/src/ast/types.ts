import type { Diagnostic, SourceRange } from "../diagnostics/types.js";
import type { AionisValue } from "../ir/types.js";

export interface BaseNode {
  type: string;
  loc: SourceRange;
  raw?: string;
}

export interface DocumentNode extends BaseNode {
  type: "DocumentNode";
  children: AstNode[];
  diagnostics: Diagnostic[];
}

export interface HeadingNode extends BaseNode {
  type: "HeadingNode";
  depth: number;
  text: string;
}

export interface ParagraphNode extends BaseNode {
  type: "ParagraphNode";
  text: string;
}

export interface CodeFenceNode extends BaseNode {
  type: "CodeFenceNode";
  fence: "```";
  info?: string;
  content: string;
}

export interface DirectiveNode extends BaseNode {
  type: "DirectiveNode";
  name: string;
  payload: AionisValue | null;
  diagnostics?: Diagnostic[];
}

export type AstNode = HeadingNode | ParagraphNode | CodeFenceNode | DirectiveNode;
