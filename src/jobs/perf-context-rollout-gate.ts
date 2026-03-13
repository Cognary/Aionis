import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

type OptimizationSummary = {
  estimated_token_reduction?: { mean?: number };
  optimization_profile_applied_ratio?: number;
  optimization_profile_source_frequency?: Record<string, number>;
  selected_memory_layers_frequency?: Record<string, number>;
  selection_policy_frequency?: Record<string, number>;
  selection_policy_source_frequency?: Record<string, number>;
  requested_allowed_layers_frequency?: Record<string, number>;
  latency_ms?: { delta_p95?: number };
};

type OptimizationAggregate = {
  enabled?: boolean;
  total_pairs?: number;
  ok_pairs?: number;
  params?: {
    profile?: string;
    request_mode?: string;
    query_text?: string;
  };
  summary?: OptimizationSummary;
};

type BenchmarkJson = {
  scope?: string;
  tenant_id?: string;
  optimization?: OptimizationAggregate;
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
  if (!Number.isFinite(n)) throw new Error(`invalid ${flag}: expected number`);
  return n;
}

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const hdr = rows[0];
  const sep = hdr.map(() => "---");
  const body = rows.slice(1);
  return [hdr, sep, ...body].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

function parseJsonStringArrayArg(flag: string): string[] | null {
  const raw = argValue(flag);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`invalid ${flag}: expected JSON array of strings`);
  }
  return parsed.map((item) => String(item));
}

async function resolveBenchmarkFiles(): Promise<string[]> {
  const fileArgs = parseJsonStringArrayArg("--benchmark-files-json");
  if (fileArgs && fileArgs.length > 0) return fileArgs.map((file) => path.resolve(file));

  const dirs = parseJsonStringArrayArg("--dirs-json");
  if (!dirs || dirs.length === 0) {
    throw new Error(
      "usage: npm run job:perf-context-rollout-gate -- --benchmark-files-json '[\"/path/benchmark_1.json\"]' | --dirs-json '[\"/path/artifact_dir\"]'",
    );
  }

  const files: string[] = [];
  for (const dirRaw of dirs) {
    const dir = path.resolve(dirRaw);
    const entries = await fs.readdir(dir);
    for (const entry of entries.sort()) {
      if (entry.startsWith("benchmark_") && entry.endsWith(".json")) {
        files.push(path.join(dir, entry));
      }
    }
  }
  if (files.length === 0) {
    throw new Error("no benchmark_*.json files found in --dirs-json inputs");
  }
  return files;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function topFrequencyEntry(frequency: Record<string, number> | null | undefined): { key: string; count: number } | null {
  const entries = Object.entries(frequency ?? {}).filter(([, value]) => Number(value) > 0);
  if (entries.length === 0) return null;
  entries.sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]));
  return { key: entries[0][0], count: Number(entries[0][1]) };
}

