import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { createRequestGuards } from "../../src/app/request-guards.ts";
import { createReplayRepairReviewPolicy } from "../../src/app/replay-repair-review-policy.ts";
import { createReplayRuntimeOptionBuilders } from "../../src/app/replay-runtime-options.ts";
import { registerHostErrorHandler } from "../../src/host/http-host.ts";
import { ReplayPlaybookRepairReviewResponseSchema } from "../../src/memory/schemas.ts";
import { registerMemoryReplayGovernedRoutes } from "../../src/routes/memory-replay-governed.ts";
import { applyReplayMemoryWrite } from "../../src/memory/replay-write.ts";
import { createLiteReplayStore } from "../../src/store/lite-replay-store.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { InflightGate } from "../../src/util/inflight_gate.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-replay-governed-"));
  return path.join(dir, `${name}.sqlite`);
}

function buildEnv(overrides: Record<string, unknown> = {}) {
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
    MAX_TEXT_LEN: 10000,
    PII_REDACTION: false,
    ALLOW_CROSS_SCOPE_EDGES: false,
    MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
    MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
    SANDBOX_ENABLED: false,
    SANDBOX_EXECUTOR_MODE: "disabled",
    SANDBOX_EXECUTOR_TIMEOUT_MS: 15000,
    SANDBOX_STDIO_MAX_BYTES: 262144,
    SANDBOX_EXECUTOR_WORKDIR: process.cwd(),
    REPLAY_SHADOW_VALIDATE_EXECUTE_TIMEOUT_MS: 15000,
    REPLAY_SHADOW_VALIDATE_EXECUTE_STOP_ON_FAILURE: true,
    REPLAY_SHADOW_VALIDATE_SANDBOX_TIMEOUT_MS: 15000,
    REPLAY_SHADOW_VALIDATE_SANDBOX_STOP_ON_FAILURE: true,
    REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_PROFILE: "custom",
    REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT: false,
    REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_TARGET_STATUS: "active",
    REPLAY_REPAIR_REVIEW_GATE_REQUIRE_SHADOW_PASS: true,
    REPLAY_REPAIR_REVIEW_GATE_MIN_TOTAL_STEPS: 1,
    REPLAY_REPAIR_REVIEW_GATE_MAX_FAILED_STEPS: 0,
    REPLAY_REPAIR_REVIEW_GATE_MAX_BLOCKED_STEPS: 0,
    REPLAY_REPAIR_REVIEW_GATE_MAX_UNKNOWN_STEPS: 0,
    REPLAY_REPAIR_REVIEW_GATE_MIN_SUCCESS_RATIO: 1,
    REPLAY_REPAIR_REVIEW_POLICY_JSON: "{}",
    REPLAY_LEARNING_PROJECTION_ENABLED: true,
    REPLAY_LEARNING_PROJECTION_MODE: "rule_and_episode",
    REPLAY_LEARNING_PROJECTION_DELIVERY: "async_outbox",
    REPLAY_LEARNING_TARGET_RULE_STATE: "draft",
    REPLAY_LEARNING_MIN_TOTAL_STEPS: 1,
    REPLAY_LEARNING_MIN_SUCCESS_RATIO: 1,
    REPLAY_LEARNING_MAX_MATCHER_BYTES: 16384,
    REPLAY_LEARNING_MAX_TOOL_PREFER: 8,
    EPISODE_GC_TTL_DAYS: 30,
    REPLAY_GUIDED_REPAIR_STRATEGY: "off",
    REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM: false,
    REPLAY_GUIDED_REPAIR_MAX_ERROR_CHARS: 4000,
    REPLAY_GUIDED_REPAIR_HTTP_ENDPOINT: "",
    REPLAY_GUIDED_REPAIR_HTTP_TIMEOUT_MS: 1000,
    REPLAY_GUIDED_REPAIR_HTTP_AUTH_TOKEN: "",
    REPLAY_GUIDED_REPAIR_LLM_BASE_URL: "",
    REPLAY_GUIDED_REPAIR_LLM_API_KEY: "",
    REPLAY_GUIDED_REPAIR_LLM_MODEL: "",
    REPLAY_GUIDED_REPAIR_LLM_TIMEOUT_MS: 1000,
    REPLAY_GUIDED_REPAIR_LLM_MAX_TOKENS: 256,
    REPLAY_GUIDED_REPAIR_LLM_TEMPERATURE: 0,
    ...overrides,
  } as any;
}

