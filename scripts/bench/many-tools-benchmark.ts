import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AionisClient } from "../../src/sdk/index.js";
import {
  orderCandidatesFromCase,
  validateManyToolsCases,
  type ManyToolsCase,
  type ManyToolsCaseList,
} from "../../src/bench/many-tools.js";

type LlmProvider = "openai_compat" | "gemini";

type LlmConfig = {
  provider: LlmProvider;
  model: string;
  endpoint: string;
  headers: Record<string, string>;
  temperature: number;
  maxTokens: number;
  apiKeySource: string | null;
};

type ToolSelectionResult = {
  selectedTool: string | null;
  reason: string | null;
  rawText: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

type BenchVariant = "baseline" | "aionis_selection";

type BenchTrace = {
  run_id: string;
  variant: BenchVariant;
  case_id: string;
  family: string;
  bucket: number;
  difficulty: string;
  correct_first_tool: string;
  selected_tool: string | null;
  correct: boolean;
  omitted: boolean;
  wrong_tool: boolean;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  wall_clock_ms: number;
  ordered_candidates: string[];
  aionis_selected_tool: string | null;
  tool_registry_present: boolean | null;
  family_aware_ordering_applied: boolean | null;
  raw_output: string;
};

type BenchSummary = {
  run_id: string;
  created_at: string;
  variants: Record<string, {
    cases: number;
    first_correct_tool_rate: number;
    omission_rate: number;
    wrong_tool_rate: number;
    avg_total_tokens: number | null;
    avg_wall_clock_ms: number;
    by_bucket: Record<string, {
      cases: number;
      first_correct_tool_rate: number;
      omission_rate: number;
      wrong_tool_rate: number;
    }>;
    by_family: Record<string, {
      cases: number;
      first_correct_tool_rate: number;
      omission_rate: number;
      wrong_tool_rate: number;
    }>;
  }>;
};

function inferAionisApiKeyFromEnv(): string | undefined {
  const explicit = process.env.API_KEY?.trim() || process.env.PERF_API_KEY?.trim();
  if (explicit) return explicit;
  const raw = process.env.MEMORY_API_KEYS_JSON?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const first = Object.keys(parsed)[0];
    return first ? first.trim() : undefined;
  } catch {
    return undefined;
  }
}

function resolveApiKey(explicitKey: string, envCandidates: string[]): { key: string; source: string | null } {
  const explicit = explicitKey.trim();
  if (explicit) return { key: explicit, source: "explicit" };
  for (const candidate of envCandidates) {
    const value = process.env[candidate]?.trim();
    if (value) return { key: value, source: candidate };
  }
  return { key: "", source: null };
}

