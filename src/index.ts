import "dotenv/config";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ZodError, z } from "zod";
import { loadEnv } from "./config.js";
import { CAPABILITY_CONTRACT, capabilityContract, type CapabilityId } from "./capability-contract.js";
import { asPostgresMemoryStore, createMemoryStore } from "./store/memory-store.js";
import { createEmbeddedMemoryRuntime } from "./store/embedded-memory-runtime.js";
import {
  RECALL_STORE_ACCESS_CAPABILITY_VERSION,
  assertRecallStoreAccessContract,
  createPostgresRecallStoreAccess,
  type RecallStoreCapabilities,
} from "./store/recall-access.js";
import {
  WRITE_STORE_ACCESS_CAPABILITY_VERSION,
  assertWriteStoreAccessContract,
  createPostgresWriteStoreAccess,
  type WriteStoreCapabilities,
} from "./store/write-access.js";
import {
  createControlAlertRoute,
  enqueueControlIncidentPublishJob,
  createApiKeyPrincipalResolver,
  createControlApiKey,
  createTenantQuotaResolver,
  deleteTenantQuotaProfile,
  getTenantQuotaProfile,
  getTenantApiKeyUsageReport,
  getTenantDashboardSummary,
  getTenantOperabilityDiagnostics,
  getTenantIncidentPublishRollup,
  getTenantIncidentPublishSloReport,
  getTenantRequestTimeseries,
  listControlApiKeys,
  listControlAlertDeliveries,
  listControlAlertRoutes,
  listControlAuditEvents,
  listControlIncidentPublishJobs,
  replayControlIncidentPublishJobs,
  listStaleControlApiKeys,
  listControlTenants,
  recordMemoryContextAssemblyTelemetry,
  recordMemoryRequestTelemetry,
  recordControlAuditEvent,
  rotateControlApiKey,
  revokeControlApiKey,
  updateControlAlertRouteStatus,
  upsertControlProject,
  upsertControlTenant,
  upsertTenantQuotaProfile,
} from "./control-plane.js";
import { applyMemoryWrite, computeEffectiveWritePolicy, prepareMemoryWrite } from "./memory/write.js";
import { rehydrateArchiveNodes } from "./memory/rehydrate.js";
import { activateMemoryNodes } from "./memory/nodes-activate.js";
import { type RecallAuth, memoryRecallParsed } from "./memory/recall.js";
import { memoryFind } from "./memory/find.js";
import { memoryResolve } from "./memory/resolve.js";
import { createSession, listSessionEvents, writeSessionEvent } from "./memory/sessions.js";
import { exportMemoryPack, importMemoryPack } from "./memory/packs.js";
import { ruleFeedback } from "./memory/feedback.js";
import { updateRuleState } from "./memory/rules.js";
import { evaluateRules } from "./memory/rules-evaluate.js";
import { selectTools } from "./memory/tools-select.js";
import { getToolsDecisionById } from "./memory/tools-decision.js";
import { getToolsRunLifecycle } from "./memory/tools-run.js";
import { toolSelectionFeedback } from "./memory/tools-feedback.js";
import {
  replayPlaybookCompileFromRun,
  replayPlaybookGet,
  replayPlaybookPromote,
  replayPlaybookRepair,
  replayPlaybookRepairReview,
  replayPlaybookRun,
  replayRunEnd,
  replayRunGet,
  replayRunStart,
  replayStepAfter,
  replayStepBefore,
} from "./memory/replay.js";
import { buildReplayLearningProjectionDefaults } from "./memory/replay-learning.js";
import {
  SandboxExecutor,
  cancelSandboxRun,
  createSandboxSession,
  enqueueSandboxRun,
  getSandboxRunArtifact,
  getSandboxRun,
  getSandboxRunLogs,
  parseAllowedSandboxCommands,
} from "./memory/sandbox.js";
import { estimateTokenCountFromText } from "./memory/context.js";
import { assembleLayeredContext } from "./memory/context-orchestrator.js";
import { createEmbeddingProviderFromEnv } from "./embeddings/index.js";
import { EmbedHttpError } from "./embeddings/http.js";
import { runTopicClusterForEventIds } from "./jobs/topicClusterLib.js";
import {
  ContextAssembleRequest,
  MemoryRecallRequest,
  MemoryRecallTextRequest,
  PlanningContextRequest,
  ReplayPlaybookRunRequest,
} from "./memory/schemas.js";
import { normalizeText } from "./util/normalize.js";
import { redactPII } from "./util/redaction.js";
import { HttpError } from "./util/http.js";
import { requireAdminTokenHeader } from "./util/admin_auth.js";
import { sha256Hex } from "./util/crypto.js";
import { TokenBucketLimiter } from "./util/ratelimit.js";
import { LruTtlCache } from "./util/lru_ttl_cache.js";
import { createAuthResolver, type AuthPrincipal } from "./util/auth.js";
import { EmbedQueryBatcher, EmbedQueryBatcherError } from "./util/embed_query_batcher.js";
import { InflightGate, InflightGateError, type InflightGateToken } from "./util/inflight_gate.js";

type SandboxTenantBudgetPolicy = {
  daily_run_cap: number | null;
  daily_timeout_cap: number | null;
  daily_failure_cap: number | null;
};

type ReplayPlaybookStatus = "draft" | "shadow" | "active" | "disabled";
type ReplayRepairReviewAutoPromoteProfile = "custom" | "strict" | "staged" | "aggressive";
type ReplayRepairReviewEndpoint = "replay_playbook_repair_review";
type ReplayRepairReviewAutoPromoteGateDefaults = {
  require_shadow_pass: boolean;
  min_total_steps: number;
  max_failed_steps: number;
  max_blocked_steps: number;
  max_unknown_steps: number;
  min_success_ratio: number;
};
type ReplayRepairReviewAutoPromoteDefaults = {
  auto_promote_on_pass: boolean;
  auto_promote_target_status: ReplayPlaybookStatus;
  auto_promote_gate: ReplayRepairReviewAutoPromoteGateDefaults;
};
type ReplayRepairReviewPolicyPatch = {
  profile?: ReplayRepairReviewAutoPromoteProfile;
  auto_promote_on_pass?: boolean;
  auto_promote_target_status?: ReplayPlaybookStatus;
  auto_promote_gate?: Partial<ReplayRepairReviewAutoPromoteGateDefaults>;
};
type ReplayRepairReviewPolicy = {
  endpoint: Record<string, ReplayRepairReviewPolicyPatch>;
  tenant_default: Record<string, ReplayRepairReviewPolicyPatch>;
  tenant_endpoint: Record<string, Record<string, ReplayRepairReviewPolicyPatch>>;
  tenant_scope_default: Record<string, Record<string, ReplayRepairReviewPolicyPatch>>;
  tenant_scope_endpoint: Record<string, Record<string, Record<string, ReplayRepairReviewPolicyPatch>>>;
};
type ReplayRepairReviewDefaultsResolution = {
  endpoint: ReplayRepairReviewEndpoint;
  tenant_id: string;
  scope: string;
  base_source: "global_profile" | "global_env";
  base_profile: ReplayRepairReviewAutoPromoteProfile | null;
  sources_applied: Array<{
    layer:
      | "endpoint"
      | "tenant_default"
      | "tenant_endpoint"
      | "tenant_scope_default"
      | "tenant_scope_endpoint";
    key: string;
    patch: ReplayRepairReviewPolicyPatch;
  }>;
  request_overrides: {
    auto_promote_on_pass: boolean;
    auto_promote_target_status: boolean;
    gate: {
      require_shadow_pass: boolean;
      min_total_steps: boolean;
      max_failed_steps: boolean;
      max_blocked_steps: boolean;
      max_unknown_steps: boolean;
      min_success_ratio: boolean;
    };
  };
  effective: ReplayRepairReviewAutoPromoteDefaults;
};
const REPLAY_REPAIR_REVIEW_ENDPOINT_KEY: ReplayRepairReviewEndpoint = "replay_playbook_repair_review";

const REPLAY_REPAIR_REVIEW_PROFILE_DEFAULTS: Record<
  Exclude<ReplayRepairReviewAutoPromoteProfile, "custom">,
  ReplayRepairReviewAutoPromoteDefaults
> = {
  strict: {
    auto_promote_on_pass: false,
    auto_promote_target_status: "active",
    auto_promote_gate: {
      require_shadow_pass: true,
      min_total_steps: 1,
      max_failed_steps: 0,
      max_blocked_steps: 0,
      max_unknown_steps: 0,
      min_success_ratio: 1,
    },
  },
  staged: {
    auto_promote_on_pass: true,
    auto_promote_target_status: "shadow",
    auto_promote_gate: {
      require_shadow_pass: true,
      min_total_steps: 1,
      max_failed_steps: 0,
      max_blocked_steps: 0,
      max_unknown_steps: 0,
      min_success_ratio: 1,
    },
  },
  aggressive: {
    auto_promote_on_pass: true,
    auto_promote_target_status: "active",
    auto_promote_gate: {
      require_shadow_pass: false,
      min_total_steps: 1,
      max_failed_steps: 0,
      max_blocked_steps: 1,
      max_unknown_steps: 1,
      min_success_ratio: 0.9,
    },
  },
};

function sanitizeBudgetCap(value: unknown): number | null {
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

const env = loadEnv();
const sandboxRemoteAllowedHosts = parseSandboxRemoteAllowedHosts(env.SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON);
const sandboxRemoteAllowedCidrs = parseSandboxRemoteAllowedCidrs(env.SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON);
const sandboxAllowedCommands = parseAllowedSandboxCommands(env.SANDBOX_ALLOWED_COMMANDS_JSON);
const store = createMemoryStore({
  backend: env.MEMORY_STORE_BACKEND,
  databaseUrl: env.DATABASE_URL,
  embeddedExperimentalEnabled: env.MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED,
});
const db = asPostgresMemoryStore(store).db;
const embeddedRuntime =
  env.MEMORY_STORE_BACKEND === "embedded"
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

const healthDatabaseTargetHash = databaseTargetHash(env.DATABASE_URL);

const recallStoreCapabilities: RecallStoreCapabilities = {
  debug_embeddings: env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED,
  audit_insert: env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED,
};

function recallAccessForClient(client: any) {
  if (embeddedRuntime) return embeddedRuntime.createRecallAccess();
  return createPostgresRecallStoreAccess(client, {
    capabilities: recallStoreCapabilities,
  });
}

const writeStoreCapabilities: WriteStoreCapabilities = {
  shadow_mirror_v2: env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED,
};

const storeFeatureCapabilities = {
  sessions_graph: env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_SESSION_GRAPH_ENABLED,
  packs_export: env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_PACK_EXPORT_ENABLED,
  packs_import: env.MEMORY_STORE_BACKEND === "postgres" || env.MEMORY_STORE_EMBEDDED_PACK_IMPORT_ENABLED,
} as const;

function writeAccessForClient(client: any) {
  return createPostgresWriteStoreAccess(client, {
    capabilities: writeStoreCapabilities,
  });
}

function requireStoreFeatureCapability(capability: keyof typeof storeFeatureCapabilities): void {
  if (storeFeatureCapabilities[capability]) return;
  const spec = capabilityContract(capability as CapabilityId);
  throw new HttpError(501, "backend_capability_unsupported", `backend capability unsupported: ${capability}`, {
    capability,
    backend: env.MEMORY_STORE_BACKEND,
    failure_mode: spec.failure_mode,
    degraded_mode: "feature_disabled",
    fallback_applied: false,
  });
}

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

const resolveControlPlaneApiKeyPrincipal = createApiKeyPrincipalResolver(db, {
  ttl_ms: 60_000,
  negative_ttl_ms: 10_000,
});

const tenantQuotaResolver = createTenantQuotaResolver(db, {
  cache_ttl_ms: env.CONTROL_TENANT_QUOTA_CACHE_TTL_MS,
  defaults: {
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
  },
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

type RecallProfileDefaults = {
  limit: number;
  neighborhood_hops: 1 | 2;
  max_nodes: number;
  max_edges: number;
  ranked_limit: number;
  min_edge_weight: number;
  min_edge_confidence: number;
};

type RecallProfileName = "legacy" | "strict_edges" | "quality_first" | "lite";
type RecallEndpoint = "recall" | "recall_text";
type RecallStrategyName = "local" | "balanced" | "global";

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
  lite: {
    limit: 12,
    neighborhood_hops: 1,
    max_nodes: 24,
    max_edges: 24,
    ranked_limit: 48,
    min_edge_weight: 0.25,
    min_edge_confidence: 0.25,
  },
};

const RECALL_STRATEGY_DEFAULTS: Record<RecallStrategyName, RecallProfileDefaults> = {
  local: {
    limit: 16,
    neighborhood_hops: 1,
    max_nodes: 32,
    max_edges: 40,
    ranked_limit: 80,
    min_edge_weight: 0.2,
    min_edge_confidence: 0.2,
  },
  balanced: RECALL_PROFILE_DEFAULTS.strict_edges,
  global: RECALL_PROFILE_DEFAULTS.quality_first,
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

type RecallStrategyResolution = {
  strategy: RecallStrategyName;
  defaults: RecallProfileDefaults;
  applied: boolean;
  reason: "no_strategy" | "explicit_knobs" | "applied";
};

type RecallHardCapResolution = {
  defaults: RecallProfileDefaults;
  applied: boolean;
  reason: "disabled" | "explicit_knobs" | "wait_below_threshold" | "already_capped" | "queue_pressure_hard_cap";
};

const globalRecallProfileDefaults = RECALL_PROFILE_DEFAULTS[env.MEMORY_RECALL_PROFILE];
const recallProfilePolicy = parseRecallProfilePolicy(env.MEMORY_RECALL_PROFILE_POLICY_JSON);
const replayRepairReviewPolicy = parseReplayRepairReviewPolicy(env.REPLAY_REPAIR_REVIEW_POLICY_JSON);

function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

// CORS is route-scoped:
// - memory routes: browser clients for public POST APIs
// - admin routes: disabled by default; opt-in for internal console origins only
const CORS_MEMORY_ALLOW_ORIGINS = parseCorsOrigins(process.env.CORS_ALLOW_ORIGINS ?? (env.APP_ENV === "prod" ? "" : "*"));
const CORS_ADMIN_ALLOW_ORIGINS = parseCorsOrigins(process.env.CORS_ADMIN_ALLOW_ORIGINS ?? "");
const CORS_MEMORY_ALLOW_HEADERS = "content-type,x-api-key,x-tenant-id,authorization,x-request-id";
const CORS_MEMORY_ALLOW_METHODS = "POST,OPTIONS";
const CORS_ADMIN_ALLOW_HEADERS = "content-type,authorization,x-admin-token,x-request-id";
const CORS_ADMIN_ALLOW_METHODS = "GET,POST,PUT,DELETE,OPTIONS";
const CORS_ADMIN_ROUTE_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
type TelemetryEndpoint = "write" | "recall" | "recall_text" | "planning_context" | "context_assemble";

const TELEMETRY_MEMORY_ROUTE_TO_ENDPOINT = new Map<string, TelemetryEndpoint>([
  ["/v1/memory/write", "write"],
  ["/v1/memory/sessions", "write"],
  ["/v1/memory/events", "write"],
  ["/v1/memory/packs/import", "write"],
  ["/v1/memory/find", "recall"],
  ["/v1/memory/packs/export", "recall"],
  ["/v1/memory/recall", "recall"],
  ["/v1/memory/recall_text", "recall_text"],
  ["/v1/memory/planning/context", "planning_context"],
  ["/v1/memory/context/assemble", "context_assemble"],
  ["/v1/memory/tools/decision", "recall"],
  ["/v1/memory/replay/run/start", "write"],
  ["/v1/memory/replay/step/before", "write"],
  ["/v1/memory/replay/step/after", "write"],
  ["/v1/memory/replay/run/end", "write"],
  ["/v1/memory/replay/runs/get", "recall"],
  ["/v1/memory/replay/playbooks/compile_from_run", "write"],
  ["/v1/memory/replay/playbooks/get", "recall"],
  ["/v1/memory/replay/playbooks/promote", "write"],
  ["/v1/memory/replay/playbooks/repair", "write"],
  ["/v1/memory/replay/playbooks/repair/review", "write"],
  ["/v1/memory/replay/playbooks/run", "recall"],
]);

function resolveCorsAllowOrigin(origin: string | null, allowOrigins: string[]): string | null {
  if (allowOrigins.includes("*")) return "*";
  if (!origin) return null;
  return allowOrigins.includes(origin) ? origin : null;
}

function routePath(req: any): string {
  const raw = String(req?.routeOptions?.url ?? req?.routerPath ?? req?.url ?? "");
  return raw.split("?")[0] ?? raw;
}

function requestHeader(req: any, name: string): string | null {
  const raw = req?.headers?.[name];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") return raw[0];
  return null;
}

type CorsPolicy = {
  allow_origins: string[];
  allow_methods: string;
  allow_headers: string;
  expose_headers: string;
};

function resolveCorsPolicy(req: any): CorsPolicy | null {
  const path = routePath(req);
  const method = String(req?.method ?? "").toUpperCase();
  const preflightMethod = String(requestHeader(req, "access-control-request-method") ?? "").trim().toUpperCase();

  if (path.startsWith("/v1/memory/")) {
    const isMemoryCorsMethod = method === "POST" || (method === "OPTIONS" && preflightMethod === "POST");
    if (!isMemoryCorsMethod) return null;
    return {
      allow_origins: CORS_MEMORY_ALLOW_ORIGINS,
      allow_methods: CORS_MEMORY_ALLOW_METHODS,
      allow_headers: CORS_MEMORY_ALLOW_HEADERS,
      expose_headers: "x-request-id",
    };
  }

  if (path.startsWith("/v1/admin/")) {
    if (CORS_ADMIN_ALLOW_ORIGINS.length === 0) return null;
    const isAdminCorsMethod = CORS_ADMIN_ROUTE_METHODS.has(method);
    const isAdminPreflight = method === "OPTIONS" && CORS_ADMIN_ROUTE_METHODS.has(preflightMethod);
    if (!isAdminCorsMethod && !isAdminPreflight) return null;
    return {
      allow_origins: CORS_ADMIN_ALLOW_ORIGINS,
      allow_methods: CORS_ADMIN_ALLOW_METHODS,
      allow_headers: CORS_ADMIN_ALLOW_HEADERS,
      expose_headers: "x-request-id",
    };
  }

  return null;
}

function telemetryEndpointFromRequest(req: any): TelemetryEndpoint | null {
  if (String(req?.method ?? "").toUpperCase() !== "POST") return null;
  const p = routePath(req);
  return TELEMETRY_MEMORY_ROUTE_TO_ENDPOINT.get(p) ?? null;
}

function parseTelemetryEndpoint(v: unknown): TelemetryEndpoint | undefined {
  if (typeof v !== "string") return undefined;
  if (v === "write" || v === "recall" || v === "recall_text" || v === "planning_context" || v === "context_assemble") {
    return v;
  }
  return undefined;
}

type DashboardCursor = {
  v: 1;
  kind: "timeseries" | "key_usage";
  tenant_id: string;
  endpoint?: TelemetryEndpoint | null;
  window_hours: number;
  baseline_hours?: number;
  limit: number;
  offset: number;
  anchor_utc: string;
};

function encodeDashboardCursor(cursor: DashboardCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeDashboardCursor(raw: string): DashboardCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as DashboardCursor;
    if (!parsed || parsed.v !== 1 || !parsed.kind || !parsed.tenant_id || !parsed.anchor_utc) {
      throw new Error("malformed cursor");
    }
    if (!Number.isFinite(parsed.window_hours) || !Number.isFinite(parsed.limit) || !Number.isFinite(parsed.offset)) {
      throw new Error("malformed cursor numeric fields");
    }
    const d = new Date(parsed.anchor_utc);
    if (!Number.isFinite(d.getTime())) throw new Error("invalid cursor anchor");
    return {
      ...parsed,
      anchor_utc: d.toISOString(),
    };
  } catch {
    throw new HttpError(400, "invalid_request", "invalid cursor");
  }
}

function parseCursor(raw: unknown, kind: DashboardCursor["kind"], tenantId: string): DashboardCursor | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const cursor = decodeDashboardCursor(raw.trim());
  if (cursor.kind !== kind) throw new HttpError(400, "invalid_request", `cursor kind mismatch: expected ${kind}`);
  if (cursor.tenant_id !== tenantId) throw new HttpError(400, "invalid_request", "cursor tenant mismatch");
  return cursor;
}

function resolveRequestScopeForTelemetry(req: any): string {
  if (typeof req?.aionis_scope === "string" && req.aionis_scope.trim().length > 0) return req.aionis_scope.trim();
  const body = req?.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const s = (body as any).scope;
    if (typeof s === "string" && s.trim().length > 0) return s.trim();
  }
  return env.MEMORY_SCOPE;
}