function buildRequestGuards() {
  return createRequestGuards({
    env: buildEnv(),
    embedder: null,
    recallLimiter: null,
    debugEmbedLimiter: null,
    writeLimiter: null,
    sandboxWriteLimiter: null,
    sandboxReadLimiter: null,
    recallTextEmbedLimiter: null,
    recallInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
    writeInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
  });
}

async function seedPendingReviewPlaybook(args: {
  writeDbPath: string;
  replayDbPath: string;
  playbookId: string;
}) {
  const liteWriteStore = createLiteWriteStore(args.writeDbPath);
  const liteReplayStore = createLiteReplayStore(args.replayDbPath);
  const sourceClientId = `replay:playbook:${args.playbookId}:v1`;
  const out = await applyReplayMemoryWrite(
    {} as any,
    {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      input_text: `seed pending review playbook ${args.playbookId}`,
      auto_embed: false,
      memory_lane: "private",
      producer_agent_id: "local-user",
      owner_agent_id: "local-user",
      nodes: [
        {
          client_id: sourceClientId,
          type: "procedure",
          title: "Fix export failure",
          text_summary: "Replay playbook pending review",
          slots: {
            replay_kind: "playbook",
            playbook_id: args.playbookId,
            name: "Fix export failure",
            version: 1,
            status: "draft",
            matchers: { task_kind: "repair_export" },
            success_criteria: { status: "success" },
            risk_profile: "medium",
            source_run_id: randomUUID(),
            created_from_run_ids: [randomUUID()],
            policy_constraints: {},
            steps_template: [
              {
                step_index: 1,
                tool_name: "edit",
                preconditions: [],
                postconditions: [],
                safety_level: "needs_confirm",
              },
              {
                step_index: 2,
                tool_name: "test",
                preconditions: [],
                postconditions: [],
                safety_level: "observe_only",
              },
            ],
            repair_patch: {
              note: "normalize export path",
            },
            repair_review: {
              state: "pending_review",
            },
          },
        },
      ],
      edges: [],
    },
    {
      defaultScope: "default",
      defaultTenantId: "default",
      maxTextLen: 10000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      writeAccessShadowMirrorV2: false,
      embedder: null,
      replayMirror: liteReplayStore,
      writeAccess: liteWriteStore,
    },
  );
  assert.ok(out.out.nodes[0]?.id);
  return { liteWriteStore, liteReplayStore };
}

function registerReplayReviewRoute(args: {
  liteWriteStore: ReturnType<typeof createLiteWriteStore>;
  liteReplayStore: ReturnType<typeof createLiteReplayStore>;
}) {
  const env = buildEnv();
  const app = Fastify();
  registerHostErrorHandler(app);
  const guards = createRequestGuards({
    env,
    embedder: null,
    recallLimiter: null,
    debugEmbedLimiter: null,
    writeLimiter: null,
    sandboxWriteLimiter: null,
    sandboxReadLimiter: null,
    recallTextEmbedLimiter: null,
    recallInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
    writeInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
  });
  const runtimeOptions = createReplayRuntimeOptionBuilders({
    env,
    store: {
      withTx: async <T>(fn: (client: any) => Promise<T>) => await fn({} as any),
      withClient: async <T>(fn: (client: any) => Promise<T>) => await fn({} as any),
    },
    embedder: null,
    embeddingSurfacePolicy: undefined,
    embeddedRuntime: null,
    liteReplayAccess: args.liteReplayStore.createReplayAccess(),
    liteReplayStore: args.liteReplayStore,
    sandboxAllowedCommands: [],
    sandboxExecutor: {
      enqueue: () => {},
      executeSync: async () => {},
    },
    writeAccessShadowMirrorV2: false,
    enforceSandboxTenantBudget: async () => {},
  });
  const { withReplayRepairReviewDefaults } = createReplayRepairReviewPolicy({
    env,
    tenantFromBody: guards.tenantFromBody,
    scopeFromBody: guards.scopeFromBody,
  });

  registerMemoryReplayGovernedRoutes({
    app,
    env,
    liteWriteStore: args.liteWriteStore as any,
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions: runtimeOptions.buildReplayRepairReviewOptions,
    buildReplayPlaybookRunOptions: runtimeOptions.buildAutomationReplayRunOptions,
  });

  return { app, runtimeOptions };
}

