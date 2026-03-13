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
  const lines = out.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

test("native handoff routes store and recover exact handoff artifact in lite mode", () => {
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

test("native handoff recover prefers the newest matching handoff", () => {
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
