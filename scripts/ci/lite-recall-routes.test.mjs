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

test("lite recall routes round-trip through sqlite recall access", () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryRecallRoutes } from "./src/routes/memory-recall.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";
    import { createLiteRecallStore } from "./src/store/lite-recall-store.ts";
    import { createRecallPolicy } from "./src/app/recall-policy.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-recall-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const liteRecallStore = createLiteRecallStore(sqlitePath);
      await liteWriteStore.withTx(async () => {
        const commitId = await liteWriteStore.insertCommit({
          scope: "default",
          parentCommitId: null,
          inputSha256: "lite-recall-sha",
          diffJson: JSON.stringify({ nodes: [], edges: [] }),
          actor: "lite-recall-test",
          modelVersion: null,
          promptVersion: null,
          commitHash: "lite-recall-smoke",
        });
        await liteWriteStore.insertNode({
          id: "10000000-0000-0000-0000-000000000001",
          scope: "default",
          clientId: "deploy_event",
          type: "event",
          tier: "hot",
          title: "deploy incident summary",
          textSummary: "deployment incident and rollback context",
          slotsJson: JSON.stringify({}),
          rawRef: null,
          evidenceRef: null,
          embeddingVector: JSON.stringify(Array.from({ length: 1536 }, () => 0)),
          embeddingModel: "client",
          memoryLane: "shared",
          producerAgentId: null,
          ownerAgentId: null,
          ownerTeamId: null,
          embeddingStatus: "ready",
          embeddingLastError: null,
          salience: 0.9,
          importance: 0.8,
          confidence: 0.9,
          redactionVersion: 1,
          commitId,
        });
        await liteWriteStore.insertNode({
          id: "10000000-0000-0000-0000-000000000002",
          scope: "default",
          clientId: "deploy_topic",
          type: "topic",
          tier: "hot",
          title: "deploy topology",
          textSummary: "service dependency graph and rollback playbook",
          slotsJson: JSON.stringify({ topic_state: "active" }),
          rawRef: null,
          evidenceRef: null,
          embeddingVector: JSON.stringify(Array.from({ length: 1536 }, () => 0)),
          embeddingModel: "client",
          memoryLane: "shared",
          producerAgentId: null,
          ownerAgentId: null,
          ownerTeamId: null,
          embeddingStatus: "ready",
          embeddingLastError: null,
          salience: 0.8,
          importance: 0.8,
          confidence: 0.85,
          redactionVersion: 1,
          commitId,
        });
        await liteWriteStore.upsertEdge({
          id: "10000000-0000-0000-0000-0000000000e1",
          scope: "default",
          type: "part_of",
          srcId: "10000000-0000-0000-0000-000000000001",
          dstId: "10000000-0000-0000-0000-000000000002",
          weight: 0.95,
          confidence: 0.95,
          decayRate: 0.01,
          commitId,
        });
      });

      const env = {
        AIONIS_EDITION: "lite",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY: true,
        MEMORY_RECALL_PROFILE: "strict_edges",
        MEMORY_RECALL_PROFILE_POLICY_JSON: "{}",
        MEMORY_RECALL_CLASS_AWARE_ENABLED: false,
        MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED: false,
        MEMORY_RECALL_ADAPTIVE_WAIT_MS: 1000,
        MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE: "lite",
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_ENABLED: false,
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS: 1000,
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_LIMIT: 12,
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_NEIGHBORHOOD_HOPS: 1,
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_NODES: 24,
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_EDGES: 24,
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_RANKED_LIMIT: 48,
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_WEIGHT: 0.25,
        MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_CONFIDENCE: 0.25,
      };
      const recallPolicy = createRecallPolicy(env);
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);
      registerMemoryRecallRoutes({
        app,
        env,
        store: { withClient: async (fn) => await fn({}) },
        embeddedRuntime: null,
        recallAccessForClient: () => liteRecallStore.createRecallAccess(),
        requireMemoryPrincipal: async () => ({ sub: "tester" }),
        withIdentityFromRequest: (_req, body) => body,
        enforceRateLimit: async () => {},
        enforceTenantQuota: async () => {},
        tenantFromBody: () => "default",
        acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
        hasExplicitRecallKnobs: recallPolicy.hasExplicitRecallKnobs,
        resolveRecallProfile: recallPolicy.resolveRecallProfile,
        resolveExplicitRecallMode: recallPolicy.resolveExplicitRecallMode,
        withRecallProfileDefaults: recallPolicy.withRecallProfileDefaults,
        resolveRecallStrategy: recallPolicy.resolveRecallStrategy,
        resolveAdaptiveRecallProfile: recallPolicy.resolveAdaptiveRecallProfile,
        resolveAdaptiveRecallHardCap: recallPolicy.resolveAdaptiveRecallHardCap,
        inferRecallStrategyFromKnobs: recallPolicy.inferRecallStrategyFromKnobs,
        buildRecallTrajectory: recallPolicy.buildRecallTrajectory,
        buildRecallAuth: () => ({ allow_debug_embeddings: false }),
      });

      try {
        const res = await app.inject({
          method: "POST",
          url: "/v1/memory/recall",
          payload: {
            query_embedding: Array.from({ length: 1536 }, () => 0),
            limit: 8,
            neighborhood_hops: 2,
            return_debug: true,
            include_meta: true,
          },
        });
        process.stdout.write("__RESULT__" + JSON.stringify({
          status: res.statusCode,
          body: JSON.parse(res.body),
        }));
      } finally {
        await app.close();
        await liteRecallStore.close();
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
  assert.ok(parsed.body.seeds.length >= 1);
  assert.ok(parsed.body.subgraph.nodes.length >= 1);
  assert.ok(parsed.body.subgraph.edges.length >= 1);
  assert.equal(parsed.body.observability.stage1.mode, "ann");
  assert.equal(parsed.body.observability.adaptive.profile.profile, "strict_edges");
  assert.equal(parsed.body.observability.adaptive.profile.applied, false);
  assert.ok(Array.isArray(parsed.body.trajectory.layers));
  assert.equal(parsed.body.trajectory.layers[0].name, "seed_candidates");
});
