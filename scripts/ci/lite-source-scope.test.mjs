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
  "src/sdk/index.ts",
  "src/memory/automation.ts",
  "src/memory/automation-lite.ts",
  "src/memory/feedback.ts",
  "src/memory/find.ts",
  "src/memory/handoff.ts",
  "src/memory/packs.ts",
  "src/memory/resolve.ts",
  "src/memory/sessions.ts",
  "src/memory/tools-decision.ts",
  "src/memory/tools-run.ts",
  "src/routes/admin-control-alerts.ts",
  "src/routes/admin-control-config.ts",
  "src/routes/admin-control-dashboard.ts",
  "src/routes/admin-control-entities.ts",
  "src/routes/automations.ts",
  "src/routes/handoff.ts",
  "src/routes/memory-access.ts",
  "src/routes/memory-feedback-tools.ts",
  "src/routes/memory-recall.ts",
  "src/routes/memory-replay-core.ts",
  "src/routes/memory-replay-governed.ts",
  "src/routes/memory-sandbox.ts",
  "src/routes/memory-write.ts",
  "src/util/error-format.ts",
];

const ALLOWED_JOB_FILES = [
  "associative-linking-lib.ts",
  "topicClusterLib.ts",
];

test("lite repo excludes bench/dev/eval/sdk source entrypoints", () => {
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

test("lite sdk demo host stays on demo and lite-edition surfaces", () => {
  const hostFile = fs.readFileSync(path.join(ROOT, "src/host/http-host-sdk-demo.ts"), "utf8");
  const forbiddenImports = [
    "../routes/admin-control-alerts.js",
    "../routes/admin-control-config.js",
    "../routes/admin-control-dashboard.js",
    "../routes/admin-control-entities.js",
  ];
  for (const specifier of forbiddenImports) {
    assert.equal(hostFile.includes(specifier), false, `${specifier} should not be imported by lite sdk-demo host`);
  }
  assert.equal(hostFile.includes("../routes/sdk-demo-memory-routes.js"), true, "lite sdk-demo host should import the demo route bundle");
  assert.equal(hostFile.includes("./lite-edition.js"), true, "lite sdk-demo host should import lite-edition server-only routes");
});

test("lite route registration args drop server-only plumbing", () => {
  const routeArgsFile = fs.readFileSync(path.join(ROOT, "src/host/application-route-args.ts"), "utf8");
  const demoArgsFile = fs.readFileSync(path.join(ROOT, "src/host/http-host-sdk-demo-args.ts"), "utf8");
  const runtimeEntry = fs.readFileSync(path.join(ROOT, "src/runtime-entry-sdk-demo.ts"), "utf8");
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
    assert.equal(routeArgsFile.includes(symbol), false, `${symbol} should be absent from lite application route args`);
    assert.equal(demoArgsFile.includes(symbol), false, `${symbol} should be absent from lite sdk-demo route args`);
    assert.equal(runtimeEntry.includes(symbol), false, `${symbol} should not be passed through lite runtime-entry route wiring`);
  }
  const sandboxBudgetFile = fs.readFileSync(path.join(ROOT, "src", "app", "sandbox-budget.ts"), "utf8");
  for (const symbol of forbiddenSymbols.slice(2)) {
    assert.equal(sandboxBudgetFile.includes(symbol), false, `${symbol} should be absent from lite sandbox-budget module`);
  }
  assert.match(sandboxBudgetFile, /enforceSandboxTenantBudget/);
});

test("lite public route matrix matches the sdk_demo surface", () => {
  const liteEdition = fs.readFileSync(path.join(ROOT, "src/host/lite-edition.ts"), "utf8");
  assert.equal(liteEdition.includes("memory-handoff"), false);
  assert.equal(liteEdition.includes("memory-recall"), false);
  assert.equal(liteEdition.includes("automations-lite-kernel"), false);
  assert.equal(liteEdition.includes("memory-sandbox"), false);
  assert.match(liteEdition, /memory-write/);
  assert.match(liteEdition, /memory-context-runtime/);
  assert.match(liteEdition, /memory-access-partial/);
  assert.match(liteEdition, /memory-feedback-tools/);
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
  const runtimeEntryFile = fs.readFileSync(path.join(ROOT, "src", "runtime-entry-sdk-demo.ts"), "utf8");
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
  const hostFile = fs.readFileSync(path.join(ROOT, "src", "host", "http-host-bootstrap-shared.ts"), "utf8");
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

test("lite pack routes do not keep admin-token-only gating", () => {
  const memoryAccessFile = fs.readFileSync(path.join(ROOT, "src", "routes", "sdk-demo-memory-access.ts"), "utf8");
  assert.equal(memoryAccessFile.includes("requireAdmin: true"), false, "pack routes should not require admin token in lite");
  assert.equal(memoryAccessFile.includes("requireAdminToken"), false, "memory-access should not depend on admin token helper in lite");
});

test("lite sdk-demo memory-access routes do not keep store fallback branches", () => {
  const memoryAccessFile = fs.readFileSync(path.join(ROOT, "src", "routes", "sdk-demo-memory-access.ts"), "utf8");
  const forbiddenSymbols = [
    "store.withTx",
    "store.withClient",
    "memoryFind(",
    "memoryResolve(",
    "embeddedRuntime",
  ];
  for (const symbol of forbiddenSymbols) {
    assert.equal(memoryAccessFile.includes(symbol), false, `${symbol} should be absent from lite memory-access routes`);
  }
  assert.match(memoryAccessFile, /aionis-lite sdk-demo memory-access routes only support AIONIS_EDITION=lite/);
});

test("lite sdk-demo memory-feedback-tools routes do not keep store fallback branches", () => {
  const memoryFeedbackToolsFile = fs.readFileSync(path.join(ROOT, "src", "routes", "sdk-demo-memory-feedback-tools.ts"), "utf8");
  const forbiddenSymbols = [
    "type StoreLike",
    "store.withTx",
    "store.withClient",
    "executeStore:",
    "MemoryFeedbackRunner",
  ];
  for (const symbol of forbiddenSymbols) {
    assert.equal(memoryFeedbackToolsFile.includes(symbol), false, `${symbol} should be absent from lite memory-feedback-tools routes`);
  }
  assert.match(memoryFeedbackToolsFile, /aionis-lite sdk-demo memory-feedback routes only support AIONIS_EDITION=lite/);
  assert.equal(memoryFeedbackToolsFile.includes("../memory/feedback.js"), false, "lite sdk-demo feedback routes should not keep legacy rule-feedback helpers");
});

test("lite memory-context-runtime routes do not keep store-client recall plumbing", () => {
  const memoryContextRuntimeFile = fs.readFileSync(path.join(ROOT, "src", "routes", "memory-context-runtime.ts"), "utf8");
  const forbiddenSymbols = [
    "type StoreLike",
    "store.withClient",
    "recallAccessForClient",
    "liteModeActive",
  ];
  for (const symbol of forbiddenSymbols) {
    assert.equal(memoryContextRuntimeFile.includes(symbol), false, `${symbol} should be absent from lite memory-context-runtime routes`);
  }
  assert.match(memoryContextRuntimeFile, /aionis-lite memory-context-runtime routes only support AIONIS_EDITION=lite/);
});

test("lite host does not register broken memory lifecycle routes and exposes them as unsupported", () => {
  const liteEditionFile = fs.readFileSync(path.join(ROOT, "src", "host", "lite-edition.ts"), "utf8");
  assert.match(liteEditionFile, /memory lifecycle routes are unavailable in lite edition/);
  assert.match(liteEditionFile, /\/v1\/memory\/archive\/rehydrate/);
  assert.match(liteEditionFile, /\/v1\/memory\/nodes\/activate/);
});

test("lite sdk-demo memory-replay-governed routes do not keep store fallback branches", () => {
  const replayGovernedFile = fs.readFileSync(path.join(ROOT, "src", "routes", "sdk-demo-memory-replay-governed.ts"), "utf8");
  const forbiddenSymbols = [
    "type StoreLike",
    "store.withTx",
    "store.withClient",
    "liteModeActive",
  ];
  for (const symbol of forbiddenSymbols) {
    assert.equal(replayGovernedFile.includes(symbol), false, `${symbol} should be absent from lite memory-replay-governed routes`);
  }
  assert.match(replayGovernedFile, /aionis-lite sdk-demo replay routes only support AIONIS_EDITION=lite/);
});
