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
import { registerSdkDemoMemoryWriteRoutes as registerMemoryWriteRoutes } from "../../src/routes/sdk-demo-memory-write.ts";
import {
  ExecutionMemoryIntrospectionResponseSchema,
  PlanningContextRouteContractSchema,
} from "../../src/memory/schemas.ts";
import { createLiteRecallStore } from "../../src/store/lite-recall-store.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { InflightGate } from "../../src/util/inflight_gate.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-write-workflow-projection-"));
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
    WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    ...overrides,
  } as any;
}

function registerApp(args: {
  app: ReturnType<typeof Fastify>;
  liteWriteStore: ReturnType<typeof createLiteWriteStore>;
  liteRecallStore: ReturnType<typeof createLiteRecallStore>;
  envOverrides?: Record<string, unknown>;
}) {
  const env = buildEnv(args.envOverrides);
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
  registerMemoryWriteRoutes({
    app: args.app,
    env,
    store: {
      withTx: async <T>(fn: (client: any) => Promise<T>) => await fn({} as any),
    },
    embedder: FakeEmbeddingProvider,
    embeddedRuntime: null,
    liteWriteStore: args.liteWriteStore,
    writeAccessForClient: () => args.liteWriteStore,
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    runTopicClusterForEventIds: async () => ({ processed_events: 0 }),
    executionStateStore: null,
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
}

function buildExecutionWritePayload(args: {
  eventId: string;
  title: string;
  inputText: string;
  taskBrief: string;
  stateId: string;
  filePath: string;
  modifiedFiles: string[];
  ownedFiles?: string[];
  workflowPromotionGovernanceReview?: Record<string, unknown>;
}) {
  const updatedAt = "2026-03-21T12:00:00.000Z";
  return {
    tenant_id: "default",
    scope: "default",
    input_text: args.inputText,
    auto_embed: true,
    memory_lane: "private",
    nodes: [
      {
        client_id: `execution-event:${args.eventId}`,
        type: "event",
        title: args.title,
        text_summary: args.taskBrief,
        slots: {
          summary_kind: "handoff",
          execution_state_v1: {
            version: 1,
            state_id: args.stateId,
            scope: `aionis://execution/${args.stateId}`,
            task_brief: args.taskBrief,
            current_stage: "patch",
            active_role: "patch",
            owned_files: args.ownedFiles ?? [],
            modified_files: args.modifiedFiles,
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
            target_files: args.modifiedFiles,
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
          ...(args.workflowPromotionGovernanceReview
            ? { workflow_promotion_governance_review: args.workflowPromotionGovernanceReview }
            : {}),
        },
      },
    ],
    edges: [],
  };
}

function buildPacketOnlyWritePayload(args: {
  eventId: string;
  title: string;
  inputText: string;
  taskBrief: string;
  stateId: string;
  filePath: string;
  targetFiles: string[];
}) {
  return {
    tenant_id: "default",
    scope: "default",
    input_text: args.inputText,
    auto_embed: true,
    memory_lane: "private",
    nodes: [
      {
        client_id: `packet-only-event:${args.eventId}`,
        type: "event",
        title: args.title,
        text_summary: args.taskBrief,
        slots: {
          summary_kind: "handoff",
          execution_packet_v1: {
            version: 1,
            state_id: args.stateId,
            current_stage: "patch",
            active_role: "patch",
            task_brief: args.taskBrief,
            target_files: args.targetFiles,
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
        },
      },
    ],
    edges: [],
  };
}

function buildLightweightHandoffWritePayload(args: {
  eventId: string;
  title: string;
  inputText: string;
  taskBrief: string;
  filePath: string;
  targetFiles: string[];
}) {
  return {
    tenant_id: "default",
    scope: "default",
    input_text: args.inputText,
    auto_embed: true,
    memory_lane: "private",
    nodes: [
      {
        client_id: `lightweight-handoff-event:${args.eventId}`,
        type: "event",
        title: args.title,
        text_summary: args.taskBrief,
        slots: {
          summary_kind: "handoff",
          handoff_kind: "patch_handoff",
          anchor: `resume:${args.filePath}`,
          file_path: args.filePath,
          repo_root: "/Volumes/ziel/Aionisgo",
          target_files: args.targetFiles,
          next_action: `Patch ${args.filePath} and rerun export tests`,
          acceptance_checks: ["npm run -s test:lite -- export"],
        },
      },
    ],
    edges: [],
  };
}

test("memory/write projects execution-state-backed writes into workflow candidates and then auto-promotes stable workflow guidance", async () => {
  const dbPath = tmpDbPath("projection");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    registerApp({ app, liteWriteStore, liteRecallStore });

    const firstWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildExecutionWritePayload({
        eventId: randomUUID(),
        title: "Patch export resolver",
        inputText: "continue fixing export resolver",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
        modifiedFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

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
    assert.equal(firstBody.workflow_signals.length, 1);
    assert.equal(firstBody.workflow_signals[0]?.promotion_ready, false);
    assert.match(firstBody.planning_summary.planner_explanation, /candidate workflows visible but not yet promoted/i);
    assert.ok(!("layered_context" in (firstBody as Record<string, unknown>)));

    const secondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildExecutionWritePayload({
        eventId: randomUUID(),
        title: "Patch export resolver again",
        inputText: "continue fixing export resolver second run",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
        modifiedFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(secondWrite.statusCode, 200);
    const storedStable = await liteWriteStore.findNodes({
      scope: "default",
      type: "procedure",
      slotsContains: {
        summary_kind: "workflow_anchor",
      },
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 20,
      offset: 0,
    });
    const stableWorkflowNode = storedStable.rows.find((row) => {
      const projection = (row.slots?.workflow_write_projection ?? null) as Record<string, unknown> | null;
      return projection?.auto_promoted === true;
    }) ?? null;
    assert.ok(stableWorkflowNode);
    const stableProjection = (stableWorkflowNode.slots?.workflow_write_projection ?? {}) as Record<string, unknown>;
    const governancePreview = (stableProjection.governance_preview ?? {}) as Record<string, unknown>;
    const promotePreview = (governancePreview.promote_memory ?? {}) as Record<string, unknown>;
    const reviewPacket = (promotePreview.review_packet ?? {}) as Record<string, unknown>;
    const decisionTrace = (promotePreview.decision_trace ?? {}) as Record<string, unknown>;
    const policyEffect = (promotePreview.policy_effect ?? {}) as Record<string, unknown>;
    assert.equal(reviewPacket.operation, "promote_memory");
    assert.equal(reviewPacket.requested_target_kind, "workflow");
    assert.equal(reviewPacket.requested_target_level, "L2");
    assert.equal(decisionTrace.review_supplied, false);
    assert.deepEqual(decisionTrace.stage_order, ["review_packet_built", "policy_effect_derived"]);
    assert.equal(policyEffect.applies, false);
    assert.equal(policyEffect.reason_code, "review_not_supplied");

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
    assert.equal(secondBody.workflow_signals.length, 1);
    assert.equal(secondBody.workflow_signals[0]?.promotion_state, "stable");
    assert.match(secondBody.planning_summary.planner_explanation, /workflow guidance:/i);

    const introspectAfterSecondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: {
        tenant_id: "default",
        scope: "default",
        limit: 8,
      },
    });
    assert.equal(introspectAfterSecondWrite.statusCode, 200);
    const introspectBody = ExecutionMemoryIntrospectionResponseSchema.parse(introspectAfterSecondWrite.json());
    assert.equal(introspectBody.recommended_workflows.length, 1);
    assert.equal(introspectBody.candidate_workflows.length, 0);
    assert.equal(introspectBody.workflow_signal_summary.stable_workflow_count, 1);
    assert.equal(introspectBody.workflow_signal_summary.promotion_ready_workflow_count, 0);
    assert.equal(introspectBody.inventory.raw_workflow_candidate_count, 2);
    assert.equal(introspectBody.inventory.suppressed_candidate_workflow_count, 2);

    const fixedSourcePayload = buildExecutionWritePayload({
      eventId: "fixed-source-event",
      title: "Patch export resolver retry",
      inputText: "continue fixing export resolver retry",
      taskBrief: "Fix export failure in node tests",
      stateId: "state:fixed-retry",
      filePath: "src/routes/export.ts",
      modifiedFiles: ["src/routes/export.ts"],
    });

    const initialFixedSourceWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: fixedSourcePayload,
    });
    assert.equal(initialFixedSourceWrite.statusCode, 200);

    const retryWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: fixedSourcePayload,
    });
    assert.equal(retryWrite.statusCode, 200);

    const retryIntrospect = await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: {
        tenant_id: "default",
        scope: "default",
        limit: 8,
      },
    });
    assert.equal(retryIntrospect.statusCode, 200);
    const retryBody = ExecutionMemoryIntrospectionResponseSchema.parse(retryIntrospect.json());
    assert.equal(retryBody.recommended_workflows.length, 1);
    assert.equal(retryBody.candidate_workflows.length, 0);
    assert.equal(retryBody.workflow_signal_summary.stable_workflow_count, 1);
    assert.equal(retryBody.workflow_signal_summary.promotion_ready_workflow_count, 0);
    assert.equal(retryBody.inventory.raw_workflow_candidate_count, 2);
    assert.equal(retryBody.inventory.suppressed_candidate_workflow_count, 2);
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
});