function resolveRequestTenantForTelemetry(req: any): string {
  if (typeof req?.aionis_tenant_id === "string" && req.aionis_tenant_id.trim().length > 0) return req.aionis_tenant_id.trim();
  const body = req?.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const t = (body as any).tenant_id;
    if (typeof t === "string" && t.trim().length > 0) return t.trim();
  }
  const headerTenant = typeof req?.headers?.["x-tenant-id"] === "string" ? String(req.headers["x-tenant-id"]).trim() : "";
  if (headerTenant) return headerTenant;
  return env.MEMORY_TENANT_ID;
}

function resolveRequestApiKeyPrefixForTelemetry(req: any): string | null {
  const tagged = (req as any)?.aionis_api_key_prefix;
  if (typeof tagged === "string" && tagged.trim().length > 0) return tagged.trim();
  return null;
}

type ContextAssemblyEndpoint = "planning_context" | "context_assemble";

type ContextAssemblyLayerTelemetryRow = {
  layer_name: "facts" | "episodes" | "rules" | "decisions" | "tools" | "citations";
  source_count: number;
  kept_count: number;
  dropped_count: number;
  budget_chars: number;
  used_chars: number;
  max_items: number;
};

function parseNonNegativeNumber(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function collectLayeredContextTelemetryRows(layeredContext: any): ContextAssemblyLayerTelemetryRow[] {
  if (!layeredContext || typeof layeredContext !== "object") return [];
  const layers = layeredContext.layers;
  if (!layers || typeof layers !== "object" || Array.isArray(layers)) return [];
  const validLayers = ["facts", "episodes", "rules", "decisions", "tools", "citations"] as const;
  const out: ContextAssemblyLayerTelemetryRow[] = [];
  for (const layerName of validLayers) {
    const layer = (layers as any)[layerName];
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) continue;
    out.push({
      layer_name: layerName,
      source_count: parseNonNegativeNumber(layer.source_count),
      kept_count: parseNonNegativeNumber(layer.kept_count),
      dropped_count: parseNonNegativeNumber(layer.dropped_count),
      budget_chars: parseNonNegativeNumber(layer.budget_chars),
      used_chars: parseNonNegativeNumber(layer.used_chars),
      max_items: parseNonNegativeNumber(layer.max_items),
    });
  }
  return out;
}

async function recordContextAssemblyTelemetryBestEffort(args: {
  req: any;
  tenant_id: string;
  scope: string;
  endpoint: ContextAssemblyEndpoint;
  latency_ms: number;
  layered_output: boolean;
  layered_context: any;
}) {
  const isLayeredOutput = args.layered_output === true;
  const layerRows = isLayeredOutput ? collectLayeredContextTelemetryRows(args.layered_context) : [];
  await recordMemoryContextAssemblyTelemetry(db, {
    tenant_id: args.tenant_id,
    scope: args.scope,
    endpoint: args.endpoint,
    layered_output: isLayeredOutput,
    latency_ms: parseNonNegativeNumber(args.latency_ms),
    request_id: String(args.req?.id ?? ""),
    total_budget_chars: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.budget?.total_chars) : 0,
    used_chars: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.budget?.used_chars) : 0,
    remaining_chars: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.budget?.remaining_chars) : 0,
    source_items: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.stats?.source_items) : 0,
    kept_items: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.stats?.kept_items) : 0,
    dropped_items: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.stats?.dropped_items) : 0,
    layers_with_content: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.stats?.layers_with_content) : 0,
    merge_trace_included: isLayeredOutput ? Array.isArray(args.layered_context?.merge_trace) : false,
    layers: layerRows,
  });
}

function withRecallProfileDefaults(body: unknown, defaults: RecallProfileDefaults) {
  const out: Record<string, unknown> = body && typeof body === "object" ? { ...(body as Record<string, unknown>) } : {};
  const entries = Object.entries(defaults) as Array<[keyof RecallProfileDefaults, number]>;
  for (const [key, value] of entries) {
    if (out[key] === undefined || out[key] === null) out[key] = value;
  }
  return out;
}

function cloneReplayRepairReviewDefaults(defaults: ReplayRepairReviewAutoPromoteDefaults): ReplayRepairReviewAutoPromoteDefaults {
  return {
    auto_promote_on_pass: defaults.auto_promote_on_pass,
    auto_promote_target_status: defaults.auto_promote_target_status,
    auto_promote_gate: { ...defaults.auto_promote_gate },
  };
}

function resolveReplayRepairReviewGlobalDefaults(): {
  defaults: ReplayRepairReviewAutoPromoteDefaults;
  source: "global_profile" | "global_env";
  profile: ReplayRepairReviewAutoPromoteProfile | null;
} {
  const profile = env.REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_PROFILE as ReplayRepairReviewAutoPromoteProfile;
  const profileDefaults = profile === "custom" ? null : REPLAY_REPAIR_REVIEW_PROFILE_DEFAULTS[profile];
  if (profileDefaults) {
    return {
      defaults: cloneReplayRepairReviewDefaults(profileDefaults),
      source: "global_profile",
      profile,
    };
  }
  return {
    defaults: {
      auto_promote_on_pass: env.REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT,
      auto_promote_target_status: env.REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_TARGET_STATUS,
      auto_promote_gate: {
        require_shadow_pass: env.REPLAY_REPAIR_REVIEW_GATE_REQUIRE_SHADOW_PASS,
        min_total_steps: env.REPLAY_REPAIR_REVIEW_GATE_MIN_TOTAL_STEPS,
        max_failed_steps: env.REPLAY_REPAIR_REVIEW_GATE_MAX_FAILED_STEPS,
        max_blocked_steps: env.REPLAY_REPAIR_REVIEW_GATE_MAX_BLOCKED_STEPS,
        max_unknown_steps: env.REPLAY_REPAIR_REVIEW_GATE_MAX_UNKNOWN_STEPS,
        min_success_ratio: env.REPLAY_REPAIR_REVIEW_GATE_MIN_SUCCESS_RATIO,
      },
    },
    source: "global_env",
    profile: null,
  };
}

function applyReplayRepairReviewPolicyPatch(
  base: ReplayRepairReviewAutoPromoteDefaults,
  patch: ReplayRepairReviewPolicyPatch | null | undefined,
): ReplayRepairReviewAutoPromoteDefaults {
  if (!patch) return cloneReplayRepairReviewDefaults(base);
  let out = cloneReplayRepairReviewDefaults(base);
  if (patch.profile && patch.profile !== "custom") {
    out = cloneReplayRepairReviewDefaults(REPLAY_REPAIR_REVIEW_PROFILE_DEFAULTS[patch.profile]);
  }
  if (typeof patch.auto_promote_on_pass === "boolean") out.auto_promote_on_pass = patch.auto_promote_on_pass;
  if (patch.auto_promote_target_status) out.auto_promote_target_status = patch.auto_promote_target_status;
  if (patch.auto_promote_gate) {
    if (typeof patch.auto_promote_gate.require_shadow_pass === "boolean") {
      out.auto_promote_gate.require_shadow_pass = patch.auto_promote_gate.require_shadow_pass;
    }
    if (typeof patch.auto_promote_gate.min_total_steps === "number") {
      out.auto_promote_gate.min_total_steps = patch.auto_promote_gate.min_total_steps;
    }
    if (typeof patch.auto_promote_gate.max_failed_steps === "number") {
      out.auto_promote_gate.max_failed_steps = patch.auto_promote_gate.max_failed_steps;
    }
    if (typeof patch.auto_promote_gate.max_blocked_steps === "number") {
      out.auto_promote_gate.max_blocked_steps = patch.auto_promote_gate.max_blocked_steps;
    }
    if (typeof patch.auto_promote_gate.max_unknown_steps === "number") {
      out.auto_promote_gate.max_unknown_steps = patch.auto_promote_gate.max_unknown_steps;
    }
    if (typeof patch.auto_promote_gate.min_success_ratio === "number") {
      out.auto_promote_gate.min_success_ratio = patch.auto_promote_gate.min_success_ratio;
    }
  }
  return out;
}

function resolveReplayRepairReviewDefaults(
  tenantIdRaw: string | null | undefined,
  scopeRaw: string | null | undefined,
  endpoint: ReplayRepairReviewEndpoint,
): ReplayRepairReviewDefaultsResolution {
  const tenantId = String(tenantIdRaw ?? "").trim() || env.MEMORY_TENANT_ID;
  const scope = String(scopeRaw ?? "").trim() || env.MEMORY_SCOPE;
  const global = resolveReplayRepairReviewGlobalDefaults();
  let out = cloneReplayRepairReviewDefaults(global.defaults);
  const sourcesApplied: ReplayRepairReviewDefaultsResolution["sources_applied"] = [];
  const apply = (
    layer: ReplayRepairReviewDefaultsResolution["sources_applied"][number]["layer"],
    key: string,
    patch: ReplayRepairReviewPolicyPatch | null | undefined,
  ) => {
    if (!patch) return;
    out = applyReplayRepairReviewPolicyPatch(out, patch);
    sourcesApplied.push({ layer, key, patch });
  };
  apply("endpoint", "*", replayRepairReviewPolicy.endpoint["*"]);
  apply("endpoint", endpoint, replayRepairReviewPolicy.endpoint[endpoint]);
  apply("tenant_default", "*", replayRepairReviewPolicy.tenant_default["*"]);
  apply("tenant_default", tenantId, replayRepairReviewPolicy.tenant_default[tenantId]);
  apply("tenant_endpoint", "*.*", replayRepairReviewPolicy.tenant_endpoint["*"]?.["*"]);
  apply("tenant_endpoint", `*.${endpoint}`, replayRepairReviewPolicy.tenant_endpoint["*"]?.[endpoint]);
  apply("tenant_endpoint", `${tenantId}.*`, replayRepairReviewPolicy.tenant_endpoint[tenantId]?.["*"]);
  apply("tenant_endpoint", `${tenantId}.${endpoint}`, replayRepairReviewPolicy.tenant_endpoint[tenantId]?.[endpoint]);
  apply("tenant_scope_default", "*.*", replayRepairReviewPolicy.tenant_scope_default["*"]?.["*"]);
  apply("tenant_scope_default", `*.${scope}`, replayRepairReviewPolicy.tenant_scope_default["*"]?.[scope]);
  apply("tenant_scope_default", `${tenantId}.*`, replayRepairReviewPolicy.tenant_scope_default[tenantId]?.["*"]);
  apply("tenant_scope_default", `${tenantId}.${scope}`, replayRepairReviewPolicy.tenant_scope_default[tenantId]?.[scope]);
  apply("tenant_scope_endpoint", "*.*.*", replayRepairReviewPolicy.tenant_scope_endpoint["*"]?.["*"]?.["*"]);
  apply("tenant_scope_endpoint", `*.*.${endpoint}`, replayRepairReviewPolicy.tenant_scope_endpoint["*"]?.["*"]?.[endpoint]);
  apply("tenant_scope_endpoint", `*.${scope}.*`, replayRepairReviewPolicy.tenant_scope_endpoint["*"]?.[scope]?.["*"]);
  apply(
    "tenant_scope_endpoint",
    `*.${scope}.${endpoint}`,
    replayRepairReviewPolicy.tenant_scope_endpoint["*"]?.[scope]?.[endpoint],
  );
  apply(
    "tenant_scope_endpoint",
    `${tenantId}.*.*`,
    replayRepairReviewPolicy.tenant_scope_endpoint[tenantId]?.["*"]?.["*"],
  );
  apply(
    "tenant_scope_endpoint",
    `${tenantId}.*.${endpoint}`,
    replayRepairReviewPolicy.tenant_scope_endpoint[tenantId]?.["*"]?.[endpoint],
  );
  apply(
    "tenant_scope_endpoint",
    `${tenantId}.${scope}.*`,
    replayRepairReviewPolicy.tenant_scope_endpoint[tenantId]?.[scope]?.["*"],
  );
  apply(
    "tenant_scope_endpoint",
    `${tenantId}.${scope}.${endpoint}`,
    replayRepairReviewPolicy.tenant_scope_endpoint[tenantId]?.[scope]?.[endpoint],
  );
  return {
    endpoint,
    tenant_id: tenantId,
    scope,
    base_source: global.source,
    base_profile: global.profile,
    sources_applied: sourcesApplied,
    request_overrides: {
      auto_promote_on_pass: false,
      auto_promote_target_status: false,
      gate: {
        require_shadow_pass: false,
        min_total_steps: false,
        max_failed_steps: false,
        max_blocked_steps: false,
        max_unknown_steps: false,
        min_success_ratio: false,
      },
    },
    effective: out,
  };
}

function withReplayRepairReviewDefaults(body: unknown): {
  body: Record<string, unknown>;
  resolution: ReplayRepairReviewDefaultsResolution;
} {
  const out: Record<string, unknown> = body && typeof body === "object" && !Array.isArray(body)
    ? { ...(body as Record<string, unknown>) }
    : {};
  const tenantId = tenantFromBody(out);
  const scope = scopeFromBody(out);
  const resolution = resolveReplayRepairReviewDefaults(tenantId, scope, REPLAY_REPAIR_REVIEW_ENDPOINT_KEY);
  const resolved = resolution.effective;
  resolution.request_overrides.auto_promote_on_pass = out.auto_promote_on_pass !== undefined && out.auto_promote_on_pass !== null;
  resolution.request_overrides.auto_promote_target_status =
    out.auto_promote_target_status !== undefined && out.auto_promote_target_status !== null;
  if (out.auto_promote_on_pass === undefined || out.auto_promote_on_pass === null) {
    out.auto_promote_on_pass = resolved.auto_promote_on_pass;
  }
  if (out.auto_promote_target_status === undefined || out.auto_promote_target_status === null) {
    out.auto_promote_target_status = resolved.auto_promote_target_status;
  }
  const gateRaw = out.auto_promote_gate;
  const gate: Record<string, unknown> = gateRaw && typeof gateRaw === "object" && !Array.isArray(gateRaw)
    ? { ...(gateRaw as Record<string, unknown>) }
    : {};
  resolution.request_overrides.gate.require_shadow_pass =
    gate.require_shadow_pass !== undefined && gate.require_shadow_pass !== null;
  resolution.request_overrides.gate.min_total_steps = gate.min_total_steps !== undefined && gate.min_total_steps !== null;
  resolution.request_overrides.gate.max_failed_steps = gate.max_failed_steps !== undefined && gate.max_failed_steps !== null;
  resolution.request_overrides.gate.max_blocked_steps = gate.max_blocked_steps !== undefined && gate.max_blocked_steps !== null;
  resolution.request_overrides.gate.max_unknown_steps = gate.max_unknown_steps !== undefined && gate.max_unknown_steps !== null;
  resolution.request_overrides.gate.min_success_ratio = gate.min_success_ratio !== undefined && gate.min_success_ratio !== null;
  if (gate.require_shadow_pass === undefined || gate.require_shadow_pass === null) {
    gate.require_shadow_pass = resolved.auto_promote_gate.require_shadow_pass;
  }
  if (gate.min_total_steps === undefined || gate.min_total_steps === null) {
    gate.min_total_steps = resolved.auto_promote_gate.min_total_steps;
  }
  if (gate.max_failed_steps === undefined || gate.max_failed_steps === null) {
    gate.max_failed_steps = resolved.auto_promote_gate.max_failed_steps;
  }
  if (gate.max_blocked_steps === undefined || gate.max_blocked_steps === null) {
    gate.max_blocked_steps = resolved.auto_promote_gate.max_blocked_steps;
  }
  if (gate.max_unknown_steps === undefined || gate.max_unknown_steps === null) {
    gate.max_unknown_steps = resolved.auto_promote_gate.max_unknown_steps;
  }
  if (gate.min_success_ratio === undefined || gate.min_success_ratio === null) {
    gate.min_success_ratio = resolved.auto_promote_gate.min_success_ratio;
  }
  out.auto_promote_gate = gate;
  return { body: out, resolution };
}

function parseReplayRepairReviewPolicyPatch(raw: unknown, path: string): ReplayRepairReviewPolicyPatch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const out: ReplayRepairReviewPolicyPatch = {};
  if (obj.profile !== undefined) {
    const profile = String(obj.profile ?? "").trim();
    if (profile !== "custom" && profile !== "strict" && profile !== "staged" && profile !== "aggressive") {
      throw new Error(`${path}.profile must be one of: custom|strict|staged|aggressive`);
    }
    out.profile = profile as ReplayRepairReviewAutoPromoteProfile;
  }
  if (obj.auto_promote_on_pass !== undefined) {
    if (typeof obj.auto_promote_on_pass !== "boolean") {
      throw new Error(`${path}.auto_promote_on_pass must be boolean`);
    }
    out.auto_promote_on_pass = obj.auto_promote_on_pass;
  }
  if (obj.auto_promote_target_status !== undefined) {
    const status = String(obj.auto_promote_target_status ?? "").trim();
    if (status !== "draft" && status !== "shadow" && status !== "active" && status !== "disabled") {
      throw new Error(`${path}.auto_promote_target_status must be one of: draft|shadow|active|disabled`);
    }
    out.auto_promote_target_status = status as ReplayPlaybookStatus;
  }
  if (obj.auto_promote_gate !== undefined) {
    if (!obj.auto_promote_gate || typeof obj.auto_promote_gate !== "object" || Array.isArray(obj.auto_promote_gate)) {
      throw new Error(`${path}.auto_promote_gate must be an object`);
    }
    const gateObj = obj.auto_promote_gate as Record<string, unknown>;
    const gate: Partial<ReplayRepairReviewAutoPromoteGateDefaults> = {};
    if (gateObj.require_shadow_pass !== undefined) {
      if (typeof gateObj.require_shadow_pass !== "boolean") {
        throw new Error(`${path}.auto_promote_gate.require_shadow_pass must be boolean`);
      }
      gate.require_shadow_pass = gateObj.require_shadow_pass;
    }
    const parseNonNegativeInt = (value: unknown, key: string): number => {
      const n = Number(value);
      if (!Number.isFinite(n) || Math.trunc(n) !== n || n < 0) {
        throw new Error(`${path}.auto_promote_gate.${key} must be a non-negative integer`);
      }
      return n;
    };
    if (gateObj.min_total_steps !== undefined) gate.min_total_steps = parseNonNegativeInt(gateObj.min_total_steps, "min_total_steps");
    if (gateObj.max_failed_steps !== undefined) gate.max_failed_steps = parseNonNegativeInt(gateObj.max_failed_steps, "max_failed_steps");
    if (gateObj.max_blocked_steps !== undefined) gate.max_blocked_steps = parseNonNegativeInt(gateObj.max_blocked_steps, "max_blocked_steps");
    if (gateObj.max_unknown_steps !== undefined) gate.max_unknown_steps = parseNonNegativeInt(gateObj.max_unknown_steps, "max_unknown_steps");
    if (gateObj.min_success_ratio !== undefined) {
      const ratio = Number(gateObj.min_success_ratio);
      if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        throw new Error(`${path}.auto_promote_gate.min_success_ratio must be between 0 and 1`);
      }
      gate.min_success_ratio = ratio;
    }
    out.auto_promote_gate = gate;
  }
  return out;
}

