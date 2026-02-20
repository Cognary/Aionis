import "dotenv/config";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ZodError } from "zod";
import { loadEnv } from "./config.js";
import { createDb, withClient, withTx } from "./db.js";
import { applyMemoryWrite, computeEffectiveWritePolicy, prepareMemoryWrite } from "./memory/write.js";
import { rehydrateArchiveNodes } from "./memory/rehydrate.js";
import { activateMemoryNodes } from "./memory/nodes-activate.js";
import { type RecallAuth, memoryRecallParsed } from "./memory/recall.js";
import { ruleFeedback } from "./memory/feedback.js";
import { updateRuleState } from "./memory/rules.js";
import { evaluateRules } from "./memory/rules-evaluate.js";
import { selectTools } from "./memory/tools-select.js";
import { toolSelectionFeedback } from "./memory/tools-feedback.js";
import { createEmbeddingProviderFromEnv } from "./embeddings/index.js";
import { EmbedHttpError } from "./embeddings/http.js";
import { runTopicClusterForEventIds } from "./jobs/topicClusterLib.js";
import { MemoryRecallRequest, MemoryRecallTextRequest } from "./memory/schemas.js";
import { normalizeText } from "./util/normalize.js";
import { redactPII } from "./util/redaction.js";
import { HttpError } from "./util/http.js";
import { sha256Hex } from "./util/crypto.js";
import { TokenBucketLimiter } from "./util/ratelimit.js";
import { LruTtlCache } from "./util/lru_ttl_cache.js";
import { createAuthResolver, type AuthPrincipal } from "./util/auth.js";
import { EmbedQueryBatcher, EmbedQueryBatcherError } from "./util/embed_query_batcher.js";
import { InflightGate, InflightGateError, type InflightGateToken } from "./util/inflight_gate.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const embedder = createEmbeddingProviderFromEnv(process.env);
const authResolver = createAuthResolver({
  mode: env.MEMORY_AUTH_MODE,
  apiKeysJson: env.MEMORY_API_KEYS_JSON,
  jwtHs256Secret: env.MEMORY_JWT_HS256_SECRET,
  jwtClockSkewSec: env.MEMORY_JWT_CLOCK_SKEW_SEC,
});

const recallLimiter = env.RATE_LIMIT_ENABLED
  ? new TokenBucketLimiter({
      rate_per_sec: env.RECALL_RATE_LIMIT_RPS,
      burst: env.RECALL_RATE_LIMIT_BURST,
      ttl_ms: env.RATE_LIMIT_TTL_MS,
      sweep_every_n: 500,
    })
  : null;

const debugEmbedLimiter = env.RATE_LIMIT_ENABLED
  ? new TokenBucketLimiter({
      rate_per_sec: env.DEBUG_EMBED_RATE_LIMIT_RPS,
      burst: env.DEBUG_EMBED_RATE_LIMIT_BURST,
      ttl_ms: env.RATE_LIMIT_TTL_MS,
      sweep_every_n: 500,
    })
  : null;

const writeLimiter = env.RATE_LIMIT_ENABLED
  ? new TokenBucketLimiter({
      rate_per_sec: env.WRITE_RATE_LIMIT_RPS,
      burst: env.WRITE_RATE_LIMIT_BURST,
      ttl_ms: env.RATE_LIMIT_TTL_MS,
      sweep_every_n: 500,
    })
  : null;

const recallTextEmbedLimiter = env.RATE_LIMIT_ENABLED
  ? new TokenBucketLimiter({
      rate_per_sec: env.RECALL_TEXT_EMBED_RATE_LIMIT_RPS,
      burst: env.RECALL_TEXT_EMBED_RATE_LIMIT_BURST,
      ttl_ms: env.RATE_LIMIT_TTL_MS,
      sweep_every_n: 500,
    })
  : null;

const tenantRecallLimiter = env.TENANT_QUOTA_ENABLED
  ? new TokenBucketLimiter({
      rate_per_sec: env.TENANT_RECALL_RATE_LIMIT_RPS,
      burst: env.TENANT_RECALL_RATE_LIMIT_BURST,
      ttl_ms: env.RATE_LIMIT_TTL_MS,
      sweep_every_n: 500,
    })
  : null;

const tenantDebugEmbedLimiter = env.TENANT_QUOTA_ENABLED
  ? new TokenBucketLimiter({
      rate_per_sec: env.TENANT_DEBUG_EMBED_RATE_LIMIT_RPS,
      burst: env.TENANT_DEBUG_EMBED_RATE_LIMIT_BURST,
      ttl_ms: env.RATE_LIMIT_TTL_MS,
      sweep_every_n: 500,
    })
  : null;

const tenantWriteLimiter = env.TENANT_QUOTA_ENABLED
  ? new TokenBucketLimiter({
      rate_per_sec: env.TENANT_WRITE_RATE_LIMIT_RPS,
      burst: env.TENANT_WRITE_RATE_LIMIT_BURST,
      ttl_ms: env.RATE_LIMIT_TTL_MS,
      sweep_every_n: 500,
    })
  : null;

const tenantRecallTextEmbedLimiter = env.TENANT_QUOTA_ENABLED
  ? new TokenBucketLimiter({
      rate_per_sec: env.TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_RPS,
      burst: env.TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_BURST,
      ttl_ms: env.RATE_LIMIT_TTL_MS,
      sweep_every_n: 500,
    })
  : null;

const recallTextEmbedCache =
  embedder && env.RECALL_TEXT_EMBED_CACHE_ENABLED
    ? new LruTtlCache<string, number[]>({
        maxEntries: env.RECALL_TEXT_EMBED_CACHE_MAX_KEYS,
        ttlMs: env.RECALL_TEXT_EMBED_CACHE_TTL_MS,
      })
    : null;