test("lite replay runtime defaults force sync_inline learning projection delivery", () => {
  const env = buildEnv({ REPLAY_LEARNING_PROJECTION_DELIVERY: "async_outbox" });
  const runtimeOptions = createReplayRuntimeOptionBuilders({
    env,
    store: {
      withTx: async <T>(fn: (client: any) => Promise<T>) => await fn({} as any),
      withClient: async <T>(fn: (client: any) => Promise<T>) => await fn({} as any),
    },
    embedder: null,
    embeddingSurfacePolicy: undefined,
    embeddedRuntime: null,
    liteReplayAccess: null,
    liteReplayStore: null,
    sandboxAllowedCommands: [],
    sandboxExecutor: {
      enqueue: () => {},
      executeSync: async () => {},
    },
    writeAccessShadowMirrorV2: false,
    enforceSandboxTenantBudget: async () => {},
  });

  assert.equal(runtimeOptions.buildReplayRepairReviewOptions().learningProjectionDefaults?.delivery, "sync_inline");
});

test("lite replay repair review applies learning projection inline by default", async () => {
  const dbPath = tmpDbPath("repair-review-inline");
  const playbookId = randomUUID();
  const { liteWriteStore, liteReplayStore } = await seedPendingReviewPlaybook({
    writeDbPath: dbPath,
    replayDbPath: tmpDbPath("repair-review-inline-replay"),
    playbookId,
  });
  const { app } = registerReplayReviewRoute({ liteWriteStore, liteReplayStore });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/v1/memory/replay/playbooks/repair/review",
      payload: {
        tenant_id: "default",
        scope: "default",
        playbook_id: playbookId,
        action: "approve",
        auto_shadow_validate: false,
        target_status_on_approve: "shadow",
        learning_projection: {
          enabled: true,
        },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = ReplayPlaybookRepairReviewResponseSchema.parse(res.json());
    assert.equal(body.learning_projection_result.delivery, "sync_inline");
    assert.equal(body.learning_projection_result.status, "applied");
    assert.ok(body.learning_projection_result.generated_episode_node_id);
    assert.ok(body.learning_projection_result.generated_rule_node_id);

    const { rows: ruleRows } = await liteWriteStore.findNodes({
      scope: "default",
      type: "rule",
      slotsContains: {
        replay_learning: {
          generated_by: "replay_learning_v1",
          source_playbook_id: playbookId,
        },
      },
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 10,
      offset: 0,
    });
    assert.equal(ruleRows.length, 1);
    assert.equal(ruleRows[0]?.id, body.learning_projection_result.generated_rule_node_id);

    const { rows: episodeRows } = await liteWriteStore.findNodes({
      scope: "default",
      id: body.learning_projection_result.generated_episode_node_id,
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 10,
      offset: 0,
    });
    assert.equal(episodeRows.length, 1);
    assert.equal(episodeRows[0]?.slots.replay_learning?.generated_by, "replay_learning_v1");
    assert.equal(episodeRows[0]?.owner_agent_id, "local-user");

    const { rows: anonymousEpisodeRows } = await liteWriteStore.findNodes({
      scope: "default",
      id: body.learning_projection_result.generated_episode_node_id,
      consumerAgentId: null,
      consumerTeamId: null,
      limit: 10,
      offset: 0,
    });
    assert.equal(anonymousEpisodeRows.length, 0);

    const { rows: generatedRuleRows } = await liteWriteStore.findNodes({
      scope: "default",
      id: body.learning_projection_result.generated_rule_node_id,
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 10,
      offset: 0,
    });
    assert.equal(generatedRuleRows.length, 1);
    assert.equal(generatedRuleRows[0]?.owner_agent_id, "local-user");
  } finally {
    await app.close();
    await liteReplayStore.close();
    await liteWriteStore.close();
  }
});

test("lite replay repair review rejects async_outbox learning projection delivery", async () => {
  const dbPath = tmpDbPath("repair-review-async-reject");
  const playbookId = randomUUID();
  const { liteWriteStore, liteReplayStore } = await seedPendingReviewPlaybook({
    writeDbPath: dbPath,
    replayDbPath: tmpDbPath("repair-review-async-reject-replay"),
    playbookId,
  });
  const { app } = registerReplayReviewRoute({ liteWriteStore, liteReplayStore });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/v1/memory/replay/playbooks/repair/review",
      payload: {
        tenant_id: "default",
        scope: "default",
        playbook_id: playbookId,
        action: "approve",
        auto_shadow_validate: false,
        target_status_on_approve: "shadow",
        learning_projection: {
          enabled: true,
          delivery: "async_outbox",
        },
      },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error, "replay_learning_async_outbox_unsupported_in_lite");
  } finally {
    await app.close();
    await liteReplayStore.close();
    await liteWriteStore.close();
  }
});