function parseReplayRepairReviewPolicy(raw: string): ReplayRepairReviewPolicy {
  const out: ReplayRepairReviewPolicy = {
    endpoint: {},
    tenant_default: {},
    tenant_endpoint: {},
    tenant_scope_default: {},
    tenant_scope_endpoint: {},
  };
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === "{}") return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("REPLAY_REPAIR_REVIEW_POLICY_JSON must be valid JSON object");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("REPLAY_REPAIR_REVIEW_POLICY_JSON must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.endpoint !== undefined) {
    if (!obj.endpoint || typeof obj.endpoint !== "object" || Array.isArray(obj.endpoint)) {
      throw new Error("REPLAY_REPAIR_REVIEW_POLICY_JSON.endpoint must be an object");
    }
    for (const [endpointKey, patchRaw] of Object.entries(obj.endpoint as Record<string, unknown>)) {
      const key = endpointKey.trim();
      if (!key) continue;
      out.endpoint[key] = parseReplayRepairReviewPolicyPatch(
        patchRaw,
        `REPLAY_REPAIR_REVIEW_POLICY_JSON.endpoint.${key}`,
      );
    }
  }
  if (obj.tenant_default !== undefined) {
    if (!obj.tenant_default || typeof obj.tenant_default !== "object" || Array.isArray(obj.tenant_default)) {
      throw new Error("REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_default must be an object");
    }
    for (const [tenantIdRaw, patchRaw] of Object.entries(obj.tenant_default as Record<string, unknown>)) {
      const tenantId = tenantIdRaw.trim();
      if (!tenantId) continue;
      out.tenant_default[tenantId] = parseReplayRepairReviewPolicyPatch(
        patchRaw,
        `REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_default.${tenantId}`,
      );
    }
  }
  if (obj.tenant_endpoint !== undefined) {
    if (!obj.tenant_endpoint || typeof obj.tenant_endpoint !== "object" || Array.isArray(obj.tenant_endpoint)) {
      throw new Error("REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_endpoint must be an object");
    }
    for (const [tenantIdRaw, endpointMapRaw] of Object.entries(obj.tenant_endpoint as Record<string, unknown>)) {
      const tenantId = tenantIdRaw.trim();
      if (!tenantId) continue;
      if (!endpointMapRaw || typeof endpointMapRaw !== "object" || Array.isArray(endpointMapRaw)) {
        throw new Error(`REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_endpoint.${tenantId} must be an object`);
      }
      const endpointMap = endpointMapRaw as Record<string, unknown>;
      const parsedEndpointMap: Record<string, ReplayRepairReviewPolicyPatch> = {};
      for (const [endpointKeyRaw, patchRaw] of Object.entries(endpointMap)) {
        const endpointKey = endpointKeyRaw.trim();
        if (!endpointKey) continue;
        parsedEndpointMap[endpointKey] = parseReplayRepairReviewPolicyPatch(
          patchRaw,
          `REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_endpoint.${tenantId}.${endpointKey}`,
        );
      }
      out.tenant_endpoint[tenantId] = parsedEndpointMap;
    }
  }
  if (obj.tenant_scope_default !== undefined) {
    if (!obj.tenant_scope_default || typeof obj.tenant_scope_default !== "object" || Array.isArray(obj.tenant_scope_default)) {
      throw new Error("REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_scope_default must be an object");
    }
    for (const [tenantIdRaw, scopeMapRaw] of Object.entries(obj.tenant_scope_default as Record<string, unknown>)) {
      const tenantId = tenantIdRaw.trim();
      if (!tenantId) continue;
      if (!scopeMapRaw || typeof scopeMapRaw !== "object" || Array.isArray(scopeMapRaw)) {
        throw new Error(`REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_scope_default.${tenantId} must be an object`);
      }
      const scopeMap = scopeMapRaw as Record<string, unknown>;
      const parsedScopeMap: Record<string, ReplayRepairReviewPolicyPatch> = {};
      for (const [scopeRaw, patchRaw] of Object.entries(scopeMap)) {
        const scope = scopeRaw.trim();
        if (!scope) continue;
        parsedScopeMap[scope] = parseReplayRepairReviewPolicyPatch(
          patchRaw,
          `REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_scope_default.${tenantId}.${scope}`,
        );
      }
      out.tenant_scope_default[tenantId] = parsedScopeMap;
    }
  }
  if (obj.tenant_scope_endpoint !== undefined) {
    if (!obj.tenant_scope_endpoint || typeof obj.tenant_scope_endpoint !== "object" || Array.isArray(obj.tenant_scope_endpoint)) {
      throw new Error("REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_scope_endpoint must be an object");
    }
    for (const [tenantIdRaw, scopeMapRaw] of Object.entries(obj.tenant_scope_endpoint as Record<string, unknown>)) {
      const tenantId = tenantIdRaw.trim();
      if (!tenantId) continue;
      if (!scopeMapRaw || typeof scopeMapRaw !== "object" || Array.isArray(scopeMapRaw)) {
        throw new Error(`REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_scope_endpoint.${tenantId} must be an object`);
      }
      const scopeMap = scopeMapRaw as Record<string, unknown>;
      const parsedScopeMap: Record<string, Record<string, ReplayRepairReviewPolicyPatch>> = {};
      for (const [scopeRaw, endpointMapRaw] of Object.entries(scopeMap)) {
        const scope = scopeRaw.trim();
        if (!scope) continue;
        if (!endpointMapRaw || typeof endpointMapRaw !== "object" || Array.isArray(endpointMapRaw)) {
          throw new Error(`REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_scope_endpoint.${tenantId}.${scope} must be an object`);
        }
        const endpointMap = endpointMapRaw as Record<string, unknown>;
        const parsedEndpointMap: Record<string, ReplayRepairReviewPolicyPatch> = {};
        for (const [endpointKeyRaw, patchRaw] of Object.entries(endpointMap)) {
          const endpointKey = endpointKeyRaw.trim();
          if (!endpointKey) continue;
          parsedEndpointMap[endpointKey] = parseReplayRepairReviewPolicyPatch(
            patchRaw,
            `REPLAY_REPAIR_REVIEW_POLICY_JSON.tenant_scope_endpoint.${tenantId}.${scope}.${endpointKey}`,
          );
        }
        parsedScopeMap[scope] = parsedEndpointMap;
      }
      out.tenant_scope_endpoint[tenantId] = parsedScopeMap;
    }
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

function resolveRecallStrategy(body: unknown, hasExplicitKnobs: boolean): RecallStrategyResolution {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { strategy: "balanced", defaults: RECALL_STRATEGY_DEFAULTS.balanced, applied: false, reason: "no_strategy" };
  }
  const raw = (body as Record<string, unknown>).recall_strategy;
  if (raw !== "local" && raw !== "balanced" && raw !== "global") {
    return { strategy: "balanced", defaults: RECALL_STRATEGY_DEFAULTS.balanced, applied: false, reason: "no_strategy" };
  }
  const strategy = raw as RecallStrategyName;
  if (hasExplicitKnobs) {
    return { strategy, defaults: RECALL_STRATEGY_DEFAULTS[strategy], applied: false, reason: "explicit_knobs" };
  }
  return { strategy, defaults: RECALL_STRATEGY_DEFAULTS[strategy], applied: true, reason: "applied" };
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

function resolveAdaptiveRecallHardCap(
  current: RecallProfileDefaults,
  gateWaitMs: number,
  hasExplicitKnobs: boolean,
): RecallHardCapResolution {
  if (!env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_ENABLED) {
    return { defaults: current, applied: false, reason: "disabled" };
  }
  if (hasExplicitKnobs) {
    return { defaults: current, applied: false, reason: "explicit_knobs" };
  }
  if (gateWaitMs < env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS) {
    return { defaults: current, applied: false, reason: "wait_below_threshold" };
  }
  const capped: RecallProfileDefaults = {
    limit: Math.min(current.limit, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_LIMIT),
    neighborhood_hops: (Math.min(current.neighborhood_hops, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_NEIGHBORHOOD_HOPS) as 1 | 2),
    max_nodes: Math.min(current.max_nodes, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_NODES),
    max_edges: Math.min(current.max_edges, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_EDGES),
    ranked_limit: Math.min(current.ranked_limit, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_RANKED_LIMIT),
    min_edge_weight: Math.max(current.min_edge_weight, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_WEIGHT),
    min_edge_confidence: Math.max(current.min_edge_confidence, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_CONFIDENCE),
  };
  const changed =
    capped.limit !== current.limit ||
    capped.neighborhood_hops !== current.neighborhood_hops ||
    capped.max_nodes !== current.max_nodes ||
    capped.max_edges !== current.max_edges ||
    capped.ranked_limit !== current.ranked_limit ||
    capped.min_edge_weight !== current.min_edge_weight ||
    capped.min_edge_confidence !== current.min_edge_confidence;
  if (!changed) {
    return { defaults: current, applied: false, reason: "already_capped" };
  }
  return { defaults: capped, applied: true, reason: "queue_pressure_hard_cap" };
}

function buildRecallTrajectory(args: {
  strategy: RecallStrategyName;
  limit: number;
  neighborhood_hops: number;
  max_nodes: number;
  max_edges: number;
  ranked_limit: number;
  min_edge_weight: number;
  min_edge_confidence: number;
  seeds: number;
  nodes: number;
  edges: number;
  context_chars: number;
  timings: Record<string, number>;
  neighborhood_counts?: { nodes?: number; edges?: number } | null;
  stage1?: {
    mode?: "ann" | "exact_fallback";
    ann_seed_count?: number;
    final_seed_count?: number;
    exact_fallback_enabled?: boolean;
    exact_fallback_attempted?: boolean;
  } | null;
  uri_links?: {
    nodes: string[];
    edges: string[];
    commits: string[];
    decisions: string[];
    counts: {
      nodes: number;
      edges: number;
      commits: number;
      decisions: number;
    };
    chain?: {
      decision_uri: string;
      commit_uri?: string;
      node_uri?: string;
      edge_uri?: string;
    };
  } | null;
}) {
  const stage1Ms = (args.timings["stage1_candidates_ann"] ?? 0) + (args.timings["stage1_candidates_exact_fallback"] ?? 0);
  const stage2Ms = (args.timings["stage2_edges"] ?? 0) + (args.timings["stage2_nodes"] ?? 0) + (args.timings["stage2_spread"] ?? 0);
  const stage3Ms = args.timings["stage3_context"] ?? 0;
  const stage1AnnSeeds = Number.isFinite(args.stage1?.ann_seed_count) ? Number(args.stage1?.ann_seed_count) : args.seeds;
  const stage1FinalSeeds = Number.isFinite(args.stage1?.final_seed_count) ? Number(args.stage1?.final_seed_count) : args.seeds;
  const neighborhoodNodeCandidates = Number.isFinite(args.neighborhood_counts?.nodes)
    ? Number(args.neighborhood_counts?.nodes)
    : args.nodes;
  const neighborhoodEdgeCandidates = Number.isFinite(args.neighborhood_counts?.edges)
    ? Number(args.neighborhood_counts?.edges)
    : args.edges;
  const droppedNodes = Math.max(0, neighborhoodNodeCandidates - args.nodes);
  const droppedEdges = Math.max(0, neighborhoodEdgeCandidates - args.edges);

  const stage0Reasons: string[] = [];
  if (stage1FinalSeeds === 0) stage0Reasons.push("seed_empty");
  if (args.stage1?.exact_fallback_attempted && stage1FinalSeeds === 0) stage0Reasons.push("exact_fallback_empty");
  if (args.stage1?.mode === "exact_fallback" && stage1AnnSeeds === 0 && stage1FinalSeeds > 0) {
    stage0Reasons.push("ann_empty_recovered_by_exact_fallback");
  }

  const stage1Reasons: string[] = [];
  if (droppedNodes > 0 && args.nodes >= args.max_nodes) stage1Reasons.push("max_nodes_cap");
  if (droppedEdges > 0 && args.edges >= args.max_edges) stage1Reasons.push("max_edges_cap");
  if (args.min_edge_weight > 0 || args.min_edge_confidence > 0) stage1Reasons.push("edge_quality_thresholds_active");
  if (args.nodes === 0 && stage1FinalSeeds > 0) stage1Reasons.push("seed_visibility_or_state_filtered");

  const stage2Reasons: string[] = [];
  if (args.context_chars === 0 && args.nodes === 0) stage2Reasons.push("context_empty_no_nodes");
  if (args.context_chars === 0 && args.nodes > 0) stage2Reasons.push("context_empty_after_compaction_or_missing_text");

  const pruned_reasons = Array.from(new Set([...stage0Reasons, ...stage1Reasons, ...stage2Reasons]));

  return {
    strategy: args.strategy,
    layers: [
      {
        level: "L0",
        name: "seed_candidates",
        hits: stage1FinalSeeds,
        ann_seed_candidates: stage1AnnSeeds,
        mode: args.stage1?.mode ?? "ann",
        exact_fallback_attempted: args.stage1?.exact_fallback_attempted ?? false,
        duration_ms: stage1Ms,
        pruned_reasons: stage0Reasons,
      },
      {
        level: "L1",
        name: "graph_expansion",
        hits: args.nodes,
        edges: args.edges,
        candidate_nodes: neighborhoodNodeCandidates,
        candidate_edges: neighborhoodEdgeCandidates,
        dropped_nodes: droppedNodes,
        dropped_edges: droppedEdges,
        duration_ms: stage2Ms,
        pruned_reasons: stage1Reasons,
      },
      {
        level: "L2",
        name: "context_assembly",
        context_chars: args.context_chars,
        duration_ms: stage3Ms,
        pruned_reasons: stage2Reasons,
      },
    ],
    budgets: {
      limit: args.limit,
      neighborhood_hops: args.neighborhood_hops,
      max_nodes: args.max_nodes,
      max_edges: args.max_edges,
      ranked_limit: args.ranked_limit,
      min_edge_weight: args.min_edge_weight,
      min_edge_confidence: args.min_edge_confidence,
    },
    pruned_reasons,
    ...(args.uri_links ? { uri_links: args.uri_links } : {}),
  };
}

function normalizeAionisUri(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s.startsWith("aionis://")) return null;
  return s;
}

function collectRecallTrajectoryUriLinks(args: { recall: any; tools?: any; max_per_type?: number }) {
  const cap = Math.max(1, Math.min(200, Number(args.max_per_type ?? 32)));
  const out = {
    nodes: [] as string[],
    edges: [] as string[],
    commits: [] as string[],
    decisions: [] as string[],
  };
  const seen = {
    nodes: new Set<string>(),
    edges: new Set<string>(),
    commits: new Set<string>(),
    decisions: new Set<string>(),
  };
  const totals = {
    nodes: new Set<string>(),
    edges: new Set<string>(),
    commits: new Set<string>(),
    decisions: new Set<string>(),
  };

  const add = (kind: keyof typeof out, raw: unknown) => {
    const uri = normalizeAionisUri(raw);
    if (!uri) return;
    totals[kind].add(uri);
    if (out[kind].length >= cap) return;
    if (seen[kind].has(uri)) return;
    seen[kind].add(uri);
    out[kind].push(uri);
  };

  const recall = args.recall ?? {};
  const seeds = Array.isArray(recall?.seeds) ? recall.seeds : [];
  for (const s of seeds) add("nodes", (s as any)?.uri);

  const ranked = Array.isArray(recall?.ranked) ? recall.ranked : [];
  for (const r of ranked) add("nodes", (r as any)?.uri);

  const subgraphNodes = Array.isArray(recall?.subgraph?.nodes) ? recall.subgraph.nodes : [];
  for (const n of subgraphNodes) add("nodes", (n as any)?.uri);

  const subgraphEdges = Array.isArray(recall?.subgraph?.edges) ? recall.subgraph.edges : [];
  for (const e of subgraphEdges) {
    add("edges", (e as any)?.uri);
    add("commits", (e as any)?.commit_uri);
  }

  const contextItems = Array.isArray(recall?.context?.items) ? recall.context.items : [];
  for (const i of contextItems) add("nodes", (i as any)?.uri);

  const citations = Array.isArray(recall?.context?.citations) ? recall.context.citations : [];
  for (const c of citations) {
    add("nodes", (c as any)?.uri);
    add("commits", (c as any)?.commit_uri);
  }

  const tools = args.tools ?? {};
  add("decisions", tools?.decision?.decision_uri);
  add("decisions", tools?.decision_uri);
  add("commits", tools?.decision?.commit_uri);
  add("commits", tools?.commit_uri);

  const chainDecision = out.decisions[0];
  const chainCommit = out.commits[0];
  const chainNode = out.nodes[0];
  const chainEdge = out.edges[0];

  return {
    ...out,
    counts: {
      nodes: totals.nodes.size,
      edges: totals.edges.size,
      commits: totals.commits.size,
      decisions: totals.decisions.size,
    },
    ...(chainDecision
      ? {
          chain: {
            decision_uri: chainDecision,
            ...(chainCommit ? { commit_uri: chainCommit } : {}),
            ...(chainNode ? { node_uri: chainNode } : {}),
            ...(chainEdge ? { edge_uri: chainEdge } : {}),
          },
        }
      : {}),
  };
}

function buildRecallObservability(args: {
  timings: Record<string, number>;
  inflight_wait_ms: number;
  adaptive_profile: { profile: string; applied: boolean; reason: string };
  adaptive_hard_cap: { applied: boolean; reason: string };
  stage1?: {
    mode?: "ann" | "exact_fallback";
    ann_seed_count?: number;
    final_seed_count?: number;
    exact_fallback_enabled?: boolean;
    exact_fallback_attempted?: boolean;
  } | null;
  neighborhood_counts?: { nodes?: number; edges?: number } | null;
}) {
  const stageTimings = {
    stage1_candidates_ann_ms: args.timings["stage1_candidates_ann"] ?? 0,
    stage1_candidates_exact_fallback_ms: args.timings["stage1_candidates_exact_fallback"] ?? 0,
    stage2_edges_ms: args.timings["stage2_edges"] ?? 0,
    stage2_nodes_ms: args.timings["stage2_nodes"] ?? 0,
    stage2_spread_ms: args.timings["stage2_spread"] ?? 0,
    stage3_context_ms: args.timings["stage3_context"] ?? 0,
    rule_defs_ms: args.timings["rule_defs"] ?? 0,
    audit_insert_ms: args.timings["audit_insert"] ?? 0,
    debug_embeddings_ms: args.timings["debug_embeddings"] ?? 0,
  };
  return {
    stage_timings_ms: stageTimings,
    inflight_wait_ms: args.inflight_wait_ms,
    adaptive: {
      profile: {
        profile: args.adaptive_profile.profile,
        applied: args.adaptive_profile.applied,
        reason: args.adaptive_profile.reason,
      },
      hard_cap: {
        applied: args.adaptive_hard_cap.applied,
        reason: args.adaptive_hard_cap.reason,
      },
    },
    stage1: args.stage1 ?? null,
    neighborhood_counts: args.neighborhood_counts ?? null,
  };
}

function inferRecallStrategyFromKnobs(knobs: RecallProfileDefaults): RecallStrategyName {
  const isSame = (a: RecallProfileDefaults, b: RecallProfileDefaults) =>
    a.limit === b.limit &&
    a.neighborhood_hops === b.neighborhood_hops &&
    a.max_nodes === b.max_nodes &&
    a.max_edges === b.max_edges &&
    a.ranked_limit === b.ranked_limit &&
    a.min_edge_weight === b.min_edge_weight &&
    a.min_edge_confidence === b.min_edge_confidence;
  if (isSame(knobs, RECALL_STRATEGY_DEFAULTS.local)) return "local";
  if (isSame(knobs, RECALL_STRATEGY_DEFAULTS.global)) return "global";
  return "balanced";
}

