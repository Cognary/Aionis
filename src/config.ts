import { z } from "zod";

const EnvSchema = z.object({
  APP_ENV: z.enum(["dev", "ci", "prod"]).default("dev"),
  DATABASE_URL: z.string().min(1),
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
  DEBUG_EMBED_RATE_LIMIT_RPS: z.coerce.number().positive().default(0.2), // ~1 request per 5s
  DEBUG_EMBED_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(2),
  WRITE_RATE_LIMIT_RPS: z.coerce.number().positive().default(5),
  WRITE_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(10),
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
  TENANT_DEBUG_EMBED_RATE_LIMIT_RPS: z.coerce.number().positive().default(1),
  TENANT_DEBUG_EMBED_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(4),
  TENANT_WRITE_RATE_LIMIT_RPS: z.coerce.number().positive().default(10),
  TENANT_WRITE_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(20),
  TENANT_WRITE_RATE_LIMIT_MAX_WAIT_MS: z.coerce.number().int().min(0).max(5000).default(300),
  // Query embedding cache for recall_text (reduces upstream provider RPM pressure).
  RECALL_TEXT_EMBED_CACHE_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  RECALL_TEXT_EMBED_CACHE_MAX_KEYS: z.coerce.number().int().positive().max(200000).default(2000),
  RECALL_TEXT_EMBED_CACHE_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
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

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
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
  }
  return parsed.data;
}
