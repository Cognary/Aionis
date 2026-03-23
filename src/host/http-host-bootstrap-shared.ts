import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { Env } from "../config.js";
import type { Db } from "../db.js";
import type { EmbeddingSurfacePolicy } from "../embeddings/surface-policy.js";
import { recordMemoryRequestTelemetry, type MemoryRequestTelemetryInput } from "../control-plane.js";
import { buildLiteRouteMatrix } from "./lite-edition.js";
import { createErrorResponse, HttpError } from "../util/http.js";

function resolveRuntimeMemoryStoreBackend(env: Env): string {
  return env.AIONIS_EDITION === "lite" ? "lite_sqlite" : env.MEMORY_STORE_BACKEND;
}

type HealthSnapshotProvider = {
  healthSnapshot: () => unknown;
};

type HostHookRequest = FastifyRequest & {
  aionis_t0_ms?: number;
};

type CorsPolicyLike = {
  allow_origins: string[];
  allow_methods: string;
  allow_headers: string;
  expose_headers: string;
};

export function registerHostErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return reply.code(400).send({
        ...createErrorResponse({
          status: 400,
          error: "invalid_request",
          message: "invalid request",
          details: { contract: "error_v1", issues },
          issues,
        }),
      });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send(createErrorResponse({
        status: err.statusCode,
        error: err.code,
        message: err.message,
        details: err.details ?? undefined,
      }));
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send(createErrorResponse({
      status: 500,
      error: "internal_error",
      message: "internal error",
      details: { contract: "error_v1" },
    }));
  });
}

export function logMemoryApiConfig(args: {
  app: FastifyInstance;
  env: Env;
  embedder: any;
  embeddingSurfacePolicy: EmbeddingSurfacePolicy;
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
    embeddingSurfacePolicy,
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
      embedding_enabled_surfaces: embeddingSurfacePolicy.enabled_surfaces,
      embedding_provider_configured: embeddingSurfacePolicy.provider_configured,
      runtime_defaults: {
        scope: env.MEMORY_SCOPE,
        tenant_id: env.MEMORY_TENANT_ID,
        local_actor_id: env.LITE_LOCAL_ACTOR_ID,
      },
      storage_backend: resolveRuntimeMemoryStoreBackend(env),
      auth_mode: env.MEMORY_AUTH_MODE,
      sandbox: {
        enabled: env.SANDBOX_ENABLED,
        admin_only: env.SANDBOX_ADMIN_ONLY,
        executor_mode: env.SANDBOX_EXECUTOR_MODE,
        max_concurrency: env.SANDBOX_EXECUTOR_MAX_CONCURRENCY,
        remote_executor_configured: env.SANDBOX_EXECUTOR_MODE === "http_remote" ? !!env.SANDBOX_REMOTE_EXECUTOR_URL.trim() : false,
        remote_executor_allowlist_count: sandboxRemoteAllowedHosts.size,
        tenant_budget_window_hours: env.SANDBOX_TENANT_BUDGET_WINDOW_HOURS,
        tenant_budget_tenant_count: sandboxTenantBudgetPolicy.size,
      },
      recall: {
        profile: env.MEMORY_RECALL_PROFILE,
        profile_defaults: globalRecallProfileDefaults,
        profile_policy: recallProfilePolicy,
        recall_text_embed_cache_enabled: !!recallTextEmbedCache,
        recall_text_embed_batch_enabled: !!recallTextEmbedBatcher,
      },
      concurrency: {
        api_recall_max_inflight: env.API_RECALL_MAX_INFLIGHT,
        api_recall_queue_max: env.API_RECALL_QUEUE_MAX,
        api_write_max_inflight: env.API_WRITE_MAX_INFLIGHT,
        api_write_queue_max: env.API_WRITE_QUEUE_MAX,
      },
    },
    "memory api config",
  );
}

export function registerHostRequestHooks(args: {
  app: FastifyInstance;
  db: Db | null;
  resolveCorsPolicy: (req: FastifyRequest) => CorsPolicyLike | null;
  resolveCorsAllowOrigin: (origin: string | null, allowOrigins: string[]) => string | null;
  telemetryEndpointFromRequest: (req: FastifyRequest) => MemoryRequestTelemetryInput["endpoint"] | null;
  resolveRequestTenantForTelemetry: (req: FastifyRequest) => string;
  resolveRequestScopeForTelemetry: (req: FastifyRequest) => string;
  resolveRequestApiKeyPrefixForTelemetry: (req: FastifyRequest) => string | null;
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

  app.addHook("onRequest", async (req: HostHookRequest, reply: FastifyReply) => {
    req.aionis_t0_ms = performance.now();
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

  app.addHook("onResponse", async (req: HostHookRequest, reply: FastifyReply) => {
    if (!db) return;
    const endpoint = telemetryEndpointFromRequest(req);
    if (!endpoint) return;
    const t0 = Number(req.aionis_t0_ms ?? Number.NaN);
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
  app: FastifyInstance;
  env: Env;
  liteReplayStore?: HealthSnapshotProvider | null;
  liteRecallStore?: { healthSnapshot: () => unknown } | null;
  liteWriteStore?: { healthSnapshot: () => unknown } | null;
  liteAutomationStore?: HealthSnapshotProvider | null;
  liteAutomationRunStore?: HealthSnapshotProvider | null;
  sandboxExecutor: any;
  sandboxTenantBudgetPolicy: Map<string, unknown>;
  sandboxRemoteAllowedCidrs: Set<string>;
}) {
  const {
    app,
    env,
    liteReplayStore,
    liteRecallStore,
    liteWriteStore,
    liteAutomationStore,
    liteAutomationRunStore,
    sandboxExecutor,
    sandboxTenantBudgetPolicy,
    sandboxRemoteAllowedCidrs,
  } = args;

  app.get("/health", async () => ({
    ok: true,
    runtime: {
      edition: env.AIONIS_EDITION,
      mode: env.AIONIS_MODE,
    },
    storage: {
      backend: resolveRuntimeMemoryStoreBackend(env),
    },
    lite: env.AIONIS_EDITION === "lite"
      ? {
          identity: {
            local_actor_id: env.LITE_LOCAL_ACTOR_ID,
          },
          stores: {
            recall: liteRecallStore ? liteRecallStore.healthSnapshot() : null,
            write: liteWriteStore ? liteWriteStore.healthSnapshot() : null,
            replay: liteReplayStore ? liteReplayStore.healthSnapshot() : null,
            automation_definitions: liteAutomationStore ? liteAutomationStore.healthSnapshot() : null,
            automation_runs: liteAutomationRunStore ? liteAutomationRunStore.healthSnapshot() : null,
          },
          route_matrix: buildLiteRouteMatrix(),
        }
      : null,
    sandbox: {
      ...sandboxExecutor.healthSnapshot(),
      tenant_budget: {
        window_hours: env.SANDBOX_TENANT_BUDGET_WINDOW_HOURS,
        tenant_count: sandboxTenantBudgetPolicy.size,
      },
      remote_egress: {
        cidr_count: sandboxRemoteAllowedCidrs.size,
        deny_private_ips: env.SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS,
      },
      artifact_object_store: {
        base_uri_configured: !!env.SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI.trim(),
      },
    },
  }));
}