const app = Fastify({
  logger: true,
  bodyLimit: 5 * 1024 * 1024,
  trustProxy: env.TRUST_PROXY,
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
    aionis_mode: env.AIONIS_MODE,
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
    write_store_access_capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
    trust_proxy: env.TRUST_PROXY,
    cors_memory_allow_origins: CORS_MEMORY_ALLOW_ORIGINS,
    cors_admin_allow_origins: CORS_ADMIN_ALLOW_ORIGINS,
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

app.addHook("onRequest", async (req, reply) => {
  (req as any).aionis_t0_ms = performance.now();
  // Always expose the request id for correlation (client <-> server logs).
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

  // Handle browser preflight directly.
  if (req.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

app.addHook("onResponse", async (req, reply) => {
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

app.get("/health", async () => ({
  ok: true,
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
  write_store_access_capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
  sandbox: sandboxExecutor.healthSnapshot(),
  sandbox_tenant_budget_window_hours: env.SANDBOX_TENANT_BUDGET_WINDOW_HOURS,
  sandbox_tenant_budget_tenant_count: sandboxTenantBudgetPolicy.size,
  sandbox_remote_egress_cidr_count: sandboxRemoteAllowedCidrs.size,
  sandbox_remote_deny_private_ips: env.SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS,
  sandbox_artifact_object_store_base_uri_configured: !!env.SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI.trim(),
}));

const ControlTenantSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  display_name: z.string().max(256).optional().nullable(),
  status: z.enum(["active", "suspended"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlProjectSchema = z.object({
  project_id: z.string().min(1).max(128),
  tenant_id: z.string().min(1).max(128),
  display_name: z.string().max(256).optional().nullable(),
  status: z.enum(["active", "archived"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlApiKeySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  project_id: z.string().max(128).optional().nullable(),
  label: z.string().max(256).optional().nullable(),
  role: z.string().max(128).optional().nullable(),
  agent_id: z.string().max(128).optional().nullable(),
  team_id: z.string().max(128).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlApiKeyRotateSchema = z.object({
  label: z.string().max(256).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlTenantQuotaSchema = z.object({
  recall_rps: z.number().positive(),
  recall_burst: z.number().int().positive(),
  write_rps: z.number().positive(),
  write_burst: z.number().int().positive(),
  write_max_wait_ms: z.number().int().min(0),
  debug_embed_rps: z.number().positive(),
  debug_embed_burst: z.number().int().positive(),
  recall_text_embed_rps: z.number().positive(),
  recall_text_embed_burst: z.number().int().positive(),
  recall_text_embed_max_wait_ms: z.number().int().min(0),
});

const ControlSandboxBudgetUpsertSchema = z
  .object({
    scope: z.string().min(1).max(256).optional(),
    daily_run_cap: z.number().int().min(0).nullable().optional(),
    daily_timeout_cap: z.number().int().min(0).nullable().optional(),
    daily_failure_cap: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (v) => v.daily_run_cap !== undefined || v.daily_timeout_cap !== undefined || v.daily_failure_cap !== undefined,
    { message: "at least one cap field is required" },
  );

const ControlSandboxProjectBudgetUpsertSchema = z
  .object({
    scope: z.string().min(1).max(256).optional(),
    daily_run_cap: z.number().int().min(0).nullable().optional(),
    daily_timeout_cap: z.number().int().min(0).nullable().optional(),
    daily_failure_cap: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (v) => v.daily_run_cap !== undefined || v.daily_timeout_cap !== undefined || v.daily_failure_cap !== undefined,
    { message: "at least one cap field is required" },
  );

const ControlAlertRouteSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  channel: z.enum(["webhook", "slack_webhook", "pagerduty_events"]),
  label: z.string().max(256).optional().nullable(),
  events: z.array(z.string().min(1).max(128)).max(64).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  target: z.string().min(1).max(2048),
  secret: z.string().max(2048).optional().nullable(),
  headers: z.record(z.string().max(2048)).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlAlertRouteStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

const ControlIncidentPublishJobSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  run_id: z.string().min(1).max(256),
  source_dir: z.string().min(1).max(4096),
  target: z.string().min(1).max(4096),
  max_attempts: z.number().int().min(1).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlIncidentPublishReplaySchema = z.object({
  tenant_id: z.string().min(1).max(128).optional(),
  statuses: z.array(z.enum(["failed", "dead_letter"])).max(8).optional(),
  ids: z.array(z.string().uuid()).max(500).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  reset_attempts: z.boolean().optional(),
  reason: z.string().min(1).max(256).optional(),
  dry_run: z.boolean().optional(),
  allow_all_tenants: z.boolean().optional(),
});

const ControlTenantDiagnosticsQuerySchema = z.object({
  scope: z.string().min(1).max(256).optional(),
  window_minutes: z.coerce.number().int().min(5).max(24 * 60).optional(),
});

function summarizeIncidentPublishReplayRows(rows: any[], sampleLimit = 20) {
  const sample = rows.slice(0, sampleLimit).map((row) => ({
    id: String(row.id),
    tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
    run_id: row.run_id == null ? null : String(row.run_id),
    status: row.status == null ? null : String(row.status),
    attempts: Number.isFinite(Number(row.attempts)) ? Number(row.attempts) : null,
    max_attempts: Number.isFinite(Number(row.max_attempts)) ? Number(row.max_attempts) : null,
    target: row.target == null ? null : String(row.target),
    next_attempt_at: row.next_attempt_at == null ? null : String(row.next_attempt_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  }));
  return sample;
}

app.post("/v1/admin/control/tenants", async (req, reply) => {
  requireAdminToken(req);
  const body = ControlTenantSchema.parse(req.body ?? {});
  const out = await upsertControlTenant(db, body);
  await emitControlAudit(req, {
    action: "tenant.upsert",
    resource_type: "tenant",
    resource_id: String(out.tenant_id),
    tenant_id: String(out.tenant_id),
    details: { status: out.status },
  });
  return reply.code(200).send({ ok: true, tenant: out });
});

app.get("/v1/admin/control/tenants", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const status = q?.status === "active" || q?.status === "suspended" ? q.status : undefined;
  const limit = typeof q?.limit === "string" ? Number(q.limit) : undefined;
  const offset = typeof q?.offset === "string" ? Number(q.offset) : undefined;
  const rows = await listControlTenants(db, { status, limit, offset });
  return reply.code(200).send({ ok: true, tenants: rows });
});

app.post("/v1/admin/control/projects", async (req, reply) => {
  requireAdminToken(req);
  const body = ControlProjectSchema.parse(req.body ?? {});
  const out = await upsertControlProject(db, body);
  await emitControlAudit(req, {
    action: "project.upsert",
    resource_type: "project",
    resource_id: String(out.project_id),
    tenant_id: String(out.tenant_id),
    details: { status: out.status },
  });
  return reply.code(200).send({ ok: true, project: out });
});

app.post("/v1/admin/control/api-keys", async (req, reply) => {
  requireAdminToken(req);
  const body = ControlApiKeySchema.parse(req.body ?? {});
  const out = await createControlApiKey(db, body);
  await emitControlAudit(req, {
    action: "api_key.create",
    resource_type: "api_key",
    resource_id: String(out.id),
    tenant_id: String(out.tenant_id),
    details: { project_id: out.project_id ?? null, key_prefix: out.key_prefix },
  });
  return reply.code(200).send({ ok: true, key: out });
});

app.get("/v1/admin/control/api-keys", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const rows = await listControlApiKeys(db, {
    tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
    project_id: typeof q?.project_id === "string" ? q.project_id : undefined,
    status: q?.status === "active" || q?.status === "revoked" ? q.status : undefined,
    limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
    offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
  });
  return reply.code(200).send({ ok: true, keys: rows });
});

app.get("/v1/admin/control/api-keys/stale", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const out = await listStaleControlApiKeys(db, {
    max_age_days: typeof q?.max_age_days === "string" ? Number(q.max_age_days) : undefined,
    warn_age_days: typeof q?.warn_age_days === "string" ? Number(q.warn_age_days) : undefined,
    rotation_window_days: typeof q?.rotation_window_days === "string" ? Number(q.rotation_window_days) : undefined,
    limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
  });
  return reply.code(200).send(out);
});

app.post("/v1/admin/control/api-keys/:id/revoke", async (req, reply) => {
  requireAdminToken(req);
  const id = String((req.params as any)?.id ?? "");
  const out = await revokeControlApiKey(db, id);
  if (!out) return reply.code(404).send({ error: "not_found", message: "api key not found" });
  await emitControlAudit(req, {
    action: "api_key.revoke",
    resource_type: "api_key",
    resource_id: String(out.id),
    tenant_id: String(out.tenant_id),
    details: { key_prefix: out.key_prefix },
  });
  return reply.code(200).send({ ok: true, key: out });
});

app.post("/v1/admin/control/api-keys/:id/rotate", async (req, reply) => {
  requireAdminToken(req);
  const id = String((req.params as any)?.id ?? "");
  const body = ControlApiKeyRotateSchema.parse(req.body ?? {});
  const out = await rotateControlApiKey(db, id, body);
  if (!out) return reply.code(404).send({ error: "not_found", message: "active api key not found" });
  await emitControlAudit(req, {
    action: "api_key.rotate",
    resource_type: "api_key",
    resource_id: String(out.rotated.id),
    tenant_id: String(out.rotated.tenant_id),
    details: {
      revoked_key_id: out.revoked?.id ?? id,
      key_prefix: out.rotated.key_prefix,
    },
  });
  return reply.code(200).send({ ok: true, key: out });
});

app.post("/v1/admin/control/alerts/routes", async (req, reply) => {
  requireAdminToken(req);
  const body = ControlAlertRouteSchema.parse(req.body ?? {});
  const out = await createControlAlertRoute(db, body);
  await emitControlAudit(req, {
    action: "alert_route.create",
    resource_type: "alert_route",
    resource_id: String(out.id),
    tenant_id: String(out.tenant_id),
    details: {
      channel: out.channel,
      status: out.status,
      events: out.events,
      label: out.label ?? null,
    },
  });
  return reply.code(200).send({ ok: true, route: out });
});

app.get("/v1/admin/control/alerts/routes", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const rows = await listControlAlertRoutes(db, {
    tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
    channel:
      q?.channel === "webhook" || q?.channel === "slack_webhook" || q?.channel === "pagerduty_events"
        ? q.channel
        : undefined,
    status: q?.status === "active" || q?.status === "disabled" ? q.status : undefined,
    limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
    offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
  });
  return reply.code(200).send({ ok: true, routes: rows });
});

app.post("/v1/admin/control/alerts/routes/:id/status", async (req, reply) => {
  requireAdminToken(req);
  const id = String((req.params as any)?.id ?? "").trim();
  if (!id) throw new HttpError(400, "invalid_request", "id is required");
  const body = ControlAlertRouteStatusSchema.parse(req.body ?? {});
  const out = await updateControlAlertRouteStatus(db, id, body.status);
  if (!out) return reply.code(404).send({ error: "not_found", message: "alert route not found" });
  await emitControlAudit(req, {
    action: "alert_route.status",
    resource_type: "alert_route",
    resource_id: String(out.id),
    tenant_id: String(out.tenant_id),
    details: { status: out.status },
  });
  return reply.code(200).send({ ok: true, route: out });
});

app.get("/v1/admin/control/alerts/deliveries", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const deliveries = await listControlAlertDeliveries(db, {
    tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
    event_type: typeof q?.event_type === "string" ? q.event_type : undefined,
    status: q?.status === "sent" || q?.status === "failed" || q?.status === "skipped" ? q.status : undefined,
    limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
    offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
  });
  return reply.code(200).send({ ok: true, deliveries });
});

app.post("/v1/admin/control/incident-publish/jobs", async (req, reply) => {
  requireAdminToken(req);
  const body = ControlIncidentPublishJobSchema.parse(req.body ?? {});
  const out = await enqueueControlIncidentPublishJob(db, body);
  await emitControlAudit(req, {
    action: "incident_publish.enqueue",
    resource_type: "incident_publish_job",
    resource_id: String(out.id),
    tenant_id: String(out.tenant_id),
    details: {
      run_id: out.run_id,
      target: out.target,
      max_attempts: out.max_attempts,
    },
  });
  return reply.code(200).send({ ok: true, job: out });
});

app.get("/v1/admin/control/incident-publish/jobs", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const statusRaw = typeof q?.status === "string" ? q.status : undefined;
  const status =
    statusRaw === "pending" ||
    statusRaw === "processing" ||
    statusRaw === "succeeded" ||
    statusRaw === "failed" ||
    statusRaw === "dead_letter"
      ? statusRaw
      : undefined;
  const jobs = await listControlIncidentPublishJobs(db, {
    tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
    status,
    limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
    offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
  });
  return reply.code(200).send({ ok: true, jobs });
});

app.post("/v1/admin/control/incident-publish/jobs/replay", async (req, reply) => {
  requireAdminToken(req);
  const body = ControlIncidentPublishReplaySchema.parse(req.body ?? {});
  const hasIds = Array.isArray(body.ids) && body.ids.length > 0;
  if (!body.tenant_id && !hasIds && !body.allow_all_tenants) {
    throw new HttpError(
      400,
      "invalid_request",
      "tenant_id or ids is required unless allow_all_tenants=true",
    );
  }
  const jobs = await replayControlIncidentPublishJobs(db, body);
  const jobsSample = summarizeIncidentPublishReplayRows(jobs, 20);
  const dryRun = body.dry_run ?? false;
  const tenantId = body.tenant_id ?? (jobs[0]?.tenant_id ? String(jobs[0].tenant_id) : null);
  await emitControlAudit(req, {
    action: dryRun ? "incident_publish.replay.preview" : "incident_publish.replay",
    resource_type: "incident_publish_job_batch",
    resource_id: `${tenantId ?? "all"}:${new Date().toISOString()}`,
    tenant_id: tenantId,
    details: {
      replayed_count: dryRun ? 0 : jobs.length,
      candidate_count: jobs.length,
      statuses: body.statuses ?? ["dead_letter", "failed"],
      limit: body.limit ?? 50,
      reset_attempts: body.reset_attempts ?? true,
      dry_run: dryRun,
      allow_all_tenants: body.allow_all_tenants ?? false,
      reason: body.reason ?? "manual_replay",
      sample_job_ids: jobsSample.map((x) => String(x.id)),
    },
  });
  return reply.code(200).send({
    ok: true,
    dry_run: dryRun,
    replayed_count: dryRun ? 0 : jobs.length,
    candidate_count: jobs.length,
    jobs_sample: jobsSample,
  });
});

app.put("/v1/admin/control/tenant-quotas/:tenant_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const body = ControlTenantQuotaSchema.parse(req.body ?? {});
  const out = await upsertTenantQuotaProfile(db, tenantId, body);
  tenantQuotaResolver.invalidate(tenantId);
  await emitControlAudit(req, {
    action: "tenant_quota.upsert",
    resource_type: "tenant_quota",
    resource_id: tenantId,
    tenant_id: tenantId,
    details: body,
  });
  return reply.code(200).send({ ok: true, quota: out });
});

app.get("/v1/admin/control/tenant-quotas/:tenant_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const out = await getTenantQuotaProfile(db, tenantId);
  if (!out) return reply.code(404).send({ error: "not_found", message: "tenant quota profile not found" });
  return reply.code(200).send({ ok: true, quota: out });
});

app.delete("/v1/admin/control/tenant-quotas/:tenant_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const deleted = await deleteTenantQuotaProfile(db, tenantId);
  tenantQuotaResolver.invalidate(tenantId);
  if (deleted) {
    await emitControlAudit(req, {
      action: "tenant_quota.delete",
      resource_type: "tenant_quota",
      resource_id: tenantId,
      tenant_id: tenantId,
      details: { deleted: true },
    });
  }
  return reply.code(200).send({ ok: true, deleted });
});

app.put("/v1/admin/control/sandbox-budgets/:tenant_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const body = ControlSandboxBudgetUpsertSchema.parse(req.body ?? {});
  const out = await upsertSandboxBudgetProfile({
    tenant_id: tenantId,
    scope: body.scope ?? "*",
    daily_run_cap: body.daily_run_cap,
    daily_timeout_cap: body.daily_timeout_cap,
    daily_failure_cap: body.daily_failure_cap,
  });
  await emitControlAudit(req, {
    action: "sandbox_budget.upsert",
    resource_type: "sandbox_budget",
    resource_id: `${tenantId}:${normalizeSandboxBudgetScope(body.scope)}`,
    tenant_id: tenantId,
    details: out as Record<string, unknown>,
  });
  return reply.code(200).send({ ok: true, budget: out });
});

app.get("/v1/admin/control/sandbox-budgets/:tenant_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const q = req.query as Record<string, unknown> | undefined;
  const scope = typeof q?.scope === "string" ? q.scope : "*";
  const out = await getSandboxBudgetProfile(tenantId, scope);
  if (!out) return reply.code(404).send({ error: "not_found", message: "sandbox budget profile not found" });
  return reply.code(200).send({ ok: true, budget: out });
});

app.delete("/v1/admin/control/sandbox-budgets/:tenant_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const q = req.query as Record<string, unknown> | undefined;
  const scope = typeof q?.scope === "string" ? q.scope : "*";
  const deleted = await deleteSandboxBudgetProfile(tenantId, scope);
  if (deleted) {
    await emitControlAudit(req, {
      action: "sandbox_budget.delete",
      resource_type: "sandbox_budget",
      resource_id: `${tenantId}:${normalizeSandboxBudgetScope(scope)}`,
      tenant_id: tenantId,
      details: { deleted: true },
    });
  }
  return reply.code(200).send({ ok: true, deleted });
});

app.get("/v1/admin/control/sandbox-budgets", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const budgets = await listSandboxBudgetProfiles({
    tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
    limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
    offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
  });
  return reply.code(200).send({ ok: true, budgets });
});

app.put("/v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  const projectId = String((req.params as any)?.project_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  if (!projectId) throw new HttpError(400, "invalid_request", "project_id is required");
  const body = ControlSandboxProjectBudgetUpsertSchema.parse(req.body ?? {});
  const out = await upsertSandboxProjectBudgetProfile({
    tenant_id: tenantId,
    project_id: projectId,
    scope: body.scope ?? "*",
    daily_run_cap: body.daily_run_cap,
    daily_timeout_cap: body.daily_timeout_cap,
    daily_failure_cap: body.daily_failure_cap,
  });
  await emitControlAudit(req, {
    action: "sandbox_project_budget.upsert",
    resource_type: "sandbox_project_budget",
    resource_id: `${tenantId}:${projectId}:${normalizeSandboxBudgetScope(body.scope)}`,
    tenant_id: tenantId,
    details: out as Record<string, unknown>,
  });
  return reply.code(200).send({ ok: true, budget: out });
});

app.get("/v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  const projectId = String((req.params as any)?.project_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  if (!projectId) throw new HttpError(400, "invalid_request", "project_id is required");
  const q = req.query as Record<string, unknown> | undefined;
  const scope = typeof q?.scope === "string" ? q.scope : "*";
  const out = await getSandboxProjectBudgetProfile(tenantId, projectId, scope);
  if (!out) return reply.code(404).send({ error: "not_found", message: "sandbox project budget profile not found" });
  return reply.code(200).send({ ok: true, budget: out });
});

app.delete("/v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  const projectId = String((req.params as any)?.project_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  if (!projectId) throw new HttpError(400, "invalid_request", "project_id is required");
  const q = req.query as Record<string, unknown> | undefined;
  const scope = typeof q?.scope === "string" ? q.scope : "*";
  const deleted = await deleteSandboxProjectBudgetProfile(tenantId, projectId, scope);
  if (deleted) {
    await emitControlAudit(req, {
      action: "sandbox_project_budget.delete",
      resource_type: "sandbox_project_budget",
      resource_id: `${tenantId}:${projectId}:${normalizeSandboxBudgetScope(scope)}`,
      tenant_id: tenantId,
      details: { deleted: true },
    });
  }
  return reply.code(200).send({ ok: true, deleted });
});

app.get("/v1/admin/control/sandbox-project-budgets", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const budgets = await listSandboxProjectBudgetProfiles({
    tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
    project_id: typeof q?.project_id === "string" ? q.project_id : undefined,
    limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
    offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
  });
  return reply.code(200).send({ ok: true, budgets });
});

app.get("/v1/admin/control/audit-events", async (req, reply) => {
  requireAdminToken(req);
  const q = req.query as Record<string, unknown> | undefined;
  const events = await listControlAuditEvents(db, {
    tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
    action: typeof q?.action === "string" ? q.action : undefined,
    limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
    offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
  });
  return reply.code(200).send({ ok: true, events });
});

app.get("/v1/admin/control/dashboard/tenant/:tenant_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const dashboard = await getTenantDashboardSummary(db, {
    tenant_id: tenantId,
    default_tenant_id: env.MEMORY_TENANT_ID,
  });
  return reply.code(200).send({ ok: true, dashboard });
});

app.get("/v1/admin/control/diagnostics/tenant/:tenant_id", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const q = ControlTenantDiagnosticsQuerySchema.parse(req.query ?? {});
  const diagnostics = await getTenantOperabilityDiagnostics(db, {
    tenant_id: tenantId,
    default_tenant_id: env.MEMORY_TENANT_ID,
    scope: q.scope,
    window_minutes: q.window_minutes,
  });
  return reply.code(200).send({ ok: true, diagnostics });
});

app.get("/v1/admin/control/dashboard/tenant/:tenant_id/incident-publish-rollup", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const q = req.query as Record<string, unknown> | undefined;
  const windowHours = typeof q?.window_hours === "string" ? Number(q.window_hours) : undefined;
  const sampleLimit = typeof q?.sample_limit === "string" ? Number(q.sample_limit) : undefined;
  const rollup = await getTenantIncidentPublishRollup(db, {
    tenant_id: tenantId,
    window_hours: windowHours,
    sample_limit: sampleLimit,
  });
  return reply.code(200).send({ ok: true, rollup });
});

