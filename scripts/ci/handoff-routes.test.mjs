import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(import.meta.url);

const LITE_SQLITE_UNAVAILABLE =
  (() => {
    try {
      const mod = require("node:sqlite");
      return typeof mod?.DatabaseSync !== "function";
    } catch {
      return true;
    }
  })()
    ? "requires Node.js with node:sqlite support"
    : false;

function extractFirstJsonObject(text) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (start === -1) {
      if (ch === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.trim();
}

function runSnippet(source) {
  const out = execFileSync("npx", ["tsx", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const marker = "__RESULT__";
  const idx = out.lastIndexOf(marker);
  if (idx >= 0) return extractFirstJsonObject(out.slice(idx + marker.length));
  const lines = out.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

test("native handoff routes store and recover exact handoff artifact in lite mode", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerHandoffRoutes } from "./src/routes/handoff.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-handoff-routes-"));
      const sqlitePath = path.join(tmpDir, "handoff.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerHandoffRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
          },
          store: {
            withTx: async () => { throw new Error("lite handoff store should not use store.withTx"); },
            withClient: async () => { throw new Error("lite handoff recover should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessForClient: () => { throw new Error("lite handoff routes should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
        });

        const storeRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor: "handoff-anchor-1",
            file_path: "/repo/foo.py",
            repo_root: "/repo",
            symbol: "parse_foo",
            summary: "Preserve empty tuple semantics",
            handoff_text: "Only normalize () in the narrow envvar-backed variadic case.",
            risk: "Empty tuple collapses to UNSET too broadly.",
            acceptance_checks: ["Add regression for nargs == -1"],
            tags: ["click", "handoff"],
          },
        });

        const recoverRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/recover",
          payload: {
            anchor: "handoff-anchor-1",
            file_path: "/repo/foo.py",
            symbol: "parse_foo",
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          storeStatus: storeRes.statusCode,
          recoverStatus: recoverRes.statusCode,
          storeBody: JSON.parse(storeRes.body),
          recoverBody: JSON.parse(recoverRes.body),
        }));
      } finally {
        await app.close();
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.storeStatus, 200);
  assert.equal(parsed.recoverStatus, 200);
  assert.equal(parsed.storeBody.handoff.handoff_kind, "patch_handoff");
  assert.equal(parsed.storeBody.handoff.anchor, "handoff-anchor-1");
  assert.equal(parsed.storeBody.handoff.file_path, "/repo/foo.py");
  assert.equal(
    parsed.recoverBody.handoff.handoff_text,
    "Only normalize () in the narrow envvar-backed variadic case.",
  );
  assert.equal(parsed.recoverBody.handoff.file_path, "/repo/foo.py");
  assert.equal(parsed.recoverBody.handoff.symbol, "parse_foo");
  assert.equal(parsed.recoverBody.handoff.risk, "Empty tuple collapses to UNSET too broadly.");
  assert.deepEqual(parsed.recoverBody.handoff.acceptance_checks, ["Add regression for nargs == -1"]);
  assert.equal(parsed.recoverBody.matched_nodes, 1);
});

