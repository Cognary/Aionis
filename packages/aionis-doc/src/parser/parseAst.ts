import type { AstNode, CodeFenceNode, DirectiveNode, DocumentNode, HeadingNode, ParagraphNode } from "../ast/types.js";
import type { Diagnostic } from "../diagnostics/types.js";
import type { ScanResult } from "../scanner/scanSource.js";
import { findLineIndexAtOffset, rangeFromOffsets } from "../scanner/scanSource.js";
import { parseAionisPayload } from "./payload.js";

function isFenceLine(line: string): boolean {
  return /^\s*```/.test(line);
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function isDirectiveLine(line: string): boolean {
  return /^\s*@[A-Za-z][A-Za-z0-9_.-]*/.test(line);
}

function countNewlines(source: string, start: number, end: number): number {
  let count = 0;
  for (let i = start; i < end; i += 1) {
    if (source[i] === "\n") count += 1;
  }
  return count;
}

function findDirectiveBlockEnd(source: string, braceStart: number): number {
  let depth = 0;
  let quote: "\"" | "'" | null = null;
  let escaped = false;

  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

function makeInvalidDirectiveDiagnostic(scan: ScanResult, start: number, end: number, message: string): Diagnostic {
  return {
    severity: "error",
    code: "INVALID_PAYLOAD",
    message,
    loc: rangeFromOffsets(scan, start, end),
    hint: "Directives must be followed by a balanced { ... } payload.",
  };
}

export function parseAst(scan: ScanResult): DocumentNode {
  const lines = scan.source.split("\n");
  const children: AstNode[] = [];
  const diagnostics: Diagnostic[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineStart = scan.lineStarts[lineIndex] ?? scan.source.length;

    if (line.trim().length === 0) {
      continue;
    }

    if (isFenceLine(line)) {
      const startOffset = lineStart;
      const fenceStart = line.trim();
      const info = fenceStart.slice(3).trim() || undefined;
      let endLineIndex = lineIndex;
      while (endLineIndex + 1 < lines.length) {
        endLineIndex += 1;
        if (isFenceLine(lines[endLineIndex])) {
          break;
        }
      }
      const isClosed = endLineIndex !== lineIndex && isFenceLine(lines[endLineIndex]);
      const endOffset =
        endLineIndex + 1 < scan.lineStarts.length ? scan.lineStarts[endLineIndex + 1] : scan.source.length;
      const node: CodeFenceNode = {
        type: "CodeFenceNode",
        fence: "```",
        info,
        content: lines.slice(lineIndex + 1, isClosed ? endLineIndex : endLineIndex + 1).join("\n"),
        raw: scan.source.slice(startOffset, endOffset),
        loc: rangeFromOffsets(scan, startOffset, endOffset),
      };
      children.push(node);
      if (!isClosed) {
        diagnostics.push({
          severity: "warning",
          code: "UNCLOSED_FENCE",
          message: "Code fence reaches end of file without a closing delimiter.",
          loc: node.loc,
        });
      }
      lineIndex = endLineIndex;
      continue;
    }

    if (isHeadingLine(line)) {
      const match = /^(#{1,6})\s+(.*)$/.exec(line);
      if (match) {
        const node: HeadingNode = {
          type: "HeadingNode",
          depth: match[1].length,
          text: match[2],
          raw: line,
          loc: rangeFromOffsets(scan, lineStart, lineStart + line.length),
        };
        children.push(node);
        continue;
      }
    }

    if (isDirectiveLine(line)) {
      const match = /^(\s*)@([A-Za-z][A-Za-z0-9_.-]*)/.exec(line);
      if (!match) continue;
      const directiveStart = lineStart + match[1].length;
      const afterHead = directiveStart + 1 + match[2].length;
      let payloadStart = afterHead;
      while (payloadStart < scan.source.length && /\s/.test(scan.source[payloadStart])) {
        payloadStart += 1;
      }
      if (scan.source[payloadStart] !== "{") {
        const endOffset = lineStart + line.length;
        const node: DirectiveNode = {
          type: "DirectiveNode",
          name: match[2],
          payload: null,
          raw: scan.source.slice(directiveStart, endOffset),
          loc: rangeFromOffsets(scan, directiveStart, endOffset),
          diagnostics: [
            makeInvalidDirectiveDiagnostic(scan, directiveStart, endOffset, "Directive is missing an object payload."),
          ],
        };
        children.push(node);
        diagnostics.push(...(node.diagnostics ?? []));
        continue;
      }

      const endOffset = findDirectiveBlockEnd(scan.source, payloadStart);
      if (endOffset < 0) {
        const node: DirectiveNode = {
          type: "DirectiveNode",
          name: match[2],
          payload: null,
          raw: scan.source.slice(directiveStart),
          loc: rangeFromOffsets(scan, directiveStart, scan.source.length),
          diagnostics: [
            makeInvalidDirectiveDiagnostic(
              scan,
              directiveStart,
              scan.source.length,
              "Directive payload ends before its closing brace.",
            ),
          ],
        };
        children.push(node);
        diagnostics.push(...(node.diagnostics ?? []));
        break;
      }

      const loc = rangeFromOffsets(scan, directiveStart, endOffset);
      const payload = parseAionisPayload(scan.source.slice(payloadStart, endOffset), loc);
      const node: DirectiveNode = {
        type: "DirectiveNode",
        name: match[2],
        payload: payload.value,
        raw: scan.source.slice(directiveStart, endOffset),
        loc,
        diagnostics: payload.diagnostics,
      };
      children.push(node);
      diagnostics.push(...payload.diagnostics);
      lineIndex += countNewlines(scan.source, directiveStart, endOffset);
      continue;
    }

    const paragraphStart = lineStart;
    let paragraphEndLine = lineIndex;
    while (paragraphEndLine + 1 < lines.length) {
      const next = lines[paragraphEndLine + 1];
      if (
        next.trim().length === 0 ||
        isFenceLine(next) ||
        isHeadingLine(next) ||
        isDirectiveLine(next)
      ) {
        break;
      }
      paragraphEndLine += 1;
    }
    const paragraphEndOffset =
      paragraphEndLine + 1 < scan.lineStarts.length ? scan.lineStarts[paragraphEndLine + 1] : scan.source.length;
    const node: ParagraphNode = {
      type: "ParagraphNode",
      text: lines.slice(lineIndex, paragraphEndLine + 1).join("\n").trim(),
      raw: scan.source.slice(paragraphStart, paragraphEndOffset),
      loc: rangeFromOffsets(scan, paragraphStart, paragraphEndOffset),
    };
    children.push(node);
    lineIndex = paragraphEndLine;
  }

  return {
    type: "DocumentNode",
    children,
    diagnostics,
    loc: rangeFromOffsets(scan, 0, scan.source.length),
  };
}
