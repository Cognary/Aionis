import { isIP } from "node:net";
import { z } from "zod";

const RuntimeModeSchema = z.enum(["local", "service", "cloud"]);
const AbstractionPolicyProfileSchema = z.enum(["conservative", "balanced", "aggressive"]);

function sandboxRemoteHostAllowed(hostname: string, allowlist: string[]): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (allowlist.length === 0) return true;
  for (const raw of allowlist) {
    const rule = raw.trim().toLowerCase();
    if (!rule) continue;
    if (rule.startsWith("*.")) {
      const suffix = rule.slice(2);
      if (!suffix) continue;
      if (host === suffix || host.endsWith(`.${suffix}`)) return true;
      continue;
    }
    if (host === rule) return true;
  }
  return false;
}

function normalizeSandboxRemoteEgressCidrs(raw: string): string[] {
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
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") {
      throw new Error("SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON entries must be strings");
    }
    const rawRule = item.trim();
    if (!rawRule) continue;
    const slash = rawRule.lastIndexOf("/");
    if (slash <= 0 || slash >= rawRule.length - 1) {
      throw new Error(`SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON invalid CIDR: ${rawRule}`);
    }
    const ip = rawRule.slice(0, slash).trim();
    const prefixRaw = rawRule.slice(slash + 1).trim();
    const family = isIP(ip);
    if (family !== 4 && family !== 6) {
      throw new Error(`SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON invalid CIDR IP: ${rawRule}`);
    }
    const prefix = Number(prefixRaw);
    const maxPrefix = family === 4 ? 32 : 128;
    if (!Number.isFinite(prefix) || Math.trunc(prefix) !== prefix || prefix < 0 || prefix > maxPrefix) {
      throw new Error(`SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON invalid CIDR prefix: ${rawRule}`);
    }
    out.push(`${ip.toLowerCase()}/${prefix}`);
  }
  return out;
}

function parseSandboxAllowedCommandsJson(raw: string): string[] {
  const input = raw.trim();
  const candidates: string[] = [];
  if (input.length === 0) {
    candidates.push("[]");
  } else {
    candidates.push(input);
    // Accept shell-quoted env-file values, e.g. '["echo"]' or "[\"echo\"]".
    if (
      (input.startsWith("'") && input.endsWith("'") && input.length >= 2)
      || (input.startsWith("\"") && input.endsWith("\"") && input.length >= 2)
    ) {
      candidates.push(input.slice(1, -1).trim());
    }
  }

  let sawNonArrayJson = false;
  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) {
        sawNonArrayJson = true;
        continue;
      }
      return parsed
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v) => v.length > 0);
    } catch {
      // fall through to other candidate forms
    }
  }

  // Accept shell-expanded bare list form, e.g. [echo,python3] after `source`.
  if (input.startsWith("[") && input.endsWith("]")) {
    const body = input.slice(1, -1).trim();
    if (body.length === 0) return [];
    const parts = body.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
    const safeToken = /^[a-zA-Z0-9._/+:-]+$/;
    if (parts.every((v) => safeToken.test(v))) {
      return parts;
    }
  }

  if (sawNonArrayJson) {
    throw new Error("SANDBOX_ALLOWED_COMMANDS_JSON must be a JSON array");
  }
  throw new Error("SANDBOX_ALLOWED_COMMANDS_JSON must be a valid JSON array of command names");
}