test("native handoff routes preserve explicit Aionis Doc runtime continuity payloads", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync, readFileSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerHandoffRoutes } from "./src/routes/handoff.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";
    import {
      compileAionisDoc,
      compileAndExecuteAionisDoc,
      ModuleRegistryExecutionRuntime,
      StaticModuleRegistry,
      buildRuntimeHandoffV1,
      buildHandoffStoreRequestFromRuntimeHandoff,
    } from "./packages/aionis-doc/src/index.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-handoff-routes-"));
      const sqlitePath = path.join(tmpDir, "handoff.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerHandoffRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
          },
          store: {
            withTx: async () => { throw new Error("lite handoff store should not use store.withTx"); },
            withClient: async () => { throw new Error("lite handoff recover should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessForClient: () => { throw new Error("lite handoff routes should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
        });

        const sourcePath = path.join(process.cwd(), "packages/aionis-doc/fixtures/valid-workflow.aionis.md");
        const compile = compileAionisDoc(readFileSync(sourcePath, "utf8"));
        const executionResult = await compileAndExecuteAionisDoc(readFileSync(sourcePath, "utf8"), {
          runtime: new ModuleRegistryExecutionRuntime({
            runtime_id: "handoff_routes_runtime_v1",
            capabilities: {
              evidence_capture: true,
            },
            registry: new StaticModuleRegistry([
              {
                manifest: {
                  module: "research.claims.v1",
                  version: "1.0.0",
                  required_capabilities: ["direct_execution", "evidence_capture"],
                  input_contract: {
                    kind: "object",
                    additional_properties: true,
                  },
                  output_contract: {
                    kind: "object",
                    properties: {
                      claims: {
                        kind: "array",
                        items: { kind: "string" },
                      },
                    },
                    required: ["claims"],
                    additional_properties: false,
                  },
                  artifact_contract: {
                    kind: "object",
                    properties: {
                      uri: { kind: "string" },
                    },
                    required: ["uri"],
                    additional_properties: false,
                  },
                  evidence_contract: {
                    kind: "object",
                    properties: {
                      claim: { kind: "string" },
                    },
                    required: ["claim"],
                    additional_properties: false,
                  },
                },
                handler: () => ({
                  kind: "module_result",
                  output: {
                    claims: ["workflow claim 1", "workflow claim 2"],
                  },
                  artifacts: [{ uri: "memory://artifacts/research.claims.v1/result.json" }],
                  evidence: [{ claim: "Claims were generated" }],
                }),
              },
              {
                manifest: {
                  module: "copy.hero.v1",
                  version: "1.0.0",
                  input_contract: {
                    kind: "object",
                    properties: {
                      claims: {
                        kind: "array",
                        items: { kind: "string" },
                      },
                    },
                    required: ["claims"],
                    additional_properties: false,
                  },
                  output_contract: {
                    kind: "object",
                    properties: {
                      hero: { kind: "string" },
                    },
                    required: ["hero"],
                    additional_properties: false,
                  },
                },
                handler: (input) => ({
                  hero: Array.isArray(input?.claims) ? input.claims[0] : "fallback",
                }),
              },
            ]),
          }),
        });
        const runtimeHandoff = buildRuntimeHandoffV1({
          inputPath: sourcePath,
          result: compile,
          executionResult,
          scope: "default",
          repoRoot: process.cwd(),
        });
        const storePayload = buildHandoffStoreRequestFromRuntimeHandoff({
          handoff: runtimeHandoff,
          scope: "default",
        });

        const storeRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: storePayload,
        });

        const recoverRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/recover",
          payload: {
            anchor: storePayload.anchor,
            handoff_kind: "task_handoff",
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          storeStatus: storeRes.statusCode,
          recoverStatus: recoverRes.statusCode,
          storeBody: JSON.parse(storeRes.body),
          recoverBody: JSON.parse(recoverRes.body),
        }));
      } finally {
        await app.close();
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.storeStatus, 200);
  assert.equal(parsed.recoverStatus, 200);
  assert.equal(parsed.storeBody.execution_result_summary.runtime_id, "handoff_routes_runtime_v1");
  assert.equal(parsed.storeBody.execution_artifacts.length, 1);
  assert.equal(parsed.storeBody.execution_evidence.length, 1);
  assert.equal(parsed.storeBody.execution_state_v1.current_stage, "patch");
  assert.equal(parsed.storeBody.execution_packet_v1.artifact_refs[0], "artifact:run.claims:1");
  assert.equal(parsed.storeBody.execution_packet_v1.review_contract.required_outputs[0], "out.hero");
  assert.equal(parsed.recoverBody.execution_result_summary.runtime_id, "handoff_routes_runtime_v1");
  assert.equal(parsed.recoverBody.execution_artifacts[0].ref, "artifact:run.claims:1");
  assert.equal(parsed.recoverBody.execution_evidence[0].ref, "evidence:run.claims:1");
  assert.equal(parsed.recoverBody.execution_state_v1.current_stage, "patch");
  assert.equal(parsed.recoverBody.execution_packet_v1.artifact_refs[0], "artifact:run.claims:1");
  assert.equal(parsed.recoverBody.execution_packet_v1.review_contract.required_outputs[0], "out.hero");
  assert.equal(parsed.recoverBody.handoff.handoff_kind, "task_handoff");
});