app.get("/v1/admin/control/dashboard/tenant/:tenant_id/incident-publish-slo", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const q = req.query as Record<string, unknown> | undefined;
  const report = await getTenantIncidentPublishSloReport(db, {
    tenant_id: tenantId,
    window_hours: typeof q?.window_hours === "string" ? Number(q.window_hours) : undefined,
    baseline_hours: typeof q?.baseline_hours === "string" ? Number(q.baseline_hours) : undefined,
    min_jobs: typeof q?.min_jobs === "string" ? Number(q.min_jobs) : undefined,
    adaptive_multiplier: typeof q?.adaptive_multiplier === "string" ? Number(q.adaptive_multiplier) : undefined,
    failure_rate_floor: typeof q?.failure_rate_floor === "string" ? Number(q.failure_rate_floor) : undefined,
    dead_letter_rate_floor:
      typeof q?.dead_letter_rate_floor === "string" ? Number(q.dead_letter_rate_floor) : undefined,
    backlog_warning_abs: typeof q?.backlog_warning_abs === "string" ? Number(q.backlog_warning_abs) : undefined,
    dead_letter_backlog_warning_abs:
      typeof q?.dead_letter_backlog_warning_abs === "string" ? Number(q.dead_letter_backlog_warning_abs) : undefined,
    dead_letter_backlog_critical_abs:
      typeof q?.dead_letter_backlog_critical_abs === "string"
        ? Number(q.dead_letter_backlog_critical_abs)
        : undefined,
  });
  return reply.code(200).send({ ok: true, report });
});

app.get("/v1/admin/control/dashboard/tenant/:tenant_id/timeseries", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const q = req.query as Record<string, unknown> | undefined;
  const cursor = parseCursor(q?.cursor, "timeseries", tenantId);
  const endpointRaw = typeof q?.endpoint === "string" ? q.endpoint : undefined;
  const endpoint = parseTelemetryEndpoint(endpointRaw ?? cursor?.endpoint ?? undefined);
  if (endpointRaw && !endpoint && endpointRaw.trim().length > 0) {
    throw new HttpError(
      400,
      "invalid_request",
      "endpoint must be one of: write|recall|recall_text|planning_context|context_assemble",
    );
  }
  const windowHours = typeof q?.window_hours === "string" ? Number(q.window_hours) : cursor?.window_hours;
  const limit = typeof q?.limit === "string" ? Number(q.limit) : cursor?.limit;
  const offset = typeof q?.offset === "string" ? Number(q.offset) : cursor?.offset;
  const anchorUtc = cursor?.anchor_utc ?? new Date().toISOString();
  const out = await getTenantRequestTimeseries(db, {
    tenant_id: tenantId,
    window_hours: windowHours,
    endpoint,
    limit,
    offset,
    retention_hours: env.CONTROL_TELEMETRY_RETENTION_HOURS,
    anchor_utc: anchorUtc,
    bucket: "hour",
  });
  const page = (out as any)?.page ?? null;
  const nextCursor =
    out && (out as any).ok && page?.has_more
      ? encodeDashboardCursor({
          v: 1,
          kind: "timeseries",
          tenant_id: tenantId,
          endpoint: endpoint ?? null,
          window_hours: Number((out as any).window_hours ?? windowHours ?? 0),
          limit: Number(page.limit ?? limit ?? 0),
          offset: Number(page.offset ?? offset ?? 0) + Number(page.limit ?? limit ?? 0),
          anchor_utc: String((out as any)?.snapshot?.anchor_utc ?? anchorUtc),
        })
      : null;
  return reply.code(200).send({ ...out, cursor: { next: nextCursor } });
});

app.get("/v1/admin/control/dashboard/tenant/:tenant_id/key-usage", async (req, reply) => {
  requireAdminToken(req);
  const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const q = req.query as Record<string, unknown> | undefined;
  const cursor = parseCursor(q?.cursor, "key_usage", tenantId);
  const endpointRaw = typeof q?.endpoint === "string" ? q.endpoint : undefined;
  const endpoint = parseTelemetryEndpoint(endpointRaw ?? cursor?.endpoint ?? undefined);
  if (endpointRaw && !endpoint && endpointRaw.trim().length > 0) {
    throw new HttpError(
      400,
      "invalid_request",
      "endpoint must be one of: write|recall|recall_text|planning_context|context_assemble",
    );
  }
  const windowHours = typeof q?.window_hours === "string" ? Number(q.window_hours) : cursor?.window_hours;
  const baselineHours = typeof q?.baseline_hours === "string" ? Number(q.baseline_hours) : cursor?.baseline_hours;
  const minRequests = typeof q?.min_requests === "string" ? Number(q.min_requests) : undefined;
  const zscoreThreshold = typeof q?.zscore_threshold === "string" ? Number(q.zscore_threshold) : undefined;
  const limit = typeof q?.limit === "string" ? Number(q.limit) : cursor?.limit;
  const offset = typeof q?.offset === "string" ? Number(q.offset) : cursor?.offset;
  const anchorUtc = cursor?.anchor_utc ?? new Date().toISOString();
  const out = await getTenantApiKeyUsageReport(db, {
    tenant_id: tenantId,
    window_hours: windowHours,
    baseline_hours: baselineHours,
    min_requests: minRequests,
    zscore_threshold: zscoreThreshold,
    endpoint,
    limit,
    offset,
    retention_hours: env.CONTROL_TELEMETRY_RETENTION_HOURS,
    anchor_utc: anchorUtc,
  });
  const page = (out as any)?.page ?? null;
  const nextCursor =
    out && (out as any).ok && page?.has_more
      ? encodeDashboardCursor({
          v: 1,
          kind: "key_usage",
          tenant_id: tenantId,
          endpoint: endpoint ?? null,
          window_hours: Number((out as any)?.retention?.applied_window_hours ?? windowHours ?? 0),
          baseline_hours: Number((out as any)?.retention?.applied_baseline_hours ?? baselineHours ?? 0),
          limit: Number(page.limit ?? limit ?? 0),
          offset: Number(page.offset ?? offset ?? 0) + Number(page.limit ?? limit ?? 0),
          anchor_utc: String((out as any)?.snapshot?.anchor_utc ?? anchorUtc),
        })
      : null;
  return reply.code(200).send({ ...out, cursor: { next: nextCursor } });
});

app.post("/v1/memory/write", async (req, reply) => {
  const t0 = performance.now();
  const principal = await requireMemoryPrincipal(req);
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

    const out = await store.withTx(async (client) => {
      // Attach effective policy for applyMemoryWrite(outbox enqueue) and handler sync execution.
      (prepared as any).trigger_topic_cluster = policy.trigger_topic_cluster;
      (prepared as any).topic_cluster_async = policy.topic_cluster_async;

      const writeRes = await applyMemoryWrite(client, prepared, {
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        write_access: writeAccessForClient(client),
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
    if (embeddedRuntime) {
      await embeddedRuntime.applyWrite(prepared as any, out as any);
    }

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
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "rehydrate");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await store.withTx((client) =>
    rehydrateArchiveNodes(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
    }),
  );
  return reply.code(200).send(out);
});

// Node activation/feedback ingestion for adaptive decay signals.
app.post("/v1/memory/nodes/activate", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "activate");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await store.withTx((client) =>
    activateMemoryNodes(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
    }),
  );
  return reply.code(200).send(out);
});

