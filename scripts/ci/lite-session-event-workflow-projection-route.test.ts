import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { FakeEmbeddingProvider } from "../../src/embeddings/fake.ts";
import { createRequestGuards } from "../../src/app/request-guards.ts";
import { registerHostErrorHandler } from "../../src/host/http-host-bootstrap-shared.ts";
import { registerSdkDemoMemoryAccessRoutes as registerMemoryAccessRoutes } from "../../src/routes/sdk-demo-memory-access.ts";
import { registerMemoryContextRuntimeRoutes } from "../../src/routes/memory-context-runtime.ts";
import {
  ExecutionMemoryIntrospectionResponseSchema,
  PlanningContextRouteContractSchema,
} from "../../src/memory/schemas.ts";
import { createLiteRecallStore } from "../../src/store/lite-recall-store.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { InflightGate } from "../../src/util/inflight_gate.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-session-event-workflow-projection-"));
  return path.join(dir, `${name}.sqlite`);
}

function buildEnv() {
  return {
    AIONIS_EDITION: "lite",
    MEMORY_AUTH_MODE: "off",
    TENANT_QUOTA_ENABLED: false,
    LITE_LOCAL_ACTOR_ID: "local-user",
    MEMORY_TENANT_ID: "default",
    MEMORY_SCOPE: "default",
    APP_ENV: "test",
    ADMIN_TOKEN: "",
    TRUST_PROXY: false,
    TRUSTED_PROXY_CIDRS: [],
    RATE_LIMIT_ENABLED: false,
    RATE_LIMIT_BYPASS_LOOPBACK: false,
    WRITE_RATE_LIMIT_MAX_WAIT_MS: 0,
    RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS: 0,
    MAX_TEXT_LEN: 10_000,
    PII_REDACTION: false,
    ALLOW_CROSS_SCOPE_EDGES: false,
    MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
    MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
    AUTO_TOPIC_CLUSTER_ON_WRITE: false,
    TOPIC_CLUSTER_ASYNC_ON_WRITE: true,
    MEMORY_WRITE_REQUIRE_NODES: false,
    MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT: 4096,
    MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY: true,
    MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS: 0,
    MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT: "balanced",
    MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT: "balanced",
  } as any;
}

function registerApp(args: {
  app: ReturnType<typeof Fastify>;
  liteWriteStore: ReturnType<typeof createLiteWriteStore>;
  liteRecallStore: ReturnType<typeof createLiteRecallStore>;
}) {
  const env = buildEnv();
  const guards = createRequestGuards({
    env,
    embedder: FakeEmbeddingProvider,
    recallLimiter: null,
    debugEmbedLimiter: null,
    writeLimiter: null,
    sandboxWriteLimiter: null,
    sandboxReadLimiter: null,
    recallTextEmbedLimiter: null,
    recallInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
    writeInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
  });

  registerHostErrorHandler(args.app);
  registerMemoryAccessRoutes({
    app: args.app,
    env,
    liteWriteStore: args.liteWriteStore,
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
  });

  registerMemoryContextRuntimeRoutes({
    app: args.app,
    env,
    embedder: FakeEmbeddingProvider,
    embeddedRuntime: null,
    liteWriteStore: args.liteWriteStore,
    liteRecallAccess: args.liteRecallStore.createRecallAccess(),
    recallTextEmbedBatcher: { stats: () => null },
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    enforceRecallTextEmbedQuota: guards.enforceRecallTextEmbedQuota,
    buildRecallAuth: guards.buildRecallAuth,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    hasExplicitRecallKnobs: () => false,
    resolveRecallProfile: () => ({ profile: "balanced", source: "test" }),
    resolveExplicitRecallMode: () => ({
      mode: null,
      profile: "balanced",
      defaults: {},
      applied: false,
      reason: "test_default",
      source: "test",
    }),
    resolveClassAwareRecallProfile: (_endpoint, _body, baseProfile) => ({
      profile: baseProfile,
      defaults: {},
      enabled: false,
      applied: false,
      reason: "test_default",
      source: "test",
      workload_class: null,
      signals: [],
    }),
    withRecallProfileDefaults: (body) => ({ ...(body as Record<string, unknown>) }),
    resolveRecallStrategy: () => ({ strategy: "local", defaults: {}, applied: false }),
    resolveAdaptiveRecallProfile: (profile) => ({ profile, defaults: {}, applied: false, reason: "test_default" }),
    resolveAdaptiveRecallHardCap: () => ({ defaults: {}, applied: false, reason: "test_default" }),
    inferRecallStrategyFromKnobs: () => "local",
    buildRecallTrajectory: () => ({ strategy: "local" }),
    embedRecallTextQuery: async (provider, queryText) => {
      const [vec] = await provider.embed([queryText]);
      return {
        vec,
        ms: 0,
        cache_hit: false,
        singleflight_join: false,
        queue_wait_ms: 0,
        batch_size: 1,
      };
    },
    mapRecallTextEmbeddingError: () => ({
      statusCode: 500,
      code: "embed_failed",
      message: "embedding failed",
    }),
    recordContextAssemblyTelemetryBestEffort: async () => {},
  });
}