test("native handoff recover prefers the newest matching handoff", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerHandoffRoutes } from "./src/routes/handoff.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-handoff-routes-"));
      const sqlitePath = path.join(tmpDir, "handoff.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerHandoffRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
          },
          store: {
            withTx: async () => { throw new Error("lite handoff store should not use store.withTx"); },
            withClient: async () => { throw new Error("lite handoff recover should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessForClient: () => { throw new Error("lite handoff routes should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
        });

        await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor: "handoff-anchor-latest",
            file_path: "/repo/foo.py",
            symbol: "parse_foo",
            summary: "Old summary",
            handoff_text: "Old handoff text",
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 20));

        await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor: "handoff-anchor-latest",
            file_path: "/repo/foo.py",
            symbol: "parse_foo",
            summary: "New summary",
            handoff_text: "New handoff text",
          },
        });

        const recoverRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/recover",
          payload: {
            anchor: "handoff-anchor-latest",
            file_path: "/repo/foo.py",
            symbol: "parse_foo",
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          recoverStatus: recoverRes.statusCode,
          recoverBody: JSON.parse(recoverRes.body),
        }));
      } finally {
        await app.close();
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.recoverStatus, 200);
  assert.equal(parsed.recoverBody.matched_nodes, 2);
  assert.equal(parsed.recoverBody.handoff.summary, "New summary");
  assert.equal(parsed.recoverBody.handoff.handoff_text, "New handoff text");
});

test("native handoff recover preserves lookup slots under pii redaction", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerHandoffRoutes } from "./src/routes/handoff.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-handoff-routes-"));
      const sqlitePath = path.join(tmpDir, "handoff.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerHandoffRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: true,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
          },
          store: {
            withTx: async () => { throw new Error("lite handoff store should not use store.withTx"); },
            withClient: async () => { throw new Error("lite handoff recover should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessForClient: () => { throw new Error("lite handoff routes should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
        });

        const anchor = "sdk_cli_task_1773455171879";
        await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor,
            file_path: "packages/sdk/src/cli.ts",
            summary: "PII-safe handoff lookup",
            handoff_text: "Continue validation for 415-555-1212 and ensure lookup still works.",
          },
        });

        const recoverRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/recover",
          payload: {
            anchor,
            file_path: "packages/sdk/src/cli.ts",
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          recoverStatus: recoverRes.statusCode,
          recoverBody: JSON.parse(recoverRes.body),
        }));
      } finally {
        await app.close();
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.recoverStatus, 200);
  assert.equal(parsed.recoverBody.handoff.anchor, "sdk_cli_task_1773455171879");
  assert.equal(parsed.recoverBody.handoff.file_path, "packages/sdk/src/cli.ts");
});

test("native handoff recover can disambiguate by repo_root", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerHandoffRoutes } from "./src/routes/handoff.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-handoff-routes-"));
      const sqlitePath = path.join(tmpDir, "handoff.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerHandoffRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
          },
          store: {
            withTx: async () => { throw new Error("lite handoff store should not use store.withTx"); },
            withClient: async () => { throw new Error("lite handoff recover should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessForClient: () => { throw new Error("lite handoff routes should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
        });

        await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor: "shared-anchor",
            repo_root: "/repo-a",
            file_path: "/repo/foo.py",
            summary: "Repo A summary",
            handoff_text: "Repo A handoff",
          },
        });
        await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor: "shared-anchor",
            repo_root: "/repo-b",
            file_path: "/repo/foo.py",
            summary: "Repo B summary",
            handoff_text: "Repo B handoff",
          },
        });

        const recoverRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/recover",
          payload: {
            anchor: "shared-anchor",
            repo_root: "/repo-a",
            file_path: "/repo/foo.py",
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          recoverStatus: recoverRes.statusCode,
          recoverBody: JSON.parse(recoverRes.body),
        }));
      } finally {
        await app.close();
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.recoverStatus, 200);
  assert.equal(parsed.recoverBody.handoff.repo_root, "/repo-a");
  assert.equal(parsed.recoverBody.handoff.handoff_text, "Repo A handoff");
});

