import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

const FORBIDDEN_PATHS = [
  "src/.DS_Store",
  "src/bench/many-tools.ts",
  "src/dev/contract-smoke.ts",
  "src/eval/score.ts",
  "src/mcp/aionis-mcp.ts",
  "src/sdk/index.ts",
  "src/memory/automation.ts",
  "src/routes/admin-control-alerts.ts",
  "src/routes/admin-control-config.ts",
  "src/routes/admin-control-dashboard.ts",
  "src/routes/admin-control-entities.ts",
  "src/util/error-format.ts",
];

const ALLOWED_JOB_FILES = [
  "associative-linking-lib.ts",
  "topicClusterLib.ts",
];

test("lite repo excludes bench/dev/eval/mcp/sdk source entrypoints", () => {
  for (const rel of FORBIDDEN_PATHS) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), false, `${rel} should be absent in lite repo`);
  }
});

test("lite repo keeps only kernel-linked job helpers", () => {
  const jobsDir = path.join(ROOT, "src/jobs");
  const jobFiles = fs.readdirSync(jobsDir)
    .filter((name) => fs.statSync(path.join(jobsDir, name)).isFile())
    .sort();
  assert.deepEqual(jobFiles, ALLOWED_JOB_FILES);
  assert.equal(fs.existsSync(path.join(jobsDir, "fixtures")), false, "src/jobs/fixtures should be absent in lite repo");
});

test("lite repo does not keep a copied apps/lite dist launcher", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "apps", "lite", "dist")), false, "apps/lite/dist should be absent");
});

test("lite host does not statically import server-only routes", () => {
  const hostFile = fs.readFileSync(path.join(ROOT, "src/host/http-host.ts"), "utf8");
  const forbiddenImports = [
    "../routes/admin-control-alerts.js",
    "../routes/admin-control-config.js",
    "../routes/admin-control-dashboard.js",
    "../routes/admin-control-entities.js",
  ];
  for (const specifier of forbiddenImports) {
    assert.equal(hostFile.includes(specifier), false, `${specifier} should not be imported by lite http-host`);
  }
  assert.equal(hostFile.includes("../routes/automations.js"), true, "lite http-host should import the lite automations route");
  assert.match(hostFile, /assertLiteOnlySourceTree/);
});

test("lite route registration args drop server-only plumbing", () => {
  const hostFile = fs.readFileSync(path.join(ROOT, "src/host/http-host.ts"), "utf8");
  const runtimeEntry = fs.readFileSync(path.join(ROOT, "src/runtime-entry.ts"), "utf8");
  const forbiddenSymbols = [
    "buildAutomationTestHook",
    "emitControlAudit",
    "listSandboxBudgetProfiles",
    "getSandboxBudgetProfile",
    "upsertSandboxBudgetProfile",
    "deleteSandboxBudgetProfile",
    "listSandboxProjectBudgetProfiles",
    "getSandboxProjectBudgetProfile",
    "upsertSandboxProjectBudgetProfile",
    "deleteSandboxProjectBudgetProfile",
  ];
  for (const symbol of forbiddenSymbols) {
    assert.equal(hostFile.includes(symbol), false, `${symbol} should be absent from lite http-host route args`);
    assert.equal(runtimeEntry.includes(symbol), false, `${symbol} should not be passed through lite runtime-entry route wiring`);
  }
});

test("lite repo keeps local automation kernel sources and removes server-only lite automation blockers", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "src/routes/automations.ts")), true, "lite automations route should exist");
  const liteEdition = fs.readFileSync(path.join(ROOT, "src/host/lite-edition.ts"), "utf8");
  assert.equal(liteEdition.includes("automation orchestration remains server-only"), false);
  assert.match(liteEdition, /automations-lite-kernel/);
});
