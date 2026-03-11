import { ZodError } from "zod";
import { CAPABILITY_CONTRACT } from "../capability-contract.js";
import type { Env } from "../config.js";
import { recordMemoryRequestTelemetry } from "../control-plane.js";
import {
  RECALL_STORE_ACCESS_CAPABILITY_VERSION,
} from "../store/recall-access.js";
import {
  REPLAY_STORE_ACCESS_CAPABILITY_VERSION,
} from "../store/replay-access.js";
import {
  WRITE_STORE_ACCESS_CAPABILITY_VERSION,
} from "../store/write-access.js";
import { registerAdminControlAlertRoutes } from "../routes/admin-control-alerts.js";
import { registerAdminControlConfigRoutes } from "../routes/admin-control-config.js";
import { registerAdminControlDashboardRoutes } from "../routes/admin-control-dashboard.js";
import { registerAdminControlEntityRoutes } from "../routes/admin-control-entities.js";
import { registerAutomationRoutes } from "../routes/automations.js";
import { registerMemoryAccessRoutes } from "../routes/memory-access.js";
import { registerMemoryContextRuntimeRoutes } from "../routes/memory-context-runtime.js";
import { registerMemoryFeedbackToolRoutes } from "../routes/memory-feedback-tools.js";
import { registerMemoryLifecycleRoutes } from "../routes/memory-lifecycle.js";
import { registerMemoryRecallRoutes } from "../routes/memory-recall.js";
import { registerMemoryReplayCoreRoutes } from "../routes/memory-replay-core.js";
import { registerMemoryReplayGovernedRoutes } from "../routes/memory-replay-governed.js";
import { registerMemorySandboxRoutes } from "../routes/memory-sandbox.js";
import { registerMemoryWriteRoutes } from "../routes/memory-write.js";
import { buildLiteRouteMatrix, registerLiteServerOnlyRoutes } from "./lite-edition.js";
import { HttpError } from "../util/http.js";

export function registerHostErrorHandler(app: any) {
  app.setErrorHandler((err: unknown, req: any, reply: any) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "invalid_request",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details ?? undefined });
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "internal_error", message: "internal error" });
  });
}

