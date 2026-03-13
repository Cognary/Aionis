import "dotenv/config";
import { readFile } from "node:fs/promises";
import { loadEnv } from "../config.js";

type CaseName = "recall_text" | "write";
type RecallProfileName = "legacy" | "strict_edges" | "quality_first" | "lite";

type RecallProfileDefaults = {
  limit: number;
  neighborhood_hops: 1 | 2;
  max_nodes: number;
  max_edges: number;
  ranked_limit: number;
  min_edge_weight: number;
  min_edge_confidence: number;
};

const RECALL_PROFILE_DEFAULTS: Record<RecallProfileName, RecallProfileDefaults> = {
  legacy: {
    limit: 30,
    neighborhood_hops: 2,
    max_nodes: 50,
    max_edges: 100,
    ranked_limit: 100,
    min_edge_weight: 0,
    min_edge_confidence: 0,
  },
  strict_edges: {
    limit: 24,
    neighborhood_hops: 2,
    max_nodes: 60,
    max_edges: 80,
    ranked_limit: 140,
    min_edge_weight: 0.2,
    min_edge_confidence: 0.2,
  },
  quality_first: {
    limit: 30,
    neighborhood_hops: 2,
    max_nodes: 80,
    max_edges: 100,
    ranked_limit: 180,
    min_edge_weight: 0.05,
    min_edge_confidence: 0.05,
  },
  lite: {
    limit: 12,
    neighborhood_hops: 1,
    max_nodes: 24,
    max_edges: 24,
    ranked_limit: 48,
    min_edge_weight: 0.25,
    min_edge_confidence: 0.25,
  },
};

type Sample = {
  ok: boolean;
  status: number;
  ms: number;
  error?: string;
};

type CaseSummary = {
  name: CaseName;
  total: number;
  ok: number;
  failed: number;
  rps: number;
  latency_ms: {
    min: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
  };
  by_status: Record<string, number>;
  transport_error_count: number;
  transport_error_rate: number;
};

type JsonSample = Sample & {
  body?: any;
};

type CompressionAggregate = {
  enabled: boolean;
  params: {
    profile: "balanced" | "aggressive";
    token_budget: number;
    samples: number;
    query_text: string;
  };
  total_pairs: number;
  ok_pairs: number;
  failed_pairs: number;
  by_status: Record<string, number>;
  transport_error_count: number;
  summary: {
    compression_ratio: { mean: number; p50: number; p95: number; min: number; max: number };
    baseline_context_chars: { mean: number; p50: number; p95: number };
    compressed_context_chars: { mean: number; p50: number; p95: number };
    items_retain_ratio: { mean: number; p50: number; p95: number };
    citations_retain_ratio: { mean: number; p50: number; p95: number };
    compaction_applied_ratio: number;
    latency_ms: { baseline_p95: number; compressed_p95: number; delta_p95: number };
  };
};

type OptimizationAggregate = {
  enabled: boolean;
  params: {
    benchmark_preset: OptimizationBenchmarkPresetName | null;
    profile: "balanced" | "aggressive";
    request_mode: "explicit" | "inherit_default";
    token_budget: number;
    char_budget_total: number;
    samples: number;
    query_text: string;
    tool_candidates: string[];
    override_check: boolean;
    override_layers: string[];
  };
  total_pairs: number;
  ok_pairs: number;
  failed_pairs: number;
  by_status: Record<string, number>;
  transport_error_count: number;
  levers_frequency: Record<string, number>;
  summary: {
    estimated_token_reduction: { mean: number; p50: number; p95: number; min: number; max: number };
    baseline_context_est_tokens: { mean: number; p50: number; p95: number };
    optimized_context_est_tokens: { mean: number; p50: number; p95: number };
    forgotten_items: { mean: number; p50: number; p95: number };
    static_blocks_selected: { mean: number; p50: number; p95: number };
    within_token_budget_ratio: number;
    optimization_profile_applied_ratio: number;
    optimization_profile_source_frequency?: Record<string, number>;
    selected_memory_layers_frequency?: Record<string, number>;
    selection_policy_frequency?: Record<string, number>;
    selection_policy_source_frequency?: Record<string, number>;
    requested_allowed_layers_frequency?: Record<string, number>;
    latency_ms: { baseline_p95: number; optimized_p95: number; delta_p95: number };
  };
  override_compare?: {
    enabled: boolean;
    allowed_layers: string[];
    ok_pairs: number;
    failed_pairs: number;
    tightened_context_est_tokens: { mean: number; p50: number; p95: number };
    delta_vs_optimized_tokens: { mean: number; p50: number; p95: number; min: number; max: number };
    within_token_budget_ratio: number;
    selected_memory_layers_frequency?: Record<string, number>;
    selection_policy_source_frequency?: Record<string, number>;
    requested_allowed_layers_frequency?: Record<string, number>;
    latency_ms: { optimized_p95: number; tightened_p95: number; delta_p95: number };
  };
  latency_breakdown_ms: {
    baseline: Record<string, { mean: number; p50: number; p95: number; min: number; max: number }>;
    optimized: Record<string, { mean: number; p50: number; p95: number; min: number; max: number }>;
    delta_p95: Record<string, number>;
  };
};

type ReplayOptimizationAggregate = {
  enabled: boolean;
  params: {
    playbook_id: string;
    version: number | null;
    samples: number;
    fallback_mode: "simulate" | "strict" | "guided";
    execute_fallback: boolean;
    gate_matchers: Record<string, unknown> | null;
    gate_policy_constraints: Record<string, unknown> | null;
  };
  total_samples: number;
  ok_samples: number;
  failed_samples: number;
  by_status: Record<string, number>;
  transport_error_count: number;
  candidate: {
    eligible_ratio: number;
    recommended_mode_frequency: Record<string, number>;
    next_action_frequency: Record<string, number>;
    mismatch_frequency: Record<string, number>;
  };
  dispatch: {
    decision_frequency: Record<string, number>;
    primary_inference_skipped_ratio: number;
    fallback_executed_ratio: number;
    estimated_primary_model_calls_avoided_mean: number;
    result_summary_present_ratio: number;
    latency_ms: { p50: number; p95: number; mean: number };
  };
};

type SandboxOptimizationAggregate = {
  enabled: boolean;
  params: {
    samples: number;
    argv: string[];
    timeout_ms: number | null;
  };
  session_created: boolean;
  total_samples: number;
  ok_samples: number;
  failed_samples: number;
  by_status: Record<string, number>;
  transport_error_count: number;
  result_summary_present_ratio: {
    execute: number;
    run_get: number;
    logs: number;
    artifact: number;
  };
  endpoint_latency_ms: {
    execute: { p50: number; p95: number; mean: number };
    run_get: { p50: number; p95: number; mean: number };
    logs: { p50: number; p95: number; mean: number };
    artifact: { p50: number; p95: number; mean: number };
  };
};

type AnnProfileAggregate = {
  samples: number;
  transport_error_count: number;
  status_counts: Record<string, number>;
  recall_latency_ms: { mean: number; p50: number; p95: number; min: number; max: number };
  stage1_candidates_ann_ms: { mean: number; p50: number; p95: number; min: number; max: number };
  ann_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
  final_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
  result_nodes: { mean: number; p50: number; p95: number; min: number; max: number };
  result_edges: { mean: number; p50: number; p95: number; min: number; max: number };
};

type AnnQuerySpec = {
  text: string;
  class: string;
};

type AnnOptimizationAggregate = {
  enabled: boolean;
  params: {
    samples_per_query: number;
    query_texts: string[];
    query_classes: string[];
    profiles: RecallProfileName[];
  };
  profiles: Record<string, AnnProfileAggregate>;
  per_query_profiles: Record<string, Record<string, AnnProfileAggregate>>;
  per_class_profiles: Record<string, Record<string, AnnProfileAggregate>>;
  selector_compare?: AnnSelectorCompareAggregate;
};

type AnnSelectorMode = "static" | "class_aware";

type AnnSelectorAggregate = AnnProfileAggregate & {
  selected_profile_frequency: Record<string, number>;
  class_aware_applied_ratio: number;
};

type SelectorAccumulator = AnnAccumulator & {
  selected_profile_frequency: Record<string, number>;
  class_aware_applied_count: number;
};

type AnnSelectorCompareAggregate = {
  enabled: boolean;
  params: {
    samples_per_query: number;
    query_texts: string[];
    query_classes: string[];
    modes: AnnSelectorMode[];
  };
  overall_modes: Record<AnnSelectorMode, AnnSelectorAggregate>;
  per_class_modes: Record<string, Record<AnnSelectorMode, AnnSelectorAggregate>>;
};

type AnnAccumulator = {
  status_counts: Record<string, number>;
  recall_latency: number[];
  ann_stage1_latency: number[];
  ann_seed_count: number[];
  final_seed_count: number[];
  result_nodes: number[];
  result_edges: number[];
  transport_error_count: number;
  sample_count: number;
};

type OptimizationBenchmarkPresetName = "endpoint_default_only" | "caller_tightened_l1" | "caller_tightened_l1_l3";

type OptimizationBenchmarkPreset = {
  name: OptimizationBenchmarkPresetName;
  optimization_check: boolean;
  optimization_request_mode: "explicit" | "inherit_default";
  optimization_override_check: boolean;
  optimization_override_layers: string[];
};

function emptySelectorAccumulator(): SelectorAccumulator {
  return {
    status_counts: {},
    recall_latency: [],
    ann_stage1_latency: [],
    ann_seed_count: [],
    final_seed_count: [],
    result_nodes: [],
    result_edges: [],
    transport_error_count: 0,
    sample_count: 0,
    selected_profile_frequency: {},
    class_aware_applied_count: 0,
  };
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1));
  return sorted[idx];
}

