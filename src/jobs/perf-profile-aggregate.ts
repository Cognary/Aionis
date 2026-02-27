import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

type CompareRunJson = {
  ok: boolean;
  generated_at?: string;
  baseline?: { label?: string } | null;
  candidate?: { label?: string } | null;
  recall_gate?: {
    observed_p95_regression_pct?: number;
    observed_p99_regression_pct?: number;
    observed_fail_rate_regression_abs?: number;
    pass?: boolean;
  } | null;
  comparisons?: Array<{
    case_name?: string;
    baseline?: { p95_ms?: number; p99_ms?: number; fail_rate?: number; rps?: number } | null;
    candidate?: { p95_ms?: number; p99_ms?: number; fail_rate?: number; rps?: number } | null;
    delta?: {
      p95_pct?: number;
      p99_pct?: number;
      fail_rate_abs?: number;
      rps_pct?: number;
    } | null;
  }>;
};

type RunSummary = {
  file: string;
  ok: boolean;
  observed_p95_regression_pct: number;
  observed_p99_regression_pct: number;
  observed_fail_rate_regression_abs: number;
  pass: boolean;
  baseline_p95_ms: number;
  candidate_p95_ms: number;
  baseline_p99_ms: number;
  candidate_p99_ms: number;
  baseline_rps: number;
  candidate_rps: number;
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

function argOptionalNumber(flag: string): number | null {
  const raw = argValue(flag);
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as T;
}

async function main() {
  const dirArg = argValue("--dir");
  if (!dirArg) {
    throw new Error("usage: npm run job:perf-profile-aggregate -- --dir <artifacts_dir> [--output <file.md>]");
  }
  const dir = path.resolve(dirArg);
  const baselineLabel = argValue("--baseline-label") ?? "strict_edges";
  const candidateLabel = argValue("--candidate-label") ?? "lite";
  const maxRecallP95RegressionPct = argNumber("--max-recall-p95-regression-pct", 15);
  const maxRecallP99RegressionPct = argOptionalNumber("--max-recall-p99-regression-pct");
  const maxRecallFailRateRegressionAbs = argNumber("--max-recall-fail-rate-regression-abs", 0.01);
  const output = path.resolve(argValue("--output") ?? path.join(dir, "LITE_VS_STRICT_COMPARE.md"));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(dir, "LITE_VS_STRICT_COMPARE.json"));
  const patternRaw = argValue("--pattern") ?? "^LITE_VS_STRICT_COMPARE_run\\d+\\.json$";
  const pattern = new RegExp(patternRaw);
  const nowIso = new Date().toISOString();

  const files = (await fs.readdir(dir))
    .filter((f) => pattern.test(f))
    .sort((a, b) => {
      const ai = Number(a.match(/(\d+)/)?.[1] ?? "0");
      const bi = Number(b.match(/(\d+)/)?.[1] ?? "0");
      return ai - bi;
    });
  if (files.length === 0) {
    throw new Error(`no compare run files matched pattern=${patternRaw} in dir=${dir}`);
  }

  const summaries: RunSummary[] = [];
  for (const f of files) {
    const run = await readJson<CompareRunJson>(path.join(dir, f));
    const recallCmp = (run.comparisons ?? []).find((c) => c.case_name === "recall_text") ?? null;
    const p95 = Number(run.recall_gate?.observed_p95_regression_pct ?? recallCmp?.delta?.p95_pct ?? 0);
    const p99 = Number(run.recall_gate?.observed_p99_regression_pct ?? recallCmp?.delta?.p99_pct ?? 0);
    const failRate = Number(run.recall_gate?.observed_fail_rate_regression_abs ?? recallCmp?.delta?.fail_rate_abs ?? 0);
    summaries.push({
      file: f,
      ok: run.ok === true,
      observed_p95_regression_pct: p95,
      observed_p99_regression_pct: p99,
      observed_fail_rate_regression_abs: failRate,
      pass: run.recall_gate?.pass === true,
      baseline_p95_ms: Number(recallCmp?.baseline?.p95_ms ?? 0),
      candidate_p95_ms: Number(recallCmp?.candidate?.p95_ms ?? 0),
      baseline_p99_ms: Number(recallCmp?.baseline?.p99_ms ?? 0),
      candidate_p99_ms: Number(recallCmp?.candidate?.p99_ms ?? 0),
      baseline_rps: Number(recallCmp?.baseline?.rps ?? 0),
      candidate_rps: Number(recallCmp?.candidate?.rps ?? 0),
    });
  }

  const medP95 = median(summaries.map((r) => r.observed_p95_regression_pct));
  const medP99 = median(summaries.map((r) => r.observed_p99_regression_pct));
  const medFailRate = median(summaries.map((r) => r.observed_fail_rate_regression_abs));
  const medBaselineP95 = median(summaries.map((r) => r.baseline_p95_ms));
  const medCandidateP95 = median(summaries.map((r) => r.candidate_p95_ms));
  const medBaselineP99 = median(summaries.map((r) => r.baseline_p99_ms));
  const medCandidateP99 = median(summaries.map((r) => r.candidate_p99_ms));
  const medBaselineRps = median(summaries.map((r) => r.baseline_rps));
  const medCandidateRps = median(summaries.map((r) => r.candidate_rps));

  const p99GateEnabled = maxRecallP99RegressionPct !== null;
  const p99GateThreshold = maxRecallP99RegressionPct ?? 0;
  const aggregatePass =
    medP95 <= maxRecallP95RegressionPct &&
    (!p99GateEnabled || medP99 <= p99GateThreshold) &&
    medFailRate <= maxRecallFailRateRegressionAbs;
  const passingRuns = summaries.filter((r) => r.pass).length;

  const runRows: string[][] = [
    ["Run", "pass", "delta p95%", "delta p99%", "delta fail-rate", "baseline p95", "candidate p95"],
  ];
  summaries.forEach((r, idx) => {
    runRows.push([
      `#${idx + 1}`,
      r.pass ? "pass" : "fail",
      `${round(r.observed_p95_regression_pct)}%`,
      `${round(r.observed_p99_regression_pct)}%`,
      `${round(r.observed_fail_rate_regression_abs * 100)}%`,
      `${round(r.baseline_p95_ms)} ms`,
      `${round(r.candidate_p95_ms)} ms`,
    ]);
  });

  const report = `# Perf Profile Compare (Aggregated)

Generated at: \`${nowIso}\`  
Baseline: \`${baselineLabel}\`  
Candidate: \`${candidateLabel}\`  
Runs: ${summaries.length}

## Per-Run Summary

${mdTable(runRows)}

## Median Gate

- max p95 regression pct: ${maxRecallP95RegressionPct}%
- observed median p95 regression pct: ${round(medP95)}%
- max p99 regression pct: ${p99GateEnabled ? `${p99GateThreshold}%` : "disabled"}
- observed median p99 regression pct: ${round(medP99)}%
- max fail-rate regression abs: ${(maxRecallFailRateRegressionAbs * 100).toFixed(4)}%
- observed median fail-rate regression abs: ${round(medFailRate * 100)}%
- passing runs: ${passingRuns}/${summaries.length}
- verdict: ${aggregatePass ? "pass" : "fail"}
`;

  const out = {
    ok: aggregatePass,
    generated_at: nowIso,
    baseline: { label: baselineLabel, file: dir, scope: null, tenant_id: null, params: null },
    candidate: { label: candidateLabel, file: dir, scope: null, tenant_id: null, params: null },
    recall_gate: {
      max_p95_regression_pct: maxRecallP95RegressionPct,
      observed_p95_regression_pct: round(medP95, 4),
      p99_gate_enabled: p99GateEnabled,
      max_p99_regression_pct: p99GateEnabled ? round(p99GateThreshold, 4) : null,
      observed_p99_regression_pct: round(medP99, 4),
      max_fail_rate_regression_abs: round(maxRecallFailRateRegressionAbs, 6),
      observed_fail_rate_regression_abs: round(medFailRate, 6),
      pass: aggregatePass,
    },
    aggregation: {
      sample_count: summaries.length,
      passing_runs: passingRuns,
      failing_runs: summaries.length - passingRuns,
      median: {
        baseline_p95_ms: round(medBaselineP95, 4),
        candidate_p95_ms: round(medCandidateP95, 4),
        baseline_p99_ms: round(medBaselineP99, 4),
        candidate_p99_ms: round(medCandidateP99, 4),
        baseline_rps: round(medBaselineRps, 4),
        candidate_rps: round(medCandidateRps, 4),
      },
      runs: summaries,
    },
    comparisons: [
      {
        case_name: "recall_text",
        baseline: {
          total: 0,
          failed: 0,
          fail_rate: 0,
          p95_ms: round(medBaselineP95, 4),
          p99_ms: round(medBaselineP99, 4),
          rps: round(medBaselineRps, 4),
        },
        candidate: {
          total: 0,
          failed: 0,
          fail_rate: 0,
          p95_ms: round(medCandidateP95, 4),
          p99_ms: round(medCandidateP99, 4),
          rps: round(medCandidateRps, 4),
        },
        delta: {
          fail_rate_abs: round(medFailRate, 6),
          p95_ms: round(medCandidateP95 - medBaselineP95, 4),
          p95_pct: round(medP95, 4),
          p99_ms: round(medCandidateP99 - medBaselineP99, 4),
          p99_pct: round(medP99, 4),
          rps_abs: round(medCandidateRps - medBaselineRps, 4),
          rps_pct: round(medBaselineRps === 0 ? 0 : ((medCandidateRps - medBaselineRps) / medBaselineRps) * 100, 4),
        },
      },
    ],
    output,
    output_json: outputJson,
  };

  await fs.writeFile(output, report, "utf-8");
  await fs.writeFile(outputJson, JSON.stringify(out, null, 2), "utf-8");

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
  if (!aggregatePass) process.exitCode = 2;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

