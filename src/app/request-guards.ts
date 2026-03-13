import { type ApiKeyPrincipalResolver, recordControlAuditEvent } from "../control-plane.js";
import type { Db } from "../db.js";
import type { Env } from "../config.js";
import type { RecallAuth } from "../memory/recall.js";
import { requireAdminTokenHeader, secretTokensEqual } from "../util/admin_auth.js";
import type { AuthPrincipal, AuthResolver } from "../util/auth.js";
import { sha256Hex } from "../util/crypto.js";
import { HttpError } from "../util/http.js";
import { InflightGate, InflightGateError, type InflightGateToken } from "../util/inflight_gate.js";

type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retry_after_ms: number };

type Limiter = {
  check: (key: string, cost?: number) => RateLimitResult;
};

type TenantQuotaLimit = {
  rps: number;
  burst: number;
  max_wait_ms: number;
};

type TenantQuotaResolver = {
  resolve: (tenantId: string) => Promise<{
    recall: TenantQuotaLimit;
    write: TenantQuotaLimit;
    debug_embeddings: TenantQuotaLimit;
    recall_text_embed: TenantQuotaLimit;
  }>;
  limiterFor: (
    tenantId: string,
    kind: "recall" | "write" | "debug_embeddings" | "recall_text_embed",
    cfg: TenantQuotaLimit,
  ) => Limiter;
};

type RateLimitKind = "recall" | "debug_embeddings" | "write" | "sandbox_read" | "sandbox_write";
type TenantQuotaKind = "recall" | "debug_embeddings" | "write";
type InflightKind = "recall" | "write";

type IdentityRequestKind =
  | "write"
  | "handoff_store"
  | "handoff_recover"
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
  | "replay_playbook_candidate"
  | "replay_playbook_promote"
  | "replay_playbook_repair"
  | "replay_playbook_repair_review"
  | "replay_playbook_run"
  | "replay_playbook_dispatch"
  | "automation_create"
  | "automation_get"
  | "automation_promote"
  | "automation_validate"
  | "automation_run"
  | "automation_run_get"
  | "automation_run_cancel"
  | "automation_run_resume"
  | "automation_run_reject_repair"
  | "automation_run_approve_repair"
  | "automation_run_compensation_retry"
  | "automation_run_compensation_record_action"
  | "sandbox_session_create"
  | "sandbox_execute"
  | "sandbox_run_get"
  | "sandbox_run_logs"
  | "sandbox_run_artifact"
  | "sandbox_run_cancel";

type CreateRequestGuardsArgs = {
  env: Env;
  db: Db | null;
  embedder: { embed: (texts: string[]) => Promise<number[][]> } | null;
  authResolver: AuthResolver;
  resolveControlPlaneApiKeyPrincipal: ApiKeyPrincipalResolver;
  tenantQuotaResolver: TenantQuotaResolver;
  recallLimiter: Limiter | null;
  debugEmbedLimiter: Limiter | null;
  writeLimiter: Limiter | null;
  sandboxWriteLimiter: Limiter | null;
  sandboxReadLimiter: Limiter | null;
  recallTextEmbedLimiter: Limiter | null;
  recallInflightGate: InflightGate;
  writeInflightGate: InflightGate;
};