function round(v: number, d = 3): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function parseJsonObjectArg(flag: string): Record<string, unknown> | null {
  const raw = argValue(flag);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${flag} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (err: any) {
    throw new Error(`invalid ${flag}: ${String(err?.message ?? err)}`);
  }
}

function parseJsonStringArrayArg(flag: string, fallback: string[]): string[] {
  const raw = argValue(flag);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || item.trim().length === 0)) {
      throw new Error(`${flag} must be a JSON string array`);
    }
    return parsed.map((item) => String(item));
  } catch (err: any) {
    throw new Error(`invalid ${flag}: ${String(err?.message ?? err)}`);
  }
}

function parseAnnQuerySpecArg(flag: string, fallback: string[]): AnnQuerySpec[] {
  const raw = argValue(flag);
  if (!raw) {
    return fallback.map((text) => ({ text, class: "uncategorized" }));
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          Array.isArray(item) ||
          typeof (item as any).text !== "string" ||
          (item as any).text.trim().length === 0 ||
          typeof (item as any).class !== "string" ||
          (item as any).class.trim().length === 0,
      )
    ) {
      throw new Error(`${flag} must be a JSON array of {text,class}`);
    }
    return parsed.map((item) => ({
      text: String((item as any).text),
      class: String((item as any).class).trim(),
    }));
  } catch (err: any) {
    throw new Error(`invalid ${flag}: ${String(err?.message ?? err)}`);
  }
}

async function parseAnnQuerySpecFile(flag: string): Promise<AnnQuerySpec[] | null> {
  const file = argValue(flag);
  if (!file) return null;
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          Array.isArray(item) ||
          typeof (item as any).text !== "string" ||
          (item as any).text.trim().length === 0 ||
          typeof (item as any).class !== "string" ||
          (item as any).class.trim().length === 0,
      )
    ) {
      throw new Error(`${flag} must contain a JSON array of {text,class}`);
    }
    return parsed.map((item) => ({
      text: String((item as any).text),
      class: String((item as any).class).trim(),
    }));
  } catch (err: any) {
    throw new Error(`invalid ${flag}: ${String(err?.message ?? err)}`);
  }
}

function parseCsvRecallProfiles(flag: string, fallback: RecallProfileName[]): RecallProfileName[] {
  const raw = argValue(flag);
  if (!raw) return fallback;
  const out: RecallProfileName[] = [];
  for (const part of raw.split(",")) {
    const parsed = parseRecallProfile(part.trim());
    if (!parsed) throw new Error(`invalid ${flag}: expected comma-separated legacy|strict_edges|quality_first|lite`);
    if (!out.includes(parsed)) out.push(parsed);
  }
  return out.length > 0 ? out : fallback;
}

function parseOptimizationBenchmarkPreset(flag: string): OptimizationBenchmarkPreset | null {
  const raw = (argValue(flag) ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "endpoint_default_only") {
    return {
      name: "endpoint_default_only",
      optimization_check: true,
      optimization_request_mode: "inherit_default",
      optimization_override_check: false,
      optimization_override_layers: [],
    };
  }
  if (raw === "caller_tightened_l1") {
    return {
      name: "caller_tightened_l1",
      optimization_check: true,
      optimization_request_mode: "inherit_default",
      optimization_override_check: true,
      optimization_override_layers: ["L1"],
    };
  }
  if (raw === "caller_tightened_l1_l3") {
    return {
      name: "caller_tightened_l1_l3",
      optimization_check: true,
      optimization_request_mode: "inherit_default",
      optimization_override_check: true,
      optimization_override_layers: ["L1", "L3"],
    };
  }
  throw new Error(
    "invalid --optimization-benchmark-preset; expected endpoint_default_only|caller_tightened_l1|caller_tightened_l1_l3",
  );
}

function summarizeSeries(values: number[]): { mean: number; p50: number; p95: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    mean: round(sum / sorted.length, 6),
    p50: round(quantile(sorted, 0.5), 6),
    p95: round(quantile(sorted, 0.95), 6),
    min: round(sorted[0], 6),
    max: round(sorted[sorted.length - 1], 6),
  };
}

function incrementFrequency(target: Record<string, number>, key: unknown) {
  const normalized = String(key ?? "").trim();
  if (!normalized) return;
  target[normalized] = (target[normalized] ?? 0) + 1;
}

function summarizeAnnAccumulator(acc: AnnAccumulator): AnnProfileAggregate {
  return {
    samples: acc.sample_count,
    transport_error_count: acc.transport_error_count,
    status_counts: acc.status_counts,
    recall_latency_ms: summarizeSeries(acc.recall_latency),
    stage1_candidates_ann_ms: summarizeSeries(acc.ann_stage1_latency),
    ann_seed_count: summarizeSeries(acc.ann_seed_count),
    final_seed_count: summarizeSeries(acc.final_seed_count),
    result_nodes: summarizeSeries(acc.result_nodes),
    result_edges: summarizeSeries(acc.result_edges),
  };
}

function summarizeSelectorAccumulator(acc: SelectorAccumulator): AnnSelectorAggregate {
  return {
    ...summarizeAnnAccumulator(acc),
    selected_profile_frequency: acc.selected_profile_frequency,
    class_aware_applied_ratio: acc.sample_count > 0 ? round(acc.class_aware_applied_count / acc.sample_count, 6) : 0,
  };
}

function collectStageTimingSeries(samples: Array<Record<string, unknown>>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample ?? {})) {
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      (out[key] ??= []).push(num);
    }
  }
  return out;
}

function summarizeStageTimingSeries(samples: Array<Record<string, unknown>>) {
  const series = collectStageTimingSeries(samples);
  const out: Record<string, ReturnType<typeof summarizeSeries>> = {};
  for (const [key, values] of Object.entries(series)) {
    out[key] = summarizeSeries(values);
  }
  return out;
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function pickApiKey(envJson: string): string | null {
  try {
    const o = JSON.parse(envJson) as Record<string, unknown>;
    const keys = Object.keys(o ?? {});
    return keys.length > 0 ? keys[0] : null;
  } catch {
    return null;
  }
}

function parseRecallProfile(raw: string): RecallProfileName | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === "legacy" || v === "strict_edges" || v === "quality_first" || v === "lite") return v;
  return null;
}

async function runConcurrent(total: number, concurrency: number, fn: (i: number) => Promise<Sample>): Promise<Sample[]> {
  const out: Sample[] = [];
  let next = 0;
  const workers: Promise<void>[] = [];

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      out.push(await fn(i));
    }
  };

  for (let i = 0; i < concurrency; i += 1) workers.push(worker());
  await Promise.all(workers);
  return out;
}

