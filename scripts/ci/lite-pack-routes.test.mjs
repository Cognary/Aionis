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

test("lite pack routes export and verify import through sqlite pack bridge", () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryAccessRoutes } from "./src/routes/memory-access.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";
    import { applyMemoryWrite, prepareMemoryWrite } from "./src/memory/write.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-pack-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const prepared = await prepareMemoryWrite(
        {
          tenant_id: "default",
          scope: "default",
          actor: "lite-pack-test",
          input_text: "pack source graph",
          auto_embed: false,
          nodes: [
            {
              client_id: "pack_event",
              type: "event",
              title: "Pack Event",
              text_summary: "Pack export source event",
              memory_lane: "shared",
              slots: {},
              embedding: Array.from({ length: 1536 }, () => 0),
              embedding_model: "client",
            },
            {
              client_id: "pack_topic",
              type: "topic",
              title: "Pack Topic",
              text_summary: "Pack export source topic",
              memory_lane: "shared",
              slots: { topic_state: "active" },
              embedding: Array.from({ length: 1536 }, () => 0),
              embedding_model: "client",
            },
          ],
          edges: [
            {
              type: "part_of",
              src: { client_id: "pack_event" },
              dst: { client_id: "pack_topic" },
              weight: 0.9,
              confidence: 0.9,
            },
          ],
        },
        "default",
        "default",
        {
          maxTextLen: 4096,
          piiRedaction: false,
          allowCrossScopeEdges: false,
        },
        null,
      );
      await liteWriteStore.withTx(() => applyMemoryWrite({} as any, prepared, {
        maxTextLen: 4096,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        write_access: liteWriteStore,
      }));

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
            withTx: async () => { throw new Error("lite packs should not use store.withTx"); },
            withClient: async () => { throw new Error("lite packs should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessShadowMirrorV2: false,
          requireAdminToken: () => {},
          requireStoreFeatureCapability: () => {},
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {} }),
        });

        const exportRes = await app.inject({
          method: "POST",
          url: "/v1/memory/packs/export",
          payload: {
            tenant_id: "default",
            scope: "default",
            include_nodes: true,
            include_edges: true,
            include_commits: true,
            include_decisions: true,
            include_meta: true,
            max_rows: 50,
          },
        });
        const exportBody = JSON.parse(exportRes.body);

        const importRes = await app.inject({
          method: "POST",
          url: "/v1/memory/packs/import",
          payload: {
            tenant_id: "default",
            scope: "default",
            verify_only: true,
            pack: exportBody.pack,
            manifest_sha256: exportBody.manifest.sha256,
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          exportStatus: exportRes.statusCode,
          exportBody,
          importStatus: importRes.statusCode,
          importBody: JSON.parse(importRes.body),
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
  assert.equal(parsed.exportStatus, 200);
  assert.equal(parsed.importStatus, 200);
  assert.equal(parsed.exportBody.manifest.counts.nodes, 2);
  assert.equal(parsed.exportBody.manifest.counts.edges, 1);
  assert.ok(Array.isArray(parsed.exportBody.pack.decisions));
  assert.equal(parsed.exportBody.pack.decisions.length, 0);
  assert.equal(parsed.importBody.verified, true);
  assert.equal(parsed.importBody.imported, false);
  assert.equal(parsed.importBody.planned.nodes, 2);
  assert.equal(parsed.importBody.planned.edges, 1);
});
