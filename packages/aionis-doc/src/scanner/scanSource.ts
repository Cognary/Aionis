import type { SourcePos, SourceRange } from "../diagnostics/types.js";

export interface ScanResult {
  source: string;
  lineStarts: number[];
}

export function scanSource(source: string): ScanResult {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return { source, lineStarts };
}

export function findLineIndexAtOffset(scan: ScanResult, offset: number): number {
  let low = 0;
  let high = scan.lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = scan.lineStarts[mid];
    const next = mid + 1 < scan.lineStarts.length ? scan.lineStarts[mid + 1] : scan.source.length + 1;
    if (offset < start) {
      high = mid - 1;
    } else if (offset >= next) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return Math.max(0, scan.lineStarts.length - 1);
}

export function offsetToSourcePos(scan: ScanResult, offset: number): SourcePos {
  const safeOffset = Math.max(0, Math.min(offset, scan.source.length));
  const lineIndex = findLineIndexAtOffset(scan, safeOffset);
  return {
    line: lineIndex + 1,
    column: safeOffset - scan.lineStarts[lineIndex] + 1,
    offset: safeOffset,
  };
}

export function rangeFromOffsets(scan: ScanResult, start: number, end: number): SourceRange {
  return {
    start: offsetToSourcePos(scan, start),
    end: offsetToSourcePos(scan, end),
  };
}