function buildLlmConfig(): LlmConfig {
  const provider = ((process.env.LLM_PROVIDER || "openai_compat").trim().toLowerCase()) as LlmProvider;
  if (provider !== "openai_compat" && provider !== "gemini") {
    throw new Error(`unsupported LLM_PROVIDER: ${provider}`);
  }
  const model = (process.env.LLM_MODEL || "").trim();
  if (!model) throw new Error("LLM_MODEL is required");
  const endpoint = (process.env.LLM_ENDPOINT || "").trim();
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").trim();
  const { key, source } = resolveApiKey(process.env.LLM_API_KEY || "", [
    "OPENAI_API_KEY",
    "MINIMAX_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
  ]);
  if (!key) throw new Error("missing LLM API key");
  const temperature = Number(process.env.LLM_TEMPERATURE || "0");
  const maxTokens = Math.max(32, Number(process.env.LLM_MAX_TOKENS || "256"));

  if (provider === "openai_compat") {
    return {
      provider,
      model,
      endpoint: endpoint || `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      temperature,
      maxTokens,
      apiKeySource: source,
    };
  }

  return {
    provider,
    model,
    endpoint: endpoint || `${baseUrl.replace(/\/$/, "")}/models/${model}:generateContent`,
    headers: {
      "x-goog-api-key": key,
      "Content-Type": "application/json",
    },
    temperature,
    maxTokens,
    apiKeySource: source,
  };
}

function readCases(casePaths: string[]): ManyToolsCaseList {
  const all: unknown[] = [];
  for (const casePath of casePaths) {
    const abs = path.resolve(casePath);
    const parsed = JSON.parse(readFileSync(abs, "utf8"));
    if (Array.isArray(parsed)) {
      all.push(...parsed);
      continue;
    }
    all.push(parsed);
  }
  return validateManyToolsCases(all);
}

function buildSelectionPrompt(args: {
  task: string;
  candidates: ManyToolsCase["candidates"];
  orderedCandidates: string[];
  variant: BenchVariant;
  aionisSelectedTool?: string | null;
}) {
  const byName = new Map(args.candidates.map((candidate) => [candidate.tool_name, candidate]));
  const rendered = args.orderedCandidates.map((toolName, index) => {
    const candidate = byName.get(toolName);
    const description = candidate?.description ? ` - ${candidate.description}` : "";
    return `${index + 1}. ${toolName}${description}`;
  }).join("\n");

  const governanceNote =
    args.variant === "aionis_selection"
      ? `The candidate list below has already been ordered by an execution-control layer. Start from the top unless a lower tool is clearly a better fit. Aionis selected: ${args.aionisSelectedTool ?? "none"}.`
      : "Choose the single best tool from the raw candidate list.";

  return [
    "You are evaluating tool choice quality.",
    governanceNote,
    "Return JSON only with this exact shape:",
    '{"selected_tool":"tool-name-or-null"}',
    "Do not invent tool names. selected_tool must be null if none fit. Do not add a reason field or code fences.",
    "Task:",
    args.task,
    "Candidates:",
    rendered,
  ].join("\n\n");
}

function extractOpenAIText(resp: any): string {
  const choices = Array.isArray(resp?.choices) ? resp.choices : [];
  for (const choice of choices) {
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const joined = content
        .map((item: any) => (typeof item === "string" ? item : typeof item?.text === "string" ? item.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
      if (joined) return joined;
    }
  }
  return "";
}

function extractGeminiText(resp: any): string {
  const candidates = Array.isArray(resp?.candidates) ? resp.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const joined = parts
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (joined) return joined;
  }
  return "";
}

function extractUsage(provider: LlmProvider, resp: any) {
  if (provider === "openai_compat") {
    return {
      promptTokens: typeof resp?.usage?.prompt_tokens === "number" ? resp.usage.prompt_tokens : null,
      completionTokens: typeof resp?.usage?.completion_tokens === "number" ? resp.usage.completion_tokens : null,
      totalTokens: typeof resp?.usage?.total_tokens === "number" ? resp.usage.total_tokens : null,
    };
  }
  const usage = resp?.usageMetadata ?? {};
  return {
    promptTokens: typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null,
    completionTokens: typeof usage?.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null,
    totalTokens: typeof usage?.totalTokenCount === "number" ? usage.totalTokenCount : null,
  };
}

function extractFirstJsonObject(text: string): string {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (start === -1) {
      if (ch === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.trim();
}

export function parseModelSelection(rawText: string): { selectedTool: string | null; reason: string | null } {
  if (!rawText.trim()) {
    return { selectedTool: null, reason: null };
  }
  const sanitized = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(extractFirstJsonObject(sanitized));
    const selectedTool = typeof parsed?.selected_tool === "string" && parsed.selected_tool.trim()
      ? parsed.selected_tool.trim()
      : null;
    return { selectedTool, reason: null };
  } catch {
    const matched = sanitized.match(/"selected_tool"\s*:\s*"([^"]+)"/i);
    if (matched?.[1]) {
      return { selectedTool: matched[1].trim(), reason: null };
    }
    return { selectedTool: null, reason: rawText.trim() || null };
  }
}

async function selectToolWithModel(config: LlmConfig, prompt: string): Promise<ToolSelectionResult> {
  const payload =
    config.provider === "openai_compat"
      ? {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        }
      : {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
          },
        };

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`llm request failed: ${response.status} ${JSON.stringify(json)}`);
  }
  const rawText = config.provider === "openai_compat" ? extractOpenAIText(json) : extractGeminiText(json);
  const parsed = parseModelSelection(rawText);
  return {
    selectedTool: parsed.selectedTool,
    reason: parsed.reason,
    rawText,
    usage: extractUsage(config.provider, json),
  };
}

function buildAionisClient() {
  return new AionisClient({
    base_url: (process.env.AIONIS_BASE_URL || "http://127.0.0.1:3321").trim(),
    timeout_ms: Number(process.env.AIONIS_TIMEOUT_MS || "10000"),
    retry: { max_retries: 1 },
    admin_token: process.env.ADMIN_TOKEN || undefined,
    api_key: inferAionisApiKeyFromEnv(),
    auth_bearer: process.env.AUTH_BEARER?.trim() || process.env.PERF_AUTH_BEARER?.trim() || undefined,
  });
}

async function runVariant(args: {
  runId: string;
  variant: BenchVariant;
  item: ManyToolsCase;
  llm: LlmConfig;
  aionis?: AionisClient;
}): Promise<BenchTrace> {
  const started = Date.now();
  const rawCandidates = orderCandidatesFromCase(args.item);
  let orderedCandidates = rawCandidates;
  let aionisSelectedTool: string | null = null;
  let toolRegistryPresent: boolean | null = null;
  let familyAwareOrderingApplied: boolean | null = null;

  if (args.variant === "aionis_selection") {
    if (!args.aionis) throw new Error("aionis client is required for aionis_selection variant");
    const res = await args.aionis.toolsSelect({
      scope: process.env.MANYTOOLS_SCOPE?.trim() || "manytools:benchmark",
      context: {
        source: "many-tools-benchmark",
        benchmark_case_id: args.item.id,
        benchmark_family: args.item.family,
        control_profile_v1: args.item.continuity?.control_profile_v1 ?? null,
      },
      execution_state_v1: args.item.continuity?.execution_state_v1 ?? null,
      candidates: rawCandidates,
      strict: false,
      include_shadow: false,
      rules_limit: 50,
    });
    orderedCandidates = Array.isArray(res.data.selection?.ordered) && res.data.selection.ordered.length > 0
      ? [...res.data.selection.ordered]
      : rawCandidates;
    aionisSelectedTool = typeof res.data.selection?.selected === "string" ? res.data.selection.selected : null;
    toolRegistryPresent = typeof res.data.execution_kernel?.tool_registry_present === "boolean"
      ? res.data.execution_kernel.tool_registry_present
      : null;
    familyAwareOrderingApplied = typeof res.data.execution_kernel?.family_aware_ordering_applied === "boolean"
      ? res.data.execution_kernel.family_aware_ordering_applied
      : null;
  }

  const prompt = buildSelectionPrompt({
    task: args.item.task.instruction,
    candidates: args.item.candidates,
    orderedCandidates,
    variant: args.variant,
    aionisSelectedTool,
  });
  const selection = await selectToolWithModel(args.llm, prompt);
  const wallClockMs = Date.now() - started;
  const selectedTool = selection.selectedTool;
  const correctFirstTool = args.item.acceptance.correct_first_tool;

  return {
    run_id: args.runId,
    variant: args.variant,
    case_id: args.item.id,
    family: args.item.family,
    bucket: args.item.bucket,
    difficulty: args.item.difficulty,
    correct_first_tool: correctFirstTool,
    selected_tool: selectedTool,
    correct: selectedTool === correctFirstTool,
    omitted: selectedTool == null,
    wrong_tool: selectedTool != null && selectedTool !== correctFirstTool,
    prompt_tokens: selection.usage.promptTokens,
    completion_tokens: selection.usage.completionTokens,
    total_tokens: selection.usage.totalTokens,
    wall_clock_ms: wallClockMs,
    ordered_candidates: orderedCandidates,
    aionis_selected_tool: aionisSelectedTool,
    tool_registry_present: toolRegistryPresent,
    family_aware_ordering_applied: familyAwareOrderingApplied,
    raw_output: selection.rawText,
  };
}

function average(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => typeof value === "number");
  if (filtered.length === 0) return null;
  return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(2));
}

function rate(part: number, total: number) {
  if (total === 0) return 0;
  return Number((part / total).toFixed(4));
}

export function summarizeBenchmarkRecords(records: BenchTrace[]): BenchSummary {
  const byVariant = new Map<BenchVariant, BenchTrace[]>();
  for (const record of records) {
    const list = byVariant.get(record.variant) ?? [];
    list.push(record);
    byVariant.set(record.variant, list);
  }

  const variants: BenchSummary["variants"] = {};
  for (const [variant, rows] of byVariant.entries()) {
    const byBucket = new Map<number, BenchTrace[]>();
    const byFamily = new Map<string, BenchTrace[]>();
    for (const row of rows) {
      const bucketList = byBucket.get(row.bucket) ?? [];
      bucketList.push(row);
      byBucket.set(row.bucket, bucketList);
      const familyList = byFamily.get(row.family) ?? [];
      familyList.push(row);
      byFamily.set(row.family, familyList);
    }
    variants[variant] = {
      cases: rows.length,
      first_correct_tool_rate: rate(rows.filter((row) => row.correct).length, rows.length),
      omission_rate: rate(rows.filter((row) => row.omitted).length, rows.length),
      wrong_tool_rate: rate(rows.filter((row) => row.wrong_tool).length, rows.length),
      avg_total_tokens: average(rows.map((row) => row.total_tokens)),
      avg_wall_clock_ms: average(rows.map((row) => row.wall_clock_ms)) ?? 0,
      by_bucket: Object.fromEntries(
        [...byBucket.entries()].map(([bucket, bucketRows]) => [String(bucket), {
          cases: bucketRows.length,
          first_correct_tool_rate: rate(bucketRows.filter((row) => row.correct).length, bucketRows.length),
          omission_rate: rate(bucketRows.filter((row) => row.omitted).length, bucketRows.length),
          wrong_tool_rate: rate(bucketRows.filter((row) => row.wrong_tool).length, bucketRows.length),
        }]),
      ),
      by_family: Object.fromEntries(
        [...byFamily.entries()].map(([family, familyRows]) => [family, {
          cases: familyRows.length,
          first_correct_tool_rate: rate(familyRows.filter((row) => row.correct).length, familyRows.length),
          omission_rate: rate(familyRows.filter((row) => row.omitted).length, familyRows.length),
          wrong_tool_rate: rate(familyRows.filter((row) => row.wrong_tool).length, familyRows.length),
        }]),
      ),
    };
  }

  return {
    run_id: records[0]?.run_id ?? randomUUID(),
    created_at: new Date().toISOString(),
    variants,
  };
}

function defaultCasePaths() {
  return [
    path.resolve("scripts/bench/many-tools-cases/focused-repo-read.json"),
    path.resolve("scripts/bench/many-tools-cases/focused-test-execution.json"),
  ];
}

function resolveCasePaths() {
  const raw = (process.env.MANYTOOLS_CASES || defaultCasePaths().join(",")).trim();
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

function resolveVariants(): BenchVariant[] {
  const raw = (process.env.MANYTOOLS_VARIANTS || "baseline,aionis_selection").trim();
  const variants = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is BenchVariant => part === "baseline" || part === "aionis_selection");
  return variants.length > 0 ? variants : ["baseline", "aionis_selection"];
}

function resolveOutputDir(runId: string) {
  const base = process.env.MANYTOOLS_OUTPUT_DIR?.trim() || path.resolve("artifacts/many-tools-benchmark", runId);
  mkdirSync(base, { recursive: true });
  return base;
}

async function main() {
  const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const llm = buildLlmConfig();
  const cases = readCases(resolveCasePaths());
  const variants = resolveVariants();
  const outputDir = resolveOutputDir(runId);
  const traces: BenchTrace[] = [];
  const aionis = variants.includes("aionis_selection") ? buildAionisClient() : undefined;

  for (const item of cases) {
    for (const variant of variants) {
      const trace = await runVariant({ runId, variant, item, llm, aionis });
      traces.push(trace);
      process.stdout.write(`${JSON.stringify({
        case_id: trace.case_id,
        variant: trace.variant,
        selected_tool: trace.selected_tool,
        correct: trace.correct,
        total_tokens: trace.total_tokens,
      })}\n`);
    }
  }

  const summary = summarizeBenchmarkRecords(traces);
  writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(path.join(outputDir, "cases.jsonl"), `${traces.map((item) => JSON.stringify(item)).join("\n")}\n`);
  writeFileSync(path.join(outputDir, "selection_traces.jsonl"), `${traces.map((item) => JSON.stringify(item)).join("\n")}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, run_id: runId, output_dir: outputDir, summary })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: String(err?.message ?? err) }, null, 2)}\n`);
    process.exit(1);
  });
}
