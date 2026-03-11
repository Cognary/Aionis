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

test("lite recall routes round-trip through embedded recall access", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryRecallRoutes } from "./src/routes/memory-recall.ts";
    import { createEmbeddedMemoryRuntime } from "./src/store/embedded-memory-runtime.ts";
    import { createRecallPolicy } from "./src/app/recall-policy.ts";

    const main = async () => {
      const embeddedRuntime = createEmbeddedMemoryRuntime();
      await embeddedRuntime.applyWrite(
        {
          scope: "default",
          auto_embed_effective: false,
          nodes: [
            {
              id: "10000000-0000-0000-0000-000000000001",
              scope: "default",
              type: "event",
              tier: "hot",
              memory_lane: "shared",
              title: "deploy incident summary",
              text_summary: "deployment incident and rollback context",
              slots: {},
              embedding: Array.from({ length: 1536 }, () => 0),
              embedding_model: "client",
              salience: 0.9,
              confidence: 0.9,
            },
            {
              id: "10000000-0000-0000-0000-000000000002",
              scope: "default",
              type: "topic",
              tier: "hot",
              memory_lane: "shared",
              title: "deploy topology",
              text_summary: "service dependency graph and rollback playbook",
              slots: { topic_state: "active" },
              embedding: Array.from({ length: 1536 }, () => 0),
              embedding_model: "client",
              salience: 0.8,
              confidence: 0.85,
            },
          ],
          edges: [
            {
              id: "10000000-0000-0000-0000-0000000000e1",
              scope: "default",
              type: "part_of",
              src_id: "10000000-0000-0000-0000-000000000001",
              dst_id: "10000000-0000-0000-0000-000000000002",
              weight: 0.95,
              confidence: 0.95,
              decay_rate: 0.01,
            },
          ],
        },
        {
          commit_id: "10000000-0000-0000-0000-0000000000c1",
          commit_hash: "lite-recall-smoke",
        },
      );

      const env = {
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
        embeddedRuntime,
        recallAccessForClient: () => embeddedRuntime.createRecallAccess(),
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
