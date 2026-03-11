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

test("lite write route uses sqlite write store without pg transaction path", () => {
  const out = runSnippet(`
    import { DatabaseSync } from "node:sqlite";
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryWriteRoutes } from "./src/routes/memory-write.ts";
    import { createEmbeddedMemoryRuntime } from "./src/store/embedded-memory-runtime.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-write-"));
      const sqlitePath = path.join(tmpDir, "write.sqlite");
      const embeddedRuntime = createEmbeddedMemoryRuntime();
      const writeAccess = createLiteWriteStore(sqlitePath);
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
            MEMORY_WRITE_REQUIRE_NODES: false,
            AUTO_TOPIC_CLUSTER_ON_WRITE: false,
            TOPIC_CLUSTER_ASYNC_ON_WRITE: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
            TOPIC_SIM_THRESHOLD: 0.72,
            TOPIC_MIN_EVENTS_PER_TOPIC: 2,
            TOPIC_MAX_CANDIDATES_PER_EVENT: 32,
            TOPIC_CLUSTER_STRATEGY: "online_knn",
          },
          store: { withTx: async () => { throw new Error("lite write should not use store.withTx"); } },
          embedder: null,
          embeddedRuntime,
          liteWriteStore: writeAccess,
          writeAccessForClient: () => { throw new Error("lite write should not use postgres write access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
          runTopicClusterForEventIds: async () => ({ processed_events: 0 }),
        });
        const res = await app.inject({
          method: "POST",
          url: "/v1/memory/write",
          payload: {
            input_text: "deploy runbook memory",
            auto_embed: false,
            nodes: [
              {
                id: "30000000-0000-0000-0000-000000000001",
                type: "event",
                memory_lane: "shared",
                title: "deploy runbook",
                text_summary: "deployment rollback steps",
                slots: {},
                embedding: Array.from({ length: 1536 }, () => 0),
                embedding_model: "client",
              },
              {
                id: "30000000-0000-0000-0000-000000000002",
                type: "topic",
                memory_lane: "shared",
                title: "rollback topology",
                text_summary: "service dependency rollback graph",
                slots: {},
                embedding: Array.from({ length: 1536 }, () => 0),
                embedding_model: "client",
              },
            ],
            edges: [
              {
                id: "30000000-0000-0000-0000-0000000000e1",
                type: "part_of",
                src: { id: "30000000-0000-0000-0000-000000000001" },
                dst: { id: "30000000-0000-0000-0000-000000000002" },
                weight: 0.9,
                confidence: 0.9,
              },
            ],
          },
        });
        const parsed = JSON.parse(res.body);
        const recallSeeds = await embeddedRuntime.createRecallAccess().stage1CandidatesAnn({
          queryEmbedding: Array.from({ length: 1536 }, () => 0),
          scope: "default",
          oversample: 8,
          limit: 4,
          consumerAgentId: null,
          consumerTeamId: null,
        });
        const db = new DatabaseSync(sqlitePath);
        const commitCount = (db.prepare("SELECT COUNT(*) AS count FROM lite_memory_commits").get()).count;
        const nodeCount = (db.prepare("SELECT COUNT(*) AS count FROM lite_memory_nodes").get()).count;
        const edgeCount = (db.prepare("SELECT COUNT(*) AS count FROM lite_memory_edges").get()).count;
        db.close();
        process.stdout.write("__RESULT__" + JSON.stringify({
          status: res.statusCode,
          body: parsed,
          commitCount,
          nodeCount,
          edgeCount,
          recallSeedCount: recallSeeds.length,
          recallSeedIds: recallSeeds.map((row) => row.id),
        }));
      } finally {
        await app.close();
        await writeAccess.close();
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
  assert.equal(parsed.commitCount, 1);
  assert.equal(parsed.nodeCount, 2);
  assert.equal(parsed.edgeCount, 1);
  assert.equal(parsed.body.nodes.length, 2);
  assert.equal(parsed.body.edges.length, 1);
  assert.ok(parsed.recallSeedCount >= 1);
  assert.ok(parsed.recallSeedIds.includes("30000000-0000-0000-0000-000000000001"));
});
