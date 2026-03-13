import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

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
  const lines = out.split("\\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

test("lite edition rejects server-only admin control routes with stable 501 contract", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerLiteServerOnlyRoutes } from "./src/host/lite-edition.ts";

    const app = createHttpApp({ TRUST_PROXY: false });
    registerHostErrorHandler(app);
    registerLiteServerOnlyRoutes(app);

    const run = async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/control/tenants",
        payload: {},
      });
      process.stdout.write("__RESULT__" + JSON.stringify({ status: res.statusCode, body: JSON.parse(res.body) }));
      await app.close();
    };
    run().catch(async (err) => {
      console.error(err);
      try { await app.close(); } catch {}
      process.exit(1);
    });
  `);
  const parsed = JSON.parse(out);
  assert.equal(parsed.status, 501);
  assert.equal(parsed.body.error, "server_only_in_lite");
  assert.equal(parsed.body.details.edition, "lite");
  assert.equal(parsed.body.details.route_group, "admin_control");
});

test("lite edition rejects automation routes with stable 501 contract", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerLiteServerOnlyRoutes } from "./src/host/lite-edition.ts";

    const app = createHttpApp({ TRUST_PROXY: false });
    registerHostErrorHandler(app);
    registerLiteServerOnlyRoutes(app);

    const run = async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/automations/list",
        payload: {},
      });
      process.stdout.write("__RESULT__" + JSON.stringify({ status: res.statusCode, body: JSON.parse(res.body) }));
      await app.close();
    };
    run().catch(async (err) => {
      console.error(err);
      try { await app.close(); } catch {}
      process.exit(1);
    });
  `);
  const parsed = JSON.parse(out);
  assert.equal(parsed.status, 501);
  assert.equal(parsed.body.error, "server_only_in_lite");
  assert.equal(parsed.body.details.edition, "lite");
  assert.equal(parsed.body.details.route_group, "automations");
});

test("lite edition route matrix advertises kernel and server-only split", () => {
  const out = runSnippet(`
    import { buildLiteRouteMatrix } from "./src/host/lite-edition.ts";
    process.stdout.write("__RESULT__" + JSON.stringify(buildLiteRouteMatrix()));
  `);
  const parsed = JSON.parse(out);
  assert.ok(parsed.kernel_required_routes.includes("memory-write"));
  assert.ok(parsed.kernel_required_routes.includes("memory-handoff"));
  assert.ok(parsed.server_only_route_groups.some((entry) => entry.group === "admin_control"));
  assert.ok(parsed.server_only_route_groups.some((entry) => entry.group === "automations"));
});

test("lite health payload reports runtime backend truthfully", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHealthRoute } from "./src/host/http-host.ts";

    const app = createHttpApp({ TRUST_PROXY: false });
    registerHealthRoute({
      app,
      env: {
        AIONIS_EDITION: "lite",
        MEMORY_STORE_BACKEND: "postgres",
        MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED: false,
        MEMORY_STORE_EMBEDDED_SNAPSHOT_PATH: "",
        MEMORY_STORE_EMBEDDED_AUTOSAVE: false,
        MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BYTES: 0,
        MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BACKUPS: 0,
        MEMORY_STORE_EMBEDDED_SNAPSHOT_STRICT_MAX_BYTES: false,
        MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_ENABLED: false,
        MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_MAX_ROUNDS: 0,
        MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED: false,
        MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED: false,
        MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED: false,
        MEMORY_STORE_EMBEDDED_SESSION_GRAPH_ENABLED: false,
        MEMORY_STORE_EMBEDDED_PACK_EXPORT_ENABLED: false,
        MEMORY_STORE_EMBEDDED_PACK_IMPORT_ENABLED: false,
        SANDBOX_TENANT_BUDGET_WINDOW_HOURS: 24,
        SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS: true,
        SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI: "",
      },
      healthDatabaseTargetHash: null,
      embeddedRuntime: null,
      liteRecallStore: { healthSnapshot: () => ({ backend: "sqlite" }) },
      liteWriteStore: { healthSnapshot: () => ({ backend: "sqlite" }) },
      recallStoreCapabilities: { debug_embeddings: true, audit_insert: true },
      writeStoreCapabilities: { shadow_mirror_v2: false },
      storeFeatureCapabilities: { sessions_graph: true, packs_export: true, packs_import: true },
      sandboxExecutor: { healthSnapshot: () => ({ ok: true }) },
      sandboxTenantBudgetPolicy: new Map(),
      sandboxRemoteAllowedCidrs: new Set(),
    });

    const run = async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      process.stdout.write("__RESULT__" + JSON.stringify(JSON.parse(res.body)));
      await app.close();
    };
    run().catch(async (err) => {
      console.error(err);
      try { await app.close(); } catch {}
      process.exit(1);
    });
  `);
  const parsed = JSON.parse(out);
  assert.equal(parsed.aionis_edition, "lite");
  assert.equal(parsed.memory_store_backend, "lite_sqlite");
  assert.equal(parsed.memory_store_config_backend, "postgres");
});
