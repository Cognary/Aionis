import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = path.join(ROOT, "src", "jobs", "perf-context-rollout-gate.ts");

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-context-gate-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runGate(args) {
  return spawnSync(TSX_BIN, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function benchmarkFixture({ queryText, requestMode = "inherit_default", tokenReduction = 0.28, latencyDelta = -20, endpointDefaultRatio = 1 }) {
  return {
    scope: "perf_cost_wave_a",
    tenant_id: "default",
    optimization: {
      enabled: true,
      total_pairs: 12,
      ok_pairs: 12,
      params: {
        profile: "aggressive",
        request_mode: requestMode,
        query_text: queryText,
      },
      summary: {
        estimated_token_reduction: { mean: tokenReduction },
        optimization_profile_applied_ratio: 1,
        optimization_profile_source_frequency: {
          endpoint_default: Math.round(12 * endpointDefaultRatio),
        },
        latency_ms: {
          delta_p95: latencyDelta,
        },
      },
    },
  };
}

test("context rollout gate passes when endpoint-default evidence is strong enough", async () => {
  await withTempDir(async (dir) => {
    const a = path.join(dir, "benchmark_a.json");
    const b = path.join(dir, "benchmark_b.json");
    const outputJson = path.join(dir, "gate.json");
    await writeFile(a, JSON.stringify(benchmarkFixture({ queryText: "prepare production deploy context" }), null, 2), "utf8");
    await writeFile(b, JSON.stringify(benchmarkFixture({ queryText: "dense edge relationship recall", latencyDelta: -37 }), null, 2), "utf8");

    const run = runGate([
      "--benchmark-files-json",
      JSON.stringify([a, b]),
      "--output-json",
      outputJson,
    ]);
    assert.equal(run.status, 0, run.stderr || run.stdout);

    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, true);
    assert.equal(out.gates.sample_gate_pass, true);
    assert.deepEqual(out.gates.failing_artifacts, []);
  });
});

test("context rollout gate fails when request mode or source ratio is wrong", async () => {
  await withTempDir(async (dir) => {
    const a = path.join(dir, "benchmark_a.json");
    const b = path.join(dir, "benchmark_b.json");
    const outputJson = path.join(dir, "gate.json");
    await writeFile(a, JSON.stringify(benchmarkFixture({ queryText: "prepare production deploy context", requestMode: "explicit" }), null, 2), "utf8");
    await writeFile(b, JSON.stringify(benchmarkFixture({ queryText: "dense edge relationship recall", endpointDefaultRatio: 0.5 }), null, 2), "utf8");

    const run = runGate([
      "--benchmark-files-json",
      JSON.stringify([a, b]),
      "--output-json",
      outputJson,
    ]);
    assert.equal(run.status, 2, run.stderr || run.stdout);

    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, false);
    assert.equal(out.gates.sample_gate_pass, true);
    assert.equal(out.gates.failing_artifacts.length, 2);
  });
});
