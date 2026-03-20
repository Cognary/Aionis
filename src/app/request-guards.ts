import type { Env } from "../config.js";
import type { RecallAuth } from "../memory/recall.js";
import { requireAdminTokenHeader, secretTokensEqual } from "../util/admin_auth.js";
import type { AuthPrincipal } from "../util/auth.js";
import { sha256Hex } from "../util/crypto.js";
import { HttpError } from "../util/http.js";
import { parseTrustedProxyCidrs, resolveTrustedClientIp } from "../util/ip-guard.js";
import { InflightGate, InflightGateError, type InflightGateToken } from "../util/inflight_gate.js";

type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retry_after_ms: number };

type Limiter = {
  check: (key: string, cost?: number) => RateLimitResult;
};

export type RateLimitKind = "recall" | "debug_embeddings" | "write" | "sandbox_read" | "sandbox_write";
export type TenantQuotaKind = "recall" | "debug_embeddings" | "write";
export type InflightKind = "recall" | "write";

export type IdentityRequestKind =
  | "write"
  | "handoff_store"
  | "handoff_recover"
  | "rehydrate"
  | "activate"
  | "find"
  | "execution_introspect"
  | "resolve"
  | "rehydrate_payload"
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
  embedder: { embed: (texts: string[]) => Promise<number[][]> } | null;
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

function isReplayReadIdentityKind(kind: IdentityRequestKind): boolean {
  return (
    kind === "replay_run_start"
    || kind === "replay_step_before"
    || kind === "replay_step_after"
    || kind === "replay_run_end"
    || kind === "replay_run_get"
    || kind === "replay_playbook_compile"
    || kind === "replay_playbook_get"
    || kind === "replay_playbook_candidate"
    || kind === "replay_playbook_promote"
    || kind === "replay_playbook_repair"
    || kind === "replay_playbook_repair_review"
    || kind === "replay_playbook_run"
    || kind === "replay_playbook_dispatch"
    || kind === "execution_introspect"
  );
}

function isReplayWriteIdentityKind(kind: IdentityRequestKind): boolean {
  return (
    kind === "replay_run_start"
    || kind === "replay_step_before"
    || kind === "replay_step_after"
    || kind === "replay_run_end"
    || kind === "replay_playbook_compile"
    || kind === "replay_playbook_promote"
    || kind === "replay_playbook_repair"
    || kind === "replay_playbook_repair_review"
    || kind === "replay_playbook_run"
    || kind === "replay_playbook_dispatch"
  );
}

