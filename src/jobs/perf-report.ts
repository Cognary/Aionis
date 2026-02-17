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