function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.0.0.1");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export function createRequestGuards({
  env,
  db,
  embedder,
  authResolver,
  resolveControlPlaneApiKeyPrincipal,
  tenantQuotaResolver,
  recallLimiter,
  debugEmbedLimiter,
  writeLimiter,
  sandboxWriteLimiter,
  sandboxReadLimiter,
  recallTextEmbedLimiter,
  recallInflightGate,
  writeInflightGate,
}: CreateRequestGuardsArgs) {
  const buildRecallAuth = (req: any, wantDebugEmbeddings: boolean): RecallAuth => {
    if (!wantDebugEmbeddings) return { allow_debug_embeddings: false };

    const headerToken = String(req.headers?.["x-admin-token"] ?? "");
    if (secretTokensEqual(headerToken, env.ADMIN_TOKEN)) return { allow_debug_embeddings: true };

    const ip = String(req.ip ?? req.socket?.remoteAddress ?? "");
    if (!env.ADMIN_TOKEN && env.APP_ENV !== "prod" && isLoopbackIp(ip)) return { allow_debug_embeddings: true };

    return { allow_debug_embeddings: false };
  };

  const rateLimitKey = (req: any, category: string): string => {
    const headerToken = String(req.headers?.["x-admin-token"] ?? "");
    if (secretTokensEqual(headerToken, env.ADMIN_TOKEN)) {
      return `${category}:admin:${sha256Hex(headerToken).slice(0, 16)}`;
    }
    const ip = String(req.ip ?? req.socket?.remoteAddress ?? "unknown");
    return `${category}:ip:${ip}`;
  };

  const acquireInflightSlot = async (kind: InflightKind): Promise<InflightGateToken> => {
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
  };

  const enforceRateLimit = async (req: any, reply: any, kind: RateLimitKind) => {
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
    if (env.RATE_LIMIT_BYPASS_LOOPBACK && env.APP_ENV !== "prod" && isLoopbackIp(ip)) return;

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
    throw new HttpError(429, code, `rate limited (${kind}); retry later`, {
      retry_after_ms: res.retry_after_ms,
      waited_ms: waitedMs,
    });
  };

  const enforceRecallTextEmbedQuota = async (req: any, reply: any, tenantId: string) => {
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
    if (res.allowed) return;

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
  };

  const emitControlAudit = async (
    req: any,
    input: {
      action: string;
      resource_type: string;
      resource_id?: string | null;
      tenant_id?: string | null;
      details?: Record<string, unknown>;
    },
  ) => {
    try {
      if (!db) return;
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
  };

  const requireAdminToken = (req: any) => {
    requireAdminTokenHeader(req?.headers ?? {}, env.ADMIN_TOKEN);
  };

  const requireMemoryPrincipal = async (req: any): Promise<AuthPrincipal | null> => {
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

    const hint =
      authResolver.required_header_hint === "x-api-key"
        ? "X-Api-Key"
        : authResolver.required_header_hint === "authorization"
          ? "Authorization: Bearer <jwt>"
          : authResolver.required_header_hint === "x-api-key_or_authorization"
            ? "X-Api-Key or Authorization: Bearer <jwt>"
            : "authorization";
    throw new HttpError(401, "unauthorized", `valid ${hint} is required`);
  };

  const withIdentityFromRequest = (
    req: any,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: IdentityRequestKind,
  ): unknown => {
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
      principal
      && (kind === "rules_evaluate" || kind === "tools_select" || kind === "tools_feedback" || kind === "planning_context" || kind === "context_assemble")
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
  };

  const tenantFromBody = (body: unknown): string => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const tenantId = (body as any).tenant_id;
      if (typeof tenantId === "string" && tenantId.trim().length > 0) return tenantId.trim();
    }
    return env.MEMORY_TENANT_ID;
  };

  const scopeFromBody = (body: unknown): string => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const scope = (body as any).scope;
      if (typeof scope === "string" && scope.trim().length > 0) return scope.trim();
    }
    return env.MEMORY_SCOPE;
  };

  const projectFromBody = (body: unknown): string | null => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const projectId = (body as any).project_id;
      if (typeof projectId === "string" && projectId.trim().length > 0) return projectId.trim();
    }
    return null;
  };

  const enforceTenantQuota = async (req: any, reply: any, kind: TenantQuotaKind, tenantId: string) => {
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
  };

  return {
    buildRecallAuth,
    acquireInflightSlot,
    enforceRateLimit,
    enforceRecallTextEmbedQuota,
    emitControlAudit,
    requireAdminToken,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    tenantFromBody,
    scopeFromBody,
    projectFromBody,
    enforceTenantQuota,
  };
}