const recallTextEmbedInflight = new Map<string, Promise<{ vector: number[]; queue_wait_ms: number; batch_size: number }>>();
const recallTextEmbedBatcher =
  embedder && env.RECALL_TEXT_EMBED_BATCH_ENABLED
    ? new EmbedQueryBatcher({
        maxBatchSize: env.RECALL_TEXT_EMBED_BATCH_MAX_SIZE,
        maxBatchWaitMs: env.RECALL_TEXT_EMBED_BATCH_MAX_WAIT_MS,
        maxInflightBatches: env.RECALL_TEXT_EMBED_BATCH_MAX_INFLIGHT,
        maxQueue: env.RECALL_TEXT_EMBED_BATCH_QUEUE_MAX,
        queueTimeoutMs: env.RECALL_TEXT_EMBED_BATCH_QUEUE_TIMEOUT_MS,
        runBatch: async (texts) => {
          return await embedder.embed(texts);
        },
      })
    : null;

const recallInflightGate = new InflightGate({
  maxInflight: env.API_RECALL_MAX_INFLIGHT,
  maxQueue: env.API_RECALL_QUEUE_MAX,
  queueTimeoutMs: env.API_RECALL_QUEUE_TIMEOUT_MS,
});
const writeInflightGate = new InflightGate({
  maxInflight: env.API_WRITE_MAX_INFLIGHT,
  maxQueue: env.API_WRITE_QUEUE_MAX,
  queueTimeoutMs: env.API_WRITE_QUEUE_TIMEOUT_MS,
});

type RecallProfileDefaults = {
  limit: number;
  neighborhood_hops: 1 | 2;
  max_nodes: number;
  max_edges: number;
  ranked_limit: number;
  min_edge_weight: number;
  min_edge_confidence: number;
};

type RecallProfileName = "legacy" | "strict_edges" | "quality_first";
type RecallEndpoint = "recall" | "recall_text";

const RECALL_PROFILE_DEFAULTS: Record<RecallProfileName, RecallProfileDefaults> = {
  legacy: {
    limit: 30,
    neighborhood_hops: 2,
    max_nodes: 50,
    max_edges: 100,
    ranked_limit: 100,
    min_edge_weight: 0,
    min_edge_confidence: 0,
  },
  strict_edges: {
    limit: 24,
    neighborhood_hops: 2,
    max_nodes: 60,
    max_edges: 80,
    ranked_limit: 140,
    min_edge_weight: 0.2,
    min_edge_confidence: 0.2,
  },
  quality_first: {
    limit: 30,
    neighborhood_hops: 2,
    max_nodes: 80,
    max_edges: 100,
    ranked_limit: 180,
    min_edge_weight: 0.05,
    min_edge_confidence: 0.05,
  },
};

type RecallProfilePolicy = {
  endpoint: Partial<Record<RecallEndpoint, RecallProfileName>>;
  tenant_default: Record<string, RecallProfileName>;
  tenant_endpoint: Record<string, Partial<Record<RecallEndpoint, RecallProfileName>>>;
};

type RecallProfileResolution = {
  profile: RecallProfileName;
  defaults: RecallProfileDefaults;
  source: "global_default" | "endpoint_override" | "tenant_default" | "tenant_endpoint_override";
};

type RecallAdaptiveResolution = {
  profile: RecallProfileName;
  defaults: RecallProfileDefaults;
  applied: boolean;
  reason: "disabled" | "explicit_knobs" | "wait_below_threshold" | "already_target_profile" | "queue_pressure";
};

const globalRecallProfileDefaults = RECALL_PROFILE_DEFAULTS[env.MEMORY_RECALL_PROFILE];
const recallProfilePolicy = parseRecallProfilePolicy(env.MEMORY_RECALL_PROFILE_POLICY_JSON);

// Basic CORS support for browser-based playground/developer UIs.
// Configure with CORS_ALLOW_ORIGINS (comma-separated), default "*".
const CORS_ALLOW_ORIGINS = (process.env.CORS_ALLOW_ORIGINS ?? "*")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const CORS_ALLOW_HEADERS = "content-type,x-api-key,x-tenant-id,authorization,x-request-id";
const CORS_ALLOW_METHODS = "GET,POST,OPTIONS";

function resolveCorsAllowOrigin(origin: string | null): string | null {
  if (CORS_ALLOW_ORIGINS.includes("*")) return "*";
  if (!origin) return null;
  return CORS_ALLOW_ORIGINS.includes(origin) ? origin : null;
}

function withRecallProfileDefaults(body: unknown, defaults: RecallProfileDefaults) {
  const out: Record<string, unknown> = body && typeof body === "object" ? { ...(body as Record<string, unknown>) } : {};
  const entries = Object.entries(defaults) as Array<[keyof RecallProfileDefaults, number]>;
  for (const [key, value] of entries) {
    if (out[key] === undefined || out[key] === null) out[key] = value;
  }
  return out;
}

function parseRecallProfilePolicy(raw: string): RecallProfilePolicy {
  const out: RecallProfilePolicy = {
    endpoint: {},
    tenant_default: {},
    tenant_endpoint: {},
  };
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === "{}") return out;

  const parsed = JSON.parse(trimmed) as Record<string, unknown>;

  const endpoint = parsed.endpoint;
  if (endpoint && typeof endpoint === "object" && !Array.isArray(endpoint)) {
    for (const [k, v] of Object.entries(endpoint)) {
      if ((k === "recall" || k === "recall_text") && typeof v === "string") {
        out.endpoint[k] = v as RecallProfileName;
      }
    }
  }

  const tenantDefault = parsed.tenant_default;
  if (tenantDefault && typeof tenantDefault === "object" && !Array.isArray(tenantDefault)) {
    for (const [k, v] of Object.entries(tenantDefault)) {
      if (typeof v === "string" && k.trim().length > 0) {
        out.tenant_default[k.trim()] = v as RecallProfileName;
      }
    }
  }

  const tenantEndpoint = parsed.tenant_endpoint;
  if (tenantEndpoint && typeof tenantEndpoint === "object" && !Array.isArray(tenantEndpoint)) {
    for (const [tenant, value] of Object.entries(tenantEndpoint)) {
      if (!value || typeof value !== "object" || Array.isArray(value) || tenant.trim().length === 0) continue;
      const map: Partial<Record<RecallEndpoint, RecallProfileName>> = {};
      for (const [k, v] of Object.entries(value)) {
        if ((k === "recall" || k === "recall_text") && typeof v === "string") {
          map[k] = v as RecallProfileName;
        }
      }
      if (Object.keys(map).length > 0) out.tenant_endpoint[tenant.trim()] = map;
    }
  }

  return out;
}

