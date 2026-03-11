import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

type SelectorAggregateSummary = {
  recall_p95_ms: number;
  stage1_ann_p95_ms: number;
  result_nodes_mean: number;
  result_edges_mean: number;
  ann_seed_p95: number;
  applied_ratio: number;
};

type SelectorAggregateJson = {
  ok: boolean;
  generated_at?: string;
  runs?: string[];
  overall?: {
    static?: SelectorAggregateSummary;
    class_aware?: SelectorAggregateSummary;
  };
  per_class?: Record<
    string,
    {
      static?: SelectorAggregateSummary;
      class_aware?: SelectorAggregateSummary;
    }
  >;
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
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as T;
}

function percentDelta(next: number, base: number): number {
  if (!Number.isFinite(base) || base === 0) return 0;
  return ((next - base) / base) * 100;
}

async function main() {
  const aggregateJsonPathRaw = argValue("--aggregate-json");
  if (!aggregateJsonPathRaw) {
    throw new Error(
      "usage: npm run job:perf-selector-rollout-gate -- --aggregate-json /path/to/SELECTOR_COMPARE_AGGREGATE.json [--output /path/report.md]",
    );
  }
  const aggregateJsonPath = path.resolve(aggregateJsonPathRaw);
  const aggregate = await readJson<SelectorAggregateJson>(aggregateJsonPath);
  const generatedAt = new Date().toISOString();
  const output = path.resolve(argValue("--output") ?? path.join(path.dirname(aggregateJsonPath), "SELECTOR_ROLLOUT_GATE.md"));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(path.dirname(aggregateJsonPath), "SELECTOR_ROLLOUT_GATE.json"));

  const minSamples = argNumber("--min-samples", 3);
  const minAppliedRatio = argNumber("--min-applied-ratio", 0.5);
  const maxOverallRecallP95RegressionMs = argNumber("--max-overall-recall-p95-regression-ms", 25);
  const maxOverallAnnP95RegressionMs = argNumber("--max-overall-ann-p95-regression-ms", 50);
  const maxClassRecallP95RegressionMs = argNumber("--max-class-recall-p95-regression-ms", 120);
  const maxClassAnnP95RegressionMs = argNumber("--max-class-ann-p95-regression-ms", 160);
  const minClassNodesGain = argNumber("--min-class-nodes-gain", 10);
  const minClassEdgesGain = argNumber("--min-class-edges-gain", 10);

  const sampleCount = Array.isArray(aggregate.runs) ? aggregate.runs.length : 0;
  const overallStatic = aggregate.overall?.static;
  const overallClassAware = aggregate.overall?.class_aware;
  if (!overallStatic || !overallClassAware) {
    throw new Error(`missing overall selector aggregate in ${aggregateJsonPath}`);
  }

  const overall = {
    recall_p95_delta_ms: round(overallClassAware.recall_p95_ms - overallStatic.recall_p95_ms),
    recall_p95_delta_pct: round(percentDelta(overallClassAware.recall_p95_ms, overallStatic.recall_p95_ms)),
    ann_p95_delta_ms: round(overallClassAware.stage1_ann_p95_ms - overallStatic.stage1_ann_p95_ms),
    ann_p95_delta_pct: round(percentDelta(overallClassAware.stage1_ann_p95_ms, overallStatic.stage1_ann_p95_ms)),
    result_nodes_delta: round(overallClassAware.result_nodes_mean - overallStatic.result_nodes_mean),
    result_edges_delta: round(overallClassAware.result_edges_mean - overallStatic.result_edges_mean),
    applied_ratio: round(overallClassAware.applied_ratio, 6),
  };

  const classRows: string[][] = [[
    "Class",
    "Applied Ratio",
    "Recall p95 Delta",
    "ANN p95 Delta",
    "Nodes Delta",
    "Edges Delta",
    "Active Gate",
    "Verdict",
  ]];

  const perClass = Object.fromEntries(
    Object.entries(aggregate.per_class ?? {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([queryClass, modes]) => {
        const staticSummary = modes.static;
        const classAwareSummary = modes.class_aware;
        if (!staticSummary || !classAwareSummary) {
          throw new Error(`missing per-class selector aggregate for ${queryClass}`);
        }
        const summary = {
          applied_ratio: round(classAwareSummary.applied_ratio, 6),
          recall_p95_delta_ms: round(classAwareSummary.recall_p95_ms - staticSummary.recall_p95_ms),
          ann_p95_delta_ms: round(classAwareSummary.stage1_ann_p95_ms - staticSummary.stage1_ann_p95_ms),
          result_nodes_delta: round(classAwareSummary.result_nodes_mean - staticSummary.result_nodes_mean),
          result_edges_delta: round(classAwareSummary.result_edges_mean - staticSummary.result_edges_mean),
        };
        const activeGate = summary.applied_ratio >= minAppliedRatio;
        const breadthGainOk =
          summary.result_nodes_delta >= minClassNodesGain || summary.result_edges_delta >= minClassEdgesGain;
        const latencyOk =
          summary.recall_p95_delta_ms <= maxClassRecallP95RegressionMs &&
          summary.ann_p95_delta_ms <= maxClassAnnP95RegressionMs;
        const pass = !activeGate || (breadthGainOk && latencyOk);
        classRows.push([
          queryClass,
          String(summary.applied_ratio),
          `${summary.recall_p95_delta_ms} ms`,
          `${summary.ann_p95_delta_ms} ms`,
          String(summary.result_nodes_delta),
          String(summary.result_edges_delta),
          activeGate ? "yes" : "no",
          pass ? "pass" : "fail",
        ]);
        return [
          queryClass,
          {
            ...summary,
            active_gate: activeGate,
            breadth_gain_ok: breadthGainOk,
            latency_ok: latencyOk,
            pass,
          },
        ];
      }),
  );

  const sampleGatePass = sampleCount >= minSamples;
  const overallGatePass =
    overall.recall_p95_delta_ms <= maxOverallRecallP95RegressionMs &&
    overall.ann_p95_delta_ms <= maxOverallAnnP95RegressionMs;
  const activeClassFailures = Object.entries(perClass)
    .filter(([, summary]) => summary.active_gate && !summary.pass)
    .map(([queryClass]) => queryClass);
  const verdict = sampleGatePass && overallGatePass && activeClassFailures.length === 0;

  const recommendations: string[] = [];
  if (!sampleGatePass) {
    recommendations.push(`Need at least ${minSamples} repeated runs before considering default rollout.`);
  }
  if (!overallGatePass) {
    recommendations.push("Keep automatic selector experimental; overall median latency regression is above rollout threshold.");
  }
  if (activeClassFailures.length > 0) {
    recommendations.push(
      `Do not default-enable selector while active classes fail gate: ${activeClassFailures.join(", ")}.`,
    );
  }
  const denseEdge = perClass["dense_edge"];
  if (denseEdge && denseEdge.active_gate && denseEdge.breadth_gain_ok && !verdict) {
    recommendations.push('Use explicit `recall_mode="dense_edge"` for broader graph recall instead of selector-by-default rollout.');
  }
  if (recommendations.length === 0) {
    recommendations.push("Selector evidence is currently strong enough for the configured rollout target.");
  }

  const report = `# Selector Rollout Gate

Generated at: \`${generatedAt}\`  
Aggregate: \`${aggregateJsonPath}\`  
Runs: ${sampleCount}

## Thresholds

- min samples: ${minSamples}
- max overall recall p95 regression: ${maxOverallRecallP95RegressionMs} ms
- max overall stage1 ANN p95 regression: ${maxOverallAnnP95RegressionMs} ms
- active class minimum applied ratio: ${minAppliedRatio}
- max active-class recall p95 regression: ${maxClassRecallP95RegressionMs} ms
- max active-class stage1 ANN p95 regression: ${maxClassAnnP95RegressionMs} ms
- min active-class nodes gain: ${minClassNodesGain}
- min active-class edges gain: ${minClassEdgesGain}

## Overall Median

- recall p95 delta: ${overall.recall_p95_delta_ms} ms (${overall.recall_p95_delta_pct}%)
- stage1 ANN p95 delta: ${overall.ann_p95_delta_ms} ms (${overall.ann_p95_delta_pct}%)
- result_nodes delta: ${overall.result_nodes_delta}
- result_edges delta: ${overall.result_edges_delta}
- class-aware applied ratio: ${overall.applied_ratio}

## Per-Class Gate

${mdTable(classRows)}

## Verdict

- sample gate: ${sampleGatePass ? "pass" : "fail"}
- overall latency gate: ${overallGatePass ? "pass" : "fail"}
- active class failures: ${activeClassFailures.length === 0 ? "none" : activeClassFailures.join(", ")}
- final verdict: ${verdict ? "pass" : "fail"}

## Recommendations

${recommendations.map((line) => `- ${line}`).join("\n")}
`;

  const out = {
    ok: verdict,
    generated_at: generatedAt,
    aggregate_json: aggregateJsonPath,
    output,
    output_json: outputJson,
    thresholds: {
      min_samples: minSamples,
      max_overall_recall_p95_regression_ms: maxOverallRecallP95RegressionMs,
      max_overall_ann_p95_regression_ms: maxOverallAnnP95RegressionMs,
      min_applied_ratio: minAppliedRatio,
      max_class_recall_p95_regression_ms: maxClassRecallP95RegressionMs,
      max_class_ann_p95_regression_ms: maxClassAnnP95RegressionMs,
      min_class_nodes_gain: minClassNodesGain,
      min_class_edges_gain: minClassEdgesGain,
    },
    gates: {
      sample_gate_pass: sampleGatePass,
      overall_latency_gate_pass: overallGatePass,
      active_class_failures: activeClassFailures,
      verdict,
    },
    overall,
    per_class: perClass,
    recommendations,
  };

  await fs.writeFile(output, report, "utf-8");
  await fs.writeFile(outputJson, JSON.stringify(out, null, 2), "utf-8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
  if (!verdict) process.exitCode = 2;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