export function logMemoryApiConfig(args: {
  app: any;
  env: Env;
  embedder: any;
  embeddedRuntime: any;
  recallStoreCapabilities: any;
  writeStoreCapabilities: any;
  storeFeatureCapabilities: any;
  sandboxRemoteAllowedHosts: Set<string>;
  sandboxTenantBudgetPolicy: Map<string, unknown>;
  recallTextEmbedCache: unknown;
  globalRecallProfileDefaults: unknown;
  recallProfilePolicy: unknown;
  recallTextEmbedBatcher: unknown;
}) {
  const {
    app,
    env,
    embedder,
    embeddedRuntime,
    recallStoreCapabilities,
    writeStoreCapabilities,
    storeFeatureCapabilities,
    sandboxRemoteAllowedHosts,
    sandboxTenantBudgetPolicy,
    recallTextEmbedCache,
    globalRecallProfileDefaults,
    recallProfilePolicy,
    recallTextEmbedBatcher,
  } = args;

  app.log.info(
    {
      aionis_mode: env.AIONIS_MODE,
      aionis_edition: env.AIONIS_EDITION,
      app_env: env.APP_ENV,
      embedding_provider: embedder?.name ?? "none",
      embedding_dim: embedder?.dim ?? null,
      scope: env.MEMORY_SCOPE,
      tenant_id: env.MEMORY_TENANT_ID,
      memory_store_backend: env.MEMORY_STORE_BACKEND,
      memory_store_embedded_experimental_enabled: env.MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED,
      memory_store_embedded_runtime: embeddedRuntime ? "in_memory_v1" : null,
      memory_store_embedded_snapshot_path: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_PATH : null,
      memory_store_embedded_autosave: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_AUTOSAVE : null,
      memory_store_embedded_snapshot_max_bytes: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BYTES : null,
      memory_store_embedded_snapshot_max_backups: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BACKUPS : null,
      memory_store_embedded_snapshot_strict_max_bytes: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_STRICT_MAX_BYTES : null,
      memory_store_embedded_snapshot_compaction_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_ENABLED : null,
      memory_store_embedded_snapshot_compaction_max_rounds: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_MAX_ROUNDS : null,
      memory_store_embedded_shadow_mirror_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED : null,
      memory_store_embedded_recall_debug_embeddings_enabled: embeddedRuntime
        ? env.MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED
        : null,
      memory_store_embedded_recall_audit_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED : null,
      memory_store_embedded_session_graph_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SESSION_GRAPH_ENABLED : null,
      memory_store_embedded_pack_export_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_PACK_EXPORT_ENABLED : null,
      memory_store_embedded_pack_import_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_PACK_IMPORT_ENABLED : null,
      memory_store_recall_capabilities: recallStoreCapabilities,
      memory_store_write_capabilities: writeStoreCapabilities,
      memory_store_feature_capabilities: storeFeatureCapabilities,
      memory_store_capability_contract: CAPABILITY_CONTRACT,
      recall_store_access_capability_version: RECALL_STORE_ACCESS_CAPABILITY_VERSION,
      replay_store_access_capability_version: REPLAY_STORE_ACCESS_CAPABILITY_VERSION,
      write_store_access_capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
      trust_proxy: env.TRUST_PROXY,
      cors_memory_allow_origins: process.env.CORS_ALLOW_ORIGINS ?? (env.APP_ENV === "prod" ? "" : "*"),
      cors_admin_allow_origins: process.env.CORS_ADMIN_ALLOW_ORIGINS ?? "",
      auth_mode: env.MEMORY_AUTH_MODE,
      sandbox_enabled: env.SANDBOX_ENABLED,
      sandbox_admin_only: env.SANDBOX_ADMIN_ONLY,
      sandbox_executor_mode: env.SANDBOX_EXECUTOR_MODE,
      sandbox_executor_max_concurrency: env.SANDBOX_EXECUTOR_MAX_CONCURRENCY,
      sandbox_remote_executor_configured: env.SANDBOX_EXECUTOR_MODE === "http_remote" ? !!env.SANDBOX_REMOTE_EXECUTOR_URL.trim() : false,
      sandbox_remote_executor_allowlist_count: sandboxRemoteAllowedHosts.size,
      sandbox_run_heartbeat_interval_ms: env.SANDBOX_RUN_HEARTBEAT_INTERVAL_MS,
      sandbox_run_stale_after_ms: env.SANDBOX_RUN_STALE_AFTER_MS,
      sandbox_run_recovery_poll_interval_ms: env.SANDBOX_RUN_RECOVERY_POLL_INTERVAL_MS,
      sandbox_tenant_budget_window_hours: env.SANDBOX_TENANT_BUDGET_WINDOW_HOURS,
      sandbox_tenant_budget_tenant_count: sandboxTenantBudgetPolicy.size,
      tenant_quota_enabled: env.TENANT_QUOTA_ENABLED,
      control_tenant_quota_cache_ttl_ms: env.CONTROL_TENANT_QUOTA_CACHE_TTL_MS,
      control_telemetry_retention_hours: env.CONTROL_TELEMETRY_RETENTION_HOURS,
      control_telemetry_purge_batch_limit: env.CONTROL_TELEMETRY_PURGE_BATCH_LIMIT,
      recall_text_embed_cache_enabled: !!recallTextEmbedCache,
      recall_text_embed_cache_ttl_ms: env.RECALL_TEXT_EMBED_CACHE_TTL_MS,
      memory_recall_profile: env.MEMORY_RECALL_PROFILE,
      memory_recall_profile_defaults: globalRecallProfileDefaults,
      memory_recall_profile_policy: recallProfilePolicy,
      memory_recall_adaptive_downgrade_enabled: env.MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED,
      memory_recall_adaptive_wait_ms: env.MEMORY_RECALL_ADAPTIVE_WAIT_MS,
      memory_recall_adaptive_target_profile: env.MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE,
      memory_recall_adaptive_hard_cap_enabled: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_ENABLED,
      memory_recall_adaptive_hard_cap_wait_ms: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS,
      memory_recall_adaptive_hard_cap_defaults: {
        limit: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_LIMIT,
        neighborhood_hops: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_NEIGHBORHOOD_HOPS,
        max_nodes: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_NODES,
        max_edges: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_EDGES,
        ranked_limit: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_RANKED_LIMIT,
        min_edge_weight: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_WEIGHT,
        min_edge_confidence: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_CONFIDENCE,
      },
      memory_recall_stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
      memory_planning_context_optimization_profile_default: env.MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT,
      memory_context_assemble_optimization_profile_default: env.MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT,
      memory_abstraction_policy_profile: env.MEMORY_ABSTRACTION_POLICY_PROFILE,
      topic_cluster_defaults: {
        sim_threshold: env.TOPIC_SIM_THRESHOLD,
        min_events_per_topic: env.TOPIC_MIN_EVENTS_PER_TOPIC,
        batch_size: env.TOPIC_CLUSTER_BATCH_SIZE,
        max_candidates_per_event: env.TOPIC_MAX_CANDIDATES_PER_EVENT,
        strategy: env.TOPIC_CLUSTER_STRATEGY,
      },
      compression_rollup_defaults: {
        lookback_days: env.MEMORY_COMPRESSION_LOOKBACK_DAYS,
        topic_min_events: env.MEMORY_COMPRESSION_TOPIC_MIN_EVENTS,
        max_topics_per_run: env.MEMORY_COMPRESSION_MAX_TOPICS_PER_RUN,
        max_events_per_topic: env.MEMORY_COMPRESSION_MAX_EVENTS_PER_TOPIC,
        max_text_len: env.MEMORY_COMPRESSION_MAX_TEXT_LEN,
      },
      write_rate_limit_wait_ms: env.WRITE_RATE_LIMIT_MAX_WAIT_MS,
      tenant_write_rate_limit_wait_ms: env.TENANT_WRITE_RATE_LIMIT_MAX_WAIT_MS,
      recall_text_embed_rate_limit_rps: env.RECALL_TEXT_EMBED_RATE_LIMIT_RPS,
      tenant_recall_text_embed_rate_limit_rps: env.TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_RPS,
      recall_text_embed_batch_enabled: !!recallTextEmbedBatcher,
      recall_text_embed_batch_max_size: env.RECALL_TEXT_EMBED_BATCH_MAX_SIZE,
      recall_text_embed_batch_max_wait_ms: env.RECALL_TEXT_EMBED_BATCH_MAX_WAIT_MS,
      recall_text_embed_batch_max_inflight: env.RECALL_TEXT_EMBED_BATCH_MAX_INFLIGHT,
      db_pool_max: env.DB_POOL_MAX,
      api_recall_max_inflight: env.API_RECALL_MAX_INFLIGHT,
      api_recall_queue_max: env.API_RECALL_QUEUE_MAX,
      api_write_max_inflight: env.API_WRITE_MAX_INFLIGHT,
      api_write_queue_max: env.API_WRITE_QUEUE_MAX,
      shadow_dual_write_enabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
      shadow_dual_write_strict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
    },
    "memory api config",
  );
}