const EnvSchema = z.object({
  AIONIS_MODE: RuntimeModeSchema.default("local"),
  APP_ENV: z.enum(["dev", "ci", "prod"]).default("dev"),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  DATABASE_URL: z.string().min(1),
  MEMORY_STORE_BACKEND: z.enum(["postgres", "embedded"]).default("postgres"),
  MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_SNAPSHOT_PATH: z.string().default(".tmp/embedded-memory-runtime.snapshot.json"),
  MEMORY_STORE_EMBEDDED_AUTOSAVE: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BYTES: z.coerce.number().int().positive().max(1024 * 1024 * 1024).default(50 * 1024 * 1024),
  MEMORY_STORE_EMBEDDED_SNAPSHOT_MAX_BACKUPS: z.coerce.number().int().min(0).max(20).default(3),
  MEMORY_STORE_EMBEDDED_SNAPSHOT_STRICT_MAX_BYTES: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_SNAPSHOT_COMPACTION_MAX_ROUNDS: z.coerce.number().int().min(1).max(32).default(8),
  MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_SESSION_GRAPH_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_PACK_EXPORT_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_STORE_EMBEDDED_PACK_IMPORT_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  DB_POOL_MAX: z.coerce.number().int().positive().max(200).default(30),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  PORT: z.coerce.number().int().positive().default(3001),
  MEMORY_SCOPE: z.string().min(1).default("default"),
  MEMORY_TENANT_ID: z.string().min(1).default("default"),
  MEMORY_AUTH_MODE: z.enum(["off", "api_key", "jwt", "api_key_or_jwt"]).default("off"),
  MEMORY_API_KEYS_JSON: z.string().default("{}"),
  MEMORY_JWT_HS256_SECRET: z.string().default(""),
  MEMORY_JWT_CLOCK_SKEW_SEC: z.coerce.number().int().min(0).default(30),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1536),
  ADMIN_TOKEN: z.string().optional(),
  RATE_LIMIT_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  // Dev ergonomics by default: allow unlimited loopback traffic unless explicitly disabled.
  RATE_LIMIT_BYPASS_LOOPBACK: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  RECALL_RATE_LIMIT_RPS: z.coerce.number().positive().default(10),
  RECALL_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(20),
  // Upstream-protection limiter for recall_text query embeddings.
  RECALL_TEXT_EMBED_RATE_LIMIT_RPS: z.coerce.number().positive().default(4),
  RECALL_TEXT_EMBED_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(8),
  RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS: z.coerce.number().int().min(0).max(5000).default(600),
  DEBUG_EMBED_RATE_LIMIT_RPS: z.coerce.number().positive().default(0.2), // ~1 request per 5s
  DEBUG_EMBED_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(2),
  WRITE_RATE_LIMIT_RPS: z.coerce.number().positive().default(5),
  WRITE_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(10),
  SANDBOX_WRITE_RATE_LIMIT_RPS: z.coerce.number().positive().default(5),
  SANDBOX_WRITE_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(10),
  SANDBOX_READ_RATE_LIMIT_RPS: z.coerce.number().positive().default(20),
  SANDBOX_READ_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(40),
  // Optional write-side smoothing: when a write is just over the limit, wait briefly then retry once.
  WRITE_RATE_LIMIT_MAX_WAIT_MS: z.coerce.number().int().min(0).max(5000).default(200),
  TENANT_QUOTA_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  TENANT_RECALL_RATE_LIMIT_RPS: z.coerce.number().positive().default(30),
  TENANT_RECALL_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(60),
  TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_RPS: z.coerce.number().positive().default(8),
  TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(16),
  TENANT_RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS: z.coerce.number().int().min(0).max(5000).default(800),
  TENANT_DEBUG_EMBED_RATE_LIMIT_RPS: z.coerce.number().positive().default(1),
  TENANT_DEBUG_EMBED_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(4),
  TENANT_WRITE_RATE_LIMIT_RPS: z.coerce.number().positive().default(10),
  TENANT_WRITE_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(20),
  TENANT_WRITE_RATE_LIMIT_MAX_WAIT_MS: z.coerce.number().int().min(0).max(5000).default(300),
  CONTROL_TENANT_QUOTA_CACHE_TTL_MS: z.coerce.number().int().positive().max(300000).default(30000),
  CONTROL_TELEMETRY_RETENTION_HOURS: z.coerce.number().int().positive().max(24 * 3650).default(24 * 30),
  CONTROL_TELEMETRY_PURGE_BATCH_LIMIT: z.coerce.number().int().positive().max(200000).default(20000),
  // Query embedding cache for recall_text (reduces upstream provider RPM pressure).
  RECALL_TEXT_EMBED_CACHE_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  RECALL_TEXT_EMBED_CACHE_MAX_KEYS: z.coerce.number().int().positive().max(200000).default(2000),
  RECALL_TEXT_EMBED_CACHE_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  RECALL_TEXT_EMBED_BATCH_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  RECALL_TEXT_EMBED_BATCH_MAX_SIZE: z.coerce.number().int().positive().max(256).default(24),
  RECALL_TEXT_EMBED_BATCH_MAX_WAIT_MS: z.coerce.number().int().min(0).max(100).default(8),
  RECALL_TEXT_EMBED_BATCH_MAX_INFLIGHT: z.coerce.number().int().positive().max(64).default(4),
  RECALL_TEXT_EMBED_BATCH_QUEUE_MAX: z.coerce.number().int().positive().max(200000).default(12000),
  RECALL_TEXT_EMBED_BATCH_QUEUE_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(5_000),
  // API inflight gates: coarse server-side backpressure for read/write paths.
  API_RECALL_MAX_INFLIGHT: z.coerce.number().int().positive().max(5000).default(256),
  API_RECALL_QUEUE_MAX: z.coerce.number().int().min(0).max(200000).default(6000),
  API_RECALL_QUEUE_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(2_000),
  API_WRITE_MAX_INFLIGHT: z.coerce.number().int().positive().max(5000).default(96),
  API_WRITE_QUEUE_MAX: z.coerce.number().int().min(0).max(200000).default(3000),
  API_WRITE_QUEUE_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(2_000),
  // Server-side default recall tuning profile used when callers omit recall knobs.
  MEMORY_RECALL_PROFILE: z.enum(["legacy", "strict_edges", "quality_first", "lite"]).default("strict_edges"),
  // Layered recall profile policy (global -> endpoint -> tenant -> tenant+endpoint), JSON object.
  MEMORY_RECALL_PROFILE_POLICY_JSON: z.string().default("{}"),
  // Adaptive profile downgrade on recall queue pressure.
  MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_RECALL_ADAPTIVE_WAIT_MS: z.coerce.number().int().min(1).max(60_000).default(200),
  MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE: z.enum(["legacy", "strict_edges", "quality_first", "lite"]).default("strict_edges"),
  // Additional queue-pressure hard caps to trim recall tail latency.
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS: z.coerce.number().int().min(1).max(60_000).default(600),
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_LIMIT: z.coerce.number().int().positive().max(200).default(16),
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_NEIGHBORHOOD_HOPS: z.coerce.number().int().min(1).max(2).default(1),
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_NODES: z.coerce.number().int().positive().max(200).default(40),
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_EDGES: z.coerce.number().int().positive().max(100).default(50),
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_RANKED_LIMIT: z.coerce.number().int().positive().max(500).default(90),
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_WEIGHT: z.coerce.number().min(0).max(1).default(0.25),
  MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.25),
  // Stage-1 safety net: if ANN recall returns zero seeds, run one exact KNN pass to avoid false-empty recall.
  MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  // Optional default compaction budget for recall_text context output. 0 disables.
  MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT: z.coerce.number().int().min(0).max(256000).default(0),
  PII_REDACTION: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  ALLOW_CROSS_SCOPE_EDGES: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MAX_TEXT_LEN: z.coerce.number().int().positive().default(8000),
  SANDBOX_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  SANDBOX_ADMIN_ONLY: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  SANDBOX_EXECUTOR_MODE: z.enum(["mock", "local_process", "http_remote"]).default("mock"),
  SANDBOX_EXECUTOR_MAX_CONCURRENCY: z.coerce.number().int().positive().max(16).default(2),
  SANDBOX_EXECUTOR_TIMEOUT_MS: z.coerce.number().int().positive().max(600000).default(15000),
  SANDBOX_STDIO_MAX_BYTES: z.coerce.number().int().positive().max(1024 * 1024).default(65536),
  SANDBOX_ALLOWED_COMMANDS_JSON: z.string().default("[\"echo\"]"),
  SANDBOX_EXECUTOR_WORKDIR: z.string().default(".tmp/sandbox"),
  SANDBOX_REMOTE_EXECUTOR_URL: z.string().default(""),
  SANDBOX_REMOTE_EXECUTOR_AUTH_HEADER: z.string().default("authorization"),
  SANDBOX_REMOTE_EXECUTOR_AUTH_TOKEN: z.string().default(""),
  SANDBOX_REMOTE_EXECUTOR_TIMEOUT_MS: z.coerce.number().int().positive().max(600000).default(20000),
  SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON: z.string().default("[]"),
  SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON: z.string().default("[]"),
  SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  SANDBOX_REMOTE_EXECUTOR_MTLS_CERT_PEM: z.string().default(""),
  SANDBOX_REMOTE_EXECUTOR_MTLS_KEY_PEM: z.string().default(""),
  SANDBOX_REMOTE_EXECUTOR_MTLS_CA_PEM: z.string().default(""),
  SANDBOX_REMOTE_EXECUTOR_MTLS_SERVER_NAME: z.string().default(""),
  SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI: z.string().default(""),
  SANDBOX_LOCAL_PROCESS_ALLOW_IN_PROD: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  SANDBOX_RUN_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(0).max(60000).default(5000),
  SANDBOX_RUN_STALE_AFTER_MS: z.coerce.number().int().positive().max(86400000).default(120000),
  SANDBOX_RUN_RECOVERY_POLL_INTERVAL_MS: z.coerce.number().int().min(0).max(300000).default(15000),
  SANDBOX_RUN_RECOVERY_BATCH_SIZE: z.coerce.number().int().positive().max(10000).default(100),
  SANDBOX_RETENTION_DAYS: z.coerce.number().int().positive().max(3650).default(30),
  SANDBOX_RETENTION_BATCH_SIZE: z.coerce.number().int().positive().max(200000).default(10000),
  SANDBOX_TENANT_BUDGET_WINDOW_HOURS: z.coerce.number().int().positive().max(168).default(24),
  SANDBOX_TENANT_BUDGET_POLICY_JSON: z.string().default("{}"),

  // Abstraction policy profile: coarse operating mode for topic clustering + compression rollup defaults.
  MEMORY_ABSTRACTION_POLICY_PROFILE: AbstractionPolicyProfileSchema.default("balanced"),

  TOPIC_SIM_THRESHOLD: z.coerce.number().min(-1).max(1).default(0.78),
  TOPIC_MIN_EVENTS_PER_TOPIC: z.coerce.number().int().positive().default(5),
  TOPIC_CLUSTER_BATCH_SIZE: z.coerce.number().int().positive().max(1000).default(200),
  TOPIC_MAX_CANDIDATES_PER_EVENT: z.coerce.number().int().positive().max(50).default(5),
  TOPIC_CLUSTER_STRATEGY: z.enum(["online_knn", "offline_hdbscan"]).default("online_knn"),

  AUTO_TOPIC_CLUSTER_ON_WRITE: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  TOPIC_CLUSTER_ASYNC_ON_WRITE: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),

  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(200).default(20),
  OUTBOX_CLAIM_TIMEOUT_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(25),
  // Phase C: shadow dual-write (legacy -> *_v2 partition tables).
  MEMORY_SHADOW_DUAL_WRITE_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_SHADOW_DUAL_WRITE_STRICT: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),

  // Long-term memory tiering policy (Phase 1).
  MEMORY_TIER_WARM_BELOW: z.coerce.number().min(0).max(1).default(0.35),
  MEMORY_TIER_COLD_BELOW: z.coerce.number().min(0).max(1).default(0.12),
  MEMORY_TIER_ARCHIVE_BELOW: z.coerce.number().min(0).max(1).default(0.03),
  MEMORY_SALIENCE_DECAY_FACTOR: z.coerce.number().min(0.9).max(1).default(0.995),
  MEMORY_TIER_WARM_INACTIVE_DAYS: z.coerce.number().int().positive().default(14),
  MEMORY_TIER_COLD_INACTIVE_DAYS: z.coerce.number().int().positive().default(45),
  MEMORY_TIER_ARCHIVE_INACTIVE_DAYS: z.coerce.number().int().positive().default(120),
  MEMORY_TIER_MAX_DAILY_MUTATION_RATIO: z.coerce.number().min(0.001).max(1).default(0.05),
  // Scope-level working-set budgets (Phase 4). 0 disables each budget.
  MEMORY_SCOPE_HOT_NODE_BUDGET: z.coerce.number().int().min(0).default(0),
  MEMORY_SCOPE_ACTIVE_NODE_BUDGET: z.coerce.number().int().min(0).default(0), // hot + warm
  // Adaptive decay (Phase 4): access recency + optional feedback signals.
  MEMORY_ADAPTIVE_DECAY_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_ADAPTIVE_RECENT_DAYS: z.coerce.number().int().positive().default(7),
  MEMORY_ADAPTIVE_RECENT_SCALE: z.coerce.number().min(0.1).max(2).default(0.6),
  MEMORY_ADAPTIVE_FEEDBACK_POS_STRENGTH: z.coerce.number().min(0).max(1).default(0.5),
  MEMORY_ADAPTIVE_FEEDBACK_NEG_STRENGTH: z.coerce.number().min(0).max(2).default(1),
  MEMORY_ADAPTIVE_DECAY_SCALE_MIN: z.coerce.number().min(0.1).max(1).default(0.25),
  MEMORY_ADAPTIVE_DECAY_SCALE_MAX: z.coerce.number().min(1).max(3).default(2),

  // Compression rollup policy (Phase 2 MVP).
  MEMORY_COMPRESSION_LOOKBACK_DAYS: z.coerce.number().int().positive().default(30),
  MEMORY_COMPRESSION_TOPIC_MIN_EVENTS: z.coerce.number().int().positive().default(4),
  MEMORY_COMPRESSION_MAX_TOPICS_PER_RUN: z.coerce.number().int().positive().max(500).default(50),
  MEMORY_COMPRESSION_MAX_EVENTS_PER_TOPIC: z.coerce.number().int().positive().max(100).default(12),
  MEMORY_COMPRESSION_MAX_TEXT_LEN: z.coerce.number().int().positive().default(1800),

  // Consolidation candidate scoring policy (Phase 3 shadow mode).
  MEMORY_CONSOLIDATION_MIN_VECTOR_SIM: z.coerce.number().min(0).max(1).default(0.86),
  MEMORY_CONSOLIDATION_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.82),
  MEMORY_CONSOLIDATION_MAX_ANCHORS: z.coerce.number().int().positive().max(2000).default(300),
  MEMORY_CONSOLIDATION_NEIGHBORS_PER_NODE: z.coerce.number().int().positive().max(50).default(8),
  MEMORY_CONSOLIDATION_MAX_PAIRS: z.coerce.number().int().positive().max(2000).default(200),
  MEMORY_CONSOLIDATION_REDIRECT_MAX_ALIASES: z.coerce.number().int().positive().max(5000).default(200),
  MEMORY_CONSOLIDATION_REDIRECT_MAX_EDGES_PER_ALIAS: z.coerce.number().int().positive().max(20000).default(2000),
  MEMORY_CONSOLIDATION_BLOCK_CONTRADICTORY: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  MEMORY_CONSOLIDATION_CONFLICT_MIN_SHARED_TOKENS: z.coerce.number().int().positive().max(8).default(1),
  MEMORY_CONSOLIDATION_CONFLICT_NEGATION_LEXICAL_MIN: z.coerce.number().min(0).max(1).default(0.5),
});

