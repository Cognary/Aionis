import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

type SelectorMode = "static" | "class_aware";

type SelectorAggregate = {
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
};

type SelectorCompareJson = {
  ok: boolean;
  ann?: {
    selector_compare?: {
      enabled: boolean;
      overall_modes?: Record<string, SelectorAggregate>;
      per_class_modes?: Record<string, Record<string, SelectorAggregate>>;
    } | null;
  } | null;
};

type MetricSeries = {
  recall_p95_ms: number[];
  stage1_ann_p95_ms: number[];
  result_nodes_mean: number[];
  result_edges_mean: number[];
  ann_seed_p95: number[];
  applied_ratio: number[];
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
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

function pushAggregate(series: MetricSeries, aggregate: SelectorAggregate | undefined) {
  if (!aggregate) return;
  series.recall_p95_ms.push(Number(aggregate.recall_latency_ms?.p95 ?? 0));
  series.stage1_ann_p95_ms.push(Number(aggregate.stage1_candidates_ann_ms?.p95 ?? 0));
  series.result_nodes_mean.push(Number(aggregate.result_nodes?.mean ?? 0));
  series.result_edges_mean.push(Number(aggregate.result_edges?.mean ?? 0));
  series.ann_seed_p95.push(Number(aggregate.ann_seed_count?.p95 ?? 0));
  series.applied_ratio.push(Number(aggregate.class_aware_applied_ratio ?? 0));
}

function emptySeries(): MetricSeries {
  return {
    recall_p95_ms: [],
    stage1_ann_p95_ms: [],
    result_nodes_mean: [],
    result_edges_mean: [],
    ann_seed_p95: [],
    applied_ratio: [],
  };
}

async function main() {
  const dirsRaw = argValue("--dirs-json");
  if (!dirsRaw) {
    throw new Error("usage: npm run job:perf-selector-aggregate -- --dirs-json '[\"/path/run1\",\"/path/run2\"]' [--output <file.md>]");
  }
  const dirsParsed = JSON.parse(dirsRaw) as unknown;
  if (!Array.isArray(dirsParsed) || dirsParsed.some((v) => typeof v !== "string")) {
    throw new Error("--dirs-json must be a JSON array of directory paths");
  }
  const dirs = dirsParsed.map((v) => path.resolve(String(v)));
  if (dirs.length === 0) throw new Error("--dirs-json must contain at least one directory");

  const output = path.resolve(argValue("--output") ?? path.join(dirs[0], "..", "SELECTOR_COMPARE_AGGREGATE.md"));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(dirs[0], "..", "SELECTOR_COMPARE_AGGREGATE.json"));
  const nowIso = new Date().toISOString();

  const overallSeries: Record<SelectorMode, MetricSeries> = {
    static: emptySeries(),
    class_aware: emptySeries(),
  };
  const perClassSeries: Record<string, Record<SelectorMode, MetricSeries>> = {};
  const runRows: string[][] = [["Run", "static recall p95", "class-aware recall p95", "static ann p95", "class-aware ann p95"]];

  for (const dir of dirs) {
    const benchmarkFile = path.join(dir, "benchmark_1.json");
    const json = await readJson<SelectorCompareJson>(benchmarkFile);
    const selector = json.ann?.selector_compare;
    if (!selector?.enabled) {
      throw new Error(`selector_compare missing in ${benchmarkFile}`);
    }
    const overallStatic = selector.overall_modes?.static;
    const overallClassAware = selector.overall_modes?.class_aware;
    pushAggregate(overallSeries.static, overallStatic);
    pushAggregate(overallSeries.class_aware, overallClassAware);
    runRows.push([
      path.basename(dir),
      `${round(Number(overallStatic?.recall_latency_ms?.p95 ?? 0))} ms`,
      `${round(Number(overallClassAware?.recall_latency_ms?.p95 ?? 0))} ms`,
      `${round(Number(overallStatic?.stage1_candidates_ann_ms?.p95 ?? 0))} ms`,
      `${round(Number(overallClassAware?.stage1_candidates_ann_ms?.p95 ?? 0))} ms`,
    ]);

    for (const [queryClass, modes] of Object.entries(selector.per_class_modes ?? {})) {
      const classSeries = (perClassSeries[queryClass] ??= {
        static: emptySeries(),
        class_aware: emptySeries(),
      });
      pushAggregate(classSeries.static, modes.static);
      pushAggregate(classSeries.class_aware, modes.class_aware);
    }
  }

  const summarizeSeries = (series: MetricSeries) => ({
    recall_p95_ms: round(median(series.recall_p95_ms)),
    stage1_ann_p95_ms: round(median(series.stage1_ann_p95_ms)),
    result_nodes_mean: round(median(series.result_nodes_mean)),
    result_edges_mean: round(median(series.result_edges_mean)),
    ann_seed_p95: round(median(series.ann_seed_p95)),
    applied_ratio: round(median(series.applied_ratio), 6),
  });

  const overall = {
    static: summarizeSeries(overallSeries.static),
    class_aware: summarizeSeries(overallSeries.class_aware),
  };

  const classRows: string[][] = [[
    "Class",
    "Static recall p95",
    "Class-aware recall p95",
    "Delta recall p95",
    "Static ann p95",
    "Class-aware ann p95",
    "Delta ann p95",
    "Static nodes",
    "Class-aware nodes",
  ]];

  const perClass = Object.fromEntries(
    Object.entries(perClassSeries)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([queryClass, modes]) => {
        const staticSummary = summarizeSeries(modes.static);
        const classAwareSummary = summarizeSeries(modes.class_aware);
        classRows.push([
          queryClass,
          `${staticSummary.recall_p95_ms} ms`,
          `${classAwareSummary.recall_p95_ms} ms`,
          `${round(classAwareSummary.recall_p95_ms - staticSummary.recall_p95_ms)} ms`,
          `${staticSummary.stage1_ann_p95_ms} ms`,
          `${classAwareSummary.stage1_ann_p95_ms} ms`,
          `${round(classAwareSummary.stage1_ann_p95_ms - staticSummary.stage1_ann_p95_ms)} ms`,
          `${staticSummary.result_nodes_mean}`,
          `${classAwareSummary.result_nodes_mean}`,
        ]);
        return [
          queryClass,
          {
            static: staticSummary,
            class_aware: classAwareSummary,
          },
        ];
      }),
  );

  const report = `# Selector Compare Aggregate

Generated at: \`${nowIso}\`  
Runs: ${dirs.length}

## Run Set

${dirs.map((dir) => `- \`${dir}\``).join("\n")}

## Per-Run Snapshot

${mdTable(runRows)}

## Overall Median

- static recall p95: ${overall.static.recall_p95_ms} ms
- class-aware recall p95: ${overall.class_aware.recall_p95_ms} ms
- static stage1 ANN p95: ${overall.static.stage1_ann_p95_ms} ms
- class-aware stage1 ANN p95: ${overall.class_aware.stage1_ann_p95_ms} ms
- static result_nodes mean: ${overall.static.result_nodes_mean}
- class-aware result_nodes mean: ${overall.class_aware.result_nodes_mean}
- static result_edges mean: ${overall.static.result_edges_mean}
- class-aware result_edges mean: ${overall.class_aware.result_edges_mean}
- class-aware applied_ratio median: ${overall.class_aware.applied_ratio}

## Per-Class Median

${mdTable(classRows)}
`;

  const out = {
    ok: true,
    generated_at: nowIso,
    runs: dirs,
    overall,
    per_class: perClass,
    output,
    output_json: outputJson,
  };

  await fs.writeFile(output, report, "utf-8");
  await fs.writeFile(outputJson, JSON.stringify(out, null, 2), "utf-8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