export function createRequestGuards({
  env,
  embedder,
  recallLimiter,
  debugEmbedLimiter,
  writeLimiter,
  sandboxWriteLimiter,
  sandboxReadLimiter,
  recallTextEmbedLimiter,
  recallInflightGate,
  writeInflightGate,
}: CreateRequestGuardsArgs) {
  if (env.AIONIS_EDITION !== "lite") {
    throw new Error("aionis-lite request guards only support AIONIS_EDITION=lite");
  }
  if (env.MEMORY_AUTH_MODE !== "off") {
    throw new Error("aionis-lite request guards only support MEMORY_AUTH_MODE=off");
  }
  if (env.TENANT_QUOTA_ENABLED) {
    throw new Error("aionis-lite request guards only support TENANT_QUOTA_ENABLED=false");
  }

  const trustedProxyCidrs = parseTrustedProxyCidrs(env.TRUSTED_PROXY_CIDRS);
  const requestClientIp = (req: any): string => {
    const cached = typeof req?.aionis_client_ip === "string" ? req.aionis_client_ip : "";
    if (cached) return cached;
    const ip = env.TRUST_PROXY
      ? resolveTrustedClientIp({
          remoteAddress: String(req?.raw?.socket?.remoteAddress ?? req?.socket?.remoteAddress ?? ""),
          headers: req?.headers ?? {},
          trustedProxyCidrs,
        })
      : String(req?.raw?.socket?.remoteAddress ?? req?.socket?.remoteAddress ?? req?.ip ?? "");
    (req as any).aionis_client_ip = ip;
    return ip;
  };

  const buildRecallAuth = (req: any, wantDebugEmbeddings: boolean): RecallAuth => {
    if (!wantDebugEmbeddings) return { allow_debug_embeddings: false };

    const headerToken = String(req.headers?.["x-admin-token"] ?? "");
    if (secretTokensEqual(headerToken, env.ADMIN_TOKEN)) return { allow_debug_embeddings: true };

    const ip = requestClientIp(req);
    if (!env.ADMIN_TOKEN && env.APP_ENV !== "prod" && isLoopbackIp(ip)) return { allow_debug_embeddings: true };

    return { allow_debug_embeddings: false };
  };

  const rateLimitKey = (req: any, category: string): string => {
    const headerToken = String(req.headers?.["x-admin-token"] ?? "");
    if (secretTokensEqual(headerToken, env.ADMIN_TOKEN)) {
      return `${category}:admin:${sha256Hex(headerToken).slice(0, 16)}`;
    }
    const ip = requestClientIp(req) || "unknown";
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

    const ip = requestClientIp(req);
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
    void tenantId;
    if (!embedder) return;
    if (!env.RATE_LIMIT_ENABLED || !recallTextEmbedLimiter) return;

    const key = rateLimitKey(req, "recall_text_embed");
    let waitedMs = 0;
    let res = recallTextEmbedLimiter.check(key, 1);
    if (!res.allowed && env.RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS > 0) {
      waitedMs = Math.min(env.RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS, Math.max(1, res.retry_after_ms));
      await sleep(waitedMs);
      res = recallTextEmbedLimiter.check(key, 1);
    }
    if (res.allowed) return;

    reply.header("retry-after", Math.ceil(res.retry_after_ms / 1000));
    throw new HttpError(429, "rate_limited_recall_text_embed", "recall_text embedding quota exceeded; retry later", {
      retry_after_ms: res.retry_after_ms,
      waited_ms: waitedMs,
    });
  };

  const requireAdminToken = (req: any) => {
    requireAdminTokenHeader(req?.headers ?? {}, env.ADMIN_TOKEN);
  };

  const requireMemoryPrincipal = async (_req: any): Promise<AuthPrincipal | null> => null;

  const withIdentityFromRequest = (
    req: any,
    body: unknown,
    _principal: AuthPrincipal | null,
    kind: IdentityRequestKind,
  ): unknown => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    const obj = { ...(body as Record<string, any>) };
    const headerTenantRaw = req?.headers?.["x-tenant-id"];
    const headerTenant = typeof headerTenantRaw === "string" ? headerTenantRaw.trim() : "";
    const bodyTenant = typeof obj.tenant_id === "string" ? obj.tenant_id.trim() : "";

    if (!bodyTenant && headerTenant) {
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

    if (isReplayReadIdentityKind(kind) && !obj.consumer_agent_id) {
      obj.consumer_agent_id = env.LITE_LOCAL_ACTOR_ID;
    }

    if (kind === "rehydrate_payload" && !obj.actor) {
      obj.actor = env.LITE_LOCAL_ACTOR_ID;
    }

    if (kind === "write" || isReplayWriteIdentityKind(kind)) {
      if (!obj.actor) obj.actor = env.LITE_LOCAL_ACTOR_ID;
      if (!obj.memory_lane) obj.memory_lane = "private";
      if (!obj.producer_agent_id) obj.producer_agent_id = env.LITE_LOCAL_ACTOR_ID;
      if (!obj.owner_agent_id && !obj.owner_team_id) obj.owner_agent_id = env.LITE_LOCAL_ACTOR_ID;
    }

    if (kind === "rules_evaluate" || kind === "tools_select" || kind === "tools_feedback" || kind === "planning_context" || kind === "context_assemble") {
      const ctx = obj.context && typeof obj.context === "object" && !Array.isArray(obj.context) ? { ...obj.context } : {};
      const agent = ctx.agent && typeof ctx.agent === "object" && !Array.isArray(ctx.agent) ? { ...ctx.agent } : {};
      if (!agent.id) agent.id = env.LITE_LOCAL_ACTOR_ID;
      if (!ctx.agent_id) ctx.agent_id = env.LITE_LOCAL_ACTOR_ID;
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

  const enforceTenantQuota = async (_req: any, _reply: any, _kind: TenantQuotaKind, _tenantId: string) => {};

  return {
    buildRecallAuth,
    acquireInflightSlot,
    enforceRateLimit,
    enforceRecallTextEmbedQuota,
    requireAdminToken,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    tenantFromBody,
    scopeFromBody,
    projectFromBody,
    enforceTenantQuota,
  };
}
