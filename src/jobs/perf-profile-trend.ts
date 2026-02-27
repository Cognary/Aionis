import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

type TrendInput = {
  ok?: boolean;
  generated_at?: string;
  baseline?: { label?: string } | null;
  candidate?: { label?: string } | null;
  recall_gate?: {
    observed_p95_regression_pct?: number;
    observed_p99_regression_pct?: number;
    observed_fail_rate_regression_abs?: number;
    pass?: boolean;
  } | null;
  aggregation?: {
    sample_count?: number;
  } | null;
};

type TrendRow = {
  file: string;
  generated_at: string;
  pass: boolean;
  observed_p95_regression_pct: number;
  observed_p99_regression_pct: number | null;
  observed_fail_rate_regression_abs: number;
  sample_count: number;
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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function min(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.min(...values);
}

function max(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values);
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as T;
}

function isoNow(): string {
  return new Date().toISOString();
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

async function main() {
  const dirArg = argValue("--dir");
  if (!dirArg) {
    throw new Error("usage: npm run job:perf-profile-trend -- --dir <artifacts_dir> [--window-days <n>]");
  }
  const dir = path.resolve(dirArg);
  const windowDays = Math.max(1, Math.min(365, Math.trunc(argNumber("--window-days", 7))));
  const output = path.resolve(argValue("--output") ?? path.join(dir, `LITE_VS_STRICT_TREND_${windowDays}D.md`));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(dir, `LITE_VS_STRICT_TREND_${windowDays}D.json`));
  const patternRaw = argValue("--pattern") ?? "^LITE_VS_STRICT_COMPARE_run\\d+\\.json$";
  const pattern = new RegExp(patternRaw);

  const files = (await fs.readdir(dir)).filter((f) => pattern.test(f)).sort();
  if (files.length === 0) {
    throw new Error(`no compare artifacts found in ${dir} with pattern=${patternRaw}`);
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const rows: TrendRow[] = [];
  let baselineLabel = "strict_edges";
  let candidateLabel = "lite";

  for (const file of files) {
    const full = path.join(dir, file);
    const v = await readJson<TrendInput>(full);
    if (v.baseline?.label) baselineLabel = v.baseline.label;
    if (v.candidate?.label) candidateLabel = v.candidate.label;
    const stat = await fs.stat(full);
    const generatedAt = v.generated_at ?? stat.mtime.toISOString();
    const generatedMs = Date.parse(generatedAt);
    if (!Number.isFinite(generatedMs)) continue;
    if (generatedMs < windowStart.getTime()) continue;

    const p95 = v.recall_gate?.observed_p95_regression_pct;
    const p99 = v.recall_gate?.observed_p99_regression_pct;
    const failRate = v.recall_gate?.observed_fail_rate_regression_abs;

    if (!isFiniteNumber(p95) || !isFiniteNumber(failRate)) continue;
    rows.push({
      file,
      generated_at: new Date(generatedMs).toISOString(),
      pass: v.recall_gate?.pass === true,
      observed_p95_regression_pct: p95,
      observed_p99_regression_pct: isFiniteNumber(p99) ? p99 : null,
      observed_fail_rate_regression_abs: failRate,
      sample_count: Math.max(1, Math.trunc(Number(v.aggregation?.sample_count ?? 1))),
    });
  }

  rows.sort((a, b) => Date.parse(a.generated_at) - Date.parse(b.generated_at));
  if (rows.length === 0) {
    throw new Error(`no compare artifacts in ${dir} fell into last ${windowDays} days`);
  }

  const p95Series = rows.map((r) => r.observed_p95_regression_pct);
  const p99Series = rows.map((r) => r.observed_p99_regression_pct).filter((x): x is number => x !== null);
  const failSeries = rows.map((r) => r.observed_fail_rate_regression_abs);
  const passRuns = rows.filter((r) => r.pass).length;
  const passRate = rows.length > 0 ? passRuns / rows.length : 0;
  const latest = rows[rows.length - 1];

  const recentRows = rows.slice(-10);
  const recentTable: string[][] = [
    ["Generated At", "Pass", "P95 Δ%", "P99 Δ%", "Fail-rate Δ", "Samples", "File"],
  ];
  for (const r of recentRows) {
    recentTable.push([
      r.generated_at,
      r.pass ? "pass" : "fail",
      `${round(r.observed_p95_regression_pct)}%`,
      r.observed_p99_regression_pct === null ? "-" : `${round(r.observed_p99_regression_pct)}%`,
      `${round(r.observed_fail_rate_regression_abs * 100)}%`,
      String(r.sample_count),
      r.file,
    ]);
  }

  const medP95 = median(p95Series);
  const medP99 = median(p99Series);
  const medFail = median(failSeries);
  const report = `# Lite vs Strict Trend (${windowDays}d)

Generated at: \`${isoNow()}\`  
Window: \`${windowStart.toISOString()}\` ~ \`${now.toISOString()}\`  
Baseline: \`${baselineLabel}\`  
Candidate: \`${candidateLabel}\`

## Aggregate

- runs in window: ${rows.length}
- pass runs: ${passRuns}
- pass rate: ${(passRate * 100).toFixed(2)}%
- p95 regression pct: median=${medP95 === null ? "-" : `${round(medP95)}%`} min=${min(p95Series) === null ? "-" : `${round(min(p95Series) as number)}%`} max=${max(p95Series) === null ? "-" : `${round(max(p95Series) as number)}%`}
- p99 regression pct: median=${medP99 === null ? "-" : `${round(medP99)}%`} min=${min(p99Series) === null ? "-" : `${round(min(p99Series) as number)}%`} max=${max(p99Series) === null ? "-" : `${round(max(p99Series) as number)}%`}
- fail-rate regression abs: median=${medFail === null ? "-" : `${round(medFail * 100)}%`} max=${max(failSeries) === null ? "-" : `${round((max(failSeries) as number) * 100)}%`}

## Latest Run

- generated_at: \`${latest.generated_at}\`
- pass: ${latest.pass}
- observed p95 regression pct: ${round(latest.observed_p95_regression_pct)}%
- observed p99 regression pct: ${latest.observed_p99_regression_pct === null ? "-" : `${round(latest.observed_p99_regression_pct)}%`}
- observed fail-rate regression abs: ${round(latest.observed_fail_rate_regression_abs * 100)}%

## Recent Runs (up to 10)

${mdTable(recentTable)}
`;

  const out = {
    ok: true,
    generated_at: isoNow(),
    window_days: windowDays,
    window_start: windowStart.toISOString(),
    window_end: now.toISOString(),
    labels: {
      baseline: baselineLabel,
      candidate: candidateLabel,
    },
    metrics: {
      runs: rows.length,
      pass_runs: passRuns,
      pass_rate: round(passRate, 6),
      p95_regression_pct: {
        median: medP95 === null ? null : round(medP95, 4),
        min: min(p95Series) === null ? null : round(min(p95Series) as number, 4),
        max: max(p95Series) === null ? null : round(max(p95Series) as number, 4),
      },
      p99_regression_pct: {
        count: p99Series.length,
        median: medP99 === null ? null : round(medP99, 4),
        min: min(p99Series) === null ? null : round(min(p99Series) as number, 4),
        max: max(p99Series) === null ? null : round(max(p99Series) as number, 4),
      },
      fail_rate_regression_abs: {
        median: medFail === null ? null : round(medFail, 6),
        max: max(failSeries) === null ? null : round(max(failSeries) as number, 6),
      },
    },
    latest_run: latest,
    runs: rows,
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