test("native handoff store accepts task_handoff without file_path", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerHandoffRoutes } from "./src/routes/handoff.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-handoff-routes-"));
      const sqlitePath = path.join(tmpDir, "handoff.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerHandoffRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
          },
          store: {
            withTx: async () => { throw new Error("lite handoff store should not use store.withTx"); },
            withClient: async () => { throw new Error("lite handoff recover should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessForClient: () => { throw new Error("lite handoff routes should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
        });

        const storeRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor: "task-anchor",
            handoff_kind: "task_handoff",
            summary: "Resume deployment checklist",
            handoff_text: "Continue from approval step 2.",
            next_action: "Request final approval",
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          storeStatus: storeRes.statusCode,
          storeBody: JSON.parse(storeRes.body),
        }));
      } finally {
        await app.close();
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.storeStatus, 200);
  assert.equal(parsed.storeBody.handoff.handoff_kind, "task_handoff");
  assert.equal(parsed.storeBody.handoff.file_path, null);
  assert.equal(parsed.storeBody.handoff.next_action, "Request final approval");
});

test("native handoff routes preserve authenticated private ownership in lite mode", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerHandoffRoutes } from "./src/routes/handoff.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-handoff-routes-"));
      const sqlitePath = path.join(tmpDir, "handoff.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerHandoffRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
          },
          store: {
            withTx: async () => { throw new Error("lite handoff store should not use store.withTx"); },
            withClient: async () => { throw new Error("lite handoff recover should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessForClient: () => { throw new Error("lite handoff routes should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ tenant_id: "default", agent_id: "agent-1", team_id: null }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
        });

        const storeRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor: "private-anchor-1",
            file_path: "/repo/private.py",
            summary: "Private handoff",
            handoff_text: "Recover this exact private handoff.",
            memory_lane: "private",
          },
        });

        const recoverRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/recover",
          payload: {
            anchor: "private-anchor-1",
            file_path: "/repo/private.py",
            memory_lane: "private",
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          storeStatus: storeRes.statusCode,
          recoverStatus: recoverRes.statusCode,
          storeBody: JSON.parse(storeRes.body),
          recoverBody: JSON.parse(recoverRes.body),
        }));
      } finally {
        await app.close();
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.storeStatus, 200);
  assert.equal(parsed.recoverStatus, 200);
  assert.equal(parsed.storeBody.handoff.memory_lane, "private");
  assert.equal(parsed.recoverBody.handoff.memory_lane, "private");
  assert.equal(parsed.recoverBody.handoff.handoff_text, "Recover this exact private handoff.");
  assert.equal(parsed.recoverBody.matched_nodes, 1);
});

test("http observability maps handoff routes into request telemetry endpoints", () => {
  const out = runSnippet(`
    import { createHttpObservabilityHelpers } from "./src/app/http-observability.ts";

    const { telemetryEndpointFromRequest, resolveCorsPolicy } = createHttpObservabilityHelpers({
      env: {
        APP_ENV: "dev",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
      },
      db: null,
      recordMemoryContextAssemblyTelemetry: async () => {},
    });

    process.stdout.write("__RESULT__" + JSON.stringify({
      store: telemetryEndpointFromRequest({ method: "POST", routerPath: "/v1/handoff/store" }),
      recover: telemetryEndpointFromRequest({ method: "POST", routerPath: "/v1/handoff/recover" }),
      corsStore: resolveCorsPolicy({ method: "POST", routerPath: "/v1/handoff/store" }),
      corsPreflight: resolveCorsPolicy({
        method: "OPTIONS",
        routerPath: "/v1/handoff/recover",
        headers: { "access-control-request-method": "POST" },
      }),
    }));
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.store, "write");
  assert.equal(parsed.recover, "recall");
  assert.equal(parsed.corsStore.allow_methods, "GET,POST,OPTIONS");
  assert.deepEqual(parsed.corsStore.allow_origins, ["*"]);
  assert.equal(parsed.corsPreflight.allow_methods, "GET,POST,OPTIONS");
});