export type Env = z.infer<typeof EnvSchema>;

const MODE_PRESETS: Record<z.infer<typeof RuntimeModeSchema>, Record<string, string>> = {
  local: {
    APP_ENV: "dev",
    MEMORY_AUTH_MODE: "off",
    RATE_LIMIT_ENABLED: "true",
    RATE_LIMIT_BYPASS_LOOPBACK: "true",
    TENANT_QUOTA_ENABLED: "true",
    MEMORY_RECALL_PROFILE: "strict_edges",
  },
  service: {
    APP_ENV: "prod",
    MEMORY_AUTH_MODE: "api_key",
    RATE_LIMIT_ENABLED: "true",
    RATE_LIMIT_BYPASS_LOOPBACK: "false",
    TENANT_QUOTA_ENABLED: "true",
    MEMORY_RECALL_PROFILE: "strict_edges",
  },
  cloud: {
    APP_ENV: "prod",
    MEMORY_AUTH_MODE: "api_key_or_jwt",
    RATE_LIMIT_ENABLED: "true",
    RATE_LIMIT_BYPASS_LOOPBACK: "false",
    TENANT_QUOTA_ENABLED: "true",
    MEMORY_RECALL_PROFILE: "strict_edges",
  },
};

const ABSTRACTION_POLICY_PRESETS: Record<z.infer<typeof AbstractionPolicyProfileSchema>, Record<string, string>> = {
  conservative: {
    TOPIC_SIM_THRESHOLD: "0.84",
    TOPIC_MIN_EVENTS_PER_TOPIC: "6",
    TOPIC_CLUSTER_BATCH_SIZE: "120",
    TOPIC_MAX_CANDIDATES_PER_EVENT: "3",
    MEMORY_COMPRESSION_LOOKBACK_DAYS: "14",
    MEMORY_COMPRESSION_TOPIC_MIN_EVENTS: "6",
    MEMORY_COMPRESSION_MAX_TOPICS_PER_RUN: "30",
    MEMORY_COMPRESSION_MAX_EVENTS_PER_TOPIC: "8",
    MEMORY_COMPRESSION_MAX_TEXT_LEN: "1400",
  },
  balanced: {
    TOPIC_SIM_THRESHOLD: "0.78",
    TOPIC_MIN_EVENTS_PER_TOPIC: "5",
    TOPIC_CLUSTER_BATCH_SIZE: "200",
    TOPIC_MAX_CANDIDATES_PER_EVENT: "5",
    MEMORY_COMPRESSION_LOOKBACK_DAYS: "30",
    MEMORY_COMPRESSION_TOPIC_MIN_EVENTS: "4",
    MEMORY_COMPRESSION_MAX_TOPICS_PER_RUN: "50",
    MEMORY_COMPRESSION_MAX_EVENTS_PER_TOPIC: "12",
    MEMORY_COMPRESSION_MAX_TEXT_LEN: "1800",
  },
  aggressive: {
    TOPIC_SIM_THRESHOLD: "0.72",
    TOPIC_MIN_EVENTS_PER_TOPIC: "4",
    TOPIC_CLUSTER_BATCH_SIZE: "400",
    TOPIC_MAX_CANDIDATES_PER_EVENT: "8",
    MEMORY_COMPRESSION_LOOKBACK_DAYS: "45",
    MEMORY_COMPRESSION_TOPIC_MIN_EVENTS: "3",
    MEMORY_COMPRESSION_MAX_TOPICS_PER_RUN: "100",
    MEMORY_COMPRESSION_MAX_EVENTS_PER_TOPIC: "20",
    MEMORY_COMPRESSION_MAX_TEXT_LEN: "2200",
  },
};

