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

test("loadEnv rejects forbidden embedding surfaces in enabled list", () => {
  const out = runSnippet(`
    import { loadEnv } from "./src/config.ts";

    process.env.AIONIS_EDITION = "lite";
    process.env.AIONIS_MODE = "local";
    process.env.EMBEDDING_ENABLED_SURFACES_JSON = JSON.stringify(["handoff_recover"]);

    try {
      loadEnv();
      process.stdout.write("__RESULT__" + JSON.stringify({ ok: true }));
    } catch (err) {
      process.stdout.write("__RESULT__" + JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }));
    }
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /forbidden surface: handoff_recover/);
});

test("loadEnv accepts shell-quoted EMBEDDING_ENABLED_SURFACES_JSON", () => {
  const out = runSnippet(`
    import { loadEnv } from "./src/config.ts";

    process.env.AIONIS_EDITION = "lite";
    process.env.AIONIS_MODE = "local";
    process.env.EMBEDDING_ENABLED_SURFACES_JSON = "'[\\"recall_text\\",\\"planning_context\\"]'";

    const env = loadEnv();
    process.stdout.write("__RESULT__" + JSON.stringify({
      surfaces: env.EMBEDDING_ENABLED_SURFACES_JSON,
    }));
  `);

  const parsed = JSON.parse(out);
  assert.deepEqual(parsed.surfaces, ["recall_text", "planning_context"]);
});

test("recall_text returns embedding_surface_disabled when the surface is turned off", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryContextRuntimeRoutes } from "./src/routes/memory-context-runtime.ts";
    import { createEmbeddingSurfacePolicy } from "./src/embeddings/surface-policy.ts";

    const main = async () => {
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerMemoryContextRuntimeRoutes({
          app,
          env: {
            AIONIS_EDITION: "lite",
            APP_ENV: "dev",
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT: 0,
            MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY: true,
            MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT: "off",
            MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT: "off",
          },
          store: {
            withClient: async () => { throw new Error("recall_text disabled path should not use store.withClient"); },
          },
          embedder: { name: "fake-embedder" },
          embeddingSurfacePolicy: createEmbeddingSurfacePolicy({
            providerConfigured: true,
            enabledSurfaces: ["planning_context", "context_assemble"],
          }),
          embeddedRuntime: null,
          liteWriteStore: null,
          recallTextEmbedBatcher: null,
          recallAccessForClient: () => { throw new Error("recall_text disabled path should not use recall access"); },
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          enforceRecallTextEmbedQuota: async () => {},
          buildRecallAuth: () => ({ allow_debug_embeddings: false }),
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
          hasExplicitRecallKnobs: () => false,
          resolveRecallProfile: () => ({ profile: "strict_edges", source: "test" }),
          resolveExplicitRecallMode: () => ({ mode: null, profile: "strict_edges", applied: false, reason: null, source: "none" }),
          resolveClassAwareRecallProfile: () => ({
            profile: "strict_edges",
            defaults: {},
            enabled: false,
            applied: false,
            reason: null,
            source: "disabled",
            workload_class: null,
            signals: {},
          }),
          withRecallProfileDefaults: (body) => body,
          resolveRecallStrategy: () => ({ applied: false, strategy: null, defaults: {} }),
          resolveAdaptiveRecallProfile: (profile) => ({ profile, applied: false, reason: null }),
          resolveAdaptiveRecallHardCap: () => ({ applied: false, reason: null, defaults: {} }),
          inferRecallStrategyFromKnobs: () => "strict_edges",
          buildRecallTrajectory: () => ({}),
          embedRecallTextQuery: async () => { throw new Error("recall_text disabled path should not embed"); },
          mapRecallTextEmbeddingError: () => ({ statusCode: 500, code: "embed_error", message: "embed failed" }),
          recordContextAssemblyTelemetryBestEffort: async () => {},
        });

        const res = await app.inject({
          method: "POST",
          url: "/v1/memory/recall_text",
          payload: { query_text: "deploy rollback" },
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
  assert.equal(parsed.status, 409);
  assert.equal(parsed.body.error, "embedding_surface_disabled");
  assert.equal(parsed.body.details.surface, "recall_text");
});

test("write route suppresses auto-embed when write_auto_embed surface is disabled", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryWriteRoutes } from "./src/routes/memory-write.ts";
    import { createEmbeddingSurfacePolicy } from "./src/embeddings/surface-policy.ts";

    const main = async () => {
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);
      const insertedNodes = [];
      let commitCounter = 0;

      const writeAccess = {
        capability_version: 4,
        capabilities: { shadow_mirror_v2: false },
        async nodeScopesByIds() { return new Map(); },
        async parentCommitHash() { return null; },
        async insertCommit() {
          commitCounter += 1;
          return "41000000-0000-0000-0000-" + String(commitCounter).padStart(12, "0");
        },
        async insertNode(args) {
          insertedNodes.push({
            id: args.id,
            embedding_status: args.embeddingStatus,
            embedding_last_error: args.embeddingLastError,
          });
        },
        async insertRuleDef() {},
        async upsertEdge() {},
        async readyEmbeddingNodeIds() { return new Set(); },
        async insertOutboxEvent() {},
        async upsertAssociationCandidates() {},
        async listAssociationCandidatesForSource() { return []; },
        async markAssociationCandidatePromoted() {},
        async updateAssociationCandidateStatus() {},
        async appendAfterTopicClusterEventIds() {},
        async mirrorCommitArtifactsToShadowV2() {
          throw new Error("write capability unsupported: shadow_mirror_v2");
        },
      };

      try {
        registerMemoryWriteRoutes({
          app,
          env: {
            AIONIS_EDITION: "server",
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
          store: { withTx: async (fn) => fn({}) },
          embedder: {
            name: "fake-embedder",
            embed: async (texts) => texts.map(() => Array.from({ length: 1536 }, (_, idx) => (idx === 0 ? 1 : 0))),
          },
          embeddingSurfacePolicy: createEmbeddingSurfacePolicy({
            providerConfigured: true,
            enabledSurfaces: ["recall_text"],
          }),
          embeddedRuntime: null,
          liteWriteStore: null,
          writeAccessForClient: () => writeAccess,
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
            input_text: "deploy rollback memory",
            auto_embed: true,
            nodes: [
              {
                id: "41000000-0000-0000-0000-000000000001",
                type: "event",
                memory_lane: "shared",
                title: "rollback step",
                text_summary: "rollback deploy by revision",
                slots: {},
              },
            ],
            edges: [],
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          status: res.statusCode,
          body: JSON.parse(res.body),
          insertedNodes,
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
  assert.equal(parsed.body.embedding_backfill, undefined);
  assert.equal(parsed.insertedNodes.length, 1);
  assert.equal(parsed.insertedNodes[0].embedding_status, "failed");
  assert.equal(parsed.insertedNodes[0].embedding_last_error, "auto_embed_disabled_or_no_provider");
});

test("admin control runtime config exposes embedding surface policy snapshot", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerAdminControlConfigRoutes } from "./src/routes/admin-control-config.ts";
    import { createEmbeddingSurfacePolicy } from "./src/embeddings/surface-policy.ts";
    import { HttpError } from "./src/util/http.ts";

    const main = async () => {
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);

      try {
        registerAdminControlConfigRoutes({
          app,
          db: {},
          embeddingSurfacePolicy: createEmbeddingSurfacePolicy({
            providerConfigured: true,
            enabledSurfaces: ["recall_text", "planning_context"],
          }),
          embeddingProviderName: "fake",
          requireAdminToken: (req) => {
            if (req.headers["x-admin-token"] !== "secret") {
              throw new HttpError(401, "unauthorized", "admin token required");
            }
          },
          emitControlAudit: async () => {},
          tenantQuotaResolver: { invalidate() {} },
          listSandboxBudgetProfiles: async () => [],
          getSandboxBudgetProfile: async () => null,
          upsertSandboxBudgetProfile: async () => ({}),
          deleteSandboxBudgetProfile: async () => false,
          listSandboxProjectBudgetProfiles: async () => [],
          getSandboxProjectBudgetProfile: async () => null,
          upsertSandboxProjectBudgetProfile: async () => ({}),
          deleteSandboxProjectBudgetProfile: async () => false,
        });

        const res = await app.inject({
          method: "GET",
          url: "/v1/admin/control/runtime-config",
          headers: {
            "x-admin-token": "secret",
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
  assert.equal(parsed.body.ok, true);
  assert.equal(parsed.body.runtime_config.embeddings.provider, "fake");
  assert.equal(parsed.body.runtime_config.embeddings.provider_configured, true);
  assert.deepEqual(parsed.body.runtime_config.embeddings.enabled_surfaces, ["recall_text", "planning_context"]);
  assert.deepEqual(parsed.body.runtime_config.embeddings.allowed_surfaces, [
    "write_auto_embed",
    "recall_text",
    "planning_context",
    "context_assemble",
    "topic_cluster",
  ]);
  assert.deepEqual(parsed.body.runtime_config.embeddings.forbidden_surfaces, [
    "handoff_recover",
    "replay_deterministic_gate",
    "execution_loop_gate",
    "sandbox_budget_gate",
  ]);
});
