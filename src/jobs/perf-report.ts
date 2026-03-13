import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

type PerfCase = {
  name: "recall_text" | "write";
  total: number;
  ok: number;
  failed: number;
  rps: number;
  latency_ms: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    min: number;
    max: number;
  };
  by_status: Record<string, number>;
};

type BenchmarkJson = {
  ok: boolean;
  scope: string;
  tenant_id: string;
  params: Record<string, unknown>;
  cases: PerfCase[];
  optimization?: {
    enabled: boolean;
    total_pairs: number;
    ok_pairs: number;
    failed_pairs: number;
    summary?: {
      estimated_token_reduction?: { mean: number; p50: number; p95: number };
      baseline_context_est_tokens?: { mean: number; p50: number; p95: number };
      optimized_context_est_tokens?: { mean: number; p50: number; p95: number };
      forgotten_items?: { mean: number; p50: number; p95: number };
      static_blocks_selected?: { mean: number; p50: number; p95: number };
      within_token_budget_ratio?: number;
      optimization_profile_applied_ratio?: number;
      optimization_profile_source_frequency?: Record<string, number>;
      retrieved_memory_layers_frequency?: Record<string, number>;
      selected_memory_layers_frequency?: Record<string, number>;
      retrieval_filtered_by_layer_policy_count?: { mean: number; p50: number; p95: number; min: number; max: number };
      retrieval_filtered_by_layer_frequency?: Record<string, number>;
      filtered_by_layer_policy_count?: { mean: number; p50: number; p95: number; min: number; max: number };
      filtered_by_layer_frequency?: Record<string, number>;
      selection_policy_frequency?: Record<string, number>;
      selection_policy_source_frequency?: Record<string, number>;
      requested_allowed_layers_frequency?: Record<string, number>;
      latency_ms?: { baseline_p95: number; optimized_p95: number; delta_p95: number };
    };
    latency_breakdown_ms?: {
      baseline?: Record<string, { mean: number; p50: number; p95: number; min: number; max: number }>;
      optimized?: Record<string, { mean: number; p50: number; p95: number; min: number; max: number }>;
      delta_p95?: Record<string, number>;
    };
    levers_frequency?: Record<string, number>;
    override_compare?: {
      enabled?: boolean;
      allowed_layers?: string[];
      drop_trust_anchors?: boolean;
      apply_layer_policy_to_retrieval?: boolean;
      ok_pairs?: number;
      failed_pairs?: number;
      tightened_context_est_tokens?: { mean: number; p50: number; p95: number };
      delta_vs_optimized_tokens?: { mean: number; p50: number; p95: number; min: number; max: number };
      within_token_budget_ratio?: number;
      retrieved_memory_layers_frequency?: Record<string, number>;
      selected_memory_layers_frequency?: Record<string, number>;
      retrieval_filtered_by_layer_policy_count?: { mean: number; p50: number; p95: number; min: number; max: number };
      retrieval_filtered_by_layer_frequency?: Record<string, number>;
      filtered_by_layer_policy_count?: { mean: number; p50: number; p95: number; min: number; max: number };
      filtered_by_layer_frequency?: Record<string, number>;
      selection_policy_source_frequency?: Record<string, number>;
      requested_allowed_layers_frequency?: Record<string, number>;
      latency_ms?: { optimized_p95: number; tightened_p95: number; delta_p95: number };
    };
  } | null;
  replay?: {
    enabled: boolean;
    total_samples: number;
    ok_samples: number;
    failed_samples: number;
    candidate?: {
      eligible_ratio?: number;
      recommended_mode_frequency?: Record<string, number>;
      next_action_frequency?: Record<string, number>;
      mismatch_frequency?: Record<string, number>;
    };
    dispatch?: {
      decision_frequency?: Record<string, number>;
      primary_inference_skipped_ratio?: number;
      fallback_executed_ratio?: number;
      estimated_primary_model_calls_avoided_mean?: number;
      result_summary_present_ratio?: number;
      latency_ms?: { p50: number; p95: number; mean: number };
    };
  } | null;
  sandbox?: {
    enabled: boolean;
    session_created: boolean;
    total_samples: number;
    ok_samples: number;
    failed_samples: number;
    result_summary_present_ratio?: {
      execute?: number;
      run_get?: number;
      logs?: number;
      artifact?: number;
    };
    endpoint_latency_ms?: {
      execute?: { p50: number; p95: number; mean: number };
      run_get?: { p50: number; p95: number; mean: number };
      logs?: { p50: number; p95: number; mean: number };
      artifact?: { p50: number; p95: number; mean: number };
    };
  } | null;
  ann?: {
    enabled: boolean;
    params?: {
      samples_per_query?: number;
      query_texts?: string[];
      query_classes?: string[];
      profiles?: string[];
    };
    profiles?: Record<
      string,
      {
        samples: number;
        transport_error_count: number;
        status_counts: Record<string, number>;
        recall_latency_ms: { mean: number; p50: number; p95: number; min: number; max: number };
        stage1_candidates_ann_ms: { mean: number; p50: number; p95: number; min: number; max: number };
        ann_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
        final_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
        result_nodes: { mean: number; p50: number; p95: number; min: number; max: number };
        result_edges: { mean: number; p50: number; p95: number; min: number; max: number };
      }
    >;
    per_query_profiles?: Record<
      string,
      Record<
        string,
        {
          samples: number;
          transport_error_count: number;
          status_counts: Record<string, number>;
          recall_latency_ms: { mean: number; p50: number; p95: number; min: number; max: number };
          stage1_candidates_ann_ms: { mean: number; p50: number; p95: number; min: number; max: number };
          ann_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
          final_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
          result_nodes: { mean: number; p50: number; p95: number; min: number; max: number };
          result_edges: { mean: number; p50: number; p95: number; min: number; max: number };
        }
      >
    >;
    per_class_profiles?: Record<
      string,
      Record<
        string,
        {
          samples: number;
          transport_error_count: number;
          status_counts: Record<string, number>;
          recall_latency_ms: { mean: number; p50: number; p95: number; min: number; max: number };
          stage1_candidates_ann_ms: { mean: number; p50: number; p95: number; min: number; max: number };
          ann_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
          final_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
          result_nodes: { mean: number; p50: number; p95: number; min: number; max: number };
          result_edges: { mean: number; p50: number; p95: number; min: number; max: number };
        }
      >
    >;
    selector_compare?: {
      enabled: boolean;
      params?: {
        samples_per_query?: number;
        query_texts?: string[];
        query_classes?: string[];
        modes?: string[];
      };
      overall_modes?: Record<
        string,
        {
          samples: number;
          transport_error_count: number;
          status_counts: Record<string, number>;
          recall_latency_ms: { mean: number; p50: number; p95: number; min: number; max: number };
          stage1_candidates_ann_ms: { mean: number; p50: number; p95: number; min: number; max: number };
          ann_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
          final_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
          result_nodes: { mean: number; p50: number; p95: number; min: number; max: number };
          result_edges: { mean: number; p50: number; p95: number; min: number; max: number };
          selected_profile_frequency?: Record<string, number>;
          class_aware_applied_ratio?: number;
        }
      >;
      per_class_modes?: Record<
        string,
        Record<
          string,
          {
            samples: number;
            transport_error_count: number;
            status_counts: Record<string, number>;
            recall_latency_ms: { mean: number; p50: number; p95: number; min: number; max: number };
            stage1_candidates_ann_ms: { mean: number; p50: number; p95: number; min: number; max: number };
            ann_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
            final_seed_count: { mean: number; p50: number; p95: number; min: number; max: number };
            result_nodes: { mean: number; p50: number; p95: number; min: number; max: number };
            result_edges: { mean: number; p50: number; p95: number; min: number; max: number };
            selected_profile_frequency?: Record<string, number>;
            class_aware_applied_ratio?: number;
          }
        >
      >;
    };
  } | null;
};

