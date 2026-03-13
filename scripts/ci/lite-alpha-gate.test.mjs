import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = path.join(ROOT, "src", "jobs", "lite-alpha-gate.ts");

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-lite-alpha-gate-"));
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

function packageFixture({ includeStartLite = true } = {}) {
  return {
    scripts: {
      "test:contract": "npm run -s build && node dist/dev/contract-smoke.js",
      "test:layer:runtime-host": [
        "node --test",
        "scripts/ci/lite-startup-packaging.test.mjs",
        "scripts/ci/lite-edition-routes.test.mjs",
        "scripts/ci/handoff-routes.test.mjs",
        "scripts/ci/lite-write-routes.test.mjs",
        "scripts/ci/lite-recall-routes.test.mjs",
        "scripts/ci/lite-context-runtime-routes.test.mjs",
        "scripts/ci/lite-replay-routes.test.mjs",
        "scripts/ci/lite-session-routes.test.mjs",
        "scripts/ci/lite-pack-routes.test.mjs",
        "scripts/ci/lite-find-resolve-routes.test.mjs",
        "scripts/ci/lite-rules-routes.test.mjs",
        "scripts/ci/lite-tools-routes.test.mjs",
        "scripts/ci/lite-tools-run-routes.test.mjs",
        "scripts/ci/lite-tools-feedback-routes.test.mjs",
      ].join(" "),
      ...(includeStartLite ? { "start:lite": "node dist/index.js" } : {}),
    },
  };
}

function routeMatrixFixture() {
  return {
    kernel_required_routes: [
      "memory-write",
      "memory-handoff",
      "memory-recall",
      "memory-context-runtime",
      "memory-access-partial",
      "memory-replay-core",
      "memory-feedback-tools",
    ],
    optional_routes: ["memory-sandbox", "memory-replay-governed-partial"],
    server_only_route_groups: [
      { group: "admin_control", prefixes: ["/v1/admin/control"], reason: "server only" },
      { group: "automations", prefixes: ["/v1/automations"], reason: "server only" },
    ],
  };
}

test("lite alpha gate passes when required evidence and packaging are present", async () => {
  await withTempDir(async (dir) => {
    const packageJson = path.join(dir, "package.json");
    const routeMatrixJson = path.join(dir, "route-matrix.json");
    const compatTest = path.join(dir, "scripts", "ci", "lite-pack-compatibility.test.mjs");
    const outputJson = path.join(dir, "gate.json");

    await mkdir(path.dirname(compatTest), { recursive: true });
    await writeFile(packageJson, JSON.stringify(packageFixture(), null, 2), "utf8");
    await writeFile(routeMatrixJson, JSON.stringify(routeMatrixFixture(), null, 2), "utf8");
    await writeFile(compatTest, "test('compat', () => {});\n", "utf8");

    const run = runGate([
      "--package-json",
      packageJson,
      "--route-matrix-json",
      routeMatrixJson,
      "--output-json",
      outputJson,
    ]);

    assert.equal(run.status, 0, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, true);
    assert.deepEqual(out.failing_gates, []);
  });
});

test("lite alpha gate fails when cross-edition pack tests and start:lite are missing", async () => {
  await withTempDir(async (dir) => {
    const packageJson = path.join(dir, "package.json");
    const routeMatrixJson = path.join(dir, "route-matrix.json");
    const outputJson = path.join(dir, "gate.json");

    await writeFile(packageJson, JSON.stringify(packageFixture({ includeStartLite: false }), null, 2), "utf8");
    await writeFile(routeMatrixJson, JSON.stringify(routeMatrixFixture(), null, 2), "utf8");

    const run = runGate([
      "--package-json",
      packageJson,
      "--route-matrix-json",
      routeMatrixJson,
      "--output-json",
      outputJson,
    ]);

    assert.equal(run.status, 2, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, false);
    assert.ok(out.failing_gates.includes("pack_cross_edition_compatibility_present"));
    assert.ok(out.failing_gates.includes("lite_startup_packaging_present"));
  });
});