function withModeDefaults(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...source };
  const modeInput = String(source.AIONIS_MODE ?? "local").trim().toLowerCase();
  const modeParsed = RuntimeModeSchema.safeParse(modeInput);
  if (!modeParsed.success) {
    return out;
  }
  out.AIONIS_MODE = modeParsed.data;
  const preset = MODE_PRESETS[modeParsed.data];
  for (const [k, v] of Object.entries(preset)) {
    const cur = out[k];
    if (cur === undefined || String(cur).trim().length === 0) out[k] = v;
  }
  return out;
}

function withAbstractionPolicyDefaults(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...source };
  const profileInput = String(source.MEMORY_ABSTRACTION_POLICY_PROFILE ?? "balanced")
    .trim()
    .toLowerCase();
  const parsed = AbstractionPolicyProfileSchema.safeParse(profileInput);
  if (!parsed.success) return out;
  out.MEMORY_ABSTRACTION_POLICY_PROFILE = parsed.data;
  const preset = ABSTRACTION_POLICY_PRESETS[parsed.data];
  for (const [k, v] of Object.entries(preset)) {
    const cur = out[k];
    if (cur === undefined || String(cur).trim().length === 0) out[k] = v;
  }
  return out;
}

export function loadEnv(): Env {
  const modeApplied = withModeDefaults(process.env);
  const applied = withAbstractionPolicyDefaults(modeApplied);
  const parsed = EnvSchema.safeParse(applied);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${msg}`);
  }
  if (parsed.data.EMBEDDING_DIM !== 1536) {
    throw new Error(`EMBEDDING_DIM must be 1536 for text-embedding-3-small; got ${parsed.data.EMBEDDING_DIM}`);
  }
  if ((parsed.data.MEMORY_AUTH_MODE === "jwt" || parsed.data.MEMORY_AUTH_MODE === "api_key_or_jwt") && !parsed.data.MEMORY_JWT_HS256_SECRET) {
    throw new Error("MEMORY_JWT_HS256_SECRET is required when MEMORY_AUTH_MODE includes jwt");
  }
  if (parsed.data.MEMORY_SHADOW_DUAL_WRITE_STRICT && !parsed.data.MEMORY_SHADOW_DUAL_WRITE_ENABLED) {
    throw new Error("MEMORY_SHADOW_DUAL_WRITE_STRICT=true requires MEMORY_SHADOW_DUAL_WRITE_ENABLED=true");
  }
  if (parsed.data.MEMORY_STORE_BACKEND === "embedded" && !parsed.data.MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED) {
    throw new Error("MEMORY_STORE_BACKEND=embedded requires MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED=true");
  }
  if (
    parsed.data.MEMORY_STORE_BACKEND === "embedded" &&
    parsed.data.MEMORY_SHADOW_DUAL_WRITE_ENABLED &&
    parsed.data.MEMORY_SHADOW_DUAL_WRITE_STRICT &&
    !parsed.data.MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED
  ) {
    throw new Error(
      "MEMORY_SHADOW_DUAL_WRITE_STRICT=true requires MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED=true when MEMORY_STORE_BACKEND=embedded",
    );
  }
  {
    let policy: unknown;
    try {
      const raw = parsed.data.MEMORY_RECALL_PROFILE_POLICY_JSON.trim();
      policy = raw.length === 0 ? {} : JSON.parse(raw);
    } catch {
      throw new Error("MEMORY_RECALL_PROFILE_POLICY_JSON must be valid JSON object");
    }
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      throw new Error("MEMORY_RECALL_PROFILE_POLICY_JSON must be a JSON object");
    }
    const allowedProfiles = new Set(["legacy", "strict_edges", "quality_first", "lite"]);
    const validateProfile = (value: unknown, path: string) => {
      if (typeof value !== "string" || !allowedProfiles.has(value)) {
        throw new Error(`${path} must be one of: legacy|strict_edges|quality_first|lite`);
      }
    };
    const asRecord = policy as Record<string, unknown>;
    if (asRecord.endpoint !== undefined) {
      if (!asRecord.endpoint || typeof asRecord.endpoint !== "object" || Array.isArray(asRecord.endpoint)) {
        throw new Error("MEMORY_RECALL_PROFILE_POLICY_JSON.endpoint must be an object");
      }
      for (const [k, v] of Object.entries(asRecord.endpoint as Record<string, unknown>)) {
        if (k !== "recall" && k !== "recall_text") {
          throw new Error(`MEMORY_RECALL_PROFILE_POLICY_JSON.endpoint.${k} is not supported (use recall|recall_text)`);
        }
        validateProfile(v, `MEMORY_RECALL_PROFILE_POLICY_JSON.endpoint.${k}`);
      }
    }
    if (asRecord.tenant_default !== undefined) {
      if (!asRecord.tenant_default || typeof asRecord.tenant_default !== "object" || Array.isArray(asRecord.tenant_default)) {
        throw new Error("MEMORY_RECALL_PROFILE_POLICY_JSON.tenant_default must be an object");
      }
      for (const [k, v] of Object.entries(asRecord.tenant_default as Record<string, unknown>)) {
        if (k.trim().length === 0) throw new Error("MEMORY_RECALL_PROFILE_POLICY_JSON.tenant_default key must be non-empty");
        validateProfile(v, `MEMORY_RECALL_PROFILE_POLICY_JSON.tenant_default.${k}`);
      }
    }
    if (asRecord.tenant_endpoint !== undefined) {
      if (!asRecord.tenant_endpoint || typeof asRecord.tenant_endpoint !== "object" || Array.isArray(asRecord.tenant_endpoint)) {
        throw new Error("MEMORY_RECALL_PROFILE_POLICY_JSON.tenant_endpoint must be an object");
      }
      for (const [tenant, endpointMap] of Object.entries(asRecord.tenant_endpoint as Record<string, unknown>)) {
        if (tenant.trim().length === 0) throw new Error("MEMORY_RECALL_PROFILE_POLICY_JSON.tenant_endpoint key must be non-empty");
        if (!endpointMap || typeof endpointMap !== "object" || Array.isArray(endpointMap)) {
          throw new Error(`MEMORY_RECALL_PROFILE_POLICY_JSON.tenant_endpoint.${tenant} must be an object`);
        }
        for (const [endpoint, profile] of Object.entries(endpointMap as Record<string, unknown>)) {
          if (endpoint !== "recall" && endpoint !== "recall_text") {
            throw new Error(
              `MEMORY_RECALL_PROFILE_POLICY_JSON.tenant_endpoint.${tenant}.${endpoint} is not supported (use recall|recall_text)`,
            );
          }
          validateProfile(profile, `MEMORY_RECALL_PROFILE_POLICY_JSON.tenant_endpoint.${tenant}.${endpoint}`);
        }
      }
    }
  }
  {
    const normalized = parseSandboxAllowedCommandsJson(parsed.data.SANDBOX_ALLOWED_COMMANDS_JSON);
    if (
      parsed.data.SANDBOX_ENABLED
      && (parsed.data.SANDBOX_EXECUTOR_MODE === "local_process" || parsed.data.SANDBOX_EXECUTOR_MODE === "http_remote")
      && normalized.length === 0
    ) {
      throw new Error("SANDBOX_ALLOWED_COMMANDS_JSON must include at least one command when local_process/http_remote sandbox is enabled");
    }
    // Normalize to stable JSON so downstream parsers see a consistent shape.
    parsed.data.SANDBOX_ALLOWED_COMMANDS_JSON = JSON.stringify(normalized);
  }
  {
    const mode = parsed.data.SANDBOX_EXECUTOR_MODE;
    const remoteUrl = parsed.data.SANDBOX_REMOTE_EXECUTOR_URL.trim();
    let allowedHosts: string[] = [];
    const allowedCidrs = normalizeSandboxRemoteEgressCidrs(parsed.data.SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON);
    const mtlsCert = parsed.data.SANDBOX_REMOTE_EXECUTOR_MTLS_CERT_PEM.trim();
    const mtlsKey = parsed.data.SANDBOX_REMOTE_EXECUTOR_MTLS_KEY_PEM.trim();
    const mtlsCa = parsed.data.SANDBOX_REMOTE_EXECUTOR_MTLS_CA_PEM.trim();
    const mtlsServerName = parsed.data.SANDBOX_REMOTE_EXECUTOR_MTLS_SERVER_NAME.trim();
    const mtlsEnabled = mtlsCert.length > 0 || mtlsKey.length > 0 || mtlsCa.length > 0 || mtlsServerName.length > 0;
    if (parsed.data.SANDBOX_ENABLED && mode === "http_remote" && remoteUrl.length === 0) {
      throw new Error("SANDBOX_REMOTE_EXECUTOR_URL is required when SANDBOX_EXECUTOR_MODE=http_remote and SANDBOX_ENABLED=true");
    }
    try {
      const raw = parsed.data.SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON.trim();
      const parsedHosts = raw.length === 0 ? [] : JSON.parse(raw);
      if (!Array.isArray(parsedHosts)) {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON must be a JSON array of host rules");
      }
      allowedHosts = parsedHosts
        .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
        .filter((v) => v.length > 0);
    } catch (err: any) {
      if (String(err?.message ?? "").includes("JSON array of host rules")) throw err;
      throw new Error("SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON must be valid JSON array");
    }
    if (remoteUrl.length > 0) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(remoteUrl);
      } catch {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_URL must be a valid URL");
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_URL must use http or https scheme");
      }
      if (!sandboxRemoteHostAllowed(parsedUrl.hostname, allowedHosts)) {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_URL host is not in SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON");
      }
      if (mtlsEnabled && parsedUrl.protocol !== "https:") {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_URL must use https when SANDBOX remote mTLS is configured");
      }
    }
    if (parsed.data.SANDBOX_REMOTE_EXECUTOR_AUTH_HEADER.trim().length === 0) {
      throw new Error("SANDBOX_REMOTE_EXECUTOR_AUTH_HEADER must be non-empty");
    }
    if ((mtlsCert.length > 0 || mtlsKey.length > 0) && (mtlsCert.length === 0 || mtlsKey.length === 0)) {
      throw new Error("SANDBOX_REMOTE_EXECUTOR_MTLS_CERT_PEM and SANDBOX_REMOTE_EXECUTOR_MTLS_KEY_PEM must be set together");
    }
    if (allowedCidrs.length === 0 && !parsed.data.SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS && parsed.data.SANDBOX_ENABLED && mode === "http_remote") {
      throw new Error(
        "SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS=false requires SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON to be non-empty when sandbox http_remote is enabled",
      );
    }
    if (parsed.data.SANDBOX_RUN_HEARTBEAT_INTERVAL_MS > 0 && parsed.data.SANDBOX_RUN_HEARTBEAT_INTERVAL_MS >= parsed.data.SANDBOX_RUN_STALE_AFTER_MS) {
      throw new Error("SANDBOX_RUN_HEARTBEAT_INTERVAL_MS must be less than SANDBOX_RUN_STALE_AFTER_MS");
    }
  }
  {
    const artifactBase = parsed.data.SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI.trim();
    if (artifactBase.length > 0 && !/^[a-z][a-z0-9+.-]*:\/\//i.test(artifactBase)) {
      throw new Error("SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI must be an absolute URI (for example s3://bucket/prefix)");
    }
  }
  {
    let policyRaw: unknown;
    try {
      const raw = parsed.data.SANDBOX_TENANT_BUDGET_POLICY_JSON.trim();
      policyRaw = raw.length === 0 ? {} : JSON.parse(raw);
    } catch {
      throw new Error("SANDBOX_TENANT_BUDGET_POLICY_JSON must be valid JSON object");
    }
    if (!policyRaw || typeof policyRaw !== "object" || Array.isArray(policyRaw)) {
      throw new Error("SANDBOX_TENANT_BUDGET_POLICY_JSON must be a JSON object");
    }
    for (const [tenantId, limitsRaw] of Object.entries(policyRaw as Record<string, unknown>)) {
      if (tenantId.trim().length === 0) {
        throw new Error("SANDBOX_TENANT_BUDGET_POLICY_JSON contains empty tenant key");
      }
      if (!limitsRaw || typeof limitsRaw !== "object" || Array.isArray(limitsRaw)) {
        throw new Error(`SANDBOX_TENANT_BUDGET_POLICY_JSON.${tenantId} must be an object`);
      }
      const limits = limitsRaw as Record<string, unknown>;
      for (const key of ["daily_run_cap", "daily_timeout_cap", "daily_failure_cap"]) {
        const value = limits[key];
        if (value === undefined || value === null) continue;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || Math.trunc(n) !== n) {
          throw new Error(`SANDBOX_TENANT_BUDGET_POLICY_JSON.${tenantId}.${key} must be a non-negative integer`);
        }
      }
    }
  }
  if (parsed.data.APP_ENV === "prod") {
    if (parsed.data.MEMORY_AUTH_MODE === "off") {
      throw new Error("MEMORY_AUTH_MODE=off is not allowed when APP_ENV=prod");
    }
    if (parsed.data.RATE_LIMIT_BYPASS_LOOPBACK) {
      throw new Error("RATE_LIMIT_BYPASS_LOOPBACK=true is not allowed when APP_ENV=prod");
    }
    if (!parsed.data.RATE_LIMIT_ENABLED) {
      throw new Error("RATE_LIMIT_ENABLED=false is not allowed when APP_ENV=prod");
    }
    if (!parsed.data.TENANT_QUOTA_ENABLED) {
      throw new Error("TENANT_QUOTA_ENABLED=false is not allowed when APP_ENV=prod");
    }
    if (parsed.data.MEMORY_AUTH_MODE === "api_key" || parsed.data.MEMORY_AUTH_MODE === "api_key_or_jwt") {
      let parsedKeys: unknown;
      try {
        parsedKeys = JSON.parse(parsed.data.MEMORY_API_KEYS_JSON);
      } catch {
        throw new Error("MEMORY_API_KEYS_JSON must be valid JSON when APP_ENV=prod and auth uses api keys");
      }
      const keys = parsedKeys && typeof parsedKeys === "object" && !Array.isArray(parsedKeys) ? Object.keys(parsedKeys as Record<string, unknown>) : [];
      if (keys.length === 0) {
        throw new Error("MEMORY_API_KEYS_JSON must contain at least one key when APP_ENV=prod and auth uses api keys");
      }
    }
    if (parsed.data.SANDBOX_ENABLED && parsed.data.SANDBOX_EXECUTOR_MODE === "local_process" && !parsed.data.SANDBOX_LOCAL_PROCESS_ALLOW_IN_PROD) {
      throw new Error("SANDBOX local_process executor is blocked in APP_ENV=prod unless SANDBOX_LOCAL_PROCESS_ALLOW_IN_PROD=true");
    }
    if (parsed.data.SANDBOX_ENABLED && parsed.data.SANDBOX_EXECUTOR_MODE === "http_remote") {
      const remoteUrl = parsed.data.SANDBOX_REMOTE_EXECUTOR_URL.trim();
      const rawAllowlist = parsed.data.SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON.trim();
      const mtlsCert = parsed.data.SANDBOX_REMOTE_EXECUTOR_MTLS_CERT_PEM.trim();
      const mtlsKey = parsed.data.SANDBOX_REMOTE_EXECUTOR_MTLS_KEY_PEM.trim();
      const allowedCidrs = normalizeSandboxRemoteEgressCidrs(parsed.data.SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON);
      let allowlist: string[] = [];
      try {
        allowlist = (rawAllowlist.length === 0 ? [] : JSON.parse(rawAllowlist))
          .map((v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
          .filter((v: string) => v.length > 0);
      } catch {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON must be valid JSON array");
      }
      if (remoteUrl.length === 0) {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_URL is required when SANDBOX_EXECUTOR_MODE=http_remote and APP_ENV=prod");
      }
      if (allowlist.length === 0) {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON must be non-empty in APP_ENV=prod when SANDBOX_EXECUTOR_MODE=http_remote");
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(remoteUrl);
      } catch {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_URL must be a valid URL");
      }
      if (parsedUrl.protocol !== "https:") {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_URL must use https in APP_ENV=prod");
      }
      if (!sandboxRemoteHostAllowed(parsedUrl.hostname, allowlist)) {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_URL host is not in SANDBOX_REMOTE_EXECUTOR_ALLOWED_HOSTS_JSON");
      }
      if ((mtlsCert.length > 0 || mtlsKey.length > 0) && (mtlsCert.length === 0 || mtlsKey.length === 0)) {
        throw new Error("SANDBOX_REMOTE_EXECUTOR_MTLS_CERT_PEM and SANDBOX_REMOTE_EXECUTOR_MTLS_KEY_PEM must be set together");
      }
      if (!parsed.data.SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS && allowedCidrs.length === 0) {
        throw new Error(
          "SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS=false requires SANDBOX_REMOTE_EXECUTOR_EGRESS_ALLOWED_CIDRS_JSON in APP_ENV=prod",
        );
      }
    }
  }
  return parsed.data;
}