function buildSessionEventPayload(args: {
  sessionId: string;
  eventId: string;
  title: string;
  taskBrief: string;
  stateId: string;
  filePath: string;
}) {
  const updatedAt = "2026-03-21T12:00:00.000Z";
  return {
    tenant_id: "default",
    scope: "default",
    session_id: args.sessionId,
    event_id: args.eventId,
    title: args.title,
    text_summary: args.taskBrief,
    input_text: `continue ${args.taskBrief}`,
    memory_lane: "private",
    execution_state_v1: {
      version: 1,
      state_id: args.stateId,
      scope: `aionis://execution/${args.stateId}`,
      task_brief: args.taskBrief,
      current_stage: "patch",
      active_role: "patch",
      owned_files: [],
      modified_files: [args.filePath],
      pending_validations: ["npm run -s test:lite -- export"],
      completed_validations: [],
      last_accepted_hypothesis: null,
      rejected_paths: [],
      unresolved_blockers: [],
      rollback_notes: [],
      reviewer_contract: null,
      resume_anchor: {
        anchor: `resume:${args.filePath}`,
        file_path: args.filePath,
        symbol: null,
        repo_root: "/Volumes/ziel/Aionisgo",
      },
      updated_at: updatedAt,
    },
    execution_packet_v1: {
      version: 1,
      state_id: args.stateId,
      current_stage: "patch",
      active_role: "patch",
      task_brief: args.taskBrief,
      target_files: [args.filePath],
      next_action: `Patch ${args.filePath} and rerun export tests`,
      hard_constraints: [],
      accepted_facts: [],
      rejected_paths: [],
      pending_validations: ["npm run -s test:lite -- export"],
      unresolved_blockers: [],
      rollback_notes: [],
      review_contract: null,
      resume_anchor: {
        anchor: `resume:${args.filePath}`,
        file_path: args.filePath,
        symbol: null,
        repo_root: "/Volumes/ziel/Aionisgo",
      },
      artifact_refs: [],
      evidence_refs: [],
    },
  };
}

test("memory/events projects execution continuity session events into workflow guidance", async () => {
  const dbPath = tmpDbPath("session-event-projection");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    registerApp({ app, liteWriteStore, liteRecallStore });

    const sessionId = "session-export-fix";

    const firstEvent = await app.inject({
      method: "POST",
      url: "/v1/memory/events",
      payload: buildSessionEventPayload({
        sessionId,
        eventId: randomUUID(),
        title: "Export session event",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
      }),
    });
    assert.equal(firstEvent.statusCode, 200);

    const firstPlanning = await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "fix export failure in node tests",
        context: {
          goal: "fix export failure in node tests",
        },
        tool_candidates: ["bash", "edit", "test"],
      },
    });
    assert.equal(firstPlanning.statusCode, 200);
    const firstBody = PlanningContextRouteContractSchema.parse(firstPlanning.json());
    assert.equal(firstBody.planner_packet.sections.candidate_workflows.length, 1);
    assert.equal(firstBody.planner_packet.sections.recommended_workflows.length, 0);

    const secondEvent = await app.inject({
      method: "POST",
      url: "/v1/memory/events",
      payload: buildSessionEventPayload({
        sessionId,
        eventId: randomUUID(),
        title: "Export session event second run",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
      }),
    });
    assert.equal(secondEvent.statusCode, 200);

    const secondPlanning = await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "fix export failure in node tests",
        context: {
          goal: "fix export failure in node tests",
        },
        tool_candidates: ["bash", "edit", "test"],
      },
    });
    assert.equal(secondPlanning.statusCode, 200);
    const secondBody = PlanningContextRouteContractSchema.parse(secondPlanning.json());
    assert.equal(secondBody.planner_packet.sections.recommended_workflows.length, 1);
    assert.equal(secondBody.planner_packet.sections.candidate_workflows.length, 0);
    assert.equal(secondBody.workflow_signals[0]?.promotion_state, "stable");

    const introspect = await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: {
        tenant_id: "default",
        scope: "default",
        limit: 8,
      },
    });
    assert.equal(introspect.statusCode, 200);
    const introspectBody = ExecutionMemoryIntrospectionResponseSchema.parse(introspect.json());
    assert.equal(introspectBody.recommended_workflows.length, 1);
    assert.equal(introspectBody.candidate_workflows.length, 0);
    assert.match(introspectBody.demo_surface.merged_text, /Fix export failure/i);
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
});
