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
  const sandboxBudgetFile = fs.readFileSync(path.join(ROOT, "src", "app", "sandbox-budget.ts"), "utf8");
  for (const symbol of forbiddenSymbols.slice(2)) {
    assert.equal(sandboxBudgetFile.includes(symbol), false, `${symbol} should be absent from lite sandbox-budget module`);
  }
  assert.match(sandboxBudgetFile, /enforceSandboxTenantBudget/);
});

test("lite repo keeps local automation kernel sources and removes server-only lite automation blockers", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "src/routes/automations.ts")), true, "lite automations route should exist");
  const liteEdition = fs.readFileSync(path.join(ROOT, "src/host/lite-edition.ts"), "utf8");
  assert.equal(liteEdition.includes("automation orchestration remains server-only"), false);
  assert.match(liteEdition, /automations-lite-kernel/);
});

test("lite replay repair review policy is endpoint-only", () => {
  const policyFile = fs.readFileSync(path.join(ROOT, "src", "app", "replay-repair-review-policy.ts"), "utf8");
  const configFile = fs.readFileSync(path.join(ROOT, "src", "config.ts"), "utf8");
  assert.equal(policyFile.includes("tenant_scope_endpoint"), false, "tenant_scope_endpoint should be absent from lite repair review policy");
  assert.equal(policyFile.includes("tenant_scope_default"), false, "tenant_scope_default should be absent from lite repair review policy");
  assert.equal(policyFile.includes("tenant_endpoint"), false, "tenant_endpoint should be absent from lite repair review policy");
  assert.equal(policyFile.includes("tenant_default"), false, "tenant_default should be absent from lite repair review policy");
  assert.match(configFile, /is not supported in Lite \(use endpoint only\)/);
});

test("lite runtime services do not wire postgres or embedded store constructors", () => {
  const runtimeServicesFile = fs.readFileSync(path.join(ROOT, "src", "app", "runtime-services.ts"), "utf8");
  const forbiddenSymbols = [
    "createPostgresRecallStoreAccess",
    "createPostgresReplayStoreAccess",
    "createPostgresWriteStoreAccess",
    "createEmbeddedMemoryRuntime",
    "createMemoryStore",
    "asPostgresMemoryStore",
    "databaseTargetHash",
  ];
  for (const symbol of forbiddenSymbols) {
    assert.equal(runtimeServicesFile.includes(symbol), false, `${symbol} should be absent from lite runtime-services`);
  }
  assert.match(runtimeServicesFile, /aionis-lite runtime services only support AIONIS_EDITION=lite/);
});

test("lite request guards do not keep full auth or tenant quota plumbing", () => {
  const requestGuardsFile = fs.readFileSync(path.join(ROOT, "src", "app", "request-guards.ts"), "utf8");
  const runtimeEntryFile = fs.readFileSync(path.join(ROOT, "src", "runtime-entry.ts"), "utf8");
  const runtimeServicesFile = fs.readFileSync(path.join(ROOT, "src", "app", "runtime-services.ts"), "utf8");
  const forbiddenSymbols = [
    "recordControlAuditEvent",
    "emitControlAudit",
    "resolveControlPlaneApiKeyPrincipal",
    "tenantQuotaResolver",
    "authResolver",
    "assertIdentityMatch",
  ];
  for (const symbol of forbiddenSymbols) {
    assert.equal(requestGuardsFile.includes(symbol), false, `${symbol} should be absent from lite request-guards`);
    assert.equal(runtimeEntryFile.includes(symbol), false, `${symbol} should not be passed through lite runtime-entry`);
    assert.equal(runtimeServicesFile.includes(symbol), false, `${symbol} should be absent from lite runtime-services`);
  }
  assert.match(requestGuardsFile, /aionis-lite request guards only support MEMORY_AUTH_MODE=off/);
  assert.match(requestGuardsFile, /aionis-lite request guards only support TENANT_QUOTA_ENABLED=false/);
});

test("lite health surface avoids backend implementation detail fields", () => {
  const hostFile = fs.readFileSync(path.join(ROOT, "src", "host", "http-host.ts"), "utf8");
  const forbiddenSymbols = [
    "configured_backend",
    "database_target_hash",
    "memory_store_capability_contract",
    "recall_store_access_capability_version",
    "replay_store_access_capability_version",
    "write_store_access_capability_version",
    "memory_store_embedded_runtime",
  ];
  for (const symbol of forbiddenSymbols) {
    assert.equal(hostFile.includes(symbol), false, `${symbol} should be absent from lite host health/config surfaces`);
  }
  assert.match(hostFile, /local_actor_id: env\.LITE_LOCAL_ACTOR_ID/);
});