function topFrequencyKeys(frequency: Record<string, number> | null | undefined, limit = 3): string[] {
  return Object.entries(frequency ?? {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

async function main() {
  const benchmarkFiles = await resolveBenchmarkFiles();
  const generatedAt = new Date().toISOString();
  const output = path.resolve(
    argValue("--output") ?? path.join(path.dirname(benchmarkFiles[0]), "CONTEXT_OPTIMIZATION_ROLLOUT_GATE.md"),
  );
  const outputJson = path.resolve(
    argValue("--output-json") ?? path.join(path.dirname(benchmarkFiles[0]), "CONTEXT_OPTIMIZATION_ROLLOUT_GATE.json"),
  );

  const minArtifacts = argNumber("--min-artifacts", 2);
  const minOkPairs = argNumber("--min-ok-pairs", 8);
  const minTokenReductionMean = argNumber("--min-token-reduction-mean", 0.2);
  const minAppliedRatio = argNumber("--min-applied-ratio", 0.95);
  const minEndpointDefaultRatio = argNumber("--min-endpoint-default-ratio", 0.95);
  const maxLatencyP95RegressionMs = argNumber("--max-latency-p95-regression-ms", 50);
  const requiredRequestMode = (argValue("--required-request-mode") ?? "inherit_default").trim();
  const requiredSelectionPolicy = (argValue("--required-selection-policy") ?? "").trim();
  const minSelectionPolicyRatio = argNumber("--min-selection-policy-ratio", 0);
  const maxRequestOverrideRatio = argNumber("--max-request-override-ratio", 1);

  const rows: string[][] = [[
    "Query",
    "Scope",
    "Ok Pairs",
    "Token Reduction Mean",
    "Applied Ratio",
    "Endpoint Default Ratio",
    "Selection Policy",
    "Policy Ratio",
    "Policy Source",
    "Request Override Ratio",
    "Requested Layers",
    "Top Layers",
    "Latency p95 Delta",
    "Verdict",
  ]];

  const artifacts = [];
  for (const file of benchmarkFiles) {
    const bench = await readJson<BenchmarkJson>(file);
    const optimization = bench.optimization;
    if (!optimization?.enabled) {
      throw new Error(`missing enabled optimization aggregate in ${file}`);
    }
    const totalPairs = Number(optimization.total_pairs ?? 0);
    const okPairs = Number(optimization.ok_pairs ?? 0);
    const requestMode = String(optimization.params?.request_mode ?? "");
    const queryText = String(optimization.params?.query_text ?? "");
    const tokenReductionMean = Number(optimization.summary?.estimated_token_reduction?.mean ?? 0);
    const appliedRatio = Number(optimization.summary?.optimization_profile_applied_ratio ?? 0);
    const sourceFrequency = optimization.summary?.optimization_profile_source_frequency ?? {};
    const selectedMemoryLayersFrequency = optimization.summary?.selected_memory_layers_frequency ?? {};
    const selectionPolicyFrequency = optimization.summary?.selection_policy_frequency ?? {};
    const selectionPolicySourceFrequency = optimization.summary?.selection_policy_source_frequency ?? {};
    const requestedAllowedLayersFrequency = optimization.summary?.requested_allowed_layers_frequency ?? {};
    const endpointDefaultCount = Number(sourceFrequency.endpoint_default ?? 0);
    const endpointDefaultRatio = totalPairs > 0 ? endpointDefaultCount / totalPairs : 0;
    const dominantSelectionPolicy = topFrequencyEntry(selectionPolicyFrequency);
    const dominantSelectionPolicySource = topFrequencyEntry(selectionPolicySourceFrequency);
    const selectionPolicyCount = requiredSelectionPolicy
      ? Number(selectionPolicyFrequency[requiredSelectionPolicy] ?? 0)
      : Number(dominantSelectionPolicy?.count ?? 0);
    const selectionPolicyRatio = okPairs > 0 ? selectionPolicyCount / okPairs : 0;
    const requestOverrideCount = Number(selectionPolicySourceFrequency.request_override ?? 0);
    const requestOverrideRatio = okPairs > 0 ? requestOverrideCount / okPairs : 0;
    const topRequestedAllowedLayers = topFrequencyKeys(requestedAllowedLayersFrequency, 3);
    const topLayers = topFrequencyKeys(selectedMemoryLayersFrequency, 3);
    const latencyDeltaP95 = Number(optimization.summary?.latency_ms?.delta_p95 ?? 0);

    const pass =
      requestMode === requiredRequestMode &&
      okPairs >= minOkPairs &&
      tokenReductionMean >= minTokenReductionMean &&
      appliedRatio >= minAppliedRatio &&
      endpointDefaultRatio >= minEndpointDefaultRatio &&
      selectionPolicyRatio >= minSelectionPolicyRatio &&
      requestOverrideRatio <= maxRequestOverrideRatio &&
      latencyDeltaP95 <= maxLatencyP95RegressionMs;

    rows.push([
      queryText || "(none)",
      String(bench.scope ?? ""),
      `${okPairs}/${totalPairs}`,
      `${round(tokenReductionMean * 100, 2)}%`,
      String(round(appliedRatio, 4)),
      String(round(endpointDefaultRatio, 4)),
      dominantSelectionPolicy?.key ?? "(none)",
      String(round(selectionPolicyRatio, 4)),
      dominantSelectionPolicySource?.key ?? "(none)",
      String(round(requestOverrideRatio, 4)),
      topRequestedAllowedLayers.length > 0 ? topRequestedAllowedLayers.join(", ") : "(none)",
      topLayers.length > 0 ? topLayers.join(", ") : "(none)",
      `${round(latencyDeltaP95, 3)} ms`,
      pass ? "pass" : "fail",
    ]);

    artifacts.push({
      file,
      scope: String(bench.scope ?? ""),
      query_text: queryText,
      request_mode: requestMode,
      ok_pairs: okPairs,
      total_pairs: totalPairs,
      token_reduction_mean: round(tokenReductionMean, 6),
      optimization_profile_applied_ratio: round(appliedRatio, 6),
      endpoint_default_ratio: round(endpointDefaultRatio, 6),
      dominant_selection_policy: dominantSelectionPolicy?.key ?? null,
      selection_policy_ratio: round(selectionPolicyRatio, 6),
      dominant_selection_policy_source: dominantSelectionPolicySource?.key ?? null,
      request_override_ratio: round(requestOverrideRatio, 6),
      requested_allowed_layers: topRequestedAllowedLayers,
      selection_policy_source_frequency: selectionPolicySourceFrequency,
      selected_memory_layers: topLayers,
      selected_memory_layers_frequency: selectedMemoryLayersFrequency,
      selection_policy_frequency: selectionPolicyFrequency,
      requested_allowed_layers_frequency: requestedAllowedLayersFrequency,
      latency_p95_delta_ms: round(latencyDeltaP95, 6),
      pass,
    });
  }

  const sampleGatePass = artifacts.length >= minArtifacts;
  const failingArtifacts = artifacts.filter((artifact) => !artifact.pass).map((artifact) => artifact.query_text || artifact.file);
  const overall = {
    artifact_count: artifacts.length,
    median_token_reduction_mean: round(median(artifacts.map((artifact) => artifact.token_reduction_mean)), 6),
    median_applied_ratio: round(median(artifacts.map((artifact) => artifact.optimization_profile_applied_ratio)), 6),
    median_endpoint_default_ratio: round(median(artifacts.map((artifact) => artifact.endpoint_default_ratio)), 6),
    median_selection_policy_ratio: round(median(artifacts.map((artifact) => artifact.selection_policy_ratio)), 6),
    median_request_override_ratio: round(median(artifacts.map((artifact) => artifact.request_override_ratio)), 6),
    median_latency_p95_delta_ms: round(median(artifacts.map((artifact) => artifact.latency_p95_delta_ms)), 6),
  };
  const verdict = sampleGatePass && failingArtifacts.length === 0;

  const recommendations: string[] = [];
  if (!sampleGatePass) {
    recommendations.push(`Need at least ${minArtifacts} benchmark artifacts before recommending endpoint-default rollout.`);
  }
  if (failingArtifacts.length > 0) {
    recommendations.push(`Do not recommend endpoint-default rollout while these artifacts fail gate: ${failingArtifacts.join(", ")}.`);
  }
  if (requiredSelectionPolicy && artifacts.some((artifact) => artifact.selection_policy_ratio < minSelectionPolicyRatio)) {
    recommendations.push(
      `Selection policy requirement not met consistently: require ${requiredSelectionPolicy} at ratio >= ${minSelectionPolicyRatio}.`,
    );
  }
  if (maxRequestOverrideRatio < 1 && artifacts.some((artifact) => artifact.request_override_ratio > maxRequestOverrideRatio)) {
    recommendations.push(
      `Request override ratio too high for endpoint-default rollout: require request_override ratio <= ${maxRequestOverrideRatio}.`,
    );
  }
  if (verdict) {
    recommendations.push(
      "Endpoint-default rollout is evidence-backed for the evaluated context endpoints and benchmarked query classes.",
    );
    recommendations.push(
      "Keep wider mode-level defaults out of scope until the same gate passes on an additional seeded workload.",
    );
  }

  const report = `# Context Optimization Rollout Gate

Generated at: \`${generatedAt}\`

## Thresholds

- min artifacts: ${minArtifacts}
- min ok pairs per artifact: ${minOkPairs}
- required request mode: ${requiredRequestMode}
- min token reduction mean: ${round(minTokenReductionMean * 100, 2)}%
- min applied ratio: ${minAppliedRatio}
- min endpoint_default ratio: ${minEndpointDefaultRatio}
- required selection policy: ${requiredSelectionPolicy || "(report-only)"}
- min selection policy ratio: ${minSelectionPolicyRatio}
- max request override ratio: ${maxRequestOverrideRatio}
- max latency p95 regression: ${maxLatencyP95RegressionMs} ms

## Artifact Gate

${mdTable(rows)}

## Overall Median

- artifact count: ${overall.artifact_count}
- median token reduction mean: ${round(overall.median_token_reduction_mean * 100, 2)}%
- median applied ratio: ${overall.median_applied_ratio}
- median endpoint_default ratio: ${overall.median_endpoint_default_ratio}
- median selection policy ratio: ${overall.median_selection_policy_ratio}
- median request override ratio: ${overall.median_request_override_ratio}
- median latency p95 delta: ${overall.median_latency_p95_delta_ms} ms

## Verdict

- sample gate: ${sampleGatePass ? "pass" : "fail"}
- failing artifacts: ${failingArtifacts.length === 0 ? "none" : failingArtifacts.join(", ")}
- final verdict: ${verdict ? "pass" : "fail"}

## Recommendations

${recommendations.map((line) => `- ${line}`).join("\n")}
`;

  const out = {
    ok: verdict,
    generated_at: generatedAt,
    benchmark_files: benchmarkFiles,
    output,
    output_json: outputJson,
    thresholds: {
      min_artifacts: minArtifacts,
      min_ok_pairs: minOkPairs,
      required_request_mode: requiredRequestMode,
      min_token_reduction_mean: minTokenReductionMean,
      min_applied_ratio: minAppliedRatio,
      min_endpoint_default_ratio: minEndpointDefaultRatio,
      required_selection_policy: requiredSelectionPolicy || null,
      min_selection_policy_ratio: minSelectionPolicyRatio,
      max_request_override_ratio: maxRequestOverrideRatio,
      max_latency_p95_regression_ms: maxLatencyP95RegressionMs,
    },
    gates: {
      sample_gate_pass: sampleGatePass,
      failing_artifacts: failingArtifacts,
      verdict,
    },
    overall,
    artifacts,
    recommendations,
  };

  await fs.writeFile(output, report, "utf8");
  await fs.writeFile(outputJson, JSON.stringify(out, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: verdict, output, output_json: outputJson, artifacts: benchmarkFiles.length }, null, 2));
  process.exit(verdict ? 0 : 2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