type SeedJson = {
  ok: boolean;
  scope: string;
  tenant_id: string;
  inserted: {
    topics: number;
    events: number;
    edges: number;
  };
  totals_in_scope: {
    nodes: number;
    edges: number;
  };
  elapsed_ms: number;
};

type WorkerJson = {
  ok: boolean;
  scope: string;
  iterations: number;
  totals: {
    claimed: number;
    processed: number;
    elapsed_ms_sum: number;
    throughput_processed_per_sec: number;
  };
};

type FailureReason = {
  key: string;
  count: number;
  share_pct: number;
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function argNumber(flag: string, fallback: number): number {
  const raw = argValue(flag);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function round(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

async function readJsonSafe<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractScale(fileName: string): number | null {
  const m = fileName.match(/_(\d+)\.json$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const hdr = rows[0];
  const sep = hdr.map(() => "---");
  const body = rows.slice(1);
  return [hdr, sep, ...body].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function parseStatusCode(key: string): number | null {
  if (key.startsWith("error:")) return null;
  const n = Number(key);
  return Number.isFinite(n) ? n : null;
}

function isSuccessKey(key: string): boolean {
  const code = parseStatusCode(key);
  return code !== null && code >= 200 && code < 300;
}

function topFailureReasons(perfCase: PerfCase, maxItems = 3): FailureReason[] {
  if (!perfCase || perfCase.failed <= 0) return [];
  const all = Object.entries(perfCase.by_status ?? {})
    .filter(([k, v]) => Number(v) > 0 && !isSuccessKey(k))
    .map(([k, v]) => ({ key: k, count: Number(v) }))
    .sort((a, b) => b.count - a.count);
  if (all.length === 0) return [];
  return all.slice(0, maxItems).map((r) => ({
    key: r.key,
    count: r.count,
    share_pct: perfCase.failed > 0 ? round((r.count / perfCase.failed) * 100, 2) : 0,
  }));
}

function findStatusCount(perfCase: PerfCase | undefined, target: number): number {
  if (!perfCase) return 0;
  return Number(perfCase.by_status?.[String(target)] ?? 0);
}

function sum5xx(perfCase: PerfCase | undefined): number {
  if (!perfCase) return 0;
  return Object.entries(perfCase.by_status ?? {}).reduce((acc, [k, v]) => {
    const code = parseStatusCode(k);
    if (code !== null && code >= 500 && code <= 599) return acc + Number(v);
    return acc;
  }, 0);
}

async function main() {
  const dirArg = argValue("--dir");
  if (!dirArg) throw new Error("usage: npm run job:perf-report -- --dir <artifacts_dir> [--output <file.md>]");
  const dir = path.resolve(dirArg);
  const output = path.resolve(argValue("--output") ?? path.join(dir, "PERFORMANCE_REPORT_V1.md"));
  const sloRecallP95Ms = argNumber("--slo-recall-p95-ms", 300);
  const sloWriteP95Ms = argNumber("--slo-write-p95-ms", 500);
  const sloMaxErrorRate = argNumber("--slo-max-error-rate", 0);
  const nowIso = new Date().toISOString();

  const files = await fs.readdir(dir);
  const seedFiles = files.filter((f) => /^seed_\d+\.json$/.test(f)).sort((a, b) => Number(extractScale(a) ?? 0) - Number(extractScale(b) ?? 0));
  const benchFiles = files.filter((f) => /^benchmark_\d+\.json$/.test(f)).sort((a, b) => Number(extractScale(a) ?? 0) - Number(extractScale(b) ?? 0));
  const explainFiles = files.filter((f) => /^explain_\d+\.txt$/.test(f)).sort((a, b) => Number(extractScale(a) ?? 0) - Number(extractScale(b) ?? 0));
  const workerFile = files.includes("worker_baseline.json") ? path.join(dir, "worker_baseline.json") : null;

  const seedByScale = new Map<number, SeedJson>();
  for (const f of seedFiles) {
    const scale = extractScale(f);
    if (!scale) continue;
    const v = await readJsonSafe<SeedJson>(path.join(dir, f));
    if (v?.ok) seedByScale.set(scale, v);
  }

  const benchByScale = new Map<number, BenchmarkJson>();
  for (const f of benchFiles) {
    const scale = extractScale(f);
    if (!scale) continue;
    const v = await readJsonSafe<BenchmarkJson>(path.join(dir, f));
    if (v?.ok) benchByScale.set(scale, v);
  }

  const explainByScale = new Map<number, number[]>();
  for (const f of explainFiles) {
    const scale = extractScale(f);
    if (!scale) continue;
    const txt = await fs.readFile(path.join(dir, f), "utf-8");
    const arr: number[] = [];
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/Execution Time:\s*([0-9.]+)\s*ms/i);
      if (m) arr.push(Number(m[1]));
    }
    explainByScale.set(scale, arr);
  }

  const worker = workerFile ? await readJsonSafe<WorkerJson>(workerFile) : null;
  const scales = Array.from(new Set([...seedByScale.keys(), ...benchByScale.keys()])).sort((a, b) => a - b);

  const rows: string[][] = [
    [
      "Scale(events)",
      "Scope",
      "Nodes",
      "Edges",
      "Recall p95",
      "Recall p99",
      "Write p95",
      "Write p99",
      "Recall fail%",
      "Write fail%",
      "SLO",
    ],
  ];
  const failureLines: string[] = [];
  const recommendationLines: string[] = [];
  const optimizationLines: string[] = [];
  const replayLines: string[] = [];
  const sandboxLines: string[] = [];
  const annLines: string[] = [];
  const scalesCsv = scales.join(",");
  const anyRecallIssue = { v: false };
  const anyWriteIssue = { v: false };
  const anyRecall5xx = { v: false };
  const anyWrite429Dominant = { v: false };

  for (const scale of scales) {
    const seed = seedByScale.get(scale);
    const bench = benchByScale.get(scale);
    const recall = bench?.cases.find((c) => c.name === "recall_text");
    const write = bench?.cases.find((c) => c.name === "write");
    const recallFailRate = recall ? (recall.total > 0 ? ((recall.failed / recall.total) * 100) : 0) : 0;
    const writeFailRate = write ? (write.total > 0 ? ((write.failed / write.total) * 100) : 0) : 0;
    const recallFailRateRatio = recall ? (recall.total > 0 ? (recall.failed / recall.total) : 0) : 0;
    const writeFailRateRatio = write ? (write.total > 0 ? (write.failed / write.total) : 0) : 0;
    const recallP95 = recall?.latency_ms?.p95 ?? 0;
    const writeP95 = write?.latency_ms?.p95 ?? 0;
    const recallP95Pass = !recall || recallP95 < sloRecallP95Ms;
    const writeP95Pass = !write || writeP95 < sloWriteP95Ms;
    const recallErrorPass = !recall || recallFailRateRatio <= sloMaxErrorRate;
    const writeErrorPass = !write || writeFailRateRatio <= sloMaxErrorRate;
    const sloPass = recallP95Pass && writeP95Pass && recallErrorPass && writeErrorPass;
    const recallTopReasons = recall ? topFailureReasons(recall) : [];
    const writeTopReasons = write ? topFailureReasons(write) : [];
    const recall5xxCount = sum5xx(recall);
    const write429 = findStatusCount(write, 429);
    const write429Share = write && write.failed > 0 ? write429 / write.failed : 0;

    if ((recall && (recallFailRateRatio > sloMaxErrorRate || recallP95 >= sloRecallP95Ms)) || recall5xxCount > 0) anyRecallIssue.v = true;
    if ((write && (writeFailRateRatio > sloMaxErrorRate || writeP95 >= sloWriteP95Ms)) || write429 > 0) anyWriteIssue.v = true;
    if (recall5xxCount > 0) anyRecall5xx.v = true;
    if (write429 > 0 && write429Share >= 0.5) anyWrite429Dominant.v = true;

    rows.push([
      String(scale),
      bench?.scope ?? seed?.scope ?? "-",
      String(seed?.totals_in_scope?.nodes ?? "-"),
      String(seed?.totals_in_scope?.edges ?? "-"),
      recall ? `${round(recall.latency_ms.p95)} ms` : "-",
      recall ? `${round(recall.latency_ms.p99)} ms` : "-",
      write ? `${round(write.latency_ms.p95)} ms` : "-",
      write ? `${round(write.latency_ms.p99)} ms` : "-",
      recall ? `${round(recallFailRate, 3)}%` : "-",
      write ? `${round(writeFailRate, 3)}%` : "-",
      sloPass ? "pass" : "fail",
    ]);

    if ((recall?.failed ?? 0) > 0 || (write?.failed ?? 0) > 0) {
      failureLines.push(`- scale=${scale}:`);
      if (recall) {
        if (recall.failed > 0) {
          const reasonText = recallTopReasons.map((r) => `${r.key} x${r.count} (${r.share_pct}%)`).join(", ");
          failureLines.push(
            `  - recall failed ${recall.failed}/${recall.total} (${round(recallFailRate)}%), top reasons: ${reasonText || "n/a"}`,
          );
        } else {
          failureLines.push(`  - recall failed 0/${recall.total} (0%)`);
        }
      }
      if (write) {
        if (write.failed > 0) {
          const reasonText = writeTopReasons.map((r) => `${r.key} x${r.count} (${r.share_pct}%)`).join(", ");
          failureLines.push(
            `  - write failed ${write.failed}/${write.total} (${round(writeFailRate)}%), top reasons: ${reasonText || "n/a"}`,
          );
        } else {
          failureLines.push(`  - write failed 0/${write.total} (0%)`);
        }
      }
    }

    const optimization = bench?.optimization;
    if (optimization?.enabled) {
      const reduction = optimization.summary?.estimated_token_reduction;
      const baselineTokens = optimization.summary?.baseline_context_est_tokens;
      const optimizedTokens = optimization.summary?.optimized_context_est_tokens;
      const forgotten = optimization.summary?.forgotten_items;
      const staticBlocks = optimization.summary?.static_blocks_selected;
      const latency = optimization.summary?.latency_ms;
      const levers = Object.entries(optimization.levers_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      optimizationLines.push(`- scale=${scale}: ok_pairs=${optimization.ok_pairs}/${optimization.total_pairs}`);
      if (reduction && baselineTokens && optimizedTokens) {
        optimizationLines.push(
          `  - estimated token reduction mean=${round(reduction.mean * 100, 2)}% p95=${round(reduction.p95 * 100, 2)}%; baseline p95=${round(baselineTokens.p95)} tokens -> optimized p95=${round(optimizedTokens.p95)} tokens`,
        );
      }
      if (forgotten && staticBlocks) {
        optimizationLines.push(
          `  - forgotten_items mean=${round(forgotten.mean, 3)} p95=${round(forgotten.p95, 3)}; static_blocks_selected mean=${round(staticBlocks.mean, 3)} p95=${round(staticBlocks.p95, 3)}`,
        );
      }
      if (optimization.summary?.within_token_budget_ratio !== undefined) {
        optimizationLines.push(
          `  - within_token_budget_ratio=${round(Number(optimization.summary.within_token_budget_ratio) * 100, 2)}%; optimization_profile_applied_ratio=${round(Number(optimization.summary.optimization_profile_applied_ratio ?? 0) * 100, 2)}%`,
        );
      }
      const optimizationSources = Object.entries(optimization.summary?.optimization_profile_source_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      if (optimizationSources) {
        optimizationLines.push(`  - optimization_profile_sources: ${optimizationSources}`);
      }
      const retrievedLayers = Object.entries(optimization.summary?.retrieved_memory_layers_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      if (retrievedLayers) {
        optimizationLines.push(`  - retrieved_memory_layers: ${retrievedLayers}`);
      }
      const selectedLayers = Object.entries(optimization.summary?.selected_memory_layers_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      if (selectedLayers) {
        optimizationLines.push(`  - selected_memory_layers: ${selectedLayers}`);
      }
      const retrievalFilteredByLayerPolicy = optimization.summary?.retrieval_filtered_by_layer_policy_count;
      if (retrievalFilteredByLayerPolicy) {
        optimizationLines.push(
          `  - retrieval_filtered_by_layer_policy_count mean=${round(retrievalFilteredByLayerPolicy.mean, 3)} p50=${round(retrievalFilteredByLayerPolicy.p50, 3)} p95=${round(retrievalFilteredByLayerPolicy.p95, 3)}`,
        );
      }
      const retrievalFilteredByLayer = Object.entries(optimization.summary?.retrieval_filtered_by_layer_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      if (retrievalFilteredByLayer) {
        optimizationLines.push(`  - retrieval_filtered_by_layer: ${retrievalFilteredByLayer}`);
      }
      const filteredByLayerPolicy = optimization.summary?.filtered_by_layer_policy_count;
      if (filteredByLayerPolicy) {
        optimizationLines.push(
          `  - filtered_by_layer_policy_count mean=${round(filteredByLayerPolicy.mean, 3)} p50=${round(filteredByLayerPolicy.p50, 3)} p95=${round(filteredByLayerPolicy.p95, 3)}`,
        );
      }
      const filteredByLayer = Object.entries(optimization.summary?.filtered_by_layer_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      if (filteredByLayer) {
        optimizationLines.push(`  - filtered_by_layer: ${filteredByLayer}`);
      }
      const selectionPolicies = Object.entries(optimization.summary?.selection_policy_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      if (selectionPolicies) {
        optimizationLines.push(`  - selection_policies: ${selectionPolicies}`);
      }
      const selectionPolicySources = Object.entries(optimization.summary?.selection_policy_source_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      if (selectionPolicySources) {
        optimizationLines.push(`  - selection_policy_sources: ${selectionPolicySources}`);
      }
      const requestedAllowedLayers = Object.entries(optimization.summary?.requested_allowed_layers_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      if (requestedAllowedLayers) {
        optimizationLines.push(`  - requested_allowed_layers: ${requestedAllowedLayers}`);
      }
      if (latency) {
        optimizationLines.push(
          `  - context assemble p95 baseline=${round(latency.baseline_p95)} ms optimized=${round(latency.optimized_p95)} ms delta=${round(latency.delta_p95)} ms`,
        );
      }
      const stageBreakdown = Object.entries(optimization.latency_breakdown_ms?.delta_p95 ?? {})
        .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])) || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([k, v]) => `${k}=${round(Number(v), 3)} ms`)
        .join(", ");
      if (stageBreakdown) optimizationLines.push(`  - top stage delta p95: ${stageBreakdown}`);
      if (levers) optimizationLines.push(`  - top savings levers: ${levers}`);
      const overrideCompare = optimization.override_compare;
      if (overrideCompare?.enabled) {
        optimizationLines.push(
          `  - override cohort: layers=${Array.isArray(overrideCompare.allowed_layers) ? overrideCompare.allowed_layers.join(", ") : "(none)"} trust_anchors=${overrideCompare.drop_trust_anchors ? "dropped_for_benchmark" : "kept"} retrieval_filter=${overrideCompare.apply_layer_policy_to_retrieval ? "enabled" : "selection_only"} ok_pairs=${Number(overrideCompare.ok_pairs ?? 0)}`,
        );
        optimizationLines.push(
          `  - override token delta vs optimized mean=${round(Number(overrideCompare.delta_vs_optimized_tokens?.mean ?? 0), 3)} p50=${round(Number(overrideCompare.delta_vs_optimized_tokens?.p50 ?? 0), 3)} p95=${round(Number(overrideCompare.delta_vs_optimized_tokens?.p95 ?? 0), 3)}`,
        );
        optimizationLines.push(
          `  - override within token budget ratio=${round(Number(overrideCompare.within_token_budget_ratio ?? 0), 4)}`,
        );
        const overrideRetrievedLayers = Object.entries(overrideCompare.retrieved_memory_layers_frequency ?? {})
          .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
          .map(([k, v]) => `${k} x${v}`)
          .join(", ");
        if (overrideRetrievedLayers) {
          optimizationLines.push(`  - override retrieved_memory_layers: ${overrideRetrievedLayers}`);
        }
        const overrideRetrievalFilteredByLayerPolicy = overrideCompare.retrieval_filtered_by_layer_policy_count;
        if (overrideRetrievalFilteredByLayerPolicy) {
          optimizationLines.push(
            `  - override retrieval_filtered_by_layer_policy_count mean=${round(Number(overrideRetrievalFilteredByLayerPolicy.mean ?? 0), 3)} p50=${round(Number(overrideRetrievalFilteredByLayerPolicy.p50 ?? 0), 3)} p95=${round(Number(overrideRetrievalFilteredByLayerPolicy.p95 ?? 0), 3)}`,
          );
        }
        const overrideRetrievalFilteredByLayer = Object.entries(overrideCompare.retrieval_filtered_by_layer_frequency ?? {})
          .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
          .map(([k, v]) => `${k} x${v}`)
          .join(", ");
        if (overrideRetrievalFilteredByLayer) {
          optimizationLines.push(`  - override retrieval_filtered_by_layer: ${overrideRetrievalFilteredByLayer}`);
        }
        const overrideFilteredByLayerPolicy = overrideCompare.filtered_by_layer_policy_count;
        if (overrideFilteredByLayerPolicy) {
          optimizationLines.push(
            `  - override filtered_by_layer_policy_count mean=${round(Number(overrideFilteredByLayerPolicy.mean ?? 0), 3)} p50=${round(Number(overrideFilteredByLayerPolicy.p50 ?? 0), 3)} p95=${round(Number(overrideFilteredByLayerPolicy.p95 ?? 0), 3)}`,
          );
        }
        const overrideFilteredByLayer = Object.entries(overrideCompare.filtered_by_layer_frequency ?? {})
          .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
          .map(([k, v]) => `${k} x${v}`)
          .join(", ");
        if (overrideFilteredByLayer) {
          optimizationLines.push(`  - override filtered_by_layer: ${overrideFilteredByLayer}`);
        }
        const overrideLatency = overrideCompare.latency_ms;
        if (overrideLatency) {
          optimizationLines.push(
            `  - override p95 optimized=${round(overrideLatency.optimized_p95)} ms tightened=${round(overrideLatency.tightened_p95)} ms delta=${round(overrideLatency.delta_p95)} ms`,
          );
        }
      }
    }

    const replay = bench?.replay;
    if (replay?.enabled) {
      const recommendedModes = Object.entries(replay.candidate?.recommended_mode_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      const nextActions = Object.entries(replay.candidate?.next_action_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      const mismatchReasons = Object.entries(replay.candidate?.mismatch_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      const decisions = Object.entries(replay.dispatch?.decision_frequency ?? {})
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} x${v}`)
        .join(", ");
      replayLines.push(`- scale=${scale}: ok_samples=${replay.ok_samples}/${replay.total_samples}`);
      if (replay.candidate?.eligible_ratio !== undefined) {
        replayLines.push(
          `  - deterministic eligibility=${round(Number(replay.candidate.eligible_ratio) * 100, 2)}%; recommended_modes=${recommendedModes || "n/a"}; next_actions=${nextActions || "n/a"}`,
        );
      }
      if (replay.dispatch) {
        replayLines.push(
          `  - decisions=${decisions || "n/a"}; primary_inference_skipped=${round(Number(replay.dispatch.primary_inference_skipped_ratio ?? 0) * 100, 2)}%; fallback_executed=${round(Number(replay.dispatch.fallback_executed_ratio ?? 0) * 100, 2)}%`,
        );
        replayLines.push(
          `  - estimated_primary_model_calls_avoided_mean=${round(Number(replay.dispatch.estimated_primary_model_calls_avoided_mean ?? 0), 3)}; result_summary_present=${round(Number(replay.dispatch.result_summary_present_ratio ?? 0) * 100, 2)}%`,
        );
      }
      if (replay.dispatch?.latency_ms) {
        replayLines.push(
          `  - replay dispatch latency p50=${round(replay.dispatch.latency_ms.p50)} ms p95=${round(replay.dispatch.latency_ms.p95)} ms mean=${round(replay.dispatch.latency_ms.mean)} ms`,
        );
      }
      if (mismatchReasons) replayLines.push(`  - top mismatch reasons: ${mismatchReasons}`);
    }

    const sandbox = bench?.sandbox;
    if (sandbox?.enabled) {
      sandboxLines.push(`- scale=${scale}: session_created=${sandbox.session_created ? "yes" : "no"} ok_samples=${sandbox.ok_samples}/${sandbox.total_samples}`);
      const coverage = sandbox.result_summary_present_ratio;
      if (coverage) {
        sandboxLines.push(
          `  - result_summary coverage execute=${round(Number(coverage.execute ?? 0) * 100, 2)}% run_get=${round(Number(coverage.run_get ?? 0) * 100, 2)}% logs=${round(Number(coverage.logs ?? 0) * 100, 2)}% artifact=${round(Number(coverage.artifact ?? 0) * 100, 2)}%`,
        );
      }
      const latency = sandbox.endpoint_latency_ms;
      if (latency) {
        sandboxLines.push(
          `  - latency p95 execute=${round(Number(latency.execute?.p95 ?? 0))} ms run_get=${round(Number(latency.run_get?.p95 ?? 0))} ms logs=${round(Number(latency.logs?.p95 ?? 0))} ms artifact=${round(Number(latency.artifact?.p95 ?? 0))} ms`,
        );
      }
    }

    const ann = bench?.ann;
    if (ann?.enabled) {
      annLines.push(
        `- scale=${scale}: samples_per_query=${ann.params?.samples_per_query ?? 0}; queries=${(ann.params?.query_texts ?? []).length}; classes=${(ann.params?.query_classes ?? []).length}`,
      );
      for (const [profile, profileOut] of Object.entries(ann.profiles ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
        annLines.push(
          `  - ${profile}: recall p95=${round(profileOut.recall_latency_ms.p95)} ms; stage1_ann p95=${round(profileOut.stage1_candidates_ann_ms.p95)} ms; ann_seed_count p95=${round(profileOut.ann_seed_count.p95, 3)}; final_seed_count p95=${round(profileOut.final_seed_count.p95, 3)}; result_nodes mean=${round(profileOut.result_nodes.mean, 3)}; result_edges mean=${round(profileOut.result_edges.mean, 3)}`,
        );
      }
      for (const [queryClass, profiles] of Object.entries(ann.per_class_profiles ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
        annLines.push(`  - class=\`${queryClass}\``);
        for (const [profile, profileOut] of Object.entries(profiles).sort((a, b) => a[0].localeCompare(b[0]))) {
          annLines.push(
            `    - ${profile}: recall p95=${round(profileOut.recall_latency_ms.p95)} ms; stage1_ann p95=${round(profileOut.stage1_candidates_ann_ms.p95)} ms; ann_seed_count p95=${round(profileOut.ann_seed_count.p95, 3)}; final_seed_count p95=${round(profileOut.final_seed_count.p95, 3)}; result_nodes mean=${round(profileOut.result_nodes.mean, 3)}; result_edges mean=${round(profileOut.result_edges.mean, 3)}`,
          );
        }
      }
      for (const [queryText, profiles] of Object.entries(ann.per_query_profiles ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
        annLines.push(`  - query=\`${queryText}\``);
        for (const [profile, profileOut] of Object.entries(profiles).sort((a, b) => a[0].localeCompare(b[0]))) {
          annLines.push(
            `    - ${profile}: recall p95=${round(profileOut.recall_latency_ms.p95)} ms; stage1_ann p95=${round(profileOut.stage1_candidates_ann_ms.p95)} ms; ann_seed_count p95=${round(profileOut.ann_seed_count.p95, 3)}; final_seed_count p95=${round(profileOut.final_seed_count.p95, 3)}; result_nodes mean=${round(profileOut.result_nodes.mean, 3)}; result_edges mean=${round(profileOut.result_edges.mean, 3)}`,
          );
        }
      }
      if (ann.selector_compare?.enabled) {
        annLines.push("  - selector_compare");
        for (const [mode, modeOut] of Object.entries(ann.selector_compare.overall_modes ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
          const selectedProfiles = Object.entries(modeOut.selected_profile_frequency ?? {})
            .sort((a, b) => b[1] - a[1])
            .map(([profile, count]) => `${profile}:${count}`)
            .join(", ");
          annLines.push(
            `    - ${mode}: recall p95=${round(modeOut.recall_latency_ms.p95)} ms; stage1_ann p95=${round(modeOut.stage1_candidates_ann_ms.p95)} ms; ann_seed_count p95=${round(modeOut.ann_seed_count.p95, 3)}; final_seed_count p95=${round(modeOut.final_seed_count.p95, 3)}; result_nodes mean=${round(modeOut.result_nodes.mean, 3)}; result_edges mean=${round(modeOut.result_edges.mean, 3)}; applied_ratio=${round(Number(modeOut.class_aware_applied_ratio ?? 0), 3)}; selected_profiles=${selectedProfiles || "none"}`,
          );
        }
        for (const [queryClass, modes] of Object.entries(ann.selector_compare.per_class_modes ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
          annLines.push(`    - selector_class=\`${queryClass}\``);
          for (const [mode, modeOut] of Object.entries(modes).sort((a, b) => a[0].localeCompare(b[0]))) {
            const selectedProfiles = Object.entries(modeOut.selected_profile_frequency ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([profile, count]) => `${profile}:${count}`)
              .join(", ");
            annLines.push(
              `      - ${mode}: recall p95=${round(modeOut.recall_latency_ms.p95)} ms; stage1_ann p95=${round(modeOut.stage1_candidates_ann_ms.p95)} ms; ann_seed_count p95=${round(modeOut.ann_seed_count.p95, 3)}; final_seed_count p95=${round(modeOut.final_seed_count.p95, 3)}; result_nodes mean=${round(modeOut.result_nodes.mean, 3)}; result_edges mean=${round(modeOut.result_edges.mean, 3)}; applied_ratio=${round(Number(modeOut.class_aware_applied_ratio ?? 0), 3)}; selected_profiles=${selectedProfiles || "none"}`,
            );
          }
        }
      }
    }
  }

  const explainLines: string[] = [];
  for (const scale of scales) {
    const times = explainByScale.get(scale) ?? [];
    if (times.length === 0) continue;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    explainLines.push(`- scale=${scale}: execution_time_ms min=${round(min)} avg=${round(avg)} max=${round(max)} samples=${times.length}`);
  }

  if (anyRecallIssue.v) {
    recommendationLines.push(`- Recall SLO profile:
\`\`\`bash
PERF_PROFILE=recall_slo SCALES=${scalesCsv} npm run perf:phase-d-matrix
\`\`\``);
  }
  if (anyWriteIssue.v) {
    recommendationLines.push(`- Write SLO profile:
\`\`\`bash
PERF_PROFILE=write_slo SCALES=${scalesCsv} npm run perf:phase-d-matrix
\`\`\``);
  }
  if (worker?.ok && worker.totals.processed === 0 && worker.totals.claimed === 0) {
    recommendationLines.push(`- Worker throughput profile (build backlog first):
\`\`\`bash
PERF_PROFILE=worker_slo SCALES=${scalesCsv} npm run perf:phase-d-matrix
\`\`\``);
  }
  if (anyWrite429Dominant.v) {
    recommendationLines.push("- Note: write failures are dominated by `429`; evaluate capacity with `write_slo`, or raise rate limits in dedicated perf env.");
  }
  if (anyRecall5xx.v) {
    recommendationLines.push("- Note: recall has `5xx`; run `recall_slo` and correlate request IDs with API logs before claiming SLO pass.");
  }

  const report = `# Performance Report v1

Generated at: \`${nowIso}\`  
Artifacts dir: \`${dir}\`

## Summary Table

${mdTable(rows)}

## Worker Baseline

${worker?.ok ? `- scope: \`${worker.scope}\`
- iterations: ${worker.iterations}
- processed: ${worker.totals.processed}
- claimed: ${worker.totals.claimed}
- throughput_processed_per_sec: ${round(worker.totals.throughput_processed_per_sec)}
- elapsed_ms_sum: ${round(worker.totals.elapsed_ms_sum)}` : "- worker_baseline.json not found"}

## Failure Attribution

${failureLines.length > 0 ? failureLines.join("\n") : "- no failures observed in benchmark artifacts"}

## Context Optimization Signals

${optimizationLines.length > 0 ? optimizationLines.join("\n") : "- no optimization check data found in benchmark artifacts"}

## Replay Optimization Signals

${replayLines.length > 0 ? replayLines.join("\n") : "- no replay optimization data found in benchmark artifacts"}

## Summary-First Sandbox Signals

${sandboxLines.length > 0 ? sandboxLines.join("\n") : "- no sandbox summary-first data found in benchmark artifacts"}

## ANN Stage1 Signals

${annLines.length > 0 ? annLines.join("\n") : "- no ANN-focused data found in benchmark artifacts"}

## Explain Baseline

${explainLines.length > 0 ? explainLines.join("\n") : explainFiles.length > 0 ? "- explain files found, but no `Execution Time` lines were parsed." : "- explain files not found"}

## SLO Targets

- Recall p95 < ${sloRecallP95Ms}ms
- Write p95 < ${sloWriteP95Ms}ms
- Error rate <= ${(sloMaxErrorRate * 100).toFixed(3)}%

## Notes

- This report is generated from benchmark artifacts in the specified directory.
- Re-run with:
\`\`\`bash
npm run job:perf-report -- --dir "${dir}" --output "${output}" --slo-recall-p95-ms "${sloRecallP95Ms}" --slo-write-p95-ms "${sloWriteP95Ms}" --slo-max-error-rate "${sloMaxErrorRate}"
\`\`\`

## Next Round Parameter Recommendations

${recommendationLines.length > 0 ? recommendationLines.join("\n\n") : "- current run already aligns with SLO targets; keep `balanced` profile for routine checks."}
`;

  await fs.writeFile(output, report, "utf-8");

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        dir,
        output,
        scales,
        files: {
          seed: seedFiles.length,
          benchmark: benchFiles.length,
          explain: explainFiles.length,
          worker: worker ? 1 : 0,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