// Session-first API: create/update a session envelope while preserving commit-chain write semantics.
app.post("/v1/memory/sessions", async (req, reply) => {
  requireStoreFeatureCapability("sessions_graph");
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "write");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      createSession(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Session-first API: append one event into a session stream and link via graph edge part_of.
app.post("/v1/memory/events", async (req, reply) => {
  requireStoreFeatureCapability("sessions_graph");
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "write");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      writeSessionEvent(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Session-first API: list events belonging to one session, with tenant/lane controls.
app.get("/v1/memory/sessions/:session_id/events", async (req, reply) => {
  requireStoreFeatureCapability("sessions_graph");
  const principal = await requireMemoryPrincipal(req);
  const params = req.params as any;
  const query = req.query as any;
  const input = withIdentityFromRequest(
    req,
    {
      ...(query && typeof query === "object" ? query : {}),
      session_id: String(params?.session_id ?? ""),
    },
    principal,
    "find",
  );
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(input));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient((client) =>
      listSessionEvents(client, input, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Pack export: scoped snapshot with deterministic payload hash.
app.post("/v1/memory/packs/export", async (req, reply) => {
  requireStoreFeatureCapability("packs_export");
  requireAdminToken(req);
  const body = req.body ?? {};
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient((client) =>
      exportMemoryPack(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Pack import: hash-verified replay into write pipeline with idempotent client_id mapping.
app.post("/v1/memory/packs/import", async (req, reply) => {
  requireStoreFeatureCapability("packs_import");
  requireAdminToken(req);
  const body = req.body ?? {};
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      importMemoryPack(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Exact retrieval channel: deterministic memory lookup by URI/id/attributes.
app.post("/v1/memory/find", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "find");
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient(async (client) => {
      return await memoryFind(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID);
    });
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Canonical object resolver: resolve node/edge/commit/decision by URI.
app.post("/v1/memory/resolve", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "resolve");
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient(async (client) => {
      return await memoryResolve(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID);
    });
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

app.post("/v1/memory/recall", async (req, reply) => {
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const principal = await requireMemoryPrincipal(req);
  const bodyRaw = withIdentityFromRequest(req, req.body, principal, "recall");
  const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
  const baseProfile = resolveRecallProfile("recall", tenantFromBody(bodyRaw));
  let body = withRecallProfileDefaults(bodyRaw, baseProfile.defaults);
  const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs);
  if (strategyResolution.applied) {
    body = {
      ...body,
      ...strategyResolution.defaults,
      recall_strategy: strategyResolution.strategy,
    };
  }
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
  const adaptiveHardCap = resolveAdaptiveRecallHardCap(
    {
      limit: parsed.limit,
      neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
      max_nodes: parsed.max_nodes,
      max_edges: parsed.max_edges,
      ranked_limit: parsed.ranked_limit,
      min_edge_weight: parsed.min_edge_weight,
      min_edge_confidence: parsed.min_edge_confidence,
    },
    gate.wait_ms,
    explicitRecallKnobs,
  );
  if (adaptiveHardCap.applied) {
    parsed = MemoryRecallRequest.parse({ ...(parsed as any), ...adaptiveHardCap.defaults });
  }
  const auth = buildRecallAuth(req, wantDebugEmbeddings, env.ADMIN_TOKEN);
  let out: any;
  try {
    out = await store.withClient(async (client) => {
      const base = await memoryRecallParsed(
        client,
        parsed,
        env.MEMORY_SCOPE,
        env.MEMORY_TENANT_ID,
        auth,
        {
          timing: (stage, ms) => {
            timings[stage] = (timings[stage] ?? 0) + ms;
          },
        },
        "recall",
        {
          stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
          recall_access: recallAccessForClient(client),
        },
      );

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
          { embeddedRuntime },
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
  const contextText = typeof out?.context?.text === "string" ? out.context.text : "";
  const contextChars = contextText.length;
  const contextEstTokens = estimateTokenCountFromText(contextText);
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
        context_chars: contextChars,
        context_est_tokens: contextEstTokens,
        context_token_budget: parsed.context_token_budget ?? null,
        context_char_budget: parsed.context_char_budget ?? null,
        context_compaction_profile: parsed.context_compaction_profile ?? "balanced",
        stage1_exact_fallback_enabled: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
        stage1_exact_fallback_used: Number.isFinite(timings["stage1_candidates_exact_fallback"]),
        stage1_ann_seed_count: (out as any).debug?.stage1?.ann_seed_count ?? null,
        stage1_ann_ms: timings["stage1_candidates_ann"] ?? null,
        stage1_exact_fallback_ms: timings["stage1_candidates_exact_fallback"] ?? null,
        profile: adaptiveProfile.profile,
        profile_source: baseProfile.source,
        adaptive_profile_applied: adaptiveProfile.applied,
        adaptive_profile_reason: adaptiveProfile.reason,
        adaptive_hard_cap_applied: adaptiveHardCap.applied,
        adaptive_hard_cap_reason: adaptiveHardCap.reason,
        adaptive_hard_cap_wait_ms: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS,
        inflight_wait_ms: gate.wait_ms,
        ms,
        timings_ms: timings,
      },
    },
    "memory recall",
  );
  const trajectory = buildRecallTrajectory({
    strategy:
      parsed.recall_strategy ??
      inferRecallStrategyFromKnobs({
        limit: parsed.limit,
        neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
        max_nodes: parsed.max_nodes,
        max_edges: parsed.max_edges,
        ranked_limit: parsed.ranked_limit,
        min_edge_weight: parsed.min_edge_weight,
        min_edge_confidence: parsed.min_edge_confidence,
      }),
    limit: parsed.limit,
    neighborhood_hops: parsed.neighborhood_hops,
    max_nodes: parsed.max_nodes,
    max_edges: parsed.max_edges,
    ranked_limit: parsed.ranked_limit,
    min_edge_weight: parsed.min_edge_weight,
    min_edge_confidence: parsed.min_edge_confidence,
    seeds: out.seeds.length,
    nodes: out.subgraph.nodes.length,
    edges: out.subgraph.edges.length,
    context_chars: contextChars,
    timings,
    neighborhood_counts: (out as any)?.debug?.neighborhood_counts ?? null,
    stage1: (out as any)?.debug?.stage1 ?? null,
    uri_links: collectRecallTrajectoryUriLinks({ recall: out }),
  });
  const observability = buildRecallObservability({
    timings,
    inflight_wait_ms: gate.wait_ms,
    adaptive_profile: {
      profile: adaptiveProfile.profile,
      applied: adaptiveProfile.applied,
      reason: adaptiveProfile.reason,
    },
    adaptive_hard_cap: {
      applied: adaptiveHardCap.applied,
      reason: adaptiveHardCap.reason,
    },
    stage1: (out as any)?.debug?.stage1 ?? null,
    neighborhood_counts: (out as any)?.debug?.neighborhood_counts ?? null,
  });
  return reply.code(200).send({ ...out, trajectory, observability });
});

app.post("/v1/memory/recall_text", async (req, reply) => {
  if (!embedder) {
    return reply.code(400).send({ error: "no_embedding_provider", message: "Configure EMBEDDING_PROVIDER to use recall_text." });
  }

  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const principal = await requireMemoryPrincipal(req);
  const bodyRaw = withIdentityFromRequest(req, req.body, principal, "recall_text");
  const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
  const baseProfile = resolveRecallProfile("recall_text", tenantFromBody(bodyRaw));
  let body = withRecallProfileDefaults(bodyRaw, baseProfile.defaults);
  const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs);
  if (strategyResolution.applied) {
    body = {
      ...body,
      ...strategyResolution.defaults,
      recall_strategy: strategyResolution.strategy,
    };
  }
  let parsed = MemoryRecallTextRequest.parse(body);
  let contextBudgetDefaultApplied = false;
  if (parsed.context_token_budget === undefined && parsed.context_char_budget === undefined && env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT > 0) {
    parsed = MemoryRecallTextRequest.parse({
      ...(parsed as any),
      context_token_budget: env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT,
    });
    contextBudgetDefaultApplied = true;
  }
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
  const adaptiveHardCap = resolveAdaptiveRecallHardCap(
    {
      limit: parsed.limit,
      neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
      max_nodes: parsed.max_nodes,
      max_edges: parsed.max_edges,
      ranked_limit: parsed.ranked_limit,
      min_edge_weight: parsed.min_edge_weight,
      min_edge_confidence: parsed.min_edge_confidence,
    },
    gate.wait_ms,
    explicitRecallKnobs,
  );
  if (adaptiveHardCap.applied) {
    parsed = MemoryRecallTextRequest.parse({ ...(parsed as any), ...adaptiveHardCap.defaults });
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
      recall_strategy: parsed.recall_strategy,
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
      context_token_budget: parsed.context_token_budget,
      context_char_budget: parsed.context_char_budget,
      context_compaction_profile: parsed.context_compaction_profile,
      rules_context: parsed.rules_context,
      rules_include_shadow: parsed.rules_include_shadow,
      rules_limit: parsed.rules_limit,
    });
    const wantDebugEmbeddings = recallParsed.return_debug && recallParsed.include_embeddings;
    const auth = buildRecallAuth(req, wantDebugEmbeddings, env.ADMIN_TOKEN);
    out = await store.withClient(async (client) => {
      const base = await memoryRecallParsed(
        client,
        recallParsed,
        env.MEMORY_SCOPE,
        env.MEMORY_TENANT_ID,
        auth,
        {
          timing: (stage, ms) => {
            timings[stage] = (timings[stage] ?? 0) + ms;
          },
        },
        "recall_text",
        {
          stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
          recall_access: recallAccessForClient(client),
        },
      );

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
          { embeddedRuntime },
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
  const contextText = typeof out?.context?.text === "string" ? out.context.text : "";
  const contextChars = contextText.length;
  const contextEstTokens = estimateTokenCountFromText(contextText);
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
        context_chars: contextChars,
        context_est_tokens: contextEstTokens,
        context_token_budget: recallParsed.context_token_budget ?? null,
        context_char_budget: recallParsed.context_char_budget ?? null,
        context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
        context_budget_default_applied: contextBudgetDefaultApplied,
        stage1_exact_fallback_enabled: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
        stage1_exact_fallback_used: Number.isFinite(timings["stage1_candidates_exact_fallback"]),
        stage1_ann_seed_count: (out as any).debug?.stage1?.ann_seed_count ?? null,
        stage1_ann_ms: timings["stage1_candidates_ann"] ?? null,
        stage1_exact_fallback_ms: timings["stage1_candidates_exact_fallback"] ?? null,
        profile: adaptiveProfile.profile,
        profile_source: baseProfile.source,
        adaptive_profile_applied: adaptiveProfile.applied,
        adaptive_profile_reason: adaptiveProfile.reason,
        adaptive_hard_cap_applied: adaptiveHardCap.applied,
        adaptive_hard_cap_reason: adaptiveHardCap.reason,
        adaptive_hard_cap_wait_ms: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS,
        inflight_wait_ms: gate.wait_ms,
        ms,
        timings_ms: timings,
      },
    },
    "memory recall_text",
  );
  const trajectory = buildRecallTrajectory({
    strategy:
      recallParsed.recall_strategy ??
      inferRecallStrategyFromKnobs({
        limit: recallParsed.limit,
        neighborhood_hops: recallParsed.neighborhood_hops as 1 | 2,
        max_nodes: recallParsed.max_nodes,
        max_edges: recallParsed.max_edges,
        ranked_limit: recallParsed.ranked_limit,
        min_edge_weight: recallParsed.min_edge_weight,
        min_edge_confidence: recallParsed.min_edge_confidence,
      }),
    limit: recallParsed.limit,
    neighborhood_hops: recallParsed.neighborhood_hops,
    max_nodes: recallParsed.max_nodes,
    max_edges: recallParsed.max_edges,
    ranked_limit: recallParsed.ranked_limit,
    min_edge_weight: recallParsed.min_edge_weight,
    min_edge_confidence: recallParsed.min_edge_confidence,
    seeds: out.seeds.length,
    nodes: out.subgraph.nodes.length,
    edges: out.subgraph.edges.length,
    context_chars: contextChars,
    timings,
    neighborhood_counts: (out as any)?.debug?.neighborhood_counts ?? null,
    stage1: (out as any)?.debug?.stage1 ?? null,
    uri_links: collectRecallTrajectoryUriLinks({ recall: out }),
  });
  const observability = buildRecallObservability({
    timings,
    inflight_wait_ms: gate.wait_ms,
    adaptive_profile: {
      profile: adaptiveProfile.profile,
      applied: adaptiveProfile.applied,
      reason: adaptiveProfile.reason,
    },
    adaptive_hard_cap: {
      applied: adaptiveHardCap.applied,
      reason: adaptiveHardCap.reason,
    },
    stage1: (out as any)?.debug?.stage1 ?? null,
    neighborhood_counts: (out as any)?.debug?.neighborhood_counts ?? null,
  });
  return reply.code(200).send({ ...out, query: { text: q, embedding_provider: embedder.name }, trajectory, observability });
});

// Planner helper: one-call context assembly (recall + rules + optional tool selection).
app.post("/v1/memory/planning/context", async (req, reply) => {
  if (!embedder) {
    return reply.code(400).send({ error: "no_embedding_provider", message: "Configure EMBEDDING_PROVIDER to use planning context." });
  }

  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const principal = await requireMemoryPrincipal(req);
  const bodyRaw = withIdentityFromRequest(req, req.body, principal, "planning_context");
  const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
  const baseProfile = resolveRecallProfile("recall_text", tenantFromBody(bodyRaw));
  let body = withRecallProfileDefaults(bodyRaw, baseProfile.defaults);
  const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs);
  if (strategyResolution.applied) {
    body = {
      ...body,
      ...strategyResolution.defaults,
      recall_strategy: strategyResolution.strategy,
    };
  }
  let parsed = PlanningContextRequest.parse(body);
  let contextBudgetDefaultApplied = false;
  if (
    parsed.context_token_budget === undefined &&
    parsed.context_char_budget === undefined &&
    env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT > 0
  ) {
    parsed = PlanningContextRequest.parse({
      ...(parsed as any),
      context_token_budget: env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT,
    });
    contextBudgetDefaultApplied = true;
  }

  const wantDebugEmbeddings = parsed.return_debug && parsed.include_embeddings;
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  if (wantDebugEmbeddings) await enforceRateLimit(req, reply, "debug_embeddings");
  if (wantDebugEmbeddings) await enforceTenantQuota(req, reply, "debug_embeddings", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  await enforceRecallTextEmbedQuota(req, reply, parsed.tenant_id ?? env.MEMORY_TENANT_ID);

  const scope = parsed.scope ?? env.MEMORY_SCOPE;
  const qNorm = normalizeText(parsed.query_text, env.MAX_TEXT_LEN);
  const q = env.PII_REDACTION ? redactPII(qNorm).text : qNorm;

  let embedMs = 0;
  let embedCacheHit = false;
  let embedSingleflightJoin = false;
  let embedQueueWaitMs = 0;
  let embedBatchSize = 1;
  let recallParsed: any;
  const gate = await acquireInflightSlot("recall");
  const adaptiveProfile = resolveAdaptiveRecallProfile(baseProfile.profile, gate.wait_ms, explicitRecallKnobs);
  if (adaptiveProfile.applied) {
    parsed = PlanningContextRequest.parse({ ...(parsed as any), ...adaptiveProfile.defaults });
  }
  const adaptiveHardCap = resolveAdaptiveRecallHardCap(
    {
      limit: parsed.limit,
      neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
      max_nodes: parsed.max_nodes,
      max_edges: parsed.max_edges,
      ranked_limit: parsed.ranked_limit,
      min_edge_weight: parsed.min_edge_weight,
      min_edge_confidence: parsed.min_edge_confidence,
    },
    gate.wait_ms,
    explicitRecallKnobs,
  );
  if (adaptiveHardCap.applied) {
    parsed = PlanningContextRequest.parse({ ...(parsed as any), ...adaptiveHardCap.defaults });
  }

  let out: any;
  try {
    let vec: number[];
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
          planning_context: {
            scope,
            tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
            embedding_provider: embedder.name,
            query_len: q.length,
            mapped_error: mapped.code,
            mapped_status: mapped.statusCode,
            err_message: String(err?.message ?? err),
          },
        },
        "planning_context embedding failed",
      );
      throw new HttpError(mapped.statusCode, mapped.code, mapped.message, mapped.details);
    }

    recallParsed = MemoryRecallRequest.parse({
      tenant_id: parsed.tenant_id,
      scope,
      recall_strategy: parsed.recall_strategy,
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
      context_token_budget: parsed.context_token_budget,
      context_char_budget: parsed.context_char_budget,
      context_compaction_profile: parsed.context_compaction_profile,
    });
    const auth = buildRecallAuth(req, wantDebugEmbeddings, env.ADMIN_TOKEN);

    out = await store.withClient(async (client) => {
      const recall = await memoryRecallParsed(
        client,
        recallParsed,
        env.MEMORY_SCOPE,
        env.MEMORY_TENANT_ID,
        auth,
        {
          timing: (stage, ms) => {
            timings[stage] = (timings[stage] ?? 0) + ms;
          },
        },
        "planning_context",
        {
          stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
          recall_access: recallAccessForClient(client),
        },
      );

      const rules = await evaluateRules(
        client,
        {
          scope: recallParsed.scope ?? env.MEMORY_SCOPE,
          tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
          context: parsed.context,
          include_shadow: parsed.include_shadow,
          limit: parsed.rules_limit,
        },
        env.MEMORY_SCOPE,
        env.MEMORY_TENANT_ID,
        { embeddedRuntime },
      );

      let tools: any = null;
      if (Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0) {
        tools = await selectTools(
          client,
          {
            scope: recallParsed.scope ?? env.MEMORY_SCOPE,
            tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
            run_id: parsed.run_id,
            context: parsed.context,
            candidates: parsed.tool_candidates,
            include_shadow: parsed.include_shadow,
            rules_limit: parsed.rules_limit,
            strict: parsed.tool_strict,
          },
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          { embeddedRuntime },
        );
      }

      return { recall, rules, tools };
    });
  } finally {
    gate.release();
  }

  const ms = performance.now() - t0;
  const recallOut = out.recall as any;
  const contextText = typeof recallOut?.context?.text === "string" ? recallOut.context.text : "";
  const contextChars = contextText.length;
  const contextEstTokens = estimateTokenCountFromText(contextText);
  const trajectory = buildRecallTrajectory({
    strategy:
      recallParsed.recall_strategy ??
      inferRecallStrategyFromKnobs({
        limit: recallParsed.limit,
        neighborhood_hops: recallParsed.neighborhood_hops as 1 | 2,
        max_nodes: recallParsed.max_nodes,
        max_edges: recallParsed.max_edges,
        ranked_limit: recallParsed.ranked_limit,
        min_edge_weight: recallParsed.min_edge_weight,
        min_edge_confidence: recallParsed.min_edge_confidence,
      }),
    limit: recallParsed.limit,
    neighborhood_hops: recallParsed.neighborhood_hops,
    max_nodes: recallParsed.max_nodes,
    max_edges: recallParsed.max_edges,
    ranked_limit: recallParsed.ranked_limit,
    min_edge_weight: recallParsed.min_edge_weight,
    min_edge_confidence: recallParsed.min_edge_confidence,
    seeds: recallOut.seeds.length,
    nodes: recallOut.subgraph.nodes.length,
    edges: recallOut.subgraph.edges.length,
    context_chars: contextChars,
    timings,
    neighborhood_counts: recallOut?.debug?.neighborhood_counts ?? null,
    stage1: recallOut?.debug?.stage1 ?? null,
    uri_links: collectRecallTrajectoryUriLinks({ recall: recallOut, tools: out.tools }),
  });
  const observability = buildRecallObservability({
    timings,
    inflight_wait_ms: gate.wait_ms,
    adaptive_profile: {
      profile: adaptiveProfile.profile,
      applied: adaptiveProfile.applied,
      reason: adaptiveProfile.reason,
    },
    adaptive_hard_cap: {
      applied: adaptiveHardCap.applied,
      reason: adaptiveHardCap.reason,
    },
    stage1: recallOut?.debug?.stage1 ?? null,
    neighborhood_counts: recallOut?.debug?.neighborhood_counts ?? null,
  });

  req.log.info(
    {
      planning_context: {
        scope: recallOut.scope,
        tenant_id: recallOut.tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
        has_tool_candidates: Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0,
        tool_candidates: parsed.tool_candidates?.length ?? 0,
        include_shadow: parsed.include_shadow,
        rules_limit: parsed.rules_limit,
        embed_ms: embedMs,
        embed_cache_hit: embedCacheHit,
        embed_singleflight_join: embedSingleflightJoin,
        embed_queue_wait_ms: embedQueueWaitMs,
        embed_batch_size: embedBatchSize,
        context_chars: contextChars,
        context_est_tokens: contextEstTokens,
        context_token_budget: recallParsed.context_token_budget ?? null,
        context_char_budget: recallParsed.context_char_budget ?? null,
        context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
        context_budget_default_applied: contextBudgetDefaultApplied,
        rules_considered: out.rules?.considered ?? 0,
        rules_matched: out.rules?.matched ?? 0,
        tools_selected: out.tools?.selection?.selected ?? null,
        return_layered_context: parsed.return_layered_context,
        ms,
        timings_ms: timings,
      },
    },
    "memory planning_context",
  );

  const layeredContext = parsed.return_layered_context
    ? assembleLayeredContext({
        recall: recallOut,
        rules: out.rules,
        tools: out.tools,
        config: parsed.context_layers ?? null,
      })
    : undefined;
  const tenantIdOut = recallOut.tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID;
  try {
    await recordContextAssemblyTelemetryBestEffort({
      req,
      tenant_id: tenantIdOut,
      scope: recallOut.scope,
      endpoint: "planning_context",
      latency_ms: ms,
      layered_output: !!layeredContext,
      layered_context: layeredContext,
    });
  } catch (err) {
    req.log.warn({ err, tenant_id: tenantIdOut, scope: recallOut.scope }, "planning_context telemetry insert failed");
  }

  return reply.code(200).send({
    tenant_id: tenantIdOut,
    scope: recallOut.scope,
    query: { text: q, embedding_provider: embedder.name },
    recall: {
      ...recallOut,
      trajectory,
      observability,
    },
    rules: out.rules,
    tools: out.tools ?? undefined,
    layered_context: layeredContext,
  });
});

// Context assembly helper: explicit multi-layer context composition surface.
// This endpoint is planner-agnostic and can be used by any runtime that needs deterministic layered context output.
app.post("/v1/memory/context/assemble", async (req, reply) => {
  if (!embedder) {
    return reply.code(400).send({ error: "no_embedding_provider", message: "Configure EMBEDDING_PROVIDER to use context assembly." });
  }

  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const principal = await requireMemoryPrincipal(req);
  const bodyRaw = withIdentityFromRequest(req, req.body, principal, "context_assemble");
  const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
  const baseProfile = resolveRecallProfile("recall_text", tenantFromBody(bodyRaw));
  let body = withRecallProfileDefaults(bodyRaw, baseProfile.defaults);
  const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs);
  if (strategyResolution.applied) {
    body = {
      ...body,
      ...strategyResolution.defaults,
      recall_strategy: strategyResolution.strategy,
    };
  }
  let parsed = ContextAssembleRequest.parse(body);
  let contextBudgetDefaultApplied = false;
  if (
    parsed.context_token_budget === undefined &&
    parsed.context_char_budget === undefined &&
    env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT > 0
  ) {
    parsed = ContextAssembleRequest.parse({
      ...(parsed as any),
      context_token_budget: env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT,
    });
    contextBudgetDefaultApplied = true;
  }

  const wantDebugEmbeddings = parsed.return_debug && parsed.include_embeddings;
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  if (wantDebugEmbeddings) await enforceRateLimit(req, reply, "debug_embeddings");
  if (wantDebugEmbeddings) await enforceTenantQuota(req, reply, "debug_embeddings", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
  await enforceRecallTextEmbedQuota(req, reply, parsed.tenant_id ?? env.MEMORY_TENANT_ID);

  const scope = parsed.scope ?? env.MEMORY_SCOPE;
  const qNorm = normalizeText(parsed.query_text, env.MAX_TEXT_LEN);
  const q = env.PII_REDACTION ? redactPII(qNorm).text : qNorm;

  let embedMs = 0;
  let embedCacheHit = false;
  let embedSingleflightJoin = false;
  let embedQueueWaitMs = 0;
  let embedBatchSize = 1;
  let recallParsed: any;
  const gate = await acquireInflightSlot("recall");
  const adaptiveProfile = resolveAdaptiveRecallProfile(baseProfile.profile, gate.wait_ms, explicitRecallKnobs);
  if (adaptiveProfile.applied) {
    parsed = ContextAssembleRequest.parse({ ...(parsed as any), ...adaptiveProfile.defaults });
  }
  const adaptiveHardCap = resolveAdaptiveRecallHardCap(
    {
      limit: parsed.limit,
      neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
      max_nodes: parsed.max_nodes,
      max_edges: parsed.max_edges,
      ranked_limit: parsed.ranked_limit,
      min_edge_weight: parsed.min_edge_weight,
      min_edge_confidence: parsed.min_edge_confidence,
    },
    gate.wait_ms,
    explicitRecallKnobs,
  );
  if (adaptiveHardCap.applied) {
    parsed = ContextAssembleRequest.parse({ ...(parsed as any), ...adaptiveHardCap.defaults });
  }

  let out: any;
  try {
    let vec: number[];
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
          context_assemble: {
            scope,
            tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
            embedding_provider: embedder.name,
            query_len: q.length,
            mapped_error: mapped.code,
            mapped_status: mapped.statusCode,
            err_message: String(err?.message ?? err),
          },
        },
        "context_assemble embedding failed",
      );
      throw new HttpError(mapped.statusCode, mapped.code, mapped.message, mapped.details);
    }

    recallParsed = MemoryRecallRequest.parse({
      tenant_id: parsed.tenant_id,
      scope,
      recall_strategy: parsed.recall_strategy,
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
      context_token_budget: parsed.context_token_budget,
      context_char_budget: parsed.context_char_budget,
      context_compaction_profile: parsed.context_compaction_profile,
    });
    const auth = buildRecallAuth(req, wantDebugEmbeddings, env.ADMIN_TOKEN);
    const executionContext =
      parsed.context && typeof parsed.context === "object" && !Array.isArray(parsed.context) ? parsed.context : {};

    out = await store.withClient(async (client) => {
      const recall = await memoryRecallParsed(
        client,
        recallParsed,
        env.MEMORY_SCOPE,
        env.MEMORY_TENANT_ID,
        auth,
        {
          timing: (stage, ms) => {
            timings[stage] = (timings[stage] ?? 0) + ms;
          },
        },
        "context_assemble",
        {
          stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
          recall_access: recallAccessForClient(client),
        },
      );

      let rules: any = null;
      if (parsed.include_rules) {
        rules = await evaluateRules(
          client,
          {
            scope: recallParsed.scope ?? env.MEMORY_SCOPE,
            tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
            context: executionContext,
            include_shadow: parsed.include_shadow,
            limit: parsed.rules_limit,
          },
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          { embeddedRuntime },
        );
      }

      let tools: any = null;
      if (Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0) {
        tools = await selectTools(
          client,
          {
            scope: recallParsed.scope ?? env.MEMORY_SCOPE,
            tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
            context: executionContext,
            candidates: parsed.tool_candidates,
            include_shadow: parsed.include_shadow,
            rules_limit: parsed.rules_limit,
            strict: parsed.tool_strict,
          },
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          { embeddedRuntime },
        );
      }

      return { recall, rules, tools };
    });
  } finally {
    gate.release();
  }

  const ms = performance.now() - t0;
  const recallOut = out.recall as any;
  const contextText = typeof recallOut?.context?.text === "string" ? recallOut.context.text : "";
  const contextChars = contextText.length;
  const contextEstTokens = estimateTokenCountFromText(contextText);
  const trajectory = buildRecallTrajectory({
    strategy:
      recallParsed.recall_strategy ??
      inferRecallStrategyFromKnobs({
        limit: recallParsed.limit,
        neighborhood_hops: recallParsed.neighborhood_hops as 1 | 2,
        max_nodes: recallParsed.max_nodes,
        max_edges: recallParsed.max_edges,
        ranked_limit: recallParsed.ranked_limit,
        min_edge_weight: recallParsed.min_edge_weight,
        min_edge_confidence: recallParsed.min_edge_confidence,
      }),
    limit: recallParsed.limit,
    neighborhood_hops: recallParsed.neighborhood_hops,
    max_nodes: recallParsed.max_nodes,
    max_edges: recallParsed.max_edges,
    ranked_limit: recallParsed.ranked_limit,
    min_edge_weight: recallParsed.min_edge_weight,
    min_edge_confidence: recallParsed.min_edge_confidence,
    seeds: recallOut.seeds.length,
    nodes: recallOut.subgraph.nodes.length,
    edges: recallOut.subgraph.edges.length,
    context_chars: contextChars,
    timings,
    neighborhood_counts: recallOut?.debug?.neighborhood_counts ?? null,
    stage1: recallOut?.debug?.stage1 ?? null,
    uri_links: collectRecallTrajectoryUriLinks({ recall: recallOut, tools: out.tools }),
  });
  const observability = buildRecallObservability({
    timings,
    inflight_wait_ms: gate.wait_ms,
    adaptive_profile: {
      profile: adaptiveProfile.profile,
      applied: adaptiveProfile.applied,
      reason: adaptiveProfile.reason,
    },
    adaptive_hard_cap: {
      applied: adaptiveHardCap.applied,
      reason: adaptiveHardCap.reason,
    },
    stage1: recallOut?.debug?.stage1 ?? null,
    neighborhood_counts: recallOut?.debug?.neighborhood_counts ?? null,
  });

  const layeredContext = parsed.return_layered_context
    ? assembleLayeredContext({
        recall: recallOut,
        rules: out.rules,
        tools: out.tools,
        config: parsed.context_layers ?? null,
      })
    : undefined;
  const tenantIdOut = recallOut.tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID;
  try {
    await recordContextAssemblyTelemetryBestEffort({
      req,
      tenant_id: tenantIdOut,
      scope: recallOut.scope,
      endpoint: "context_assemble",
      latency_ms: ms,
      layered_output: !!layeredContext,
      layered_context: layeredContext,
    });
  } catch (err) {
    req.log.warn({ err, tenant_id: tenantIdOut, scope: recallOut.scope }, "context_assemble telemetry insert failed");
  }

  req.log.info(
    {
      context_assemble: {
        scope: recallOut.scope,
        tenant_id: tenantIdOut,
        include_rules: parsed.include_rules,
        include_shadow: parsed.include_shadow,
        rules_limit: parsed.rules_limit,
        has_tool_candidates: Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0,
        tool_candidates: parsed.tool_candidates?.length ?? 0,
        return_layered_context: parsed.return_layered_context,
        embed_ms: embedMs,
        embed_cache_hit: embedCacheHit,
        embed_singleflight_join: embedSingleflightJoin,
        embed_queue_wait_ms: embedQueueWaitMs,
        embed_batch_size: embedBatchSize,
        context_chars: contextChars,
        context_est_tokens: contextEstTokens,
        context_token_budget: recallParsed.context_token_budget ?? null,
        context_char_budget: recallParsed.context_char_budget ?? null,
        context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
        context_budget_default_applied: contextBudgetDefaultApplied,
        rules_considered: out.rules?.considered ?? 0,
        rules_matched: out.rules?.matched ?? 0,
        tools_selected: out.tools?.selection?.selected ?? null,
        ms,
        timings_ms: timings,
      },
    },
    "memory context_assemble",
  );

  return reply.code(200).send({
    tenant_id: tenantIdOut,
    scope: recallOut.scope,
    query: { text: q, embedding_provider: embedder.name },
    recall: {
      ...recallOut,
      trajectory,
      observability,
    },
    rules: out.rules ?? undefined,
    tools: out.tools ?? undefined,
    layered_context: layeredContext,
  });
});

app.post("/v1/memory/feedback", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "feedback");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await store.withTx((client) =>
    ruleFeedback(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
      embeddedRuntime,
    }),
  );
  return reply.code(200).send(out);
});

app.post("/v1/memory/rules/state", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "rules_state");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await store.withTx((client) =>
    updateRuleState(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      embeddedRuntime,
    }),
  );
  return reply.code(200).send(out);
});

// Execution injection: evaluate SHADOW/ACTIVE rules against a caller-provided context object.
// This is designed for planner/tool selector integration (rules are not applied automatically by this service).
app.post("/v1/memory/rules/evaluate", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "rules_evaluate");
  await enforceRateLimit(req, reply, "recall"); // same protection class as recall
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient(async (client) => {
      return await evaluateRules(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, { embeddedRuntime });
    });
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Tool selector helper: apply ACTIVE (and optionally SHADOW) rule policy to candidate tool names.
// Intended for planner/tool selector integration to keep tool selection consistent.
app.post("/v1/memory/tools/select", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "tools_select");
  await enforceRateLimit(req, reply, "recall"); // same protection class as recall
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient(async (client) => {
      return await selectTools(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, { embeddedRuntime });
    });
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Decision readback helper: resolve a persisted tool-selection decision by id.
// Intended for operator/runtime observability and provenance checks.
app.post("/v1/memory/tools/decision", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "tools_decision");
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient(async (client) => {
      return await getToolsDecisionById(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID);
    });
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Run lifecycle helper: inspect decisions + linked feedback using run_id.
// Intended for planner-runtime observability and end-to-end policy-loop tracing.
app.post("/v1/memory/tools/run", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "tools_run");
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient(async (client) => {
      return await getToolsRunLifecycle(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID);
    });
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Feedback loop for tool selection: attribute a (positive/negative/neutral) outcome to matched rules.
// This updates memory_rule_defs positive/negative counts to drive future rule ordering.
app.post("/v1/memory/tools/feedback", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "tools_feedback");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await store.withTx((client) =>
    toolSelectionFeedback(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
      embeddedRuntime,
    }),
  );
  return reply.code(200).send(out);
});