function summarize(name: CaseName, samples: Sample[], elapsedMs: number): CaseSummary {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const ok = samples.filter((s) => s.ok).length;
  const failed = samples.length - ok;
  const byStatus: Record<string, number> = {};
  for (const s of samples) {
    const k = s.error ? `error:${s.error}` : String(s.status);
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const sum = ms.reduce((a, b) => a + b, 0);
  const transportErrorCount = Object.entries(byStatus).reduce((acc, [k, v]) => {
    if (k.startsWith("error:")) return acc + Number(v);
    return acc;
  }, 0);
  const transportErrorRate = samples.length > 0 ? transportErrorCount / samples.length : 0;
  return {
    name,
    total: samples.length,
    ok,
    failed,
    rps: elapsedMs > 0 ? round((samples.length * 1000) / elapsedMs, 2) : 0,
    latency_ms: {
      min: round(ms[0] ?? 0),
      p50: round(quantile(ms, 0.5)),
      p95: round(quantile(ms, 0.95)),
      p99: round(quantile(ms, 0.99)),
      max: round(ms[ms.length - 1] ?? 0),
      mean: ms.length > 0 ? round(sum / ms.length) : 0,
    },
    by_status: byStatus,
    transport_error_count: transportErrorCount,
    transport_error_rate: round(transportErrorRate, 6),
  };
}

async function main() {
  const env = loadEnv();
  const baseUrl = argValue("--base-url") ?? `http://localhost:${env.PORT}`;
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const tenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const modeRaw = (argValue("--mode") ?? "all").trim().toLowerCase();
  const mode = modeRaw === "recall" || modeRaw === "write" || modeRaw === "all" || modeRaw === "compression" ? modeRaw : "all";

  const warmup = clampInt(Number(argValue("--warmup") ?? "20"), 0, 2000);
  const recallRequests = clampInt(Number(argValue("--recall-requests") ?? "200"), 1, 100000);
  const writeRequests = clampInt(Number(argValue("--write-requests") ?? "80"), 1, 100000);
  const recallConcurrency = clampInt(Number(argValue("--recall-concurrency") ?? "12"), 1, 512);
  const writeConcurrency = clampInt(Number(argValue("--write-concurrency") ?? "4"), 1, 128);
  const timeoutMs = clampInt(Number(argValue("--timeout-ms") ?? "15000"), 1000, 120000);
  const paceMs = clampInt(Number(argValue("--pace-ms") ?? "0"), 0, 5000);
  const failTransportRateRaw = argValue("--fail-on-transport-error-rate") ?? "";
  const failTransportRate = failTransportRateRaw === "" ? null : Math.max(0, Math.min(1, Number(failTransportRateRaw)));
  const embedOnWrite = (argValue("--embed-on-write") ?? "false").trim().toLowerCase() === "true";
  const compressionCheckRaw = (argValue("--compression-check") ?? (mode === "compression" ? "true" : "false")).trim().toLowerCase();
  const compressionCheck = compressionCheckRaw === "true";
  const compressionPairGateModeRaw = (argValue("--compression-pair-gate-mode") ?? "blocking").trim().toLowerCase();
  const compressionPairGateMode: "blocking" | "non_blocking" =
    compressionPairGateModeRaw === "non_blocking" ? "non_blocking" : "blocking";
  const compressionSamples = clampInt(Number(argValue("--compression-samples") ?? "20"), 1, 2000);
  const compressionTokenBudget = clampInt(Number(argValue("--compression-token-budget") ?? "600"), 64, 256000);
  const compressionProfileRaw = (argValue("--compression-profile") ?? "aggressive").trim().toLowerCase();
  const compressionProfile: "balanced" | "aggressive" = compressionProfileRaw === "balanced" ? "balanced" : "aggressive";
  const compressionQueryText = (argValue("--compression-query-text") ?? "memory graph perf compression").trim();
  const optimizationBenchmarkPreset = parseOptimizationBenchmarkPreset("--optimization-benchmark-preset");
  const optimizationCheckRaw = (
    argValue("--optimization-check") ??
    (optimizationBenchmarkPreset?.optimization_check ? "true" : "false")
  )
    .trim()
    .toLowerCase();
  const optimizationCheck = optimizationCheckRaw === "true";
  const optimizationSamples = clampInt(Number(argValue("--optimization-samples") ?? "20"), 1, 2000);
  const optimizationTokenBudget = clampInt(Number(argValue("--optimization-token-budget") ?? "600"), 64, 256000);
  const optimizationCharBudget = clampInt(Number(argValue("--optimization-char-budget") ?? "1800"), 200, 200000);
  const optimizationProfileRaw = (argValue("--optimization-profile") ?? "aggressive").trim().toLowerCase();
  const optimizationProfile: "balanced" | "aggressive" = optimizationProfileRaw === "balanced" ? "balanced" : "aggressive";
  const optimizationRequestModeRaw = (
    argValue("--optimization-request-mode") ??
    optimizationBenchmarkPreset?.optimization_request_mode ??
    "explicit"
  )
    .trim()
    .toLowerCase();
  const optimizationRequestMode: "explicit" | "inherit_default" =
    optimizationRequestModeRaw === "inherit_default" ? "inherit_default" : "explicit";
  const optimizationQueryText = (argValue("--optimization-query-text") ?? "prepare production deploy context").trim();
  const optimizationOverrideCheckRaw = (
    argValue("--optimization-override-check") ??
    (optimizationBenchmarkPreset?.optimization_override_check ? "true" : "false")
  )
    .trim()
    .toLowerCase();
  const optimizationOverrideCheck = optimizationOverrideCheckRaw === "true";
  const optimizationOverrideLayers = parseJsonStringArrayArg(
    "--optimization-override-layers-json",
    optimizationBenchmarkPreset?.optimization_override_layers ?? ["L1"],
  ).filter((layer) => layer === "L0" || layer === "L1" || layer === "L2" || layer === "L3" || layer === "L4" || layer === "L5");
  const replayCheckRaw = (argValue("--replay-check") ?? "false").trim().toLowerCase();
  const replayCheck = replayCheckRaw === "true";
  const replayPlaybookId = (argValue("--replay-playbook-id") ?? "").trim();
  const replayVersionRaw = argValue("--replay-version");
  const replayVersion = replayVersionRaw ? clampInt(Number(replayVersionRaw), 1, 1_000_000) : null;
  const replaySamples = clampInt(Number(argValue("--replay-samples") ?? "20"), 1, 2000);
  const replayFallbackModeRaw = (argValue("--replay-fallback-mode") ?? "simulate").trim().toLowerCase();
  const replayFallbackMode: "simulate" | "strict" | "guided" =
    replayFallbackModeRaw === "strict" || replayFallbackModeRaw === "guided" ? replayFallbackModeRaw : "simulate";
  const replayExecuteFallback = (argValue("--replay-execute-fallback") ?? "true").trim().toLowerCase() === "true";
  const replayGateMatchers = parseJsonObjectArg("--replay-gate-matchers");
  const replayGatePolicyConstraints = parseJsonObjectArg("--replay-gate-policy-constraints");
  const sandboxCheckRaw = (argValue("--sandbox-check") ?? "false").trim().toLowerCase();
  const sandboxCheck = sandboxCheckRaw === "true";
  const sandboxSamples = clampInt(Number(argValue("--sandbox-samples") ?? "10"), 1, 2000);
  const sandboxArgv = parseJsonStringArrayArg("--sandbox-argv-json", ["echo", "hello from sandbox benchmark"]);
  const sandboxTimeoutMs = argValue("--sandbox-timeout-ms");
  const sandboxTimeout = sandboxTimeoutMs ? clampInt(Number(sandboxTimeoutMs), 1, 600000) : null;
  const annCheckRaw = (argValue("--ann-check") ?? "false").trim().toLowerCase();
  const annCheck = annCheckRaw === "true";
  const annSelectorCheckRaw = (argValue("--ann-selector-check") ?? "false").trim().toLowerCase();
  const annSelectorCheck = annSelectorCheckRaw === "true";
  const annSamples = clampInt(Number(argValue("--ann-samples") ?? "8"), 1, 2000);
  const annQueryTextsFallback = [
    "memory graph perf",
    "prepare production deploy context",
    "rollback production deploy health verification",
  ];
  const annQueryTexts = parseJsonStringArrayArg("--ann-query-texts-json", annQueryTextsFallback);
  const annQuerySpecs =
    (await parseAnnQuerySpecFile("--ann-query-spec-file")) ?? parseAnnQuerySpecArg("--ann-query-spec-json", annQueryTexts);
  const annProfiles = parseCsvRecallProfiles("--ann-profiles", ["strict_edges", "quality_first", "lite"]);
  const recallProfileRaw = (argValue("--recall-profile") ?? "").trim().toLowerCase();
  const recallProfile = parseRecallProfile(recallProfileRaw);
  if (recallProfileRaw.length > 0 && !recallProfile) {
    throw new Error("invalid --recall-profile; expected: legacy|strict_edges|quality_first|lite");
  }
  if (replayCheck && !replayPlaybookId) {
    throw new Error("--replay-check requires --replay-playbook-id");
  }
  const recallProfileDefaults = recallProfile ? RECALL_PROFILE_DEFAULTS[recallProfile] : null;
  const recallDefaultLimit = recallProfileDefaults?.limit ?? 20;

  const apiKey = process.env.PERF_API_KEY?.trim() || pickApiKey(process.env.MEMORY_API_KEYS_JSON ?? "");
  const bearer = process.env.PERF_AUTH_BEARER?.trim() || "";
  const authMode = env.MEMORY_AUTH_MODE;
  if ((authMode === "api_key" || authMode === "api_key_or_jwt") && !apiKey && !bearer) {
    throw new Error("auth mode requires credentials; set PERF_API_KEY or PERF_AUTH_BEARER");
  }
  if (authMode === "jwt" && !bearer) {
    throw new Error("jwt auth mode requires PERF_AUTH_BEARER");
  }

  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (apiKey) headers.set("x-api-key", apiKey);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);

  const timedRequestJson = async (path: string, body: Record<string, unknown>): Promise<JsonSample> => {
    const t0 = process.hrtime.bigint();
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      return { ok: res.ok, status: res.status, ms, body: payload };
    } catch (e: any) {
      const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
      return { ok: false, status: 0, ms, error: String(e?.name ?? e?.message ?? "request_error") };
    } finally {
      clearTimeout(tm);
    }
  };

  const timedRequest = async (path: string, body: Record<string, unknown>): Promise<Sample> => {
    const out = await timedRequestJson(path, body);
    return { ok: out.ok, status: out.status, ms: out.ms, error: out.error };
  };

  const recallPayload = (queryText: string, extras?: Record<string, unknown>): Record<string, unknown> => ({
    tenant_id: tenantId,
    scope,
    query_text: queryText,
    ...(recallProfileDefaults ?? {}),
    ...(extras ?? {}),
  });

  const selectorPayload = (
    queryText: string,
    recallClassAware: boolean,
    extras?: Record<string, unknown>,
  ): Record<string, unknown> => ({
    tenant_id: tenantId,
    scope,
    query_text: queryText,
    recall_class_aware: recallClassAware,
    ...(extras ?? {}),
  });

  const warmupReq = async () => {
    await timedRequest("/v1/memory/recall_text", recallPayload("perf warmup", { limit: recallDefaultLimit }));
  };
  for (let i = 0; i < warmup; i += 1) await warmupReq();

  const cases: Array<{ name: CaseName; summary: CaseSummary }> = [];

  if (mode === "all" || mode === "recall") {
    const t0 = Date.now();
    const samples = await runConcurrent(recallRequests, recallConcurrency, async () => {
      if (paceMs > 0) await sleepMs(paceMs);
      return timedRequest("/v1/memory/recall_text", recallPayload("memory graph perf", { limit: recallDefaultLimit }));
    });
    cases.push({ name: "recall_text", summary: summarize("recall_text", samples, Date.now() - t0) });
  }

  if (mode === "all" || mode === "write") {
    const runTag = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const t0 = Date.now();
    const samples = await runConcurrent(writeRequests, writeConcurrency, async (i) => {
      if (paceMs > 0) await sleepMs(paceMs);
      return timedRequest("/v1/memory/write", {
        tenant_id: tenantId,
        scope,
        input_text: `perf write ${runTag} #${i}`,
        auto_embed: embedOnWrite,
        memory_lane: "shared",
        nodes: [
          {
            client_id: `perf_write_${runTag}_${i}`,
            type: "event",
            text_summary: `perf write payload #${i}`,
          },
        ],
      });
    });
    cases.push({ name: "write", summary: summarize("write", samples, Date.now() - t0) });
  }

  let compression: CompressionAggregate | null = null;
  if (compressionCheck || mode === "compression") {
    const compressionByStatus: Record<string, number> = {};
    const baselineChars: number[] = [];
    const compressedChars: number[] = [];
    const compressionRatios: number[] = [];
    const itemsRetainRatios: number[] = [];
    const citationsRetainRatios: number[] = [];
    const baselineLatency: number[] = [];
    const compressedLatency: number[] = [];
    let appliedCount = 0;
    let transportErrorCount = 0;

    for (let i = 0; i < compressionSamples; i += 1) {
      if (paceMs > 0) await sleepMs(paceMs);

      const baseline = await timedRequestJson(
        "/v1/memory/recall_text",
        recallPayload(compressionQueryText, { limit: recallDefaultLimit, context_compaction_profile: "balanced" }),
      );
      const baselineStatusKey = baseline.error ? `baseline:error:${baseline.error}` : `baseline:${baseline.status}`;
      compressionByStatus[baselineStatusKey] = (compressionByStatus[baselineStatusKey] ?? 0) + 1;
      if (baseline.error) transportErrorCount += 1;

      const compressed = await timedRequestJson(
        "/v1/memory/recall_text",
        recallPayload(compressionQueryText, {
          limit: recallDefaultLimit,
          context_token_budget: compressionTokenBudget,
          context_compaction_profile: compressionProfile,
          return_debug: true,
        }),
      );
      const compressedStatusKey = compressed.error ? `compressed:error:${compressed.error}` : `compressed:${compressed.status}`;
      compressionByStatus[compressedStatusKey] = (compressionByStatus[compressedStatusKey] ?? 0) + 1;
      if (compressed.error) transportErrorCount += 1;

      if (!baseline.ok || !compressed.ok) continue;

      const baselineText = typeof baseline.body?.context?.text === "string" ? baseline.body.context.text : "";
      const compressedText = typeof compressed.body?.context?.text === "string" ? compressed.body.context.text : "";
      const bItems = Array.isArray(baseline.body?.context?.items) ? baseline.body.context.items.length : 0;
      const cItems = Array.isArray(compressed.body?.context?.items) ? compressed.body.context.items.length : 0;
      const bCitations = Array.isArray(baseline.body?.context?.citations) ? baseline.body.context.citations.length : 0;
      const cCitations = Array.isArray(compressed.body?.context?.citations) ? compressed.body.context.citations.length : 0;
      const compApplied = compressed.body?.debug?.context_compaction?.applied === true;

      const bChars = baselineText.length;
      const cChars = compressedText.length;
      if (bChars <= 0) continue;

      baselineChars.push(bChars);
      compressedChars.push(cChars);
      compressionRatios.push(Math.max(0, 1 - cChars / bChars));
      itemsRetainRatios.push(bItems > 0 ? Math.min(1, cItems / bItems) : 1);
      citationsRetainRatios.push(bCitations > 0 ? Math.min(1, cCitations / bCitations) : 1);
      baselineLatency.push(baseline.ms);
      compressedLatency.push(compressed.ms);
      if (compApplied) appliedCount += 1;
    }

    const ratioSummary = summarizeSeries(compressionRatios);
    const bCharsSummary = summarizeSeries(baselineChars);
    const cCharsSummary = summarizeSeries(compressedChars);
    const itemsSummary = summarizeSeries(itemsRetainRatios);
    const citationsSummary = summarizeSeries(citationsRetainRatios);
    const bLatencySummary = summarizeSeries(baselineLatency);
    const cLatencySummary = summarizeSeries(compressedLatency);
    const okPairs = compressionRatios.length;

    compression = {
      enabled: true,
      params: {
        profile: compressionProfile,
        token_budget: compressionTokenBudget,
        samples: compressionSamples,
        query_text: compressionQueryText,
      },
      total_pairs: compressionSamples,
      ok_pairs: okPairs,
      failed_pairs: Math.max(0, compressionSamples - okPairs),
      by_status: compressionByStatus,
      transport_error_count: transportErrorCount,
      summary: {
        compression_ratio: ratioSummary,
        baseline_context_chars: {
          mean: bCharsSummary.mean,
          p50: bCharsSummary.p50,
          p95: bCharsSummary.p95,
        },
        compressed_context_chars: {
          mean: cCharsSummary.mean,
          p50: cCharsSummary.p50,
          p95: cCharsSummary.p95,
        },
        items_retain_ratio: {
          mean: itemsSummary.mean,
          p50: itemsSummary.p50,
          p95: itemsSummary.p95,
        },
        citations_retain_ratio: {
          mean: citationsSummary.mean,
          p50: citationsSummary.p50,
          p95: citationsSummary.p95,
        },
        compaction_applied_ratio: okPairs > 0 ? round(appliedCount / okPairs, 6) : 0,
        latency_ms: {
          baseline_p95: bLatencySummary.p95,
          compressed_p95: cLatencySummary.p95,
          delta_p95: round(cLatencySummary.p95 - bLatencySummary.p95, 6),
        },
      },
    };
  }

  let optimization: OptimizationAggregate | null = null;
  if (optimizationCheck) {
    const optimizationByStatus: Record<string, number> = {};
    const optimizationLeversFrequency: Record<string, number> = {};
    const optimizationProfileSourceFrequency: Record<string, number> = {};
    const selectedMemoryLayerFrequency: Record<string, number> = {};
    const selectionPolicyFrequency: Record<string, number> = {};
    const selectionPolicySourceFrequency: Record<string, number> = {};
    const requestedAllowedLayerFrequency: Record<string, number> = {};
    const overrideSelectedMemoryLayerFrequency: Record<string, number> = {};
    const overrideSelectionPolicySourceFrequency: Record<string, number> = {};
    const overrideRequestedAllowedLayerFrequency: Record<string, number> = {};
    const baselineTokens: number[] = [];
    const optimizedTokens: number[] = [];
    const tightenedTokens: number[] = [];
    const tightenedVsOptimizedTokenDelta: number[] = [];
    const tokenReductionRatios: number[] = [];
    const forgottenItems: number[] = [];
    const staticBlocksSelected: number[] = [];
    const baselineLatency: number[] = [];
    const optimizedLatency: number[] = [];
    const tightenedLatency: number[] = [];
    const baselineStageTimings: Array<Record<string, unknown>> = [];
    const optimizedStageTimings: Array<Record<string, unknown>> = [];
    let transportErrorCount = 0;
    let withinTokenBudgetCount = 0;
    let optimizationProfileAppliedCount = 0;
    let overrideWithinTokenBudgetCount = 0;

    const staticContextBlocks = [
      {
        id: "deploy_bootstrap",
        title: "Deploy Bootstrap",
        content: "Require approval before prod deploy, capture rollback refs, verify canary health, and confirm owner sign-off.",
        intents: ["deploy"],
        tools: ["kubectl"],
        priority: 90,
      },
      {
        id: "prod_change_guard",
        title: "Prod Change Guard",
        content: "Production changes must include blast-radius check, rollback path, and post-deploy verification commands.",
        intents: ["deploy", "change"],
        tags: ["prod", "safety"],
        tools: ["kubectl", "bash"],
        priority: 85,
      },
      {
        id: "search_reindex_playbook",
        title: "Search Reindex",
        content: "Use reindex workflow for search clusters and verify shard movement before traffic cutover.",
        intents: ["reindex"],
        tools: ["curl"],
        priority: 60,
      },
      {
        id: "postgres_maintenance_window",
        title: "Postgres Maintenance",
        content: "Schedule psql maintenance during low traffic and confirm replication lag before vacuum or schema work.",
        intents: ["database"],
        tools: ["psql"],
        priority: 55,
      },
    ];
    const optimizationToolCandidates = ["kubectl", "bash"];
    const baseAssemblePayload = () => ({
      tenant_id: tenantId,
      scope,
      query_text: optimizationQueryText,
      include_rules: false,
      tool_candidates: optimizationToolCandidates,
      return_layered_context: true,
      context: {
        intent: "deploy",
        environment: "prod",
        actor: "perf_benchmark",
      },
      context_token_budget: optimizationTokenBudget,
      static_context_blocks: staticContextBlocks,
    });

    for (let i = 0; i < optimizationSamples; i += 1) {
      if (paceMs > 0) await sleepMs(paceMs);

      const baseline = await timedRequestJson("/v1/memory/context/assemble", {
        ...baseAssemblePayload(),
        context_compaction_profile: "balanced",
        context_layers: {
          enabled: ["facts", "episodes", "static", "tools", "citations"],
          char_budget_total: optimizationCharBudget,
          include_merge_trace: false,
          forgetting_policy: { enabled: false },
        },
        static_injection: {
          enabled: true,
          max_blocks: staticContextBlocks.length,
          min_score: 0,
          include_selection_trace: false,
        },
      });
      const baselineStatusKey = baseline.error ? `baseline:error:${baseline.error}` : `baseline:${baseline.status}`;
      optimizationByStatus[baselineStatusKey] = (optimizationByStatus[baselineStatusKey] ?? 0) + 1;
      if (baseline.error) transportErrorCount += 1;

      const optimized = await timedRequestJson("/v1/memory/context/assemble", {
        ...baseAssemblePayload(),
        ...(optimizationRequestMode === "explicit" ? { context_optimization_profile: optimizationProfile } : {}),
        context_layers: {
          enabled: ["facts", "episodes", "static", "tools", "citations"],
          char_budget_total: optimizationCharBudget,
          include_merge_trace: false,
        },
      });
      const optimizedStatusKey = optimized.error ? `optimized:error:${optimized.error}` : `optimized:${optimized.status}`;
      optimizationByStatus[optimizedStatusKey] = (optimizationByStatus[optimizedStatusKey] ?? 0) + 1;
      if (optimized.error) transportErrorCount += 1;

      let optimizedOverride: JsonSample | null = null;
      if (optimizationOverrideCheck) {
        optimizedOverride = await timedRequestJson("/v1/memory/context/assemble", {
          ...baseAssemblePayload(),
          ...(optimizationRequestMode === "explicit" ? { context_optimization_profile: optimizationProfile } : {}),
          memory_layer_preference: {
            allowed_layers: optimizationOverrideLayers,
          },
          context_layers: {
            enabled: ["facts", "episodes", "static", "tools", "citations"],
            char_budget_total: optimizationCharBudget,
            include_merge_trace: false,
          },
        });
        const optimizedOverrideStatusKey = optimizedOverride.error
          ? `optimized_override:error:${optimizedOverride.error}`
          : `optimized_override:${optimizedOverride.status}`;
        optimizationByStatus[optimizedOverrideStatusKey] =
          (optimizationByStatus[optimizedOverrideStatusKey] ?? 0) + 1;
        if (optimizedOverride.error) transportErrorCount += 1;
      }

      if (!baseline.ok || !optimized.ok) continue;

      const baselineCost = baseline.body?.cost_signals ?? null;
      const optimizedCost = optimized.body?.cost_signals ?? null;
      const optimizedOverrideCost = optimizedOverride?.body?.cost_signals ?? null;
      const baselineStageTiming = baseline.body?.recall?.observability?.stage_timings_ms ?? null;
      const optimizedStageTiming = optimized.body?.recall?.observability?.stage_timings_ms ?? null;
      const baselineLayeredTiming = baseline.body?.layered_context?.timings_ms ?? null;
      const optimizedLayeredTiming = optimized.body?.layered_context?.timings_ms ?? null;
      const baselineContextTokens = Number(baselineCost?.context_est_tokens ?? 0);
      const optimizedContextTokens = Number(optimizedCost?.context_est_tokens ?? 0);
      if (!(baselineContextTokens > 0)) continue;

      baselineTokens.push(baselineContextTokens);
      optimizedTokens.push(Math.max(0, optimizedContextTokens));
      tokenReductionRatios.push(Math.max(0, 1 - Math.max(0, optimizedContextTokens) / baselineContextTokens));
      forgottenItems.push(Math.max(0, Number(optimizedCost?.forgotten_items ?? 0)));
      staticBlocksSelected.push(Math.max(0, Number(optimizedCost?.static_blocks_selected ?? 0)));
      baselineLatency.push(baseline.ms);
      optimizedLatency.push(optimized.ms);
      if (optimizedOverride?.ok) {
        const tightenedContextTokens = Number(optimizedOverrideCost?.context_est_tokens ?? 0);
        tightenedTokens.push(Math.max(0, tightenedContextTokens));
        tightenedVsOptimizedTokenDelta.push(Math.max(0, optimizedContextTokens - Math.max(0, tightenedContextTokens)));
        tightenedLatency.push(optimizedOverride.ms);
        if (optimizedOverrideCost?.within_token_budget === true) overrideWithinTokenBudgetCount += 1;
        const overrideSelectionPolicy = optimizedOverride.body?.recall?.context?.selection_policy ?? null;
        incrementFrequency(overrideSelectionPolicySourceFrequency, overrideSelectionPolicy?.source);
        const overrideRequestedAllowedLayers = Array.isArray(overrideSelectionPolicy?.requested_allowed_layers)
          ? overrideSelectionPolicy.requested_allowed_layers
          : [];
        for (const layer of overrideRequestedAllowedLayers) incrementFrequency(overrideRequestedAllowedLayerFrequency, layer);
        const overrideSelectedMemoryLayers = Array.isArray(optimizedOverrideCost?.selected_memory_layers)
          ? optimizedOverrideCost.selected_memory_layers
          : [];
        for (const layer of overrideSelectedMemoryLayers) incrementFrequency(overrideSelectedMemoryLayerFrequency, layer);
      }
      if ((baselineStageTiming && typeof baselineStageTiming === "object") || (baselineLayeredTiming && typeof baselineLayeredTiming === "object")) {
        baselineStageTimings.push({
          ...((baselineStageTiming && typeof baselineStageTiming === "object" ? baselineStageTiming : {}) as Record<string, unknown>),
          ...((baselineLayeredTiming && typeof baselineLayeredTiming === "object" ? baselineLayeredTiming : {}) as Record<string, unknown>),
        });
      }
      if ((optimizedStageTiming && typeof optimizedStageTiming === "object") || (optimizedLayeredTiming && typeof optimizedLayeredTiming === "object")) {
        optimizedStageTimings.push({
          ...((optimizedStageTiming && typeof optimizedStageTiming === "object" ? optimizedStageTiming : {}) as Record<string, unknown>),
          ...((optimizedLayeredTiming && typeof optimizedLayeredTiming === "object" ? optimizedLayeredTiming : {}) as Record<string, unknown>),
        });
      }

      if (optimizedCost?.within_token_budget === true) withinTokenBudgetCount += 1;
      if (optimized.body?.layered_context?.optimization_profile?.applied === true) optimizationProfileAppliedCount += 1;
      const optimizationProfileSource = String(
        optimized.body?.layered_context?.optimization_profile?.source ?? "unknown",
      ).trim();
      if (optimizationProfileSource) {
        optimizationProfileSourceFrequency[optimizationProfileSource] =
          (optimizationProfileSourceFrequency[optimizationProfileSource] ?? 0) + 1;
      }
      const levers = Array.isArray(optimizedCost?.primary_savings_levers) ? optimizedCost.primary_savings_levers : [];
      for (const lever of levers) {
        const key = String(lever || "").trim();
        if (!key) continue;
        optimizationLeversFrequency[key] = (optimizationLeversFrequency[key] ?? 0) + 1;
      }
      const selectedMemoryLayers = Array.isArray(optimizedCost?.selected_memory_layers) ? optimizedCost.selected_memory_layers : [];
      for (const layer of selectedMemoryLayers) incrementFrequency(selectedMemoryLayerFrequency, layer);
      const selectionPolicy = optimized.body?.recall?.context?.selection_policy ?? null;
      incrementFrequency(selectionPolicyFrequency, selectionPolicy?.name);
      incrementFrequency(selectionPolicySourceFrequency, selectionPolicy?.source);
      const requestedAllowedLayers = Array.isArray(selectionPolicy?.requested_allowed_layers)
        ? selectionPolicy.requested_allowed_layers
        : [];
      for (const layer of requestedAllowedLayers) incrementFrequency(requestedAllowedLayerFrequency, layer);
    }

    const baselineTokenSummary = summarizeSeries(baselineTokens);
    const optimizedTokenSummary = summarizeSeries(optimizedTokens);
    const tightenedTokenSummary = summarizeSeries(tightenedTokens);
    const tightenedVsOptimizedTokenDeltaSummary = summarizeSeries(tightenedVsOptimizedTokenDelta);
    const reductionSummary = summarizeSeries(tokenReductionRatios);
    const forgottenSummary = summarizeSeries(forgottenItems);
    const staticBlocksSummary = summarizeSeries(staticBlocksSelected);
    const baselineLatencySummary = summarizeSeries(baselineLatency);
    const optimizedLatencySummary = summarizeSeries(optimizedLatency);
    const tightenedLatencySummary = summarizeSeries(tightenedLatency);
    const baselineStageSummary = summarizeStageTimingSeries(baselineStageTimings);
    const optimizedStageSummary = summarizeStageTimingSeries(optimizedStageTimings);
    const stageDeltaP95: Record<string, number> = {};
    for (const key of Array.from(new Set([...Object.keys(baselineStageSummary), ...Object.keys(optimizedStageSummary)])).sort()) {
      stageDeltaP95[key] = round((optimizedStageSummary[key]?.p95 ?? 0) - (baselineStageSummary[key]?.p95 ?? 0), 6);
    }
    const okPairs = tokenReductionRatios.length;

    optimization = {
      enabled: true,
      params: {
        benchmark_preset: optimizationBenchmarkPreset?.name ?? null,
        profile: optimizationProfile,
        request_mode: optimizationRequestMode,
        token_budget: optimizationTokenBudget,
        char_budget_total: optimizationCharBudget,
        samples: optimizationSamples,
        query_text: optimizationQueryText,
        tool_candidates: optimizationToolCandidates,
        override_check: optimizationOverrideCheck,
        override_layers: optimizationOverrideLayers,
      },
      total_pairs: optimizationSamples,
      ok_pairs: okPairs,
      failed_pairs: Math.max(0, optimizationSamples - okPairs),
      by_status: optimizationByStatus,
      transport_error_count: transportErrorCount,
      levers_frequency: optimizationLeversFrequency,
      summary: {
        estimated_token_reduction: reductionSummary,
        baseline_context_est_tokens: {
          mean: baselineTokenSummary.mean,
          p50: baselineTokenSummary.p50,
          p95: baselineTokenSummary.p95,
        },
        optimized_context_est_tokens: {
          mean: optimizedTokenSummary.mean,
          p50: optimizedTokenSummary.p50,
          p95: optimizedTokenSummary.p95,
        },
        forgotten_items: {
          mean: forgottenSummary.mean,
          p50: forgottenSummary.p50,
          p95: forgottenSummary.p95,
        },
        static_blocks_selected: {
          mean: staticBlocksSummary.mean,
          p50: staticBlocksSummary.p50,
          p95: staticBlocksSummary.p95,
        },
        within_token_budget_ratio: okPairs > 0 ? round(withinTokenBudgetCount / okPairs, 6) : 0,
        optimization_profile_applied_ratio: okPairs > 0 ? round(optimizationProfileAppliedCount / okPairs, 6) : 0,
        optimization_profile_source_frequency: optimizationProfileSourceFrequency,
        selected_memory_layers_frequency: selectedMemoryLayerFrequency,
        selection_policy_frequency: selectionPolicyFrequency,
        selection_policy_source_frequency: selectionPolicySourceFrequency,
        requested_allowed_layers_frequency: requestedAllowedLayerFrequency,
        latency_ms: {
          baseline_p95: baselineLatencySummary.p95,
          optimized_p95: optimizedLatencySummary.p95,
          delta_p95: round(optimizedLatencySummary.p95 - baselineLatencySummary.p95, 6),
        },
      },
      override_compare: optimizationOverrideCheck
        ? {
            enabled: true,
            allowed_layers: optimizationOverrideLayers,
            ok_pairs: tightenedTokens.length,
            failed_pairs: Math.max(0, optimizationSamples - tightenedTokens.length),
            tightened_context_est_tokens: {
              mean: tightenedTokenSummary.mean,
              p50: tightenedTokenSummary.p50,
              p95: tightenedTokenSummary.p95,
            },
            delta_vs_optimized_tokens: tightenedVsOptimizedTokenDeltaSummary,
            within_token_budget_ratio:
              tightenedTokens.length > 0 ? round(overrideWithinTokenBudgetCount / tightenedTokens.length, 6) : 0,
            selected_memory_layers_frequency: overrideSelectedMemoryLayerFrequency,
            selection_policy_source_frequency: overrideSelectionPolicySourceFrequency,
            requested_allowed_layers_frequency: overrideRequestedAllowedLayerFrequency,
            latency_ms: {
              optimized_p95: optimizedLatencySummary.p95,
              tightened_p95: tightenedLatencySummary.p95,
              delta_p95: round(tightenedLatencySummary.p95 - optimizedLatencySummary.p95, 6),
            },
          }
        : undefined,
      latency_breakdown_ms: {
        baseline: baselineStageSummary,
        optimized: optimizedStageSummary,
        delta_p95: stageDeltaP95,
      },
    };
  }

  let replay: ReplayOptimizationAggregate | null = null;
  if (replayCheck) {
    const replayByStatus: Record<string, number> = {};
    const recommendedModeFrequency: Record<string, number> = {};
    const nextActionFrequency: Record<string, number> = {};
    const mismatchFrequency: Record<string, number> = {};
    const decisionFrequency: Record<string, number> = {};
    const dispatchLatency: number[] = [];
    let transportErrorCount = 0;
    let eligibleCount = 0;
    let primaryInferenceSkippedCount = 0;
    let fallbackExecutedCount = 0;
    let resultSummaryPresentCount = 0;
    let estimatedCallsAvoidedSum = 0;
    let okSamples = 0;

    const deterministicGate = {
      enabled: true,
      prefer_deterministic_execution: true,
      on_mismatch: replayExecuteFallback ? "fallback" : "reject",
      ...(replayGateMatchers ? { matchers: replayGateMatchers } : {}),
      ...(replayGatePolicyConstraints ? { policy_constraints: replayGatePolicyConstraints } : {}),
    };

    for (let i = 0; i < replaySamples; i += 1) {
      if (paceMs > 0) await sleepMs(paceMs);

      const candidate = await timedRequestJson("/v1/memory/replay/playbooks/candidate", {
        tenant_id: tenantId,
        scope,
        playbook_id: replayPlaybookId,
        ...(replayVersion ? { version: replayVersion } : {}),
        deterministic_gate: deterministicGate,
      });
      const candidateStatusKey = candidate.error ? `candidate:error:${candidate.error}` : `candidate:${candidate.status}`;
      replayByStatus[candidateStatusKey] = (replayByStatus[candidateStatusKey] ?? 0) + 1;
      if (candidate.error) transportErrorCount += 1;

      const dispatch = await timedRequestJson("/v1/memory/replay/playbooks/dispatch", {
        tenant_id: tenantId,
        scope,
        playbook_id: replayPlaybookId,
        ...(replayVersion ? { version: replayVersion } : {}),
        deterministic_gate: deterministicGate,
        fallback_mode: replayFallbackMode,
        execute_fallback: replayExecuteFallback,
      });
      const dispatchStatusKey = dispatch.error ? `dispatch:error:${dispatch.error}` : `dispatch:${dispatch.status}`;
      replayByStatus[dispatchStatusKey] = (replayByStatus[dispatchStatusKey] ?? 0) + 1;
      if (dispatch.error) transportErrorCount += 1;

      if (!candidate.ok || !dispatch.ok) continue;
      okSamples += 1;

      const candidateBody = candidate.body ?? {};
      const dispatchBody = dispatch.body ?? {};
      const candidateInfo = candidateBody.candidate ?? {};
      const dispatchInfo = dispatchBody.dispatch ?? {};
      const replayCost = dispatchBody.cost_signals ?? {};
      const replayPayload = dispatchBody.replay ?? null;
      const recommendedMode = String(candidateInfo.recommended_mode ?? "").trim() || "unknown";
      const nextAction = String(candidateInfo.next_action ?? "").trim() || "unknown";
      const mismatches = Array.isArray(candidateInfo.mismatch_reasons) ? candidateInfo.mismatch_reasons : [];
      const decision = String(dispatchInfo.decision ?? "").trim() || "unknown";
      const replaySteps = Array.isArray(replayPayload?.steps) ? replayPayload.steps : [];
      const hasResultSummary = replaySteps.some((step: any) => Boolean(step?.result_summary?.summary_version));

      if (candidateInfo.eligible_for_deterministic_replay === true) eligibleCount += 1;
      recommendedModeFrequency[recommendedMode] = (recommendedModeFrequency[recommendedMode] ?? 0) + 1;
      nextActionFrequency[nextAction] = (nextActionFrequency[nextAction] ?? 0) + 1;
      for (const reason of mismatches) {
        const key = String(reason || "").trim();
        if (!key) continue;
        mismatchFrequency[key] = (mismatchFrequency[key] ?? 0) + 1;
      }

      decisionFrequency[decision] = (decisionFrequency[decision] ?? 0) + 1;
      dispatchLatency.push(dispatch.ms);
      if (dispatchInfo.primary_inference_skipped === true) primaryInferenceSkippedCount += 1;
      if (dispatchInfo.fallback_executed === true) fallbackExecutedCount += 1;
      if (hasResultSummary) resultSummaryPresentCount += 1;
      estimatedCallsAvoidedSum += Number(replayCost.estimated_primary_model_calls_avoided ?? 0);
    }

    const dispatchLatencySummary = summarizeSeries(dispatchLatency);
    replay = {
      enabled: true,
      params: {
        playbook_id: replayPlaybookId,
        version: replayVersion,
        samples: replaySamples,
        fallback_mode: replayFallbackMode,
        execute_fallback: replayExecuteFallback,
        gate_matchers: replayGateMatchers,
        gate_policy_constraints: replayGatePolicyConstraints,
      },
      total_samples: replaySamples,
      ok_samples: okSamples,
      failed_samples: Math.max(0, replaySamples - okSamples),
      by_status: replayByStatus,
      transport_error_count: transportErrorCount,
      candidate: {
        eligible_ratio: okSamples > 0 ? round(eligibleCount / okSamples, 6) : 0,
        recommended_mode_frequency: recommendedModeFrequency,
        next_action_frequency: nextActionFrequency,
        mismatch_frequency: mismatchFrequency,
      },
      dispatch: {
        decision_frequency: decisionFrequency,
        primary_inference_skipped_ratio: okSamples > 0 ? round(primaryInferenceSkippedCount / okSamples, 6) : 0,
        fallback_executed_ratio: okSamples > 0 ? round(fallbackExecutedCount / okSamples, 6) : 0,
        estimated_primary_model_calls_avoided_mean: okSamples > 0 ? round(estimatedCallsAvoidedSum / okSamples, 6) : 0,
        result_summary_present_ratio: okSamples > 0 ? round(resultSummaryPresentCount / okSamples, 6) : 0,
        latency_ms: {
          p50: dispatchLatencySummary.p50,
          p95: dispatchLatencySummary.p95,
          mean: dispatchLatencySummary.mean,
        },
      },
    };
  }

  let sandbox: SandboxOptimizationAggregate | null = null;
  if (sandboxCheck) {
    const sandboxByStatus: Record<string, number> = {};
    const executeLatency: number[] = [];
    const runGetLatency: number[] = [];
    const logsLatency: number[] = [];
    const artifactLatency: number[] = [];
    let transportErrorCount = 0;
    let sessionCreated = false;
    let okSamples = 0;
    let executeSummaryCount = 0;
    let runGetSummaryCount = 0;
    let logsSummaryCount = 0;
    let artifactSummaryCount = 0;
    let sessionId: string | null = null;

    const sessionCreate = await timedRequestJson("/v1/memory/sandbox/sessions", {
      tenant_id: tenantId,
      scope,
      profile: "default",
      metadata: { source: "perf_benchmark" },
    });
    const sessionStatusKey = sessionCreate.error ? `session:error:${sessionCreate.error}` : `session:${sessionCreate.status}`;
    sandboxByStatus[sessionStatusKey] = (sandboxByStatus[sessionStatusKey] ?? 0) + 1;
    if (sessionCreate.error) transportErrorCount += 1;
    if (sessionCreate.ok) {
      sessionId = String(sessionCreate.body?.session?.session_id ?? "").trim() || null;
      sessionCreated = Boolean(sessionId);
    }

    if (sessionId) {
      for (let i = 0; i < sandboxSamples; i += 1) {
        if (paceMs > 0) await sleepMs(paceMs);

        const execute = await timedRequestJson("/v1/memory/sandbox/execute", {
          tenant_id: tenantId,
          scope,
          session_id: sessionId,
          mode: "sync",
          ...(sandboxTimeout ? { timeout_ms: sandboxTimeout } : {}),
          action: {
            kind: "command",
            argv: sandboxArgv,
          },
          metadata: { sample_index: i, source: "perf_benchmark" },
        });
        const executeStatusKey = execute.error ? `execute:error:${execute.error}` : `execute:${execute.status}`;
        sandboxByStatus[executeStatusKey] = (sandboxByStatus[executeStatusKey] ?? 0) + 1;
        if (execute.error) transportErrorCount += 1;
        if (!execute.ok) continue;

        okSamples += 1;
        executeLatency.push(execute.ms);
        const runId = String(execute.body?.run?.run_id ?? "").trim();
        if (execute.body?.run?.result_summary?.summary_version) executeSummaryCount += 1;

        const runGet = await timedRequestJson("/v1/memory/sandbox/runs/get", {
          tenant_id: tenantId,
          scope,
          run_id: runId,
        });
        const runGetStatusKey = runGet.error ? `run_get:error:${runGet.error}` : `run_get:${runGet.status}`;
        sandboxByStatus[runGetStatusKey] = (sandboxByStatus[runGetStatusKey] ?? 0) + 1;
        if (runGet.error) transportErrorCount += 1;
        if (runGet.ok) {
          runGetLatency.push(runGet.ms);
          if (runGet.body?.run?.result_summary?.summary_version) runGetSummaryCount += 1;
        }

        const logs = await timedRequestJson("/v1/memory/sandbox/runs/logs", {
          tenant_id: tenantId,
          scope,
          run_id: runId,
        });
        const logsStatusKey = logs.error ? `logs:error:${logs.error}` : `logs:${logs.status}`;
        sandboxByStatus[logsStatusKey] = (sandboxByStatus[logsStatusKey] ?? 0) + 1;
        if (logs.error) transportErrorCount += 1;
        if (logs.ok) {
          logsLatency.push(logs.ms);
          if (logs.body?.logs?.summary?.summary_version) logsSummaryCount += 1;
        }

        const artifact = await timedRequestJson("/v1/memory/sandbox/runs/artifact", {
          tenant_id: tenantId,
          scope,
          run_id: runId,
          bundle_inline: false,
        });
        const artifactStatusKey = artifact.error ? `artifact:error:${artifact.error}` : `artifact:${artifact.status}`;
        sandboxByStatus[artifactStatusKey] = (sandboxByStatus[artifactStatusKey] ?? 0) + 1;
        if (artifact.error) transportErrorCount += 1;
        if (artifact.ok) {
          artifactLatency.push(artifact.ms);
          if (artifact.body?.artifact?.summary?.summary_version) artifactSummaryCount += 1;
        }
      }
    }

    const executeLatencySummary = summarizeSeries(executeLatency);
    const runGetLatencySummary = summarizeSeries(runGetLatency);
    const logsLatencySummary = summarizeSeries(logsLatency);
    const artifactLatencySummary = summarizeSeries(artifactLatency);

    sandbox = {
      enabled: true,
      params: {
        samples: sandboxSamples,
        argv: sandboxArgv,
        timeout_ms: sandboxTimeout,
      },
      session_created: sessionCreated,
      total_samples: sandboxSamples,
      ok_samples: okSamples,
      failed_samples: Math.max(0, sandboxSamples - okSamples),
      by_status: sandboxByStatus,
      transport_error_count: transportErrorCount,
      result_summary_present_ratio: {
        execute: okSamples > 0 ? round(executeSummaryCount / okSamples, 6) : 0,
        run_get: okSamples > 0 ? round(runGetSummaryCount / okSamples, 6) : 0,
        logs: okSamples > 0 ? round(logsSummaryCount / okSamples, 6) : 0,
        artifact: okSamples > 0 ? round(artifactSummaryCount / okSamples, 6) : 0,
      },
      endpoint_latency_ms: {
        execute: {
          p50: executeLatencySummary.p50,
          p95: executeLatencySummary.p95,
          mean: executeLatencySummary.mean,
        },
        run_get: {
          p50: runGetLatencySummary.p50,
          p95: runGetLatencySummary.p95,
          mean: runGetLatencySummary.mean,
        },
        logs: {
          p50: logsLatencySummary.p50,
          p95: logsLatencySummary.p95,
          mean: logsLatencySummary.mean,
        },
        artifact: {
          p50: artifactLatencySummary.p50,
          p95: artifactLatencySummary.p95,
          mean: artifactLatencySummary.mean,
        },
      },
    };
  }

  let ann: AnnOptimizationAggregate | null = null;
  if (annCheck || annSelectorCheck) {
    const annProfilesOut: Record<string, AnnProfileAggregate> = {};
    const annPerQueryProfilesOut: Record<string, Record<string, AnnProfileAggregate>> = {};
    const annPerClassProfilesOut: Record<string, Record<string, AnnProfileAggregate>> = {};
    const annPerClassAccumulators: Record<string, Record<string, AnnAccumulator>> = {};
    if (annCheck) {
      for (const profile of annProfiles) {
        const profileDefaults = RECALL_PROFILE_DEFAULTS[profile];
        const statusCounts: Record<string, number> = {};
        const recallLatency: number[] = [];
        const annStage1Latency: number[] = [];
        const annSeedCount: number[] = [];
        const finalSeedCount: number[] = [];
        const resultNodes: number[] = [];
        const resultEdges: number[] = [];
        let transportErrorCount = 0;
        let sampleCount = 0;

        for (const querySpec of annQuerySpecs) {
          const queryText = querySpec.text;
          const queryClass = querySpec.class;
          const queryStatusCounts: Record<string, number> = {};
          const queryRecallLatency: number[] = [];
          const queryAnnStage1Latency: number[] = [];
          const queryAnnSeedCount: number[] = [];
          const queryFinalSeedCount: number[] = [];
          const queryResultNodes: number[] = [];
          const queryResultEdges: number[] = [];
          let queryTransportErrorCount = 0;
          let querySampleCount = 0;
          for (let i = 0; i < annSamples; i += 1) {
            if (paceMs > 0) await sleepMs(paceMs);
            const out = await timedRequestJson(
              "/v1/memory/recall_text",
              recallPayload(queryText, {
                ...profileDefaults,
                limit: profileDefaults.limit,
                return_debug: true,
              }),
            );
            const statusKey = out.error ? `error:${out.error}` : String(out.status);
            statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;
            queryStatusCounts[statusKey] = (queryStatusCounts[statusKey] ?? 0) + 1;
            if (out.error) transportErrorCount += 1;
            if (out.error) queryTransportErrorCount += 1;
            if (!out.ok) continue;

            sampleCount += 1;
            querySampleCount += 1;
            const observability = out.body?.observability ?? {};
            const stage1 = observability.stage1 ?? {};
            recallLatency.push(out.ms);
            queryRecallLatency.push(out.ms);
            annStage1Latency.push(Number(observability.stage_timings_ms?.stage1_candidates_ann_ms ?? 0));
            queryAnnStage1Latency.push(Number(observability.stage_timings_ms?.stage1_candidates_ann_ms ?? 0));
            annSeedCount.push(Number(stage1.ann_seed_count ?? 0));
            queryAnnSeedCount.push(Number(stage1.ann_seed_count ?? 0));
            finalSeedCount.push(Number(stage1.final_seed_count ?? 0));
            queryFinalSeedCount.push(Number(stage1.final_seed_count ?? 0));
            const nodeCount = Array.isArray(out.body?.subgraph?.nodes) ? out.body.subgraph.nodes.length : 0;
            const edgeCount = Array.isArray(out.body?.subgraph?.edges) ? out.body.subgraph.edges.length : 0;
            resultNodes.push(nodeCount);
            queryResultNodes.push(nodeCount);
            resultEdges.push(edgeCount);
            queryResultEdges.push(edgeCount);
          }
          const queryAggregate = summarizeAnnAccumulator({
            status_counts: queryStatusCounts,
            recall_latency: queryRecallLatency,
            ann_stage1_latency: queryAnnStage1Latency,
            ann_seed_count: queryAnnSeedCount,
            final_seed_count: queryFinalSeedCount,
            result_nodes: queryResultNodes,
            result_edges: queryResultEdges,
            transport_error_count: queryTransportErrorCount,
            sample_count: querySampleCount,
          });
          (annPerQueryProfilesOut[queryText] ??= {})[profile] = queryAggregate;
          const classProfileBucket = (annPerClassAccumulators[queryClass] ??= {});
          const classAcc = (classProfileBucket[profile] ??= {
            status_counts: {},
            recall_latency: [],
            ann_stage1_latency: [],
            ann_seed_count: [],
            final_seed_count: [],
            result_nodes: [],
            result_edges: [],
            transport_error_count: 0,
            sample_count: 0,
          });
          for (const [key, value] of Object.entries(queryStatusCounts)) {
            classAcc.status_counts[key] = Number(classAcc.status_counts[key] ?? 0) + Number(value);
          }
          classAcc.recall_latency.push(...queryRecallLatency);
          classAcc.ann_stage1_latency.push(...queryAnnStage1Latency);
          classAcc.ann_seed_count.push(...queryAnnSeedCount);
          classAcc.final_seed_count.push(...queryFinalSeedCount);
          classAcc.result_nodes.push(...queryResultNodes);
          classAcc.result_edges.push(...queryResultEdges);
          classAcc.transport_error_count += queryTransportErrorCount;
          classAcc.sample_count += querySampleCount;
        }

        annProfilesOut[profile] = {
          samples: sampleCount,
          transport_error_count: transportErrorCount,
          status_counts: statusCounts,
          recall_latency_ms: summarizeSeries(recallLatency),
          stage1_candidates_ann_ms: summarizeSeries(annStage1Latency),
          ann_seed_count: summarizeSeries(annSeedCount),
          final_seed_count: summarizeSeries(finalSeedCount),
          result_nodes: summarizeSeries(resultNodes),
          result_edges: summarizeSeries(resultEdges),
        };
      }
      for (const [queryClass, profiles] of Object.entries(annPerClassAccumulators)) {
        const outProfiles: Record<string, AnnProfileAggregate> = {};
        for (const [profile, acc] of Object.entries(profiles)) {
          outProfiles[profile] = summarizeAnnAccumulator(acc);
        }
        annPerClassProfilesOut[queryClass] = outProfiles;
      }
    }
    let selectorCompare: AnnSelectorCompareAggregate | undefined;
    if (annSelectorCheck) {
      const modes: AnnSelectorMode[] = ["static", "class_aware"];
      const overallAccumulators: Record<AnnSelectorMode, SelectorAccumulator> = {
        static: emptySelectorAccumulator(),
        class_aware: emptySelectorAccumulator(),
      };
      const perClassAccumulators: Record<string, Record<AnnSelectorMode, SelectorAccumulator>> = {};
      for (const querySpec of annQuerySpecs) {
        for (const mode of modes) {
          const classBucket = (perClassAccumulators[querySpec.class] ??= {
            static: emptySelectorAccumulator(),
            class_aware: emptySelectorAccumulator(),
          });
          const queryAcc = emptySelectorAccumulator();
          for (let i = 0; i < annSamples; i += 1) {
            if (paceMs > 0) await sleepMs(paceMs);
            const out = await timedRequestJson(
              "/v1/memory/recall_text",
              selectorPayload(querySpec.text, mode === "class_aware", {
                return_debug: true,
              }),
            );
            const statusKey = out.error ? `error:${out.error}` : String(out.status);
            queryAcc.status_counts[statusKey] = (queryAcc.status_counts[statusKey] ?? 0) + 1;
            if (out.error) queryAcc.transport_error_count += 1;
            if (!out.ok) continue;
            queryAcc.sample_count += 1;
            const observability = out.body?.observability ?? {};
            const stage1 = observability.stage1 ?? {};
            const classAware = observability.adaptive?.class_aware ?? {};
            queryAcc.recall_latency.push(out.ms);
            queryAcc.ann_stage1_latency.push(Number(observability.stage_timings_ms?.stage1_candidates_ann_ms ?? 0));
            queryAcc.ann_seed_count.push(Number(stage1.ann_seed_count ?? 0));
            queryAcc.final_seed_count.push(Number(stage1.final_seed_count ?? 0));
            queryAcc.result_nodes.push(Array.isArray(out.body?.subgraph?.nodes) ? out.body.subgraph.nodes.length : 0);
            queryAcc.result_edges.push(Array.isArray(out.body?.subgraph?.edges) ? out.body.subgraph.edges.length : 0);
            const selectedProfile = typeof classAware.profile === "string" && classAware.profile.trim().length > 0 ? classAware.profile.trim() : "unknown";
            queryAcc.selected_profile_frequency[selectedProfile] = (queryAcc.selected_profile_frequency[selectedProfile] ?? 0) + 1;
            if (classAware.applied === true) queryAcc.class_aware_applied_count += 1;
          }
          const sinks = [overallAccumulators[mode], classBucket[mode]];
          for (const sink of sinks) {
            for (const [key, value] of Object.entries(queryAcc.status_counts)) {
              sink.status_counts[key] = (sink.status_counts[key] ?? 0) + value;
            }
            sink.recall_latency.push(...queryAcc.recall_latency);
            sink.ann_stage1_latency.push(...queryAcc.ann_stage1_latency);
            sink.ann_seed_count.push(...queryAcc.ann_seed_count);
            sink.final_seed_count.push(...queryAcc.final_seed_count);
            sink.result_nodes.push(...queryAcc.result_nodes);
            sink.result_edges.push(...queryAcc.result_edges);
            sink.transport_error_count += queryAcc.transport_error_count;
            sink.sample_count += queryAcc.sample_count;
            sink.class_aware_applied_count += queryAcc.class_aware_applied_count;
            for (const [key, value] of Object.entries(queryAcc.selected_profile_frequency)) {
              sink.selected_profile_frequency[key] = (sink.selected_profile_frequency[key] ?? 0) + value;
            }
          }
        }
      }
      selectorCompare = {
        enabled: true,
        params: {
          samples_per_query: annSamples,
          query_texts: annQuerySpecs.map((item) => item.text),
          query_classes: Array.from(new Set(annQuerySpecs.map((item) => item.class))).sort((a, b) => a.localeCompare(b)),
          modes,
        },
        overall_modes: {
          static: summarizeSelectorAccumulator(overallAccumulators.static),
          class_aware: summarizeSelectorAccumulator(overallAccumulators.class_aware),
        },
        per_class_modes: Object.fromEntries(
          Object.entries(perClassAccumulators).map(([queryClass, modeAccumulators]) => [
            queryClass,
            {
              static: summarizeSelectorAccumulator(modeAccumulators.static),
              class_aware: summarizeSelectorAccumulator(modeAccumulators.class_aware),
            },
          ]),
        ),
      };
    }
    ann = {
      enabled: true,
      params: {
        samples_per_query: annSamples,
        query_texts: annQuerySpecs.map((item) => item.text),
        query_classes: Array.from(new Set(annQuerySpecs.map((item) => item.class))).sort((a, b) => a.localeCompare(b)),
        profiles: annProfiles,
      },
      profiles: annProfilesOut,
      per_query_profiles: annPerQueryProfilesOut,
      per_class_profiles: annPerClassProfilesOut,
      selector_compare: selectorCompare,
    };
  }

  const caseSummaries = cases.map((c) => c.summary);
  const transportFailCases =
    failTransportRate === null || !Number.isFinite(failTransportRate)
      ? []
      : caseSummaries
          .filter((c) => c.transport_error_rate > (failTransportRate as number))
          .map((c) => ({
            name: c.name,
            transport_error_count: c.transport_error_count,
            transport_error_rate: c.transport_error_rate,
          }));
  const compressionPairGate = compression ? compression.ok_pairs > 0 : true;
  const compressionPairGateEnforced = compressionPairGateMode === "blocking";
  const runOk = transportFailCases.length === 0 && (!compressionPairGateEnforced || compressionPairGate);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: runOk,
        base_url: baseUrl,
        auth_mode: authMode,
        scope,
        tenant_id: tenantId,
        params: {
          mode,
          warmup,
          recall_requests: recallRequests,
          recall_concurrency: recallConcurrency,
          write_requests: writeRequests,
          write_concurrency: writeConcurrency,
          timeout_ms: timeoutMs,
          pace_ms: paceMs,
          fail_on_transport_error_rate: failTransportRate,
          recall_profile: recallProfile,
          recall_profile_defaults: recallProfileDefaults,
          embed_on_write: embedOnWrite,
          compression_check: compressionCheck || mode === "compression",
          compression_pair_gate_mode: compressionPairGateMode,
          compression_samples: compressionSamples,
          compression_token_budget: compressionTokenBudget,
          compression_profile: compressionProfile,
          optimization_check: optimizationCheck,
          optimization_benchmark_preset: optimizationBenchmarkPreset?.name ?? null,
          optimization_samples: optimizationSamples,
          optimization_token_budget: optimizationTokenBudget,
          optimization_char_budget: optimizationCharBudget,
          optimization_profile: optimizationProfile,
          optimization_request_mode: optimizationRequestMode,
          optimization_override_check: optimizationOverrideCheck,
          optimization_override_layers: optimizationOverrideLayers,
          replay_check: replayCheck,
          replay_playbook_id: replayPlaybookId || null,
          replay_version: replayVersion,
          replay_samples: replaySamples,
          replay_fallback_mode: replayFallbackMode,
          replay_execute_fallback: replayExecuteFallback,
          sandbox_check: sandboxCheck,
          sandbox_samples: sandboxSamples,
          sandbox_argv: sandboxArgv,
          sandbox_timeout_ms: sandboxTimeout,
          ann_check: annCheck,
          ann_selector_check: annSelectorCheck,
          ann_samples: annSamples,
          ann_profiles: annProfiles,
        },
        quality: {
          transport_error_gate: {
            enabled: failTransportRate !== null && Number.isFinite(failTransportRate),
            threshold: failTransportRate,
            failed_cases: transportFailCases,
          },
          compression_pair_gate: {
            enabled: compression !== null,
            mode: compressionPairGateMode,
            enforced: compressionPairGateEnforced,
            min_ok_pairs: 1,
            ok_pairs: compression?.ok_pairs ?? 0,
            pass: compressionPairGate,
          },
        },
        cases: caseSummaries,
        compression,
        optimization,
        replay,
        sandbox,
        ann,
      },
      null,
      2,
    ),
  );

  if (!runOk) process.exitCode = 2;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