function resolveRecallProfile(endpoint: RecallEndpoint, tenantId: string | null | undefined): RecallProfileResolution {
  const tenant = (tenantId ?? "").trim();
  const tenantEndpoint = tenant ? recallProfilePolicy.tenant_endpoint[tenant]?.[endpoint] : undefined;
  if (tenantEndpoint) {
    return {
      profile: tenantEndpoint,
      defaults: RECALL_PROFILE_DEFAULTS[tenantEndpoint],
      source: "tenant_endpoint_override",
    };
  }
  const tenantDefault = tenant ? recallProfilePolicy.tenant_default[tenant] : undefined;
  if (tenantDefault) {
    return {
      profile: tenantDefault,
      defaults: RECALL_PROFILE_DEFAULTS[tenantDefault],
      source: "tenant_default",
    };
  }
  const endpointDefault = recallProfilePolicy.endpoint[endpoint];
  if (endpointDefault) {
    return {
      profile: endpointDefault,
      defaults: RECALL_PROFILE_DEFAULTS[endpointDefault],
      source: "endpoint_override",
    };
  }
  return {
    profile: env.MEMORY_RECALL_PROFILE,
    defaults: globalRecallProfileDefaults,
    source: "global_default",
  };
}

const RECALL_KNOB_KEYS: Array<keyof RecallProfileDefaults> = [
  "limit",
  "neighborhood_hops",
  "max_nodes",
  "max_edges",
  "ranked_limit",
  "min_edge_weight",
  "min_edge_confidence",
];

function hasExplicitRecallKnobs(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const obj = body as Record<string, unknown>;
  for (const key of RECALL_KNOB_KEYS) {
    if (obj[key] !== undefined && obj[key] !== null) return true;
  }
  return false;
}

function resolveAdaptiveRecallProfile(baseProfile: RecallProfileName, gateWaitMs: number, hasExplicitKnobs: boolean): RecallAdaptiveResolution {
  if (!env.MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED) {
    return { profile: baseProfile, defaults: RECALL_PROFILE_DEFAULTS[baseProfile], applied: false, reason: "disabled" };
  }
  if (hasExplicitKnobs) {
    return { profile: baseProfile, defaults: RECALL_PROFILE_DEFAULTS[baseProfile], applied: false, reason: "explicit_knobs" };
  }
  if (gateWaitMs < env.MEMORY_RECALL_ADAPTIVE_WAIT_MS) {
    return { profile: baseProfile, defaults: RECALL_PROFILE_DEFAULTS[baseProfile], applied: false, reason: "wait_below_threshold" };
  }
  const target = env.MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE;
  if (target === baseProfile) {
    return { profile: baseProfile, defaults: RECALL_PROFILE_DEFAULTS[baseProfile], applied: false, reason: "already_target_profile" };
  }
  return { profile: target, defaults: RECALL_PROFILE_DEFAULTS[target], applied: true, reason: "queue_pressure" };
}

const app = Fastify({
  logger: true,
  bodyLimit: 5 * 1024 * 1024,
  genReqId: (req) => {
    const hdr = (req.headers["x-request-id"] ?? req.headers["X-Request-Id"]) as any;
    if (typeof hdr === "string" && hdr.trim().length > 0) return hdr.trim();
    return randomUUID();
  },
});