export function registerHostRequestHooks(args: {
  app: any;
  db: any;
  resolveCorsPolicy: (req: any) => any;
  resolveCorsAllowOrigin: (origin: string | null, allowOrigins: string[]) => string | null;
  telemetryEndpointFromRequest: (req: any) => any;
  resolveRequestTenantForTelemetry: (req: any) => string;
  resolveRequestScopeForTelemetry: (req: any) => string;
  resolveRequestApiKeyPrefixForTelemetry: (req: any) => string | null;
}) {
  const {
    app,
    db,
    resolveCorsPolicy,
    resolveCorsAllowOrigin,
    telemetryEndpointFromRequest,
    resolveRequestTenantForTelemetry,
    resolveRequestScopeForTelemetry,
    resolveRequestApiKeyPrefixForTelemetry,
  } = args;

  app.addHook("onRequest", async (req: any, reply: any) => {
    (req as any).aionis_t0_ms = performance.now();
    reply.header("x-request-id", req.id);

    const origin = typeof req.headers.origin === "string" ? req.headers.origin : null;
    const corsPolicy = resolveCorsPolicy(req);
    const allowOrigin = corsPolicy ? resolveCorsAllowOrigin(origin, corsPolicy.allow_origins) : null;
    if (allowOrigin && corsPolicy) {
      reply.header("access-control-allow-origin", allowOrigin);
      if (allowOrigin !== "*") reply.header("vary", "Origin");
      reply.header("access-control-allow-methods", corsPolicy.allow_methods);
      reply.header("access-control-allow-headers", corsPolicy.allow_headers);
      reply.header("access-control-expose-headers", corsPolicy.expose_headers);
      reply.header("access-control-max-age", "600");
    }

    if (req.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  app.addHook("onResponse", async (req: any, reply: any) => {
    const endpoint = telemetryEndpointFromRequest(req);
    if (!endpoint) return;
    const t0 = Number((req as any).aionis_t0_ms ?? Number.NaN);
    const latencyMs = Number.isFinite(t0) ? Math.max(0, performance.now() - t0) : 0;
    const tenantId = resolveRequestTenantForTelemetry(req);
    const scope = resolveRequestScopeForTelemetry(req);
    try {
      await recordMemoryRequestTelemetry(db, {
        tenant_id: tenantId,
        scope,
        endpoint,
        status_code: Number(reply.statusCode ?? 0),
        latency_ms: latencyMs,
        api_key_prefix: resolveRequestApiKeyPrefixForTelemetry(req),
        request_id: String(req.id ?? ""),
      });
    } catch (err) {
      req.log.warn({ err, endpoint, tenant_id: tenantId }, "request telemetry insert failed");
    }
  });
}

export function registerHealthRoute(args: {
  app: any;
  env: Env;
  healthDatabaseTargetHash: string | null;
  embeddedRuntime: any;
  recallStoreCapabilities: any;
  writeStoreCapabilities: any;
  storeFeatureCapabilities: any;
  sandboxExecutor: any;
  sandboxTenantBudgetPolicy: Map<string, unknown>;
  sandboxRemoteAllowedCidrs: Set<string>;
}) {
  const {
    app,
    env,
    healthDatabaseTargetHash,
    embeddedRuntime,
    recallStoreCapabilities,
    writeStoreCapabilities,
    storeFeatureCapabilities,
    sandboxExecutor,
    sandboxTenantBudgetPolicy,
    sandboxRemoteAllowedCidrs,
  } = args;

  app.get("/health", async () => ({
    ok: true,
    aionis_edition: env.AIONIS_EDITION,
    database_target_hash: healthDatabaseTargetHash,
    memory_store_backend: env.MEMORY_STORE_BACKEND,
    memory_store_embedded_experimental_enabled: env.MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED,
    memory_store_embedded_runtime: embeddedRuntime ? "in_memory_v1" : null,
    memory_store_embedded_snapshot_path: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_PATH : null,
    memory_store_embedded_autosave: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_AUTOSAVE : null,
    memory_store_embedded_snapshot_max_bytes: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BYTES : null,
    memory_store_embedded_snapshot_max_backups: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BACKUPS : null,
    memory_store_embedded_snapshot_strict_max_bytes: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_STRICT_MAX_BYTES : null,
    memory_store_embedded_snapshot_compaction_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_ENABLED : null,
    memory_store_embedded_snapshot_compaction_max_rounds: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_MAX_ROUNDS : null,
    memory_store_embedded_shadow_mirror_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED : null,
    memory_store_embedded_recall_debug_embeddings_enabled: embeddedRuntime
      ? env.MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED
      : null,
    memory_store_embedded_recall_audit_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED : null,
    memory_store_embedded_session_graph_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_SESSION_GRAPH_ENABLED : null,
    memory_store_embedded_pack_export_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_PACK_EXPORT_ENABLED : null,
    memory_store_embedded_pack_import_enabled: embeddedRuntime ? env.MEMORY_STORE_EMBEDDED_PACK_IMPORT_ENABLED : null,
    memory_store_embedded_snapshot_metrics: embeddedRuntime ? embeddedRuntime.getSnapshotMetrics() : null,
    memory_store_recall_capabilities: recallStoreCapabilities,
    memory_store_write_capabilities: writeStoreCapabilities,
    memory_store_feature_capabilities: storeFeatureCapabilities,
    memory_store_capability_contract: CAPABILITY_CONTRACT,
    recall_store_access_capability_version: RECALL_STORE_ACCESS_CAPABILITY_VERSION,
    replay_store_access_capability_version: REPLAY_STORE_ACCESS_CAPABILITY_VERSION,
    write_store_access_capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
    sandbox: sandboxExecutor.healthSnapshot(),
    sandbox_tenant_budget_window_hours: env.SANDBOX_TENANT_BUDGET_WINDOW_HOURS,
    sandbox_tenant_budget_tenant_count: sandboxTenantBudgetPolicy.size,
    sandbox_remote_egress_cidr_count: sandboxRemoteAllowedCidrs.size,
    sandbox_remote_deny_private_ips: env.SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS,
    sandbox_artifact_object_store_base_uri_configured: !!env.SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI.trim(),
    lite_route_matrix: env.AIONIS_EDITION === "lite" ? buildLiteRouteMatrix() : null,
  }));
}

export function registerApplicationRoutes(args: Record<string, any>) {
  const {
    app,
    env,
    db,
    store,
    embedder,
    embeddedRuntime,
    liteReplayAccess,
    liteReplayStore,
    recallTextEmbedBatcher,
    recallAccessForClient,
    writeStoreCapabilities,
    requireAdminToken,
    requireStoreFeatureCapability,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    enforceRecallTextEmbedQuota,
    buildRecallAuth,
    tenantFromBody,
    scopeFromBody,
    projectFromBody,
    acquireInflightSlot,
    hasExplicitRecallKnobs,
    resolveRecallProfile,
    resolveExplicitRecallMode,
    resolveClassAwareRecallProfile,
    withRecallProfileDefaults,
    resolveRecallStrategy,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs,
    buildRecallTrajectory,
    embedRecallTextQuery,
    mapRecallTextEmbeddingError,
    recordContextAssemblyTelemetryBestEffort,
    withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions,
    buildAutomationReplayRunOptions,
    buildAutomationTestHook,
    sandboxExecutor,
    enforceSandboxTenantBudget,
    writeAccessForClient,
    runTopicClusterForEventIds,
    emitControlAudit,
    tenantQuotaResolver,
    listSandboxBudgetProfiles,
    getSandboxBudgetProfile,
    upsertSandboxBudgetProfile,
    deleteSandboxBudgetProfile,
    listSandboxProjectBudgetProfiles,
    getSandboxProjectBudgetProfile,
    upsertSandboxProjectBudgetProfile,
    deleteSandboxProjectBudgetProfile,
  } = args;

  if (env.AIONIS_EDITION === "lite") {
    registerLiteServerOnlyRoutes(app);
  } else {
    registerAdminControlEntityRoutes({
      app,
      db,
      requireAdminToken,
      emitControlAudit,
    });

    registerAdminControlAlertRoutes({
      app,
      db,
      env,
      store,
      requireAdminToken,
      emitControlAudit,
    });

    registerAdminControlConfigRoutes({
      app,
      db,
      requireAdminToken,
      emitControlAudit,
      tenantQuotaResolver,
      listSandboxBudgetProfiles,
      getSandboxBudgetProfile,
      upsertSandboxBudgetProfile,
      deleteSandboxBudgetProfile,
      listSandboxProjectBudgetProfiles,
      getSandboxProjectBudgetProfile,
      upsertSandboxProjectBudgetProfile,
      deleteSandboxProjectBudgetProfile,
    });

    registerAdminControlDashboardRoutes({
      app,
      db,
      env,
      requireAdminToken,
    });
  }

  registerMemoryWriteRoutes({
    app,
    env,
    store,
    embedder,
    embeddedRuntime,
    writeAccessForClient,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    runTopicClusterForEventIds,
  });

  registerMemoryLifecycleRoutes({
    app,
    env,
    store,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
  });

  registerMemoryAccessRoutes({
    app,
    env,
    store,
    embedder,
    embeddedRuntime,
    writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
    requireAdminToken,
    requireStoreFeatureCapability,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  });

  registerMemoryRecallRoutes({
    app,
    env,
    store,
    embeddedRuntime,
    recallAccessForClient,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    hasExplicitRecallKnobs,
    resolveRecallProfile,
    resolveExplicitRecallMode,
    withRecallProfileDefaults,
    resolveRecallStrategy,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs,
    buildRecallTrajectory,
    buildRecallAuth,
  });

  registerMemoryContextRuntimeRoutes({
    app,
    env,
    store,
    embedder,
    embeddedRuntime,
    recallTextEmbedBatcher,
    recallAccessForClient,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    enforceRecallTextEmbedQuota,
    buildRecallAuth,
    tenantFromBody,
    acquireInflightSlot,
    hasExplicitRecallKnobs,
    resolveRecallProfile,
    resolveExplicitRecallMode,
    resolveClassAwareRecallProfile,
    withRecallProfileDefaults,
    resolveRecallStrategy,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs,
    buildRecallTrajectory,
    embedRecallTextQuery,
    mapRecallTextEmbeddingError,
    recordContextAssemblyTelemetryBestEffort,
  });

  registerMemoryFeedbackToolRoutes({
    app,
    env,
    store,
    embeddedRuntime,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  });

  registerMemoryReplayCoreRoutes({
    app,
    env,
    store,
    embedder,
    embeddedRuntime,
    liteReplayAccess,
    liteReplayStore,
    writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  });

  registerMemoryReplayGovernedRoutes({
    app,
    store,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions,
    buildReplayPlaybookRunOptions: buildAutomationReplayRunOptions,
  });

  if (env.AIONIS_EDITION !== "lite") {
    registerAutomationRoutes({
      app,
      env,
      store,
      requireMemoryPrincipal,
      withIdentityFromRequest,
      enforceRateLimit,
      enforceTenantQuota,
      tenantFromBody,
      acquireInflightSlot,
      buildAutomationReplayRunOptions,
      buildAutomationTestHook,
    });
  }

  registerMemorySandboxRoutes({
    app,
    env,
    store,
    sandboxExecutor,
    requireAdminToken,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    scopeFromBody,
    projectFromBody,
    enforceSandboxTenantBudget,
  });
}