// Replay recorder: start one replay run envelope.
app.post("/v1/memory/replay/run/start", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_run_start");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      replayRunStart(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay recorder: record one step pre-execution snapshot.
app.post("/v1/memory/replay/step/before", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_step_before");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      replayStepBefore(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay recorder: record one step post-execution result.
app.post("/v1/memory/replay/step/after", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_step_after");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      replayStepAfter(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay recorder: mark run completion status and summary.
app.post("/v1/memory/replay/run/end", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_run_end");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      replayRunEnd(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay readback: fetch timeline/step/artifact view for one run.
app.post("/v1/memory/replay/runs/get", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_run_get");
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient((client) =>
      replayRunGet(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay compiler: build one draft playbook from a completed run.
app.post("/v1/memory/replay/playbooks/compile_from_run", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_compile");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      replayPlaybookCompileFromRun(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay playbook readback by playbook_id.
app.post("/v1/memory/replay/playbooks/get", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_get");
  await enforceRateLimit(req, reply, "recall");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const gate = await acquireInflightSlot("recall");
  let out: any;
  try {
    out = await store.withClient((client) =>
      replayPlaybookGet(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay lifecycle: promote playbook status/version (draft->shadow->active).
app.post("/v1/memory/replay/playbooks/promote", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_promote");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      replayPlaybookPromote(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay lifecycle: apply repair patch and emit a new playbook version.
app.post("/v1/memory/replay/playbooks/repair", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_repair");
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      replayPlaybookRepair(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

// Replay lifecycle: review repaired version (approve/reject) and auto shadow-validate on approval.
app.post("/v1/memory/replay/playbooks/repair/review", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const bodyRaw = withIdentityFromRequest(req, req.body, principal, "replay_playbook_repair_review");
  const defaulted = withReplayRepairReviewDefaults(bodyRaw);
  const body = defaulted.body;
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? { ...(body.metadata as Record<string, unknown>) }
    : {};
  body.metadata = {
    ...metadata,
    auto_promote_policy_resolution: defaulted.resolution,
  };
  await enforceRateLimit(req, reply, "write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const gate = await acquireInflightSlot("write");
  let out: any;
  try {
    out = await store.withTx((client) =>
      replayPlaybookRepairReview(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
        embedder,
        embeddedRuntime,
        localExecutor: {
          enabled: env.SANDBOX_ENABLED && env.SANDBOX_EXECUTOR_MODE === "local_process",
          mode: env.SANDBOX_ENABLED && env.SANDBOX_EXECUTOR_MODE === "local_process" ? "local_process" : "disabled",
          allowedCommands: sandboxAllowedCommands,
          workdir: env.SANDBOX_EXECUTOR_WORKDIR,
          timeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
          stdioMaxBytes: env.SANDBOX_STDIO_MAX_BYTES,
        },
        shadowValidationPolicy: {
          executeTimeoutMs: env.REPLAY_SHADOW_VALIDATE_EXECUTE_TIMEOUT_MS,
          executeStopOnFailure: env.REPLAY_SHADOW_VALIDATE_EXECUTE_STOP_ON_FAILURE,
          sandboxTimeoutMs: env.REPLAY_SHADOW_VALIDATE_SANDBOX_TIMEOUT_MS,
          sandboxStopOnFailure: env.REPLAY_SHADOW_VALIDATE_SANDBOX_STOP_ON_FAILURE,
        },
        learningProjectionDefaults: buildReplayLearningProjectionDefaults({
          enabled: env.REPLAY_LEARNING_PROJECTION_ENABLED,
          mode: env.REPLAY_LEARNING_PROJECTION_MODE,
          delivery: env.REPLAY_LEARNING_PROJECTION_DELIVERY,
          targetRuleState: env.REPLAY_LEARNING_TARGET_RULE_STATE,
          minTotalSteps: env.REPLAY_LEARNING_MIN_TOTAL_STEPS,
          minSuccessRatio: env.REPLAY_LEARNING_MIN_SUCCESS_RATIO,
          maxMatcherBytes: env.REPLAY_LEARNING_MAX_MATCHER_BYTES,
          maxToolPrefer: env.REPLAY_LEARNING_MAX_TOOL_PREFER,
          episodeTtlDays: env.EPISODE_GC_TTL_DAYS,
        }),
        sandboxValidationExecutor: async (input) => {
          if (!env.SANDBOX_ENABLED) {
            return {
              ok: false,
              status: "failed",
              stdout: "",
              stderr: "",
              exit_code: null,
              error: "sandbox_disabled",
              run_id: null,
            };
          }
          const sandboxMode = input.mode === "async" ? "async" : "sync";
          const sessionOut = await store.withTx((client) =>
            createSandboxSession(
              client,
              {
                tenant_id: input.tenant_id,
                scope: input.scope,
                actor: "replay_shadow_validation",
                profile: "restricted",
                ttl_seconds: 900,
                metadata: {
                  source: "replay_shadow_validation",
                  ...(input.metadata ?? {}),
                },
              },
              {
                defaultScope: env.MEMORY_SCOPE,
                defaultTenantId: env.MEMORY_TENANT_ID,
              },
            ),
          );
          const queued = await store.withTx((client) =>
            enqueueSandboxRun(
              client,
              {
                tenant_id: input.tenant_id,
                scope: input.scope,
                actor: "replay_shadow_validation",
                session_id: sessionOut.session.session_id,
                mode: sandboxMode,
                timeout_ms: input.timeout_ms,
                action: {
                  kind: "command",
                  argv: input.argv,
                },
                metadata: {
                  source: "replay_shadow_validation",
                  ...(input.metadata ?? {}),
                },
              },
              {
                defaultScope: env.MEMORY_SCOPE,
                defaultTenantId: env.MEMORY_TENANT_ID,
                defaultTimeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
              },
            ),
          );
          if (sandboxMode === "async") {
            sandboxExecutor.enqueue(queued.run.run_id);
            return {
              ok: false,
              status: queued.run.status ?? "queued",
              stdout: "",
              stderr: "",
              exit_code: null,
              error: null,
              run_id: queued.run.run_id,
            };
          }

          await sandboxExecutor.executeSync(queued.run.run_id);
          const final = await store.withClient((client) =>
            getSandboxRun(
              client,
              {
                tenant_id: input.tenant_id,
                scope: input.scope,
                run_id: queued.run.run_id,
              },
              {
                defaultScope: env.MEMORY_SCOPE,
                defaultTenantId: env.MEMORY_TENANT_ID,
              },
            ),
          );
          return {
            ok: final.run.status === "succeeded",
            status: final.run.status,
            stdout: final.run.output?.stdout ?? "",
            stderr: final.run.output?.stderr ?? "",
            exit_code: Number.isFinite(final.run.exit_code ?? NaN) ? Number(final.run.exit_code) : null,
            error: final.run.error ? String(final.run.error) : null,
            run_id: final.run.run_id,
          };
        },
      }),
    );
  } finally {
    gate.release();
  }
  if (out && typeof out === "object" && !Array.isArray(out)) {
    out.auto_promote_policy_resolution = defaulted.resolution;
  }
  return reply.code(200).send(out);
});

// Replay runner: simulate/strict/guided playbook execution.
app.post("/v1/memory/replay/playbooks/run", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_run");
  const parsedForMode = ReplayPlaybookRunRequest.safeParse(body);
  const replayMode = parsedForMode.success ? parsedForMode.data.mode : "simulate";
  const rateKind = replayMode === "simulate" ? "recall" : "write";
  await enforceRateLimit(req, reply, rateKind);
  await enforceTenantQuota(req, reply, rateKind, tenantFromBody(body));
  const gate = await acquireInflightSlot(rateKind);
  let out: any;
  try {
    out = await store.withClient((client) =>
      replayPlaybookRun(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        embeddedRuntime,
        writeOptions: {
          defaultScope: env.MEMORY_SCOPE,
          defaultTenantId: env.MEMORY_TENANT_ID,
          maxTextLen: env.MAX_TEXT_LEN,
          piiRedaction: env.PII_REDACTION,
          allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
          shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
          shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
          writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
          embedder,
          embeddedRuntime,
        },
        localExecutor: {
          enabled: env.SANDBOX_ENABLED && env.SANDBOX_EXECUTOR_MODE === "local_process",
          mode: env.SANDBOX_ENABLED && env.SANDBOX_EXECUTOR_MODE === "local_process" ? "local_process" : "disabled",
          allowedCommands: sandboxAllowedCommands,
          workdir: env.SANDBOX_EXECUTOR_WORKDIR,
          timeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
          stdioMaxBytes: env.SANDBOX_STDIO_MAX_BYTES,
        },
        guidedRepair: {
          strategy: env.REPLAY_GUIDED_REPAIR_STRATEGY,
          allowRequestBuiltinLlm: env.REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM,
          maxErrorChars: env.REPLAY_GUIDED_REPAIR_MAX_ERROR_CHARS,
          httpEndpoint: env.REPLAY_GUIDED_REPAIR_HTTP_ENDPOINT,
          httpTimeoutMs: env.REPLAY_GUIDED_REPAIR_HTTP_TIMEOUT_MS,
          httpAuthToken: env.REPLAY_GUIDED_REPAIR_HTTP_AUTH_TOKEN,
          llmBaseUrl: env.REPLAY_GUIDED_REPAIR_LLM_BASE_URL,
          llmApiKey: env.REPLAY_GUIDED_REPAIR_LLM_API_KEY,
          llmModel: env.REPLAY_GUIDED_REPAIR_LLM_MODEL,
          llmTimeoutMs: env.REPLAY_GUIDED_REPAIR_LLM_TIMEOUT_MS,
          llmMaxTokens: env.REPLAY_GUIDED_REPAIR_LLM_MAX_TOKENS,
          llmTemperature: env.REPLAY_GUIDED_REPAIR_LLM_TEMPERATURE,
        },
        sandboxBudgetGuard: async (input) => {
          await enforceSandboxTenantBudget(reply, input.tenant_id, input.scope, input.project_id);
        },
        sandboxExecutor: async (input) => {
          if (!env.SANDBOX_ENABLED) {
            return {
              ok: false,
              status: "failed",
              stdout: "",
              stderr: "",
              exit_code: null,
              error: "sandbox_disabled",
              run_id: null,
            };
          }
          const sandboxMode = input.mode === "async" ? "async" : "sync";
          const sessionOut = await store.withTx((client) =>
            createSandboxSession(
              client,
              {
                tenant_id: input.tenant_id,
                scope: input.scope,
                actor: "replay_playbook_run",
                profile: "restricted",
                ttl_seconds: 900,
                metadata: {
                  source: "replay_playbook_run",
                  ...(input.metadata ?? {}),
                },
              },
              {
                defaultScope: env.MEMORY_SCOPE,
                defaultTenantId: env.MEMORY_TENANT_ID,
              },
            ),
          );
          const queued = await store.withTx((client) =>
            enqueueSandboxRun(
              client,
              {
                tenant_id: input.tenant_id,
                scope: input.scope,
                project_id: input.project_id ?? undefined,
                actor: "replay_playbook_run",
                session_id: sessionOut.session.session_id,
                mode: sandboxMode,
                timeout_ms: input.timeout_ms,
                action: {
                  kind: "command",
                  argv: input.argv,
                },
                metadata: {
                  source: "replay_playbook_run",
                  ...(input.metadata ?? {}),
                },
              },
              {
                defaultScope: env.MEMORY_SCOPE,
                defaultTenantId: env.MEMORY_TENANT_ID,
                defaultTimeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
              },
            ),
          );
          if (sandboxMode === "async") {
            sandboxExecutor.enqueue(queued.run.run_id);
            return {
              ok: false,
              status: queued.run.status ?? "queued",
              stdout: "",
              stderr: "",
              exit_code: null,
              error: null,
              run_id: queued.run.run_id,
            };
          }

          await sandboxExecutor.executeSync(queued.run.run_id);
          const final = await store.withClient((client) =>
            getSandboxRun(
              client,
              {
                tenant_id: input.tenant_id,
                scope: input.scope,
                run_id: queued.run.run_id,
              },
              {
                defaultScope: env.MEMORY_SCOPE,
                defaultTenantId: env.MEMORY_TENANT_ID,
              },
            ),
          );
          return {
            ok: final.run.status === "succeeded",
            status: final.run.status,
            stdout: final.run.output?.stdout ?? "",
            stderr: final.run.output?.stderr ?? "",
            exit_code: Number.isFinite(final.run.exit_code ?? NaN) ? Number(final.run.exit_code) : null,
            error: final.run.error ? String(final.run.error) : null,
            run_id: final.run.run_id,
          };
        },
      }),
    );
  } finally {
    gate.release();
  }
  return reply.code(200).send(out);
});

function assertSandboxEnabled(req: any) {
  if (!env.SANDBOX_ENABLED) {
    throw new HttpError(400, "sandbox_disabled", "sandbox interface is disabled");
  }
  if (env.SANDBOX_ADMIN_ONLY) {
    requireAdminTokenHeader(req?.headers ?? {}, env.ADMIN_TOKEN);
  }
}

app.post("/v1/memory/sandbox/sessions", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "sandbox_session_create");
  assertSandboxEnabled(req);
  await enforceRateLimit(req, reply, "sandbox_write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await store.withTx((client) =>
    createSandboxSession(client, body, {
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
    }),
  );
  return reply.code(200).send(out);
});

app.post("/v1/memory/sandbox/execute", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "sandbox_execute");
  const tenantId = tenantFromBody(body);
  const scope = scopeFromBody(body);
  const projectId = projectFromBody(body);
  assertSandboxEnabled(req);
  await enforceRateLimit(req, reply, "sandbox_write");
  await enforceTenantQuota(req, reply, "write", tenantId);
  await enforceSandboxTenantBudget(reply, tenantId, scope, projectId);
  const queued = await store.withTx((client) =>
    enqueueSandboxRun(client, body, {
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
      defaultTimeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
    }),
  );

  let runPayload = queued.run;
  if (runPayload.mode === "sync") {
    await sandboxExecutor.executeSync(runPayload.run_id);
    const final = await store.withClient((client) =>
      getSandboxRun(
        client,
        {
          tenant_id: queued.tenant_id,
          scope: queued.scope,
          run_id: runPayload.run_id,
        },
        {
          defaultScope: env.MEMORY_SCOPE,
          defaultTenantId: env.MEMORY_TENANT_ID,
        },
      ),
    );
    runPayload = final.run;
  } else {
    sandboxExecutor.enqueue(runPayload.run_id);
  }

  return reply.code(200).send({
    tenant_id: queued.tenant_id,
    scope: queued.scope,
    accepted: runPayload.mode === "async",
    run: runPayload,
  });
});

app.post("/v1/memory/sandbox/runs/get", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "sandbox_run_get");
  assertSandboxEnabled(req);
  await enforceRateLimit(req, reply, "sandbox_read");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const out = await store.withClient((client) =>
    getSandboxRun(client, body, {
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
    }),
  );
  return reply.code(200).send(out);
});

app.post("/v1/memory/sandbox/runs/logs", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "sandbox_run_logs");
  assertSandboxEnabled(req);
  await enforceRateLimit(req, reply, "sandbox_read");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const out = await store.withClient((client) =>
    getSandboxRunLogs(client, body, {
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
    }),
  );
  return reply.code(200).send(out);
});

app.post("/v1/memory/sandbox/runs/artifact", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "sandbox_run_artifact");
  assertSandboxEnabled(req);
  await enforceRateLimit(req, reply, "sandbox_read");
  await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
  const out = await store.withClient((client) =>
    getSandboxRunArtifact(client, body, {
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
      artifactObjectStoreBaseUri: env.SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI.trim() || null,
    }),
  );
  return reply.code(200).send(out);
});

app.post("/v1/memory/sandbox/runs/cancel", async (req, reply) => {
  const principal = await requireMemoryPrincipal(req);
  const body = withIdentityFromRequest(req, req.body, principal, "sandbox_run_cancel");
  assertSandboxEnabled(req);
  await enforceRateLimit(req, reply, "sandbox_write");
  await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
  const out = await store.withTx((client) =>
    cancelSandboxRun(client, body, {
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
    }),
  );
  if (out.status === "running") {
    sandboxExecutor.requestCancel(out.run_id);
  }
  return reply.code(200).send(out);
});

app.addHook("onClose", async () => {
  sandboxExecutor.shutdown();
  await store.close();
});

await store.withClient(async (client) => {
  assertRecallStoreAccessContract(recallAccessForClient(client));
  assertWriteStoreAccessContract(writeAccessForClient(client));
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

async function enforceRateLimit(
  req: any,
  reply: any,
  kind: "recall" | "debug_embeddings" | "write" | "sandbox_read" | "sandbox_write",
) {
  if (!env.RATE_LIMIT_ENABLED) return;
  const limiter =
    kind === "debug_embeddings"
      ? debugEmbedLimiter
      : kind === "write"
        ? writeLimiter
        : kind === "sandbox_write"
          ? sandboxWriteLimiter
          : kind === "sandbox_read"
            ? sandboxReadLimiter
            : recallLimiter;
  if (!limiter) return;

  const ip = String(req.ip ?? req.socket?.remoteAddress ?? "");
  if (env.RATE_LIMIT_BYPASS_LOOPBACK && env.APP_ENV !== "prod" && isLoopbackIp(ip)) {
    // Dev ergonomics: don't rate-limit local loopback traffic.
    return;
  }

  const key = rateLimitKey(req, kind);
  let waitedMs = 0;
  let res = limiter.check(key, 1);
  if (!res.allowed && (kind === "write" || kind === "sandbox_write") && env.WRITE_RATE_LIMIT_MAX_WAIT_MS > 0) {
    waitedMs = Math.min(env.WRITE_RATE_LIMIT_MAX_WAIT_MS, Math.max(1, res.retry_after_ms));
    await sleep(waitedMs);
    res = limiter.check(key, 1);
  }
  if (res.allowed) return;
  reply.header("retry-after", Math.ceil(res.retry_after_ms / 1000));
  const code =
    kind === "debug_embeddings"
      ? "rate_limited_debug_embeddings"
      : kind === "write"
        ? "rate_limited_write"
        : kind === "sandbox_write"
          ? "rate_limited_sandbox_write"
          : kind === "sandbox_read"
            ? "rate_limited_sandbox_read"
            : "rate_limited_recall";
  throw new HttpError(
    429,
    code,
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

  if (!env.TENANT_QUOTA_ENABLED) return;
  const quota = await tenantQuotaResolver.resolve(tenantId);
  const cfg = quota.recall_text_embed;
  const limiter = tenantQuotaResolver.limiterFor(tenantId, "recall_text_embed", cfg);
  const key = `tenant:${tenantId}:recall_text_embed`;
  let waitedMs = 0;
  let res = limiter.check(key, 1);
  if (!res.allowed && cfg.max_wait_ms > 0) {
    waitedMs = Math.min(cfg.max_wait_ms, Math.max(1, res.retry_after_ms));
    await sleep(waitedMs);
    res = limiter.check(key, 1);
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

async function emitControlAudit(
  req: any,
  input: {
    action: string;
    resource_type: string;
    resource_id?: string | null;
    tenant_id?: string | null;
    details?: Record<string, unknown>;
  },
) {
  try {
    await recordControlAuditEvent(db, {
      actor: "admin_token",
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id ?? null,
      tenant_id: input.tenant_id ?? null,
      request_id: String(req?.id ?? ""),
      details: input.details ?? {},
    });
  } catch (err) {
    req.log.warn({ err, action: input.action }, "failed to record control audit event");
  }
}

function requireAdminToken(req: any) {
  requireAdminTokenHeader(req?.headers ?? {}, env.ADMIN_TOKEN);
}

async function requireMemoryPrincipal(req: any): Promise<AuthPrincipal | null> {
  if (authResolver.mode === "off") return null;
  const principal = authResolver.resolve(req?.headers ?? {});
  if (principal) return principal;

  if (authResolver.mode === "api_key" || authResolver.mode === "api_key_or_jwt") {
    const apiKey = typeof req?.headers?.["x-api-key"] === "string" ? String(req.headers["x-api-key"]).trim() : "";
    if (apiKey) {
      const resolved = await resolveControlPlaneApiKeyPrincipal(apiKey);
      if (resolved) {
        (req as any).aionis_api_key_prefix = resolved.key_prefix;
        return {
          tenant_id: resolved.tenant_id,
          agent_id: resolved.agent_id,
          team_id: resolved.team_id,
          role: resolved.role,
          source: "api_key",
        };
      }
    }
  }

  {
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
    | "find"
    | "resolve"
    | "recall"
    | "recall_text"
    | "planning_context"
    | "context_assemble"
    | "feedback"
    | "rules_state"
    | "rules_evaluate"
    | "tools_select"
    | "tools_decision"
    | "tools_run"
    | "tools_feedback"
    | "replay_run_start"
    | "replay_step_before"
    | "replay_step_after"
    | "replay_run_end"
    | "replay_run_get"
    | "replay_playbook_compile"
    | "replay_playbook_get"
    | "replay_playbook_promote"
    | "replay_playbook_repair"
    | "replay_playbook_repair_review"
    | "replay_playbook_run"
    | "sandbox_session_create"
    | "sandbox_execute"
    | "sandbox_run_get"
    | "sandbox_run_logs"
    | "sandbox_run_artifact"
    | "sandbox_run_cancel",
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
  if (typeof obj.tenant_id === "string" && obj.tenant_id.trim().length > 0) {
    (req as any).aionis_tenant_id = obj.tenant_id.trim();
  } else if (headerTenant) {
    (req as any).aionis_tenant_id = headerTenant;
  }
  if (typeof obj.scope === "string" && obj.scope.trim().length > 0) {
    (req as any).aionis_scope = obj.scope.trim();
  }

  if (
    principal &&
    (
      kind === "find"
      || kind === "resolve"
      || kind === "recall"
      || kind === "recall_text"
      || kind === "planning_context"
      || kind === "context_assemble"
    )
  ) {
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

  if (
    principal &&
    (kind === "rules_evaluate" || kind === "tools_select" || kind === "tools_feedback" || kind === "planning_context" || kind === "context_assemble")
  ) {
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

function scopeFromBody(body: unknown): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const s = (body as any).scope;
    if (typeof s === "string" && s.trim().length > 0) return s.trim();
  }
  return env.MEMORY_SCOPE;
}

function projectFromBody(body: unknown): string | null {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const p = (body as any).project_id;
    if (typeof p === "string" && p.trim().length > 0) return p.trim();
  }
  return null;
}

async function enforceTenantQuota(req: any, reply: any, kind: "recall" | "debug_embeddings" | "write", tenantId: string) {
  if (!env.TENANT_QUOTA_ENABLED) return;
  const quota = await tenantQuotaResolver.resolve(tenantId);
  const cfg = kind === "debug_embeddings" ? quota.debug_embeddings : kind === "write" ? quota.write : quota.recall;
  const limiter = tenantQuotaResolver.limiterFor(tenantId, kind, cfg);
  const key = `tenant:${tenantId}:${kind}`;
  let waitedMs = 0;
  let res = limiter.check(key, 1);
  if (!res.allowed && kind === "write" && cfg.max_wait_ms > 0) {
    waitedMs = Math.min(cfg.max_wait_ms, Math.max(1, res.retry_after_ms));
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

function normalizeSandboxBudgetScope(scopeRaw: string | null | undefined): string {
  const scope = String(scopeRaw ?? "").trim();
  return scope.length > 0 ? scope : "*";
}

function normalizeSandboxBudgetProject(projectRaw: string | null | undefined): string {
  const projectId = String(projectRaw ?? "").trim();
  return projectId.length > 0 ? projectId : "*";
}

function nullableBudgetCap(v: number | null | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

async function listSandboxBudgetProfiles(args: {
  tenant_id?: string;
  limit?: number;
  offset?: number;
}): Promise<Array<Record<string, unknown>>> {
  const tenantId = typeof args.tenant_id === "string" && args.tenant_id.trim().length > 0 ? args.tenant_id.trim() : null;
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(args.limit ?? 100))));
  const offset = Math.max(0, Math.trunc(Number(args.offset ?? 0)));
  try {
    const out = await db.pool.query(
      `
      SELECT
        tenant_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap,
        updated_at::text AS updated_at
      FROM memory_sandbox_budget_profiles
      WHERE ($1::text IS NULL OR tenant_id = $1)
      ORDER BY tenant_id ASC, scope ASC
      LIMIT $2 OFFSET $3
      `,
      [tenantId, limit, offset],
    );
    return out.rows;
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return [];
    throw err;
  }
}

async function getSandboxBudgetProfile(tenantIdRaw: string, scopeRaw: string): Promise<Record<string, unknown> | null> {
  const tenantId = String(tenantIdRaw ?? "").trim();
  const scope = normalizeSandboxBudgetScope(scopeRaw);
  if (!tenantId) return null;
  try {
    const out = await db.pool.query(
      `
      SELECT
        tenant_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap,
        updated_at::text AS updated_at
      FROM memory_sandbox_budget_profiles
      WHERE tenant_id = $1
        AND scope = $2
      LIMIT 1
      `,
      [tenantId, scope],
    );
    return out.rows[0] ?? null;
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return null;
    throw err;
  }
}

async function upsertSandboxBudgetProfile(args: {
  tenant_id: string;
  scope: string;
  daily_run_cap?: number | null;
  daily_timeout_cap?: number | null;
  daily_failure_cap?: number | null;
}): Promise<Record<string, unknown>> {
  const tenantId = String(args.tenant_id ?? "").trim();
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  const scope = normalizeSandboxBudgetScope(args.scope);
  const runCap = nullableBudgetCap(args.daily_run_cap);
  const timeoutCap = nullableBudgetCap(args.daily_timeout_cap);
  const failureCap = nullableBudgetCap(args.daily_failure_cap);
  const anyCap = runCap !== null || timeoutCap !== null || failureCap !== null;
  if (!anyCap) {
    throw new HttpError(400, "invalid_request", "at least one positive cap is required");
  }
  try {
    const out = await db.pool.query(
      `
      INSERT INTO memory_sandbox_budget_profiles (
        tenant_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, scope)
      DO UPDATE
      SET
        daily_run_cap = EXCLUDED.daily_run_cap,
        daily_timeout_cap = EXCLUDED.daily_timeout_cap,
        daily_failure_cap = EXCLUDED.daily_failure_cap,
        updated_at = now()
      RETURNING
        tenant_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap,
        updated_at::text AS updated_at
      `,
      [tenantId, scope, runCap, timeoutCap, failureCap],
    );
    return out.rows[0] ?? {};
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      throw new HttpError(503, "sandbox_budget_table_missing", "sandbox budget table is unavailable", {
        table: "memory_sandbox_budget_profiles",
      });
    }
    throw err;
  }
}

async function deleteSandboxBudgetProfile(tenantIdRaw: string, scopeRaw: string): Promise<boolean> {
  const tenantId = String(tenantIdRaw ?? "").trim();
  const scope = normalizeSandboxBudgetScope(scopeRaw);
  if (!tenantId) return false;
  try {
    const out = await db.pool.query(
      `
      DELETE FROM memory_sandbox_budget_profiles
      WHERE tenant_id = $1
        AND scope = $2
      `,
      [tenantId, scope],
    );
    return Number(out.rowCount ?? 0) > 0;
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return false;
    throw err;
  }
}

async function listSandboxProjectBudgetProfiles(args: {
  tenant_id?: string;
  project_id?: string;
  limit?: number;
  offset?: number;
}): Promise<Array<Record<string, unknown>>> {
  const tenantId = typeof args.tenant_id === "string" && args.tenant_id.trim().length > 0 ? args.tenant_id.trim() : null;
  const projectId = typeof args.project_id === "string" && args.project_id.trim().length > 0 ? args.project_id.trim() : null;
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(args.limit ?? 100))));
  const offset = Math.max(0, Math.trunc(Number(args.offset ?? 0)));
  try {
    const out = await db.pool.query(
      `
      SELECT
        tenant_id,
        project_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap,
        updated_at::text AS updated_at
      FROM memory_sandbox_project_budget_profiles
      WHERE ($1::text IS NULL OR tenant_id = $1)
        AND ($2::text IS NULL OR project_id = $2)
      ORDER BY tenant_id ASC, project_id ASC, scope ASC
      LIMIT $3 OFFSET $4
      `,
      [tenantId, projectId, limit, offset],
    );
    return out.rows;
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return [];
    throw err;
  }
}

async function getSandboxProjectBudgetProfile(
  tenantIdRaw: string,
  projectIdRaw: string,
  scopeRaw: string,
): Promise<Record<string, unknown> | null> {
  const tenantId = String(tenantIdRaw ?? "").trim();
  const projectId = normalizeSandboxBudgetProject(projectIdRaw);
  const scope = normalizeSandboxBudgetScope(scopeRaw);
  if (!tenantId || !projectId) return null;
  try {
    const out = await db.pool.query(
      `
      SELECT
        tenant_id,
        project_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap,
        updated_at::text AS updated_at
      FROM memory_sandbox_project_budget_profiles
      WHERE tenant_id = $1
        AND project_id = $2
        AND scope = $3
      LIMIT 1
      `,
      [tenantId, projectId, scope],
    );
    return out.rows[0] ?? null;
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return null;
    throw err;
  }
}

async function upsertSandboxProjectBudgetProfile(args: {
  tenant_id: string;
  project_id: string;
  scope: string;
  daily_run_cap?: number | null;
  daily_timeout_cap?: number | null;
  daily_failure_cap?: number | null;
}): Promise<Record<string, unknown>> {
  const tenantId = String(args.tenant_id ?? "").trim();
  const projectId = normalizeSandboxBudgetProject(args.project_id);
  if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
  if (!projectId) throw new HttpError(400, "invalid_request", "project_id is required");
  const scope = normalizeSandboxBudgetScope(args.scope);
  const runCap = nullableBudgetCap(args.daily_run_cap);
  const timeoutCap = nullableBudgetCap(args.daily_timeout_cap);
  const failureCap = nullableBudgetCap(args.daily_failure_cap);
  const anyCap = runCap !== null || timeoutCap !== null || failureCap !== null;
  if (!anyCap) throw new HttpError(400, "invalid_request", "at least one positive cap is required");
  try {
    const out = await db.pool.query(
      `
      INSERT INTO memory_sandbox_project_budget_profiles (
        tenant_id,
        project_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, project_id, scope)
      DO UPDATE
      SET
        daily_run_cap = EXCLUDED.daily_run_cap,
        daily_timeout_cap = EXCLUDED.daily_timeout_cap,
        daily_failure_cap = EXCLUDED.daily_failure_cap,
        updated_at = now()
      RETURNING
        tenant_id,
        project_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap,
        updated_at::text AS updated_at
      `,
      [tenantId, projectId, scope, runCap, timeoutCap, failureCap],
    );
    return out.rows[0] ?? {};
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      throw new HttpError(503, "sandbox_project_budget_table_missing", "sandbox project budget table is unavailable", {
        table: "memory_sandbox_project_budget_profiles",
      });
    }
    throw err;
  }
}

async function deleteSandboxProjectBudgetProfile(tenantIdRaw: string, projectIdRaw: string, scopeRaw: string): Promise<boolean> {
  const tenantId = String(tenantIdRaw ?? "").trim();
  const projectId = normalizeSandboxBudgetProject(projectIdRaw);
  const scope = normalizeSandboxBudgetScope(scopeRaw);
  if (!tenantId || !projectId) return false;
  try {
    const out = await db.pool.query(
      `
      DELETE FROM memory_sandbox_project_budget_profiles
      WHERE tenant_id = $1
        AND project_id = $2
        AND scope = $3
      `,
      [tenantId, projectId, scope],
    );
    return Number(out.rowCount ?? 0) > 0;
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return false;
    throw err;
  }
}

type ResolvedSandboxTenantBudget = {
  policy: SandboxTenantBudgetPolicy;
  scope_filter: string | null;
  project_filter: string | null;
  source:
    | "db_project_exact"
    | "db_project_default"
    | "db_project_global_scope"
    | "db_project_global_default"
    | "db_exact"
    | "db_tenant_default"
    | "db_global_scope"
    | "db_global_default"
    | "env_tenant_default"
    | "env_global_default";
};

async function resolveSandboxTenantBudget(
  tenantIdRaw: string,
  scopeRaw: string,
  projectIdRaw?: string | null,
): Promise<ResolvedSandboxTenantBudget | null> {
  const tenantId = String(tenantIdRaw ?? "").trim() || env.MEMORY_TENANT_ID;
  const scope = String(scopeRaw ?? "").trim() || env.MEMORY_SCOPE;
  const projectId = String(projectIdRaw ?? "").trim();
  if (projectId) {
    try {
      const out = await db.pool.query<{
        tenant_id: string;
        project_id: string;
        scope: string;
        daily_run_cap: number | null;
        daily_timeout_cap: number | null;
        daily_failure_cap: number | null;
      }>(
        `
        SELECT
          tenant_id,
          project_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap
        FROM memory_sandbox_project_budget_profiles
        WHERE
          (tenant_id = $1 AND project_id = $2 AND scope = $3)
          OR (tenant_id = $1 AND project_id = $2 AND scope = '*')
          OR (tenant_id = '*' AND project_id = $2 AND scope = $3)
          OR (tenant_id = '*' AND project_id = $2 AND scope = '*')
          OR (tenant_id = $1 AND project_id = '*' AND scope = $3)
          OR (tenant_id = $1 AND project_id = '*' AND scope = '*')
          OR (tenant_id = '*' AND project_id = '*' AND scope = $3)
          OR (tenant_id = '*' AND project_id = '*' AND scope = '*')
        ORDER BY
          CASE
            WHEN tenant_id = $1 AND project_id = $2 AND scope = $3 THEN 1
            WHEN tenant_id = $1 AND project_id = $2 AND scope = '*' THEN 2
            WHEN tenant_id = '*' AND project_id = $2 AND scope = $3 THEN 3
            WHEN tenant_id = '*' AND project_id = $2 AND scope = '*' THEN 4
            WHEN tenant_id = $1 AND project_id = '*' AND scope = $3 THEN 5
            WHEN tenant_id = $1 AND project_id = '*' AND scope = '*' THEN 6
            WHEN tenant_id = '*' AND project_id = '*' AND scope = $3 THEN 7
            ELSE 8
          END
        LIMIT 1
        `,
        [tenantId, projectId, scope],
      );
      const row = out.rows[0] ?? null;
      if (row) {
        return {
          policy: {
            daily_run_cap: sanitizeBudgetCap(row.daily_run_cap),
            daily_timeout_cap: sanitizeBudgetCap(row.daily_timeout_cap),
            daily_failure_cap: sanitizeBudgetCap(row.daily_failure_cap),
          },
          scope_filter: row.scope === "*" ? null : row.scope,
          project_filter: row.project_id === "*" ? null : row.project_id,
          source:
            row.tenant_id === tenantId && row.project_id === projectId && row.scope === scope
              ? "db_project_exact"
              : row.tenant_id === tenantId && row.project_id === projectId && row.scope === "*"
                ? "db_project_default"
                : row.tenant_id === "*" && row.project_id === projectId && row.scope === scope
                  ? "db_project_global_scope"
                  : "db_project_global_default",
        };
      }
    } catch (err: any) {
      if (String(err?.code ?? "") !== "42P01") throw err;
    }
  }

  try {
    const out = await db.pool.query<{
      tenant_id: string;
      scope: string;
      daily_run_cap: number | null;
      daily_timeout_cap: number | null;
      daily_failure_cap: number | null;
    }>(
      `
      SELECT
        tenant_id,
        scope,
        daily_run_cap,
        daily_timeout_cap,
        daily_failure_cap
      FROM memory_sandbox_budget_profiles
      WHERE
        (tenant_id = $1 AND scope = $2)
        OR (tenant_id = $1 AND scope = '*')
        OR (tenant_id = '*' AND scope = $2)
        OR (tenant_id = '*' AND scope = '*')
      ORDER BY
        CASE
          WHEN tenant_id = $1 AND scope = $2 THEN 1
          WHEN tenant_id = $1 AND scope = '*' THEN 2
          WHEN tenant_id = '*' AND scope = $2 THEN 3
          ELSE 4
        END
      LIMIT 1
      `,
      [tenantId, scope],
    );
    const row = out.rows[0] ?? null;
    if (row) {
      return {
        policy: {
          daily_run_cap: sanitizeBudgetCap(row.daily_run_cap),
          daily_timeout_cap: sanitizeBudgetCap(row.daily_timeout_cap),
          daily_failure_cap: sanitizeBudgetCap(row.daily_failure_cap),
        },
        scope_filter: row.scope === "*" ? null : row.scope,
        project_filter: null,
        source:
          row.tenant_id === tenantId && row.scope === scope
            ? "db_exact"
            : row.tenant_id === tenantId && row.scope === "*"
              ? "db_tenant_default"
              : row.tenant_id === "*" && row.scope === scope
                ? "db_global_scope"
                : "db_global_default",
      };
    }
  } catch (err: any) {
    if (String(err?.code ?? "") !== "42P01") throw err;
  }

  if (sandboxTenantBudgetPolicy.size === 0) return null;
  const tenantPolicy = sandboxTenantBudgetPolicy.get(tenantId);
  if (tenantPolicy) {
    return {
      policy: tenantPolicy,
      scope_filter: null,
      project_filter: null,
      source: "env_tenant_default",
    };
  }
  const globalPolicy = sandboxTenantBudgetPolicy.get("*");
  if (globalPolicy) {
    return {
      policy: globalPolicy,
      scope_filter: null,
      project_filter: null,
      source: "env_global_default",
    };
  }
  return null;
}

async function enforceSandboxTenantBudget(
  reply: any,
  tenantIdRaw: string,
  scopeRaw: string,
  projectIdRaw?: string | null,
): Promise<void> {
  const resolved = await resolveSandboxTenantBudget(tenantIdRaw, scopeRaw, projectIdRaw);
  if (!resolved) return;
  const tenantId = String(tenantIdRaw ?? "").trim() || env.MEMORY_TENANT_ID;
  const scope = String(scopeRaw ?? "").trim() || env.MEMORY_SCOPE;
  const projectId = String(projectIdRaw ?? "").trim() || null;
  const windowHours = env.SANDBOX_TENANT_BUDGET_WINDOW_HOURS;
  const policy = resolved.policy;
  let usage: { total_runs: number; timeout_runs: number; failed_runs: number };
  try {
    const out = await db.pool.query<{
      total_runs: string;
      timeout_runs: string;
      failed_runs: string;
    }>(
      `
      SELECT
        count(*)::text AS total_runs,
        count(*) FILTER (WHERE status = 'timeout')::text AS timeout_runs,
        count(*) FILTER (WHERE status IN ('failed', 'timeout'))::text AS failed_runs
      FROM memory_sandbox_runs
      WHERE tenant_id = $1
        AND created_at >= now() - make_interval(hours => $2::int)
        AND ($3::text IS NULL OR scope = $3)
        AND ($4::text IS NULL OR project_id = $4)
      `,
      [tenantId, windowHours, resolved.scope_filter, resolved.project_filter],
    );
    usage = {
      total_runs: Number(out.rows[0]?.total_runs ?? "0"),
      timeout_runs: Number(out.rows[0]?.timeout_runs ?? "0"),
      failed_runs: Number(out.rows[0]?.failed_runs ?? "0"),
    };
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01" || String(err?.code ?? "") === "42703") {
      throw new HttpError(503, "sandbox_budget_unavailable", "sandbox budget table is unavailable", {
        tenant_id: tenantId,
        table: "memory_sandbox_runs",
      });
    }
    throw err;
  }

  const raise = (code: string, metric: "total_runs" | "timeout_runs" | "failed_runs", cap: number) => {
    reply.header("retry-after", "60");
    throw new HttpError(429, code, "sandbox tenant budget exceeded; retry later", {
      tenant_id: tenantId,
      project_id: projectId,
      metric,
      used: usage[metric],
      cap,
      window_hours: windowHours,
      scope,
      scope_filter: resolved.scope_filter,
      project_filter: resolved.project_filter,
      policy_source: resolved.source,
    });
  };
  const projectScoped = resolved.source.startsWith("db_project_");
  if (policy.daily_run_cap && usage.total_runs >= policy.daily_run_cap) {
    raise(projectScoped ? "sandbox_project_budget_run_cap_exceeded" : "sandbox_tenant_budget_run_cap_exceeded", "total_runs", policy.daily_run_cap);
  }
  if (policy.daily_timeout_cap && usage.timeout_runs >= policy.daily_timeout_cap) {
    raise(
      projectScoped ? "sandbox_project_budget_timeout_cap_exceeded" : "sandbox_tenant_budget_timeout_cap_exceeded",
      "timeout_runs",
      policy.daily_timeout_cap,
    );
  }
  if (policy.daily_failure_cap && usage.failed_runs >= policy.daily_failure_cap) {
    raise(
      projectScoped ? "sandbox_project_budget_failure_cap_exceeded" : "sandbox_tenant_budget_failure_cap_exceeded",
      "failed_runs",
      policy.daily_failure_cap,
    );
  }
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