app.setErrorHandler((err, req, reply) => {
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

app.log.info(
  {
    app_env: env.APP_ENV,
    embedding_provider: embedder?.name ?? "none",
    embedding_dim: embedder?.dim ?? null,
    scope: env.MEMORY_SCOPE,
    tenant_id: env.MEMORY_TENANT_ID,
    auth_mode: env.MEMORY_AUTH_MODE,
    tenant_quota_enabled: env.TENANT_QUOTA_ENABLED,
    recall_text_embed_cache_enabled: !!recallTextEmbedCache,
    recall_text_embed_cache_ttl_ms: env.RECALL_TEXT_EMBED_CACHE_TTL_MS,
    memory_recall_profile: env.MEMORY_RECALL_PROFILE,
    memory_recall_profile_defaults: globalRecallProfileDefaults,
    memory_recall_profile_policy: recallProfilePolicy,
    memory_recall_adaptive_downgrade_enabled: env.MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED,
    memory_recall_adaptive_wait_ms: env.MEMORY_RECALL_ADAPTIVE_WAIT_MS,
    memory_recall_adaptive_target_profile: env.MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE,
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

app.addHook("onRequest", async (req, reply) => {
  // Always expose the request id for correlation (client <-> server logs).
  reply.header("x-request-id", req.id);

  const origin = typeof req.headers.origin === "string" ? req.headers.origin : null;
  const allowOrigin = resolveCorsAllowOrigin(origin);
  if (allowOrigin) {
    reply.header("access-control-allow-origin", allowOrigin);
    if (allowOrigin !== "*") reply.header("vary", "Origin");
    reply.header("access-control-allow-methods", CORS_ALLOW_METHODS);
    reply.header("access-control-allow-headers", CORS_ALLOW_HEADERS);
    reply.header("access-control-expose-headers", "x-request-id");
    reply.header("access-control-max-age", "600");
  }

  // Handle browser preflight directly.
  if (req.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

app.get("/health", async () => ({ ok: true }));

app.post("/v1/memory/write", async (req, reply) => {
  const t0 = performance.now();
  const principal = requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "write");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  try {
    const prepared = await prepareMemoryWrite(
      body,
      env.MEMORY_SCOPE,
      env.MEMORY_TENANT_ID,
      { maxTextLen: env.MAX_TEXT_LEN, piiRedaction: env.PII_REDACTION, allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES },
      embedder,
    );

    const policy = computeEffectiveWritePolicy(prepared, {
      autoTopicClusterOnWrite: env.AUTO_TOPIC_CLUSTER_ON_WRITE,
      topicClusterAsyncOnWrite: env.TOPIC_CLUSTER_ASYNC_ON_WRITE,
    });

    const out = await withTx(db, async (client) => {
      // Attach effective policy for applyMemoryWrite(outbox enqueue) and handler sync execution.
      (prepared as any).trigger_topic_cluster = policy.trigger_topic_cluster;
      (prepared as any).topic_cluster_async = policy.topic_cluster_async;

      const writeRes = await applyMemoryWrite(client, prepared, {
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
      });

      // Optional synchronous topic clustering (if requested and not async).
      if (policy.trigger_topic_cluster && !policy.topic_cluster_async) {
        const eventIds = prepared.nodes.filter((n) => n.type === "event").map((n) => n.id);
        if (eventIds.length > 0) {
          const clusterRes = await runTopicClusterForEventIds(client, {
            scope: prepared.scope,
            eventIds,
            simThreshold: env.TOPIC_SIM_THRESHOLD,
            minEventsPerTopic: env.TOPIC_MIN_EVENTS_PER_TOPIC,
            maxCandidatesPerEvent: env.TOPIC_MAX_CANDIDATES_PER_EVENT,
            maxTextLen: env.MAX_TEXT_LEN,
            piiRedaction: env.PII_REDACTION,
            strategy: env.TOPIC_CLUSTER_STRATEGY,
          });
          if (clusterRes.processed_events > 0) {
            writeRes.topic_cluster = clusterRes;
          }
        }
      }

      return writeRes;
    });

    const ms = performance.now() - t0;
    req.log.info(
      {
        write: {
          scope: out.scope ?? prepared.scope_public ?? env.MEMORY_SCOPE,
          tenant_id: out.tenant_id ?? prepared.tenant_id ?? env.MEMORY_TENANT_ID,
          commit_id: out.commit_id,
          nodes: out.nodes?.length ?? 0,
          edges: out.edges?.length ?? 0,
          embedding_backfill_enqueued: !!out.embedding_backfill?.enqueued,
          embedding_pending_nodes: out.embedding_backfill?.pending_nodes ?? 0,
          topic_cluster_enqueued: (out as any).topic_cluster?.enqueued === true,
          ms,
        },
      },
      "memory write",
    );
    return reply.code(200).send(out);
  } finally {
    gate.release();
  }
});

// On-demand archive retrieval policy: rehydrate selected nodes from archive/cold back to warm/hot.
app.post("/v1/memory/archive/rehydrate", async (req, reply) => {
  const principal = requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "rehydrate");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await withTx(db, (client) =>
    rehydrateArchiveNodes(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
    }),
  );
  return reply.code(200).send(out);
});

// Node activation/feedback ingestion for adaptive decay signals.
app.post("/v1/memory/nodes/activate", async (req, reply) => {
  const principal = requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "activate");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await withTx(db, (client) =>
    activateMemoryNodes(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
    }),
  );
  return reply.code(200).send(out);
});

app.post("/v1/memory/recall", async (req, reply) => {
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const principal = requireMemoryPrincipal(req);
  const bodyRaw = withIdentityFromRequest(req, req.body, principal, "recall");
  const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
  const baseProfile = resolveRecallProfile("recall", tenantFromBody(bodyRaw));
  const body = withRecallProfileDefaults(bodyRaw, baseProfile.defaults);
  let parsed = MemoryRecallRequest.parse(body);
  const wantDebugEmbeddings = parsed.return_debug && parsed.include_embeddings;
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  if (wantDebugEmbeddings) await enforceRateLimit(req, reply, "debug_embeddings");
  if (wantDebugEmbeddings) await enforceTenantQuota(req, reply, "debug_embeddings", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  const gate = await acquireInflightSlot("recall");
  const adaptiveProfile = resolveAdaptiveRecallProfile(baseProfile.profile, gate.wait_ms, explicitRecallKnobs);
  if (adaptiveProfile.applied) {
    parsed = MemoryRecallRequest.parse({ ...(parsed as any), ...adaptiveProfile.defaults });
  }
  const auth = buildRecallAuth(req, wantDebugEmbeddings, env.ADMIN_TOKEN);
  let out: any;
  try {
    out = await withClient(db, async (client) => {
      const base = await memoryRecallParsed(client, parsed, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, auth, {
        timing: (stage, ms) => {
          timings[stage] = (timings[stage] ?? 0) + ms;
        },
      }, "recall");

      if (parsed.rules_context !== undefined && parsed.rules_context !== null) {
        const rulesRes = await evaluateRules(
          client,
          {
            scope: parsed.scope ?? env.MEMORY_SCOPE,
            tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
            context: parsed.rules_context,
            include_shadow: parsed.rules_include_shadow,
            limit: parsed.rules_limit,
          },
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
        );

        (base as any).rules = {
          scope: rulesRes.scope,
          considered: rulesRes.considered,
          matched: rulesRes.matched,
          skipped_invalid_then: rulesRes.skipped_invalid_then,
          invalid_then_sample: rulesRes.invalid_then_sample,
          applied: rulesRes.applied,
        };
      }
      return base as any;
    });
  } finally {
    gate.release();
  }
  const ms = performance.now() - t0;
  req.log.info(
    {
      recall: {
        scope: out.scope,
        tenant_id: (out as any).tenant_id ?? parsed.tenant_id ?? env.MEMORY_TENANT_ID,
        limit: parsed.limit,
        hops: parsed.neighborhood_hops,
        include_meta: !!parsed.include_meta,
        include_slots: !!parsed.include_slots,
        include_slots_preview: !!parsed.include_slots_preview,
        consumer_agent_id: parsed.consumer_agent_id ?? null,
        consumer_team_id: parsed.consumer_team_id ?? null,
        seeds: out.seeds.length,
        nodes: out.subgraph.nodes.length,
        edges: out.subgraph.edges.length,
        neighborhood_counts: (out as any).debug?.neighborhood_counts ?? null,
        rules: (out as any).rules ? { considered: (out as any).rules.considered, matched: (out as any).rules.matched } : null,
        profile: adaptiveProfile.profile,
        profile_source: baseProfile.source,
        adaptive_profile_applied: adaptiveProfile.applied,
        adaptive_profile_reason: adaptiveProfile.reason,
        inflight_wait_ms: gate.wait_ms,
        ms,
        timings_ms: timings,
      },
    },
    "memory recall",
  );
  return reply.code(200).send(out);
});

app.post("/v1/memory/recall_text", async (req, reply) => {
  if (!embedder) {
    return reply.code(400).send({ error: "no_embedding_provider", message: "Configure EMBEDDING_PROVIDER to use recall_text." });
  }

  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const principal = requireMemoryPrincipal(req);
  const bodyRaw = withIdentityFromRequest(req, req.body, principal, "recall_text");
  const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
  const baseProfile = resolveRecallProfile("recall_text", tenantFromBody(bodyRaw));
  const body = withRecallProfileDefaults(bodyRaw, baseProfile.defaults);
  let parsed = MemoryRecallTextRequest.parse(body);
  const wantDebugEmbeddingsText = parsed.return_debug && parsed.include_embeddings;
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  if (wantDebugEmbeddingsText) await enforceRateLimit(req, reply, "debug_embeddings");
  if (wantDebugEmbeddingsText) await enforceTenantQuota(req, reply, "debug_embeddings", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  await enforceRecallTextEmbedQuota(req, reply, parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  const scope = parsed.scope ?? env.MEMORY_SCOPE;
  const qNorm = normalizeText(parsed.query_text, env.MAX_TEXT_LEN);
  const q = env.PII_REDACTION ? redactPII(qNorm).text : qNorm;

  let vec: number[];
  let embedMs = 0;
  let embedCacheHit = false;
  let embedSingleflightJoin = false;
  let embedQueueWaitMs = 0;
  let embedBatchSize = 1;
  let recallParsed: any;
  const gate = await acquireInflightSlot("recall");
  const adaptiveProfile = resolveAdaptiveRecallProfile(baseProfile.profile, gate.wait_ms, explicitRecallKnobs);
  if (adaptiveProfile.applied) {
    parsed = MemoryRecallTextRequest.parse({ ...(parsed as any), ...adaptiveProfile.defaults });
  }
  let out: any;
  try {
    try {
      const emb = await embedRecallTextQuery(embedder, q);
      vec = emb.vec;
      embedMs = emb.ms;
      embedCacheHit = emb.cache_hit;
      embedSingleflightJoin = emb.singleflight_join;
      embedQueueWaitMs = emb.queue_wait_ms;
      embedBatchSize = emb.batch_size;
    } catch (err: any) {
      const mapped = mapRecallTextEmbeddingError(err);
      if (mapped.retry_after_sec) reply.header("retry-after", mapped.retry_after_sec);
      req.log.warn(
        {
          recall_text: {
            scope,
            tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
            embedding_provider: embedder.name,
            query_len: q.length,
            mapped_error: mapped.code,
            mapped_status: mapped.statusCode,
            err_message: String(err?.message ?? err),
          },
        },
        "recall_text embedding failed",
      );
      throw new HttpError(mapped.statusCode, mapped.code, mapped.message, mapped.details);
    }

    recallParsed = MemoryRecallRequest.parse({
      tenant_id: parsed.tenant_id,
      scope,
      query_embedding: vec,
      consumer_agent_id: parsed.consumer_agent_id,
      consumer_team_id: parsed.consumer_team_id,
      limit: parsed.limit,
      neighborhood_hops: parsed.neighborhood_hops,
      return_debug: parsed.return_debug,
      include_embeddings: parsed.include_embeddings,
      include_meta: parsed.include_meta,
      include_slots: parsed.include_slots,
      include_slots_preview: parsed.include_slots_preview,
      slots_preview_keys: parsed.slots_preview_keys,
      max_nodes: parsed.max_nodes,
      max_edges: parsed.max_edges,
      ranked_limit: parsed.ranked_limit,
      min_edge_weight: parsed.min_edge_weight,
      min_edge_confidence: parsed.min_edge_confidence,
      rules_context: parsed.rules_context,
      rules_include_shadow: parsed.rules_include_shadow,
      rules_limit: parsed.rules_limit,
    });
    const wantDebugEmbeddings = recallParsed.return_debug && recallParsed.include_embeddings;
    const auth = buildRecallAuth(req, wantDebugEmbeddings, env.ADMIN_TOKEN);
    out = await withClient(db, async (client) => {
      const base = await memoryRecallParsed(client, recallParsed, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, auth, {
        timing: (stage, ms) => {
          timings[stage] = (timings[stage] ?? 0) + ms;
        },
      }, "recall_text");

      if (recallParsed.rules_context !== undefined && recallParsed.rules_context !== null) {
        const rulesRes = await evaluateRules(
          client,
          {
            scope: recallParsed.scope ?? env.MEMORY_SCOPE,
            tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
            context: recallParsed.rules_context,
            include_shadow: recallParsed.rules_include_shadow,
            limit: recallParsed.rules_limit,
          },
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
        );
        (base as any).rules = {
          scope: rulesRes.scope,
          considered: rulesRes.considered,
          matched: rulesRes.matched,
          skipped_invalid_then: rulesRes.skipped_invalid_then,
          invalid_then_sample: rulesRes.invalid_then_sample,
          applied: rulesRes.applied,
        };
      }

      return base as any;
    });
  } finally {
    gate.release();
  }
  const ms = performance.now() - t0;
  req.log.info(
    {
      recall_text: {
        scope: out.scope,
        tenant_id: (out as any).tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
        limit: recallParsed.limit,
        hops: recallParsed.neighborhood_hops,
        embedding_provider: embedder.name,
        embed_ms: embedMs,
        embed_cache_hit: embedCacheHit,
        embed_singleflight_join: embedSingleflightJoin,
        embed_queue_wait_ms: embedQueueWaitMs,
        embed_batch_size: embedBatchSize,
        embed_batcher: recallTextEmbedBatcher ? recallTextEmbedBatcher.stats() : null,
        include_meta: !!recallParsed.include_meta,
        include_slots: !!recallParsed.include_slots,
        include_slots_preview: !!recallParsed.include_slots_preview,
        consumer_agent_id: recallParsed.consumer_agent_id ?? null,
        consumer_team_id: recallParsed.consumer_team_id ?? null,
        seeds: out.seeds.length,
        nodes: out.subgraph.nodes.length,
        edges: out.subgraph.edges.length,
        neighborhood_counts: (out as any).debug?.neighborhood_counts ?? null,
        rules: (out as any).rules ? { considered: (out as any).rules.considered, matched: (out as any).rules.matched } : null,
        profile: adaptiveProfile.profile,
        profile_source: baseProfile.source,
        adaptive_profile_applied: adaptiveProfile.applied,
        adaptive_profile_reason: adaptiveProfile.reason,
        inflight_wait_ms: gate.wait_ms,
        ms,
        timings_ms: timings,
      },
    },
    "memory recall_text",
  );
  return reply.code(200).send({ ...out, query: { text: q, embedding_provider: embedder.name } });
});

app.post("/v1/memory/feedback", async (req, reply) => {
  const principal = requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "feedback");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await withTx(db, (client) =>
    ruleFeedback(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
    }),
  );
  return reply.code(200).send(out);
});

app.post("/v1/memory/rules/state", async (req, reply) => {
  const principal = requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "rules_state");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await withTx(db, (client) => updateRuleState(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID));
  return reply.code(200).send(out);
});

// Execution injection: evaluate SHADOW/ACTIVE rules against a caller-provided context object.
// This is designed for planner/tool selector integration (rules are not applied automatically by this service).
app.post("/v1/memory/rules/evaluate", async (req, reply) => {
  const principal = requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "rules_evaluate");
  await enforceRateLimit(req, reply, "recall"); // same protection class as recall
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await withClient(db, async (client) => {
      return await evaluateRules(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID);
    });
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Tool selector helper: apply ACTIVE (and optionally SHADOW) rule policy to candidate tool names.
// Intended for planner/tool selector integration to keep tool selection consistent.
app.post("/v1/memory/tools/select", async (req, reply) => {
  const principal = requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "tools_select");
  await enforceRateLimit(req, reply, "recall"); // same protection class as recall
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await withClient(db, async (client) => {
      return await selectTools(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID);
    });
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Feedback loop for tool selection: attribute a (positive/negative/neutral) outcome to matched rules.
// This updates memory_rule_defs positive/negative counts to drive future rule ordering.
app.post("/v1/memory/tools/feedback", async (req, reply) => {
  const principal = requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "tools_feedback");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await withTx(db, (client) =>
    toolSelectionFeedback(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
    }),
  );
  return reply.code(200).send(out);
});

app.addHook("onClose", async () => {
  await db.pool.end();
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });

function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.0.0.1");
}

function buildRecallAuth(req: any, wantDebugEmbeddings: boolean, adminToken: string | undefined): RecallAuth {
  if (!wantDebugEmbeddings) return { allow_debug_embeddings: false };

  const headerToken = String(req.headers?.["x-admin-token"] ?? "");
  if (adminToken && headerToken && headerToken === adminToken) return { allow_debug_embeddings: true };

  const ip = String(req.ip ?? req.socket?.remoteAddress ?? "");
  if (!adminToken && env.APP_ENV !== "prod" && isLoopbackIp(ip)) return { allow_debug_embeddings: true };

  return { allow_debug_embeddings: false };
}

function rateLimitKey(req: any, category: string): string {
  // Prefer per-admin principal when a real admin token is configured and provided.
  const headerToken = String(req.headers?.["x-admin-token"] ?? "");
  if (env.ADMIN_TOKEN && headerToken && headerToken === env.ADMIN_TOKEN) {
    return `${category}:admin:${sha256Hex(headerToken).slice(0, 16)}`;
  }
  // Otherwise, per-IP (best-effort; Fastify `req.ip` depends on trustProxy settings).
  const ip = String(req.ip ?? req.socket?.remoteAddress ?? "unknown");
  return `${category}:ip:${ip}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireInflightSlot(kind: "recall" | "write"): Promise<InflightGateToken> {
  const gate = kind === "write" ? writeInflightGate : recallInflightGate;
  try {
    return await gate.acquire();
  } catch (err) {
    if (err instanceof InflightGateError) {
      const code = kind === "write" ? "write_backpressure" : "recall_backpressure";
      throw new HttpError(429, code, `server busy on ${kind}; retry later`, err.details);
    }
    throw err;
  }
}

async function enforceRateLimit(req: any, reply: any, kind: "recall" | "debug_embeddings" | "write") {
  if (!env.RATE_LIMIT_ENABLED) return;
  const limiter = kind === "debug_embeddings" ? debugEmbedLimiter : kind === "write" ? writeLimiter : recallLimiter;
  if (!limiter) return;

  const ip = String(req.ip ?? req.socket?.remoteAddress ?? "");
  if (env.RATE_LIMIT_BYPASS_LOOPBACK && env.APP_ENV !== "prod" && isLoopbackIp(ip)) {
    // Dev ergonomics: don't rate-limit local loopback traffic.
    return;
  }

  const key = rateLimitKey(req, kind);
  let waitedMs = 0;
  let res = limiter.check(key, 1);
  if (!res.allowed && kind === "write" && env.WRITE_RATE_LIMIT_MAX_WAIT_MS > 0) {
    waitedMs = Math.min(env.WRITE_RATE_LIMIT_MAX_WAIT_MS, Math.max(1, res.retry_after_ms));
    await sleep(waitedMs);
    res = limiter.check(key, 1);
  }
  if (res.allowed) return;
  reply.header("retry-after", Math.ceil(res.retry_after_ms / 1000));
  throw new HttpError(
    429,
    kind === "debug_embeddings" ? "rate_limited_debug_embeddings" : kind === "write" ? "rate_limited_write" : "rate_limited_recall",
    `rate limited (${kind}); retry later`,
    { retry_after_ms: res.retry_after_ms, waited_ms: waitedMs },
  );
}

async function enforceRecallTextEmbedQuota(req: any, reply: any, tenantId: string) {
  if (!embedder) return;
  if (env.RATE_LIMIT_ENABLED && recallTextEmbedLimiter) {
    const key = rateLimitKey(req, "recall_text_embed");
    let waitedMs = 0;
    let res = recallTextEmbedLimiter.check(key, 1);
    if (!res.allowed && env.RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS > 0) {
      waitedMs = Math.min(env.RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS, Math.max(1, res.retry_after_ms));
      await sleep(waitedMs);
      res = recallTextEmbedLimiter.check(key, 1);
    }
    if (!res.allowed) {
      reply.header("retry-after", Math.ceil(res.retry_after_ms / 1000));
      throw new HttpError(429, "rate_limited_recall_text_embed", "recall_text embedding quota exceeded; retry later", {
        retry_after_ms: res.retry_after_ms,
        waited_ms: waitedMs,
      });
    }
  }

  if (env.TENANT_QUOTA_ENABLED && tenantRecallTextEmbedLimiter) {
    const key = `tenant:${tenantId}:recall_text_embed`;
    let waitedMs = 0;
    let res = tenantRecallTextEmbedLimiter.check(key, 1);
    if (!res.allowed && env.TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS > 0) {
      waitedMs = Math.min(env.TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS, Math.max(1, res.retry_after_ms));
      await sleep(waitedMs);
      res = tenantRecallTextEmbedLimiter.check(key, 1);
    }
    if (!res.allowed) {
      reply.header("retry-after", Math.ceil(res.retry_after_ms / 1000));
      throw new HttpError(
        429,
        "tenant_rate_limited_recall_text_embed",
        "tenant recall_text embedding quota exceeded; retry later",
        {
          tenant_id: tenantId,
          retry_after_ms: res.retry_after_ms,
          waited_ms: waitedMs,
        },
      );
    }
  }
}

function requireMemoryPrincipal(req: any): AuthPrincipal | null {
  if (authResolver.mode === "off") return null;
  const principal = authResolver.resolve(req?.headers ?? {});
  if (!principal) {
    const hint =
      authResolver.required_header_hint === "x-api-key"
        ? "X-Api-Key"
        : authResolver.required_header_hint === "authorization"
          ? "Authorization: Bearer <jwt>"
          : authResolver.required_header_hint === "x-api-key_or_authorization"
            ? "X-Api-Key or Authorization: Bearer <jwt>"
            : "authorization";
    throw new HttpError(401, "unauthorized", `valid ${hint} is required`);
  }
  return principal;
}

function assertIdentityMatch(field: string, provided: string | null, expected: string | null) {
  if (!provided || !expected) return;
  if (provided === expected) return;
  throw new HttpError(403, "identity_mismatch", `${field} does not match authenticated principal`, {
    field,
    provided,
    expected,
  });
}

function withIdentityFromRequest(
  req: any,
  body: unknown,
  principal: AuthPrincipal | null,
  kind:
    | "write"
    | "rehydrate"
    | "activate"
    | "recall"
    | "recall_text"
    | "feedback"
    | "rules_state"
    | "rules_evaluate"
    | "tools_select"
    | "tools_feedback",
): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const obj = { ...(body as Record<string, any>) };
  const headerTenantRaw = req?.headers?.["x-tenant-id"];
  const headerTenant = typeof headerTenantRaw === "string" ? headerTenantRaw.trim() : "";
  const bodyTenant = typeof obj.tenant_id === "string" ? obj.tenant_id.trim() : "";
  const explicitTenant = bodyTenant || headerTenant || null;

  if (principal) {
    assertIdentityMatch("tenant_id", explicitTenant, principal.tenant_id);
    obj.tenant_id = principal.tenant_id;
  } else if (!bodyTenant && headerTenant) {
    obj.tenant_id = headerTenant;
  }

  if (principal && (kind === "recall" || kind === "recall_text")) {
    const reqAgent = typeof obj.consumer_agent_id === "string" ? obj.consumer_agent_id.trim() : null;
    const reqTeam = typeof obj.consumer_team_id === "string" ? obj.consumer_team_id.trim() : null;
    assertIdentityMatch("consumer_agent_id", reqAgent, principal.agent_id);
    assertIdentityMatch("consumer_team_id", reqTeam, principal.team_id);
    if (!reqAgent && principal.agent_id) obj.consumer_agent_id = principal.agent_id;
    if (!reqTeam && principal.team_id) obj.consumer_team_id = principal.team_id;
  }

  if (principal && kind === "write") {
    const reqProducer = typeof obj.producer_agent_id === "string" ? obj.producer_agent_id.trim() : null;
    const reqOwnerAgent = typeof obj.owner_agent_id === "string" ? obj.owner_agent_id.trim() : null;
    const reqOwnerTeam = typeof obj.owner_team_id === "string" ? obj.owner_team_id.trim() : null;
    assertIdentityMatch("producer_agent_id", reqProducer, principal.agent_id);
    assertIdentityMatch("owner_agent_id", reqOwnerAgent, principal.agent_id);
    assertIdentityMatch("owner_team_id", reqOwnerTeam, principal.team_id);
    if (!reqProducer && principal.agent_id) obj.producer_agent_id = principal.agent_id;
    if (!reqOwnerAgent && !reqOwnerTeam) {
      if (principal.agent_id) obj.owner_agent_id = principal.agent_id;
      else if (principal.team_id) obj.owner_team_id = principal.team_id;
    }
  }

  if (principal && (kind === "rules_evaluate" || kind === "tools_select" || kind === "tools_feedback")) {
    const ctx = obj.context && typeof obj.context === "object" && !Array.isArray(obj.context) ? { ...obj.context } : {};
    const agent = ctx.agent && typeof ctx.agent === "object" && !Array.isArray(ctx.agent) ? { ...ctx.agent } : {};
    const reqCtxAgent = typeof agent.id === "string" ? agent.id.trim() : typeof ctx.agent_id === "string" ? ctx.agent_id.trim() : null;
    const reqCtxTeam = typeof agent.team_id === "string" ? agent.team_id.trim() : typeof ctx.team_id === "string" ? ctx.team_id.trim() : null;
    assertIdentityMatch("context.agent.id", reqCtxAgent, principal.agent_id);
    assertIdentityMatch("context.agent.team_id", reqCtxTeam, principal.team_id);
    if (!agent.id && principal.agent_id) agent.id = principal.agent_id;
    if (!agent.team_id && principal.team_id) agent.team_id = principal.team_id;
    if (!ctx.agent_id && principal.agent_id) ctx.agent_id = principal.agent_id;
    if (!ctx.team_id && principal.team_id) ctx.team_id = principal.team_id;
    if (Object.keys(agent).length > 0) ctx.agent = agent;
    obj.context = ctx;
  }

  return obj;
}

function tenantFromBody(body: unknown): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const t = (body as any).tenant_id;
    if (typeof t === "string" && t.trim().length > 0) return t.trim();
  }
  return env.MEMORY_TENANT_ID;
}

async function enforceTenantQuota(req: any, reply: any, kind: "recall" | "debug_embeddings" | "write", tenantId: string) {
  if (!env.TENANT_QUOTA_ENABLED) return;
  const limiter =
    kind === "debug_embeddings" ? tenantDebugEmbedLimiter : kind === "write" ? tenantWriteLimiter : tenantRecallLimiter;
  if (!limiter) return;
  const key = `tenant:${tenantId}:${kind}`;
  let waitedMs = 0;
  let res = limiter.check(key, 1);
  if (!res.allowed && kind === "write" && env.TENANT_WRITE_RATE_LIMIT_MAX_WAIT_MS > 0) {
    waitedMs = Math.min(env.TENANT_WRITE_RATE_LIMIT_MAX_WAIT_MS, Math.max(1, res.retry_after_ms));
    await sleep(waitedMs);
    res = limiter.check(key, 1);
  }
  if (res.allowed) return;
  reply.header("retry-after", Math.ceil(res.retry_after_ms / 1000));
  throw new HttpError(
    429,
    kind === "debug_embeddings"
      ? "tenant_rate_limited_debug_embeddings"
      : kind === "write"
        ? "tenant_rate_limited_write"
        : "tenant_rate_limited_recall",
    `tenant quota exceeded (${kind}); retry later`,
    { tenant_id: tenantId, retry_after_ms: res.retry_after_ms, waited_ms: waitedMs },
  );
}

async function embedRecallTextQuery(
  provider: NonNullable<typeof embedder>,
  queryText: string,
): Promise<{ vec: number[]; ms: number; cache_hit: boolean; singleflight_join: boolean; queue_wait_ms: number; batch_size: number }> {
  const cacheKey = `${provider.name}:${sha256Hex(queryText)}`;
  const cached = recallTextEmbedCache?.get(cacheKey);
  if (cached) {
    return { vec: cached.slice(), ms: 0, cache_hit: true, singleflight_join: false, queue_wait_ms: 0, batch_size: 1 };
  }

  const joined = recallTextEmbedInflight.get(cacheKey);
  if (joined) {
    const t0 = performance.now();
    const out = await joined;
    const ms = performance.now() - t0;
    return {
      vec: out.vector.slice(),
      ms,
      cache_hit: false,
      singleflight_join: true,
      queue_wait_ms: out.queue_wait_ms,
      batch_size: out.batch_size,
    };
  }

  const inflight = (async (): Promise<{ vector: number[]; queue_wait_ms: number; batch_size: number }> => {
    if (recallTextEmbedBatcher) {
      const batched = await recallTextEmbedBatcher.enqueue(cacheKey, queryText);
      recallTextEmbedCache?.set(cacheKey, batched.vector);
      return batched;
    }

    const [vec] = await provider.embed([queryText]);
    if (!Array.isArray(vec) || vec.length !== 1536) {
      throw new Error(`invalid query embedding result: expected dim=1536, got ${Array.isArray(vec) ? vec.length : "non-array"}`);
    }
    recallTextEmbedCache?.set(cacheKey, vec);
    return { vector: vec, queue_wait_ms: 0, batch_size: 1 };
  })().finally(() => {
    recallTextEmbedInflight.delete(cacheKey);
  });

  recallTextEmbedInflight.set(cacheKey, inflight);
  const t0 = performance.now();
  const out = await inflight;
  const ms = performance.now() - t0;
  return {
    vec: out.vector.slice(),
    ms,
    cache_hit: false,
    singleflight_join: false,
    queue_wait_ms: out.queue_wait_ms,
    batch_size: out.batch_size,
  };
}

function mapRecallTextEmbeddingError(err: unknown): {
  statusCode: number;
  code: string;
  message: string;
  retry_after_sec?: number;
  details?: Record<string, unknown>;
} {
  if (err instanceof EmbedQueryBatcherError) {
    const isQueueFull = err.code === "queue_full";
    return {
      statusCode: isQueueFull ? 429 : 503,
      code: isQueueFull ? "recall_text_embed_queue_full" : "recall_text_embed_queue_timeout",
      message: isQueueFull
        ? "recall_text embedding queue is saturated; retry later"
        : "recall_text embedding queue timed out; retry later",
      retry_after_sec: isQueueFull ? 1 : 2,
      details: err.details,
    };
  }

  const msg = String((err as any)?.message ?? err ?? "");
  const msgLc = msg.toLowerCase();
  const isRateLimit =
    (err instanceof EmbedHttpError && err.status === 429) ||
    msgLc.includes("rate limit") ||
    msgLc.includes("too many requests") ||
    msgLc.includes("status_code\":1002");
  if (isRateLimit) {
    return {
      statusCode: 429,
      code: "upstream_embedding_rate_limited",
      message: "embedding provider is rate limited; retry later",
      retry_after_sec: 2,
      details: { provider_status: err instanceof EmbedHttpError ? err.status : null },
    };
  }

  const isTimeoutLike =
    msgLc.includes("abort") || msgLc.includes("timeout") || msgLc.includes("timed out") || msgLc.includes("fetch failed");
  if (isTimeoutLike) {
    return {
      statusCode: 503,
      code: "upstream_embedding_unavailable",
      message: "embedding provider timeout/unavailable; retry later",
      retry_after_sec: 1,
      details: { provider_status: err instanceof EmbedHttpError ? err.status : null },
    };
  }

  if (err instanceof EmbedHttpError && typeof err.status === "number") {
    if (err.status >= 500) {
      return {
        statusCode: 503,
        code: "upstream_embedding_unavailable",
        message: "embedding provider unavailable; retry later",
        retry_after_sec: 1,
        details: { provider_status: err.status },
      };
    }
    return {
      statusCode: 502,
      code: "upstream_embedding_bad_response",
      message: "embedding provider returned an unexpected response",
      details: { provider_status: err.status },
    };
  }

  return {
    statusCode: 503,
    code: "upstream_embedding_unavailable",
    message: "embedding provider unavailable; retry later",
    retry_after_sec: 1,
  };
}