test("memory/write stable workflow governance preview evaluates admitted review results and records runtime apply", async () => {
  const dbPath = tmpDbPath("projection-governance-review");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    registerApp({ app, liteWriteStore, liteRecallStore });

    const firstWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildExecutionWritePayload({
        eventId: randomUUID(),
        title: "Patch export resolver",
        inputText: "continue fixing export resolver",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
        modifiedFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

    const secondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildExecutionWritePayload({
        eventId: randomUUID(),
        title: "Patch export resolver with governance review",
        inputText: "continue fixing export resolver second run",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
        modifiedFiles: ["src/routes/export.ts"],
        workflowPromotionGovernanceReview: {
          promote_memory: {
            review_result: {
              review_version: "promote_memory_semantic_review_v1",
              adjudication: {
                operation: "promote_memory",
                disposition: "recommend",
                target_kind: "workflow",
                target_level: "L2",
                reason: "stable workflow promotion is strategically valuable here",
                confidence: 0.92,
                strategic_value: "high",
              },
            },
          },
        },
      }),
    });
    assert.equal(secondWrite.statusCode, 200);

    const storedStable = await liteWriteStore.findNodes({
      scope: "default",
      type: "procedure",
      slotsContains: {
        summary_kind: "workflow_anchor",
      },
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 20,
      offset: 0,
    });
    const stableWorkflowNode = storedStable.rows.find((row) => {
      const projection = (row.slots?.workflow_write_projection ?? null) as Record<string, unknown> | null;
      return projection?.auto_promoted === true;
    }) ?? null;
    assert.ok(stableWorkflowNode);

    const stableProjection = (stableWorkflowNode.slots?.workflow_write_projection ?? {}) as Record<string, unknown>;
    const governancePreview = (stableProjection.governance_preview ?? {}) as Record<string, unknown>;
    const promotePreview = (governancePreview.promote_memory ?? {}) as Record<string, unknown>;
    const reviewResult = (promotePreview.review_result ?? {}) as Record<string, unknown>;
    const admissibility = (promotePreview.admissibility ?? {}) as Record<string, unknown>;
    const policyEffect = (promotePreview.policy_effect ?? {}) as Record<string, unknown>;
    const decisionTrace = (promotePreview.decision_trace ?? {}) as Record<string, unknown>;

    assert.equal(reviewResult.review_version, "promote_memory_semantic_review_v1");
    assert.equal(admissibility.admissible, true);
    assert.equal(policyEffect.applies, true);
    assert.equal(policyEffect.reason_code, "high_confidence_workflow_promotion");
    assert.equal(decisionTrace.review_supplied, true);
    assert.equal(decisionTrace.admissibility_evaluated, true);
    assert.equal(decisionTrace.admissible, true);
    assert.equal(decisionTrace.runtime_apply_changed_promotion_state, true);
    assert.deepEqual(decisionTrace.stage_order, [
      "review_packet_built",
      "review_result_received",
      "admissibility_evaluated",
      "policy_effect_derived",
      "runtime_policy_applied",
    ]);
    assert.equal(stableProjection.governed_promotion_state_override, "stable");

    const planning = await app.inject({
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
    assert.equal(planning.statusCode, 200);
    const planningBody = PlanningContextRouteContractSchema.parse(planning.json());
    assert.equal(planningBody.planner_packet.sections.recommended_workflows.length, 1);
    assert.equal(planningBody.workflow_signals[0]?.promotion_state, "stable");
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
});

test("memory/write stable workflow governance can use internal static provider without explicit review", async () => {
  const dbPath = tmpDbPath("projection-governance-provider");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    registerApp({
      app,
      liteWriteStore,
      liteRecallStore,
      envOverrides: {
        WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
      },
    });

    const firstWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildExecutionWritePayload({
        eventId: randomUUID(),
        title: "Patch export resolver",
        inputText: "continue fixing export resolver",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
        modifiedFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

    const secondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildExecutionWritePayload({
        eventId: randomUUID(),
        title: "Patch export resolver with provider",
        inputText: "continue fixing export resolver second run",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
        modifiedFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(secondWrite.statusCode, 200);

    const storedStable = await liteWriteStore.findNodes({
      scope: "default",
      type: "procedure",
      slotsContains: {
        summary_kind: "workflow_anchor",
      },
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 20,
      offset: 0,
    });
    const stableWorkflowNode = storedStable.rows.find((row) => {
      const projection = (row.slots?.workflow_write_projection ?? null) as Record<string, unknown> | null;
      return projection?.auto_promoted === true;
    }) ?? null;
    assert.ok(stableWorkflowNode);

    const stableProjection = (stableWorkflowNode.slots?.workflow_write_projection ?? {}) as Record<string, unknown>;
    const governancePreview = (stableProjection.governance_preview ?? {}) as Record<string, unknown>;
    const promotePreview = (governancePreview.promote_memory ?? {}) as Record<string, unknown>;
    const reviewResult = (promotePreview.review_result ?? {}) as Record<string, unknown>;
    const decisionTrace = (promotePreview.decision_trace ?? {}) as Record<string, unknown>;

    assert.equal(reviewResult.review_version, "promote_memory_semantic_review_v1");
    assert.equal(reviewResult.adjudication?.reason, "static provider found workflow-signature evidence");
    assert.equal(promotePreview.admissibility?.admissible, true);
    assert.equal(promotePreview.policy_effect?.applies, true);
    assert.equal(promotePreview.policy_effect?.effective_promotion_state, "stable");
    assert.equal(decisionTrace.review_supplied, true);
    assert.equal(decisionTrace.runtime_apply_changed_promotion_state, true);
    assert.equal(stableProjection.governed_promotion_state_override, "stable");
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
});

test("memory/write also projects packet-only execution continuity writes into workflow candidates", async () => {
  const dbPath = tmpDbPath("packet-only-projection");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    registerApp({ app, liteWriteStore, liteRecallStore });

    const firstWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildPacketOnlyWritePayload({
        eventId: randomUUID(),
        title: "Packet-only export repair",
        inputText: "continue packet-only export repair",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
        targetFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

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
    assert.equal(firstBody.workflow_signals[0]?.promotion_ready, false);

    const secondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildPacketOnlyWritePayload({
        eventId: randomUUID(),
        title: "Packet-only export repair second run",
        inputText: "continue packet-only export repair second run",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
        targetFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(secondWrite.statusCode, 200);

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
    assert.match(introspectBody.demo_surface.merged_text, /tools=edit, test/i);
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
});

test("memory/write projects lightweight handoff-style continuity through the generic workflow producer", async () => {
  const dbPath = tmpDbPath("lightweight-handoff-projection");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    registerApp({ app, liteWriteStore, liteRecallStore });

    const firstWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildLightweightHandoffWritePayload({
        eventId: randomUUID(),
        title: "Lightweight export repair handoff",
        inputText: "continue lightweight export repair",
        taskBrief: "Fix export failure in node tests",
        filePath: "src/routes/export.ts",
        targetFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

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
    assert.equal(firstBody.workflow_signals[0]?.promotion_ready, false);

    const secondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildLightweightHandoffWritePayload({
        eventId: randomUUID(),
        title: "Lightweight export repair handoff second run",
        inputText: "continue lightweight export repair second run",
        taskBrief: "Fix export failure in node tests",
        filePath: "src/routes/export.ts",
        targetFiles: ["src/routes/export.ts"],
      }),
    });
    assert.equal(secondWrite.statusCode, 200);

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
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
});
