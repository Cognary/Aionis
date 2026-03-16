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

test("memory/write persists execution state and applies explicit transitions into the phase2 state store", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryWriteRoutes } from "./src/routes/memory-write.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";
    import { InMemoryExecutionStateStore } from "./src/execution/state-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-phase2-memory-write-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const executionStateStore = new InMemoryExecutionStateStore();
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerMemoryWriteRoutes({
          app,
          env: {
            AIONIS_EDITION: "lite",
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
            MEMORY_WRITE_REQUIRE_NODES: false,
            AUTO_TOPIC_CLUSTER_ON_WRITE: false,
            TOPIC_CLUSTER_ASYNC_ON_WRITE: true,
            TOPIC_SIM_THRESHOLD: 0.8,
            TOPIC_MIN_EVENTS_PER_TOPIC: 2,
            TOPIC_MAX_CANDIDATES_PER_EVENT: 8,
            TOPIC_CLUSTER_STRATEGY: "online_knn",
          },
          store: {
            withTx: async () => { throw new Error("lite memory/write should not use postgres tx"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessForClient: () => { throw new Error("lite memory/write should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
          runTopicClusterForEventIds: async () => ({ processed_events: 0 }),
          executionStateStore,
        });

        const stateId = "handoff-anchor:phase2-memory-write";
        const scope = "aionis://handoff/phase2-memory-write";
        const writeRes = await app.inject({
          method: "POST",
          url: "/v1/memory/write",
          payload: {
            input_text: "Write explicit execution state and transition",
            nodes: [
              {
                type: "event",
                title: "phase2 state snapshot",
                text_summary: "Persist explicit execution state",
                slots: {
                  execution_state_v1: {
                    state_id: stateId,
                    scope,
                    task_brief: "Recover service token drift repair",
                    current_stage: "triage",
                    active_role: "triage",
                    owned_files: ["src/gateway/service-token.ts"],
                    modified_files: [],
                    pending_validations: ["run service token recovery smoke"],
                    completed_validations: [],
                    last_accepted_hypothesis: "service token rotation drift is isolated to gateway session cache",
                    rejected_paths: [],
                    unresolved_blockers: ["pending focused smoke"],
                    rollback_notes: ["preserve existing token refresh semantics"],
                    reviewer_contract: {
                      standard: "reviewer-ready token repair packet",
                      required_outputs: ["target_files:src/gateway/service-token.ts"],
                      acceptance_checks: ["run service token recovery smoke"],
                      rollback_required: true,
                    },
                    resume_anchor: {
                      anchor: "phase2-memory-write",
                      file_path: "src/gateway/service-token.ts",
                      symbol: "repairServiceTokenDrift",
                      repo_root: "/repo",
                    },
                    updated_at: "2026-03-16T04:00:00.000Z",
                    version: 1,
                  },
                },
              },
              {
                type: "event",
                title: "phase2 transition",
                text_summary: "Apply explicit validation and stage transition",
                slots: {
                  execution_transition_v1: {
                    transition_id: "phase2-memory-write-t1",
                    state_id: stateId,
                    scope,
                    actor_role: "triage",
                    at: "2026-03-16T04:00:01.000Z",
                    expected_revision: 1,
                    type: "validation_completed",
                    validations: ["run service token recovery smoke"],
                  },
                },
              },
            ],
          },
        });

        const stored = executionStateStore.get(scope, stateId);

        process.stdout.write("__RESULT__" + JSON.stringify({
          status: writeRes.statusCode,
          body: JSON.parse(writeRes.body),
          stored,
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
  assert.equal(parsed.body.nodes.length, 2);
  assert.equal(parsed.stored.revision, 2);
  assert.equal(parsed.stored.last_transition_type, "validation_completed");
  assert.deepEqual(parsed.stored.state.pending_validations, []);
  assert.deepEqual(parsed.stored.state.completed_validations, ["run service token recovery smoke"]);
  assert.equal(parsed.stored.state.current_stage, "triage");
});
