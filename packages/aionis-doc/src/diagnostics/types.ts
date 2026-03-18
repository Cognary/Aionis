export interface SourcePos {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourcePos;
  end: SourcePos;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  loc: SourceRange;
  hint?: string;
}
