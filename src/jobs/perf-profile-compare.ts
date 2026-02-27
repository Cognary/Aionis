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

type CaseComparison = {
  case_name: string;
  baseline: {
    total: number;
    failed: number;
    fail_rate: number;
    p95_ms: number;
    p99_ms: number;
    rps: number;
  } | null;
  candidate: {
    total: number;
    failed: number;
    fail_rate: number;
    p95_ms: number;
    p99_ms: number;
    rps: number;
  } | null;
  delta: {
    fail_rate_abs: number;
    p95_ms: number;
    p95_pct: number;
    p99_ms: number;
    p99_pct: number;
    rps_abs: number;
    rps_pct: number;
  } | null;
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
  if (!Number.isFinite(n)) {
    throw new Error(`invalid ${flag}: expected number`);
  }
  return n;
}

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function pctDelta(base: number, candidate: number): number {
  if (!Number.isFinite(base) || base === 0) return candidate === 0 ? 0 : 100;
  return ((candidate - base) / base) * 100;
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

function failRate(v: PerfCase | null): number {
  if (!v || v.total <= 0) return 0;
  return v.failed / v.total;
}

function compareCase(baseline: PerfCase | null, candidate: PerfCase | null): CaseComparison {
  const baselineRate = failRate(baseline);
  const candidateRate = failRate(candidate);
  return {
    case_name: baseline?.name ?? candidate?.name ?? "unknown",
    baseline: baseline
      ? {
          total: baseline.total,
          failed: baseline.failed,
          fail_rate: round(baselineRate, 6),
          p95_ms: round(baseline.latency_ms.p95, 4),
          p99_ms: round(baseline.latency_ms.p99, 4),
          rps: round(baseline.rps, 4),
        }
      : null,
    candidate: candidate
      ? {
          total: candidate.total,
          failed: candidate.failed,
          fail_rate: round(candidateRate, 6),
          p95_ms: round(candidate.latency_ms.p95, 4),
          p99_ms: round(candidate.latency_ms.p99, 4),
          rps: round(candidate.rps, 4),
        }
      : null,
    delta:
      baseline && candidate
        ? {
            fail_rate_abs: round(candidateRate - baselineRate, 6),
            p95_ms: round(candidate.latency_ms.p95 - baseline.latency_ms.p95, 4),
            p95_pct: round(pctDelta(baseline.latency_ms.p95, candidate.latency_ms.p95), 4),
            p99_ms: round(candidate.latency_ms.p99 - baseline.latency_ms.p99, 4),
            p99_pct: round(pctDelta(baseline.latency_ms.p99, candidate.latency_ms.p99), 4),
            rps_abs: round(candidate.rps - baseline.rps, 4),
            rps_pct: round(pctDelta(baseline.rps, candidate.rps), 4),
          }
        : null,
  };
}

async function main() {
  const baselineArg = argValue("--baseline");
  const candidateArg = argValue("--candidate");
  if (!baselineArg || !candidateArg) {
    throw new Error("usage: npm run job:perf-profile-compare -- --baseline <file.json> --candidate <file.json> [--output <file.md>]");
  }

  const baselineLabel = argValue("--baseline-label") ?? "baseline";
  const candidateLabel = argValue("--candidate-label") ?? "candidate";
  const maxRecallP95RegressionPct = argNumber("--max-recall-p95-regression-pct", 15);
  const maxRecallP99RegressionPct = argOptionalNumber("--max-recall-p99-regression-pct");
  const maxRecallFailRateRegressionAbs = argNumber("--max-recall-fail-rate-regression-abs", 0.01);

  const baselineFile = path.resolve(baselineArg);
  const candidateFile = path.resolve(candidateArg);
  const outDir = path.dirname(candidateFile);
  const output = path.resolve(argValue("--output") ?? path.join(outDir, "PERF_PROFILE_COMPARE.md"));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(outDir, "PERF_PROFILE_COMPARE.json"));
  const nowIso = new Date().toISOString();

  const baseline = await readJson<BenchmarkJson>(baselineFile);
  const candidate = await readJson<BenchmarkJson>(candidateFile);
  if (!baseline.ok) throw new Error(`baseline benchmark not ok: ${baselineFile}`);
  if (!candidate.ok) throw new Error(`candidate benchmark not ok: ${candidateFile}`);

  const baselineCases = new Map((baseline.cases ?? []).map((c) => [c.name, c] as const));
  const candidateCases = new Map((candidate.cases ?? []).map((c) => [c.name, c] as const));
  const caseNames = Array.from(new Set([...baselineCases.keys(), ...candidateCases.keys()]));
  const comparisons = caseNames.map((name) => compareCase(baselineCases.get(name) ?? null, candidateCases.get(name) ?? null));

  const recallCmp = comparisons.find((c) => c.case_name === "recall_text") ?? null;
  const recallP95Pct = recallCmp?.delta?.p95_pct ?? 0;
  const recallP99Pct = recallCmp?.delta?.p99_pct ?? 0;
  const recallFailRateDelta = recallCmp?.delta?.fail_rate_abs ?? 0;
  const p99GateEnabled = maxRecallP99RegressionPct !== null;
  const p99GateThreshold = maxRecallP99RegressionPct ?? 0;
  const recallGatePass =
    !!recallCmp &&
    !!recallCmp.delta &&
    recallP95Pct <= maxRecallP95RegressionPct &&
    (!p99GateEnabled || recallP99Pct <= p99GateThreshold) &&
    recallFailRateDelta <= maxRecallFailRateRegressionAbs;

  const rows: string[][] = [
    ["Case", `${baselineLabel} p95`, `${candidateLabel} p95`, "Delta p95", "Delta p95%", "Delta fail-rate", "Delta RPS%"],
  ];
  for (const c of comparisons) {
    rows.push([
      c.case_name,
      c.baseline ? `${c.baseline.p95_ms} ms` : "-",
      c.candidate ? `${c.candidate.p95_ms} ms` : "-",
      c.delta ? `${c.delta.p95_ms} ms` : "-",
      c.delta ? `${c.delta.p95_pct}%` : "-",
      c.delta ? `${round(c.delta.fail_rate_abs * 100, 4)}%` : "-",
      c.delta ? `${c.delta.rps_pct}%` : "-",
    ]);
  }

  const report = `# Perf Profile Compare

Generated at: \`${nowIso}\`  
Baseline: \`${baselineLabel}\` (\`${baselineFile}\`)  
Candidate: \`${candidateLabel}\` (\`${candidateFile}\`)

## Summary

${mdTable(rows)}

## Recall Gate

- max p95 regression pct: ${maxRecallP95RegressionPct}%
- observed recall p95 regression pct: ${round(recallP95Pct, 4)}%
- max p99 regression pct: ${p99GateEnabled ? `${maxRecallP99RegressionPct}%` : "disabled"}
- observed recall p99 regression pct: ${round(recallP99Pct, 4)}%
- max fail-rate regression abs: ${(maxRecallFailRateRegressionAbs * 100).toFixed(4)}%
- observed recall fail-rate regression abs: ${round(recallFailRateDelta * 100, 4)}%
- verdict: ${recallGatePass ? "pass" : "fail"}
`;

  const outputPayload = {
    ok: recallGatePass,
    generated_at: nowIso,
    baseline: {
      label: baselineLabel,
      file: baselineFile,
      scope: baseline.scope,
      tenant_id: baseline.tenant_id,
      params: baseline.params,
    },
    candidate: {
      label: candidateLabel,
      file: candidateFile,
      scope: candidate.scope,
      tenant_id: candidate.tenant_id,
      params: candidate.params,
    },
    recall_gate: {
      max_p95_regression_pct: maxRecallP95RegressionPct,
      observed_p95_regression_pct: round(recallP95Pct, 4),
      p99_gate_enabled: p99GateEnabled,
      max_p99_regression_pct: p99GateEnabled ? round(p99GateThreshold, 4) : null,
      observed_p99_regression_pct: round(recallP99Pct, 4),
      max_fail_rate_regression_abs: round(maxRecallFailRateRegressionAbs, 6),
      observed_fail_rate_regression_abs: round(recallFailRateDelta, 6),
      pass: recallGatePass,
    },
    comparisons,
    output,
    output_json: outputJson,
  };

  await fs.writeFile(output, report, "utf-8");
  await fs.writeFile(outputJson, JSON.stringify(outputPayload, null, 2), "utf-8");

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(outputPayload, null, 2));
  if (!recallGatePass) process.exitCode = 2;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
