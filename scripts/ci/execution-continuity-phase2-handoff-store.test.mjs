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

test("handoff/store persists execution state into the phase2 state store overlay", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerHandoffRoutes } from "./src/routes/handoff.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";
    import { InMemoryExecutionStateStore } from "./src/execution/state-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-phase2-handoff-store-"));
      const sqlitePath = path.join(tmpDir, "handoff.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const executionStateStore = new InMemoryExecutionStateStore();
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
          executionStateStore,
        });

        const storeRes = await app.inject({
          method: "POST",
          url: "/v1/handoff/store",
          payload: {
            anchor: "phase2-overlay-anchor",
            file_path: "/repo/cli.ts",
            repo_root: "/repo",
            symbol: "recover_cli",
            summary: "Resume CLI fix validation",
            handoff_text: "Carry the exact rollback notes into the resume stage.",
            acceptance_checks: ["Run the focused CLI smoke"],
            must_keep: ["Preserve current auth fallback semantics"],
            target_files: ["/repo/cli.ts", "/repo/cli.test.ts"],
            next_action: "Re-run the narrow smoke and record the verdict",
          },
        });

        const body = JSON.parse(storeRes.body);
        const storedState = executionStateStore.get(body.execution_state_v1.scope, body.execution_state_v1.state_id);

        process.stdout.write("__RESULT__" + JSON.stringify({
          status: storeRes.statusCode,
          body,
          stored: storedState,
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
  assert.equal(parsed.status, 200);
  assert.equal(parsed.body.handoff.anchor, "phase2-overlay-anchor");
  assert.equal(parsed.body.execution_state_v1.resume_anchor.anchor, "phase2-overlay-anchor");
  assert.equal(Array.isArray(parsed.body.execution_transitions_v1), true);
  assert.equal(parsed.body.execution_transitions_v1.length, 2);
  assert.equal(parsed.stored.revision, 3);
  assert.equal(parsed.stored.last_transition_type, "resume_anchor_updated");
  assert.equal(parsed.stored.state.resume_anchor.anchor, "phase2-overlay-anchor");
  assert.equal(parsed.stored.state.current_stage, "resume");
  assert.deepEqual(parsed.stored.state.pending_validations, ["Run the focused CLI smoke"]);
  assert.deepEqual(parsed.stored.state.rollback_notes, ["Preserve current auth fallback semantics"]);
});
