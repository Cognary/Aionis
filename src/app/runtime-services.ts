import { capabilityContract, type CapabilityId } from "../capability-contract.js";
import type { Env } from "../config.js";
import {
  createApiKeyPrincipalResolver,
  createTenantQuotaResolver,
} from "../control-plane.js";
import { createNoopDb } from "../db.js";
import { createEmbeddingProviderFromEnv } from "../embeddings/index.js";
import {
  SandboxExecutor,
  parseAllowedSandboxCommands,
} from "../memory/sandbox.js";
import {
  createPostgresRecallStoreAccess,
  type RecallStoreCapabilities,
} from "../store/recall-access.js";
import { createLiteRecallStore } from "../store/lite-recall-store.js";
import { createPostgresReplayStoreAccess } from "../store/replay-access.js";
import { createLiteReplayStore } from "../store/lite-replay-store.js";
import { createLiteHostStore } from "../store/lite-host-store.js";
import { createEmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import {
  asPostgresMemoryStore,
  createMemoryStore,
} from "../store/memory-store.js";
import {
  createPostgresWriteStoreAccess,
  type WriteStoreCapabilities,
} from "../store/write-access.js";
import { createLiteWriteStore } from "../store/lite-write-store.js";
import { createAuthResolver } from "../util/auth.js";
import { sha256Hex } from "../util/crypto.js";
import { EmbedQueryBatcher } from "../util/embed_query_batcher.js";
import { HttpError } from "../util/http.js";
import { InflightGate } from "../util/inflight_gate.js";
import { LruTtlCache } from "../util/lru_ttl_cache.js";
import { TokenBucketLimiter } from "../util/ratelimit.js";

export type SandboxTenantBudgetPolicy = {
  daily_run_cap: number | null;
  daily_timeout_cap: number | null;
  daily_failure_cap: number | null;
};

export function sanitizeBudgetCap(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function parseSandboxTenantBudgetPolicy(raw: string): Map<string, SandboxTenantBudgetPolicy> {
  let parsed: unknown = {};
  try {
    const normalized = raw.trim();
    parsed = normalized.length === 0 ? {} : JSON.parse(normalized);
  } catch {
    throw new Error("SANDBOX_TENANT_BUDGET_POLICY_JSON must be valid JSON object");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SANDBOX_TENANT_BUDGET_POLICY_JSON must be a JSON object");
  }
  const out = new Map<string, SandboxTenantBudgetPolicy>();
  for (const [tenantId, limitsRaw] of Object.entries(parsed as Record<string, unknown>)) {
    const key = tenantId.trim();
    if (!key) continue;
    if (!limitsRaw || typeof limitsRaw !== "object" || Array.isArray(limitsRaw)) continue;
    const limits = limitsRaw as Record<string, unknown>;
    const normalized: SandboxTenantBudgetPolicy = {
      daily_run_cap: sanitizeBudgetCap(limits.daily_run_cap),
      daily_timeout_cap: sanitizeBudgetCap(limits.daily_timeout_cap),
      daily_failure_cap: sanitizeBudgetCap(limits.daily_failure_cap),
    };
    if (!normalized.daily_run_cap && !normalized.daily_timeout_cap && !normalized.daily_failure_cap) continue;
    out.set(key, normalized);
  }
  return out;
}

function parseSandboxRemoteAllowedHosts(raw: string): Set<string> {
  let parsed: unknown = [];
  try {
    const normalized = raw.trim();
    parsed = normalized.length === 0 ? [] : JSON.parse(normalized);
  } catch {
    throw new Error("SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON must be valid JSON array");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON must be a JSON array");
  }
  return new Set(
    parsed
      .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
      .filter((v) => v.length > 0),
  );
}

function parseSandboxRemoteAllowedCidrs(raw: string): Set<string> {
  let parsed: unknown = [];
  try {
    const normalized = raw.trim();
    parsed = normalized.length === 0 ? [] : JSON.parse(normalized);
  } catch {
    throw new Error("SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON must be valid JSON array");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON must be a JSON array");
  }
  return new Set(
    parsed
      .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
      .filter((v) => v.length > 0),
  );
}

function databaseTargetHash(databaseUrl: string): string | null {
  try {
    const u = new URL(databaseUrl);
    const protocol = u.protocol.toLowerCase();
    const rawHost = u.hostname.toLowerCase();
    const host = rawHost === "localhost" || rawHost === "127.0.0.1" || rawHost === "::1" ? "loopback" : rawHost;
    const port = u.port || (protocol === "postgres:" || protocol === "postgresql:" ? "5432" : "");
    const dbName = (u.pathname || "/").replace(/^\/+/, "");
    if (!host || !port || !dbName) return null;
    return sha256Hex(`${host}:${port}/${dbName}`);
  } catch {
    return null;
  }
}

export async function createRuntimeServices(env: Env) {
  const liteEdition = env.AIONIS_EDITION === "lite";
  const sandboxRemoteAllowedHosts = parseSandboxRemoteAllowedHosts(env.SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON);
  const sandboxRemoteAllowedCidrs = parseSandboxRemoteAllowedCidrs(env.SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON);
  const sandboxAllowedCommands = parseAllowedSandboxCommands(env.SANDBOX_ALLOWED_COMMANDS_JSON);
  const store = liteEdition
    ? createLiteHostStore()
    : createMemoryStore({
        backend: env.MEMORY_STORE_BACKEND,
        databaseUrl: env.DATABASE_URL,
        embeddedExperimentalEnabled: env.MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED,
      });
  const db = liteEdition ? createNoopDb() : asPostgresMemoryStore(store).db;
  const embeddedRuntime =
    !liteEdition && env.MEMORY_STORE_BACKEND === "embedded"
      ? createEmbeddedMemoryRuntime({
          snapshotPath: env.MEMORY_STORE_EMBEDDED_SNAPSHOT_PATH,
          autoPersist: env.MEMORY_STORE_EMBEDDED_AUTOSAVE,
          snapshotMaxBytes: env.MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BYTES,
          snapshotMaxBackups: env.MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BACKUPS,
          snapshotStrictMaxBytes: env.MEMORY_STORE_EMBEDDED_SNAPSHOT_STRICT_MAX_BYTES,
          snapshotCompactionEnabled: env.MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_ENABLED,
          snapshotCompactionMaxRounds: env.MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_MAX_ROUNDS,
          recallDebugEmbeddingsEnabled: env.MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED,
          recallAuditInsertEnabled: env.MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED,
        })
      : null;
  if (embeddedRuntime) {
    await embeddedRuntime.loadSnapshot();
  }
  const liteReplayStore = liteEdition
    ? createLiteReplayStore(env.LITE_REPLAY_SQLITE_PATH)
    : null;
  const liteReplayAccess = liteReplayStore?.createReplayAccess() ?? null;
  const liteWriteStore = liteEdition
    ? createLiteWriteStore(env.LITE_WRITE_SQLITE_PATH)
    : null;
  const liteRecallStore = liteEdition
    ? createLiteRecallStore(env.LITE_WRITE_SQLITE_PATH)
    : null;
  const liteRecallAccess = liteRecallStore?.createRecallAccess() ?? null;

  const embedder = createEmbeddingProviderFromEnv(process.env);
  const sandboxExecutor = new SandboxExecutor(store, {
    enabled: env.SANDBOX_ENABLED,
    mode: env.SANDBOX_EXECUTOR_MODE,
    maxConcurrency: env.SANDBOX_EXECUTOR_MAX_CONCURRENCY,
    defaultTimeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
    stdioMaxBytes: env.SANDBOX_STDIO_MAX_BYTES,
    workdir: env.SANDBOX_EXECUTOR_WORKDIR,
    allowedCommands: sandboxAllowedCommands,
    remote: {
      url: env.SANDBOX_REMOTE_EXECUTOR_URL.trim() || null,
      authHeader: env.SANDBOX_REMOTE_EXECUTOR_AUTH_HEADER.trim(),
      authToken: env.SANDBOX_REMOTE_EXECUTOR_AUTH_TOKEN,
      timeoutMs: env.SANDBOX_REMOTE_EXECUTOR_TIMEOUT_MS,
      allowedHosts: sandboxRemoteAllowedHosts,
      allowedEgressCidrs: sandboxRemoteAllowedCidrs,
      denyPrivateIps: env.SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS,
      mtlsCertPem: env.SANDBOX_REMOTE_EXECUTOR_MTLS_CERT_PEM,
      mtlsKeyPem: env.SANDBOX_REMOTE_EXECUTOR_MTLS_KEY_PEM,
      mtlsCaPem: env.SANDBOX_REMOTE_EXECUTOR_MTLS_CA_PEM,
      mtlsServerName: env.SANDBOX_REMOTE_EXECUTOR_MTLS_SERVER_NAME,
    },
    artifactObjectStoreBaseUri: env.SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI.trim() || null,
    heartbeatIntervalMs: env.SANDBOX_RUN_HEARTBEAT_INTERVAL_MS,
    staleAfterMs: env.SANDBOX_RUN_STALE_AFTER_MS,
    recoveryPollIntervalMs: env.SANDBOX_RUN_RECOVERY_POLL_INTERVAL_MS,
    recoveryBatchSize: env.SANDBOX_RUN_RECOVERY_BATCH_SIZE,
  });
  const authResolver = createAuthResolver({
    mode: env.MEMORY_AUTH_MODE,
    apiKeysJson: env.MEMORY_API_KEYS_JSON,
    jwtHs256Secret: env.MEMORY_JWT_HS256_SECRET,
    jwtClockSkewSec: env.MEMORY_JWT_CLOCK_SKEW_SEC,
    jwtRequireExp: env.APP_ENV === "prod",
  });

  const healthDatabaseTargetHash = liteEdition ? null : databaseTargetHash(env.DATABASE_URL);
  const recallStoreCapabilities: RecallStoreCapabilities = {
    debug_embeddings: liteEdition || env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED,
    audit_insert: liteEdition || env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED,
  };
  const writeStoreCapabilities: WriteStoreCapabilities = {
    shadow_mirror_v2: liteEdition ? false : env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED,
  };
  const storeFeatureCapabilities = {
    sessions_graph: liteEdition || env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_SESSION_GRAPH_ENABLED,
    packs_export: liteEdition || env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_PACK_EXPORT_ENABLED,
    packs_import: liteEdition || env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_PACK_IMPORT_ENABLED,
  } as const;

  const recallAccessForClient = (client: any) => {
    if (liteRecallAccess) return liteRecallAccess;
    if (embeddedRuntime) return embeddedRuntime.createRecallAccess();
    return createPostgresRecallStoreAccess(client, {
      capabilities: recallStoreCapabilities,
    });
  };
  const writeAccessForClient = (client: any) => {
    if (liteWriteStore) return liteWriteStore;
    return createPostgresWriteStoreAccess(client, {
      capabilities: writeStoreCapabilities,
    });
  };
  const replayAccessForClient = (client: any) => {
    if (liteReplayAccess) return liteReplayAccess;
    return createPostgresReplayStoreAccess(client);
  };
  const requireStoreFeatureCapability = (capability: keyof typeof storeFeatureCapabilities): void => {
    if (storeFeatureCapabilities[capability]) return;
    const spec = capabilityContract(capability as CapabilityId);
    throw new HttpError(501, "backend_capability_unsupported", `backend capability unsupported: ${capability}`, {
      capability,
      backend: env.MEMORY_STORE_BACKEND,
      failure_mode: spec.failure_mode,
      degraded_mode: "feature_disabled",
      fallback_applied: false,
    });
  };

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
  const sandboxWriteLimiter = env.RATE_LIMIT_ENABLED
    ? new TokenBucketLimiter({
        rate_per_sec: env.SANDBOX_WRITE_RATE_LIMIT_RPS,
        burst: env.SANDBOX_WRITE_RATE_LIMIT_BURST,
        ttl_ms: env.RATE_LIMIT_TTL_MS,
        sweep_every_n: 500,
      })
    : null;
  const sandboxReadLimiter = env.RATE_LIMIT_ENABLED
    ? new TokenBucketLimiter({
        rate_per_sec: env.SANDBOX_READ_RATE_LIMIT_RPS,
        burst: env.SANDBOX_READ_RATE_LIMIT_BURST,
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

  const tenantQuotaDefaults = {
    recall_rps: env.TENANT_RECALL_RATE_LIMIT_RPS,
    recall_burst: env.TENANT_RECALL_RATE_LIMIT_BURST,
    write_rps: env.TENANT_WRITE_RATE_LIMIT_RPS,
    write_burst: env.TENANT_WRITE_RATE_LIMIT_BURST,
    write_max_wait_ms: env.TENANT_WRITE_RATE_LIMIT_MAX_WAIT_MS,
    debug_embed_rps: env.TENANT_DEBUG_EMBED_RATE_LIMIT_RPS,
    debug_embed_burst: env.TENANT_DEBUG_EMBED_RATE_LIMIT_BURST,
    recall_text_embed_rps: env.TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_RPS,
    recall_text_embed_burst: env.TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_BURST,
    recall_text_embed_max_wait_ms: env.TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS,
  };
  const resolveControlPlaneApiKeyPrincipal = liteEdition
    ? Object.assign(async () => null, {
        invalidate() {},
        clear() {},
      })
    : createApiKeyPrincipalResolver(db, {
        negative_ttl_ms: 10_000,
        cache_positive: false,
      });
  const tenantQuotaResolver = createTenantQuotaResolver(db, {
    cache_ttl_ms: env.CONTROL_TENANT_QUOTA_CACHE_TTL_MS,
    defaults: tenantQuotaDefaults,
  });
  const sandboxTenantBudgetPolicy = parseSandboxTenantBudgetPolicy(env.SANDBOX_TENANT_BUDGET_POLICY_JSON);

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

  return {
    sandboxRemoteAllowedHosts,
    sandboxRemoteAllowedCidrs,
    sandboxAllowedCommands,
    store,
    db,
    embeddedRuntime,
    liteRecallStore,
    liteRecallAccess,
    liteReplayStore,
    liteReplayAccess,
    liteWriteStore,
    embedder,
    sandboxExecutor,
    authResolver,
    healthDatabaseTargetHash,
    recallStoreCapabilities,
    writeStoreCapabilities,
    storeFeatureCapabilities,
    recallAccessForClient,
    replayAccessForClient,
    writeAccessForClient,
    requireStoreFeatureCapability,
    recallLimiter,
    debugEmbedLimiter,
    writeLimiter,
    sandboxWriteLimiter,
    sandboxReadLimiter,
    recallTextEmbedLimiter,
    resolveControlPlaneApiKeyPrincipal,
    tenantQuotaResolver,
    sandboxTenantBudgetPolicy,
    recallTextEmbedCache,
    recallTextEmbedInflight,
    recallTextEmbedBatcher,
    recallInflightGate,
    writeInflightGate,
  };
}
