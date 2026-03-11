type ToolResultSummaryInput = {
  stdout?: string | null;
  stderr?: string | null;
  result?: unknown;
  exit_code?: number | null;
  error?: string | null;
  truncated?: boolean;
};

export type ToolResultSummary = {
  summary_version: "tool_result_summary_v1";
  stdout_preview: string;
  stderr_preview: string;
  stdout_chars: number;
  stderr_chars: number;
  result_kind: "none" | "null" | "scalar" | "array" | "object";
  result_keys: string[];
  result_preview: string | null;
  exit_code: number | null;
  error: string | null;
  truncated: boolean;
  signals: string[];
};

const PREVIEW_MAX_CHARS = 240;
const RESULT_KEYS_MAX = 8;
const SIGNALS_MAX = 8;

function compactText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxChars = PREVIEW_MAX_CHARS): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function summarizePreview(value: unknown): string {
  return truncateText(compactText(value));
}

function classifyResultKind(value: unknown): ToolResultSummary["result_kind"] {
  if (value === undefined) return "none";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "scalar";
}

function pruneResultValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return truncateText(compactText(value), 120);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 2) {
    if (Array.isArray(value)) return `[array(${value.length})]`;
    return "[object]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 3).map((entry) => pruneResultValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort().slice(0, 5)) {
      out[key] = pruneResultValue((value as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  return String(value);
}

function buildResultPreview(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return truncateText(JSON.stringify(pruneResultValue(value)));
  } catch {
    return truncateText(String(value));
  }
}

function listResultKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort().slice(0, RESULT_KEYS_MAX);
}

export function summarizeToolResult(input: ToolResultSummaryInput): ToolResultSummary {
  const stdout = String(input.stdout ?? "");
  const stderr = String(input.stderr ?? "");
  const resultKind = classifyResultKind(input.result);
  const errorText = compactText(input.error);
  const signals: string[] = [];

  if (stderr.trim().length > 0) signals.push("stderr_present");
  if (Number.isFinite(input.exit_code ?? NaN) && Number(input.exit_code) !== 0) signals.push("nonzero_exit");
  if (errorText.length > 0) signals.push("execution_error");
  if (input.truncated) signals.push("output_truncated");
  if (resultKind === "object") signals.push("structured_result_object");
  if (resultKind === "array") signals.push("structured_result_array");
  if (stdout.length > 1024) signals.push("stdout_large");
  if (stderr.length > 1024) signals.push("stderr_large");

  return {
    summary_version: "tool_result_summary_v1",
    stdout_preview: summarizePreview(stdout),
    stderr_preview: summarizePreview(stderr),
    stdout_chars: stdout.length,
    stderr_chars: stderr.length,
    result_kind: resultKind,
    result_keys: listResultKeys(input.result),
    result_preview: buildResultPreview(input.result),
    exit_code: Number.isFinite(input.exit_code ?? NaN) ? Number(input.exit_code) : null,
    error: errorText.length > 0 ? errorText : null,
    truncated: !!input.truncated,
    signals: signals.slice(0, SIGNALS_MAX),
  };
}
