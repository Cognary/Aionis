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
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
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

test("lite session routes use sqlite session graph path", () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryAccessRoutes } from "./src/routes/memory-access.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-session-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerMemoryAccessRoutes({
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
            withTx: async () => { throw new Error("lite sessions should not use store.withTx"); },
            withClient: async () => { throw new Error("lite sessions should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessShadowMirrorV2: false,
          requireAdminToken: () => {},
          requireStoreFeatureCapability: () => {},
          requireMemoryPrincipal: async () => ({ sub: "tester", agent_id: "agent_lite" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {} }),
        });

        const createRes = await app.inject({
          method: "POST",
          url: "/v1/memory/sessions",
          payload: {
            tenant_id: "default",
            scope: "default",
            session_id: "deploy-run",
            title: "Deploy Run",
            text_summary: "Deployment run session",
            actor: "lite-test",
            memory_lane: "shared",
            auto_embed: false,
          },
        });

        const eventRes = await app.inject({
          method: "POST",
          url: "/v1/memory/events",
          payload: {
            tenant_id: "default",
            scope: "default",
            session_id: "deploy-run",
            event_id: "evt-1",
            title: "Rollback prepared",
            text_summary: "Rollback plan created",
            actor: "lite-test",
            memory_lane: "shared",
            auto_embed: false,
            edge_weight: 0.9,
            edge_confidence: 0.95,
          },
        });

        const listRes = await app.inject({
          method: "GET",
          url: "/v1/memory/sessions/deploy-run/events?tenant_id=default&scope=default&include_meta=true",
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          createStatus: createRes.statusCode,
          createBody: JSON.parse(createRes.body),
          eventStatus: eventRes.statusCode,
          eventBody: JSON.parse(eventRes.body),
          listStatus: listRes.statusCode,
          listBody: JSON.parse(listRes.body),
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
  assert.equal(parsed.createStatus, 200);
  assert.equal(parsed.eventStatus, 200);
  assert.equal(parsed.listStatus, 200);
  assert.equal(parsed.createBody.session_id, "deploy-run");
  assert.equal(parsed.eventBody.event_id, "evt-1");
  assert.equal(parsed.listBody.session.session_id, "deploy-run");
  assert.equal(parsed.listBody.events.length, 1);
  assert.equal(parsed.listBody.events[0].event_id, "evt-1");
  assert.equal(parsed.listBody.events[0].title, "Rollback prepared");
  assert.equal(parsed.listBody.events[0].edge_weight, 0.9);
});
