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

test("POST /v1/memory/tools/select returns tool registry metadata", () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryFeedbackToolRoutes } from "./src/routes/memory-feedback-tools.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-tool-evolution-route-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);

      try {
        const app = createHttpApp({ TRUST_PROXY: false });
        registerHostErrorHandler(app);
        registerMemoryFeedbackToolRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
          },
          store: {
            withTx: async () => { throw new Error("route test should not use store.withTx"); },
            withClient: async () => { throw new Error("route test should not use store.withClient"); },
          },
          embeddedRuntime: null,
          liteWriteStore,
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {} }),
        });

        try {
          const res = await app.inject({
            method: "POST",
            url: "/v1/memory/tools/select",
            payload: {
              scope: "openclaw:test",
              context: { source: "route-test" },
              candidates: ["read-source-focused-v2", "read-markdown-impl"],
              strict: false,
            },
          });
          process.stdout.write("__RESULT__" + JSON.stringify({
            statusCode: res.statusCode,
            body: JSON.parse(res.body),
          }));
        } finally {
          await app.close();
        }
      } finally {
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
  assert.equal(parsed.statusCode, 200);
  assert.equal(parsed.body.execution_kernel.tool_registry_present, true);
  assert.equal(parsed.body.execution_kernel.candidate_families[0].capability_family, "focused_repo_read");
  assert.equal(parsed.body.execution_kernel.candidate_families[0].quality_tier, "preferred");
  assert.equal(parsed.body.execution_kernel.candidate_families[1].quality_tier, "supported");
});
