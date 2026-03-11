import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = path.join(ROOT, "src", "jobs", "perf-selector-rollout-gate.ts");

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-selector-gate-"));
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

test("selector rollout gate fails when default rollout evidence is not strong enough", async () => {
  await withTempDir(async (dir) => {
    const aggregatePath = path.join(dir, "aggregate.json");
    const outputJson = path.join(dir, "gate.json");
    await writeFile(
      aggregatePath,
      JSON.stringify(
        {
          ok: true,
          runs: ["/tmp/run1", "/tmp/run2", "/tmp/run3"],
          overall: {
            static: {
              recall_p95_ms: 500,
              stage1_ann_p95_ms: 200,
              result_nodes_mean: 60,
              result_edges_mean: 36,
              ann_seed_p95: 24,
              applied_ratio: 0,
            },
            class_aware: {
              recall_p95_ms: 560,
              stage1_ann_p95_ms: 330,
              result_nodes_mean: 65,
              result_edges_mean: 40,
              ann_seed_p95: 30,
              applied_ratio: 0.25,
            },
          },
          per_class: {
            dense_edge: {
              static: {
                recall_p95_ms: 440,
                stage1_ann_p95_ms: 190,
                result_nodes_mean: 60,
                result_edges_mean: 36,
                ann_seed_p95: 24,
                applied_ratio: 0,
              },
              class_aware: {
                recall_p95_ms: 620,
                stage1_ann_p95_ms: 340,
                result_nodes_mean: 80,
                result_edges_mean: 50,
                ann_seed_p95: 30,
                applied_ratio: 1,
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const run = runGate(["--aggregate-json", aggregatePath, "--output-json", outputJson]);
    assert.equal(run.status, 2, run.stderr || run.stdout);

    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, false);
    assert.deepEqual(out.gates.active_class_failures, ["dense_edge"]);
    assert.match(out.recommendations.join("\n"), /recall_mode="dense_edge"/);
  });
});

test("selector rollout gate passes when repeated-run evidence satisfies thresholds", async () => {
  await withTempDir(async (dir) => {
    const aggregatePath = path.join(dir, "aggregate.json");
    const outputJson = path.join(dir, "gate.json");
    await writeFile(
      aggregatePath,
      JSON.stringify(
        {
          ok: true,
          runs: ["/tmp/run1", "/tmp/run2", "/tmp/run3"],
          overall: {
            static: {
              recall_p95_ms: 500,
              stage1_ann_p95_ms: 200,
              result_nodes_mean: 60,
              result_edges_mean: 36,
              ann_seed_p95: 24,
              applied_ratio: 0,
            },
            class_aware: {
              recall_p95_ms: 515,
              stage1_ann_p95_ms: 220,
              result_nodes_mean: 60,
              result_edges_mean: 36,
              ann_seed_p95: 24,
              applied_ratio: 0,
            },
          },
          per_class: {
            broad_semantic: {
              static: {
                recall_p95_ms: 520,
                stage1_ann_p95_ms: 210,
                result_nodes_mean: 60,
                result_edges_mean: 36,
                ann_seed_p95: 24,
                applied_ratio: 0,
              },
              class_aware: {
                recall_p95_ms: 515,
                stage1_ann_p95_ms: 205,
                result_nodes_mean: 60,
                result_edges_mean: 36,
                ann_seed_p95: 24,
                applied_ratio: 0,
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const run = runGate(["--aggregate-json", aggregatePath, "--output-json", outputJson]);
    assert.equal(run.status, 0, run.stderr || run.stdout);

    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, true);
    assert.equal(out.gates.overall_latency_gate_pass, true);
    assert.deepEqual(out.gates.active_class_failures, []);
  });
});
