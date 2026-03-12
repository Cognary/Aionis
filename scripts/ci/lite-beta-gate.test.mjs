import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = path.join(ROOT, "src", "jobs", "lite-beta-gate.ts");

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-lite-beta-gate-"));
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

function packageFixture() {
  return {
    scripts: {
      "start:lite": "bash scripts/start-lite.sh",
      "lite:dogfood": "bash scripts/lite-dogfood.sh",
      "job:lite-alpha-gate": "tsx src/jobs/lite-alpha-gate.ts",
    },
  };
}

function summaryFixture() {
  return {
    ok: true,
    health: {
      aionis_edition: "lite",
      memory_store_backend: "lite_sqlite",
    },
    write: {
      inline_backfill_completed: true,
    },
    replay: {
      status: "success",
    },
  };
}

test("lite beta gate passes when operator docs and repeated dogfood evidence are present", async () => {
  await withTempDir(async (dir) => {
    const packageJson = path.join(dir, "package.json");
    const artifactsLite = path.join(dir, "artifacts", "lite");
    const outputJson = path.join(dir, "gate.json");
    const operatorEn = path.join(dir, "docs/public/en/getting-started/04-lite-operator-notes.md");
    const operatorZh = path.join(dir, "docs/public/zh/getting-started/04-lite-operator-notes.md");
    const onboardingDocs = [
      path.join(dir, "docs/public/en/getting-started/01-get-started.md"),
      path.join(dir, "docs/public/en/getting-started/02-onboarding-5min.md"),
      path.join(dir, "docs/public/zh/getting-started/01-get-started.md"),
      path.join(dir, "docs/public/zh/getting-started/02-onboarding-5min.md"),
    ];

    await mkdir(path.dirname(operatorEn), { recursive: true });
    await mkdir(path.dirname(operatorZh), { recursive: true });
    await writeFile(packageJson, JSON.stringify(packageFixture(), null, 2), "utf8");
    await writeFile(operatorEn, "# Lite Operator Notes\n", "utf8");
    await writeFile(operatorZh, "# Lite 运维说明\n", "utf8");
    for (const file of onboardingDocs) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "see /public/en/getting-started/04-lite-operator-notes or /public/zh/getting-started/04-lite-operator-notes\n", "utf8");
    }

    for (const stamp of ["dogfood_1", "dogfood_2", "dogfood_3"]) {
      const dirPath = path.join(artifactsLite, stamp);
      await mkdir(dirPath, { recursive: true });
      await writeFile(path.join(dirPath, "summary.json"), JSON.stringify(summaryFixture(), null, 2), "utf8");
    }

    const run = runGate([
      "--root-dir",
      dir,
      "--package-json",
      packageJson,
      "--output-json",
      outputJson,
      "--min-successful-dogfood-runs",
      "3",
    ]);

    assert.equal(run.status, 0, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, true);
    assert.equal(out.successful_dogfood_runs, 3);
    assert.equal(out.stable_dogfood_runs, 3);
  });
});

test("lite beta gate fails when repeated dogfood evidence is below threshold", async () => {
  await withTempDir(async (dir) => {
    const packageJson = path.join(dir, "package.json");
    const artifactsLite = path.join(dir, "artifacts", "lite");
    const outputJson = path.join(dir, "gate.json");
    const operatorEn = path.join(dir, "docs/public/en/getting-started/04-lite-operator-notes.md");
    const operatorZh = path.join(dir, "docs/public/zh/getting-started/04-lite-operator-notes.md");
    const onboardingDocs = [
      path.join(dir, "docs/public/en/getting-started/01-get-started.md"),
      path.join(dir, "docs/public/en/getting-started/02-onboarding-5min.md"),
      path.join(dir, "docs/public/zh/getting-started/01-get-started.md"),
      path.join(dir, "docs/public/zh/getting-started/02-onboarding-5min.md"),
    ];

    await mkdir(path.dirname(operatorEn), { recursive: true });
    await mkdir(path.dirname(operatorZh), { recursive: true });
    await writeFile(packageJson, JSON.stringify(packageFixture(), null, 2), "utf8");
    await writeFile(operatorEn, "# Lite Operator Notes\n", "utf8");
    await writeFile(operatorZh, "# Lite 运维说明\n", "utf8");
    for (const file of onboardingDocs) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "04-lite-operator-notes\n", "utf8");
    }

    for (const stamp of ["dogfood_1", "dogfood_2"]) {
      const dirPath = path.join(artifactsLite, stamp);
      await mkdir(dirPath, { recursive: true });
      await writeFile(path.join(dirPath, "summary.json"), JSON.stringify(summaryFixture(), null, 2), "utf8");
    }

    const run = runGate([
      "--root-dir",
      dir,
      "--package-json",
      packageJson,
      "--output-json",
      outputJson,
      "--min-successful-dogfood-runs",
      "3",
    ]);

    assert.equal(run.status, 2, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, false);
    assert.ok(out.failing_gates.includes("repeated_successful_dogfood_present"));
    assert.ok(out.failing_gates.includes("repeated_stable_dogfood_present"));
  });
});
