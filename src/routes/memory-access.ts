import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import type { Env } from "../config.js";
import { createEmbeddingSurfacePolicy, type EmbeddingSurfacePolicy } from "../embeddings/surface-policy.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { memoryFindLite } from "../memory/find.js";
import { exportMemoryPack, importMemoryPack } from "../memory/packs.js";
import { memoryResolveLite } from "../memory/resolve.js";
import { createSession, listSessions, listSessionEvents, writeSessionEvent } from "../memory/sessions.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";

type MemoryAccessRequestKind = "write" | "find" | "resolve";
type MemoryAccessInflightKind = "write" | "recall";

type MemoryAccessRequest = FastifyRequest<{ Body: unknown; Querystring: Record<string, unknown>; Params: Record<string, unknown> }>;

type SessionEventsParams = {
  session_id?: string;
};

type MemoryAccessLiteStoreLike =
  NonNullable<NonNullable<Parameters<typeof createSession>[2]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof writeSessionEvent>[2]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof listSessions>[2]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof listSessionEvents>[2]>["liteWriteStore"]>;

type SessionWriteOptionsLike = Parameters<typeof createSession>[2];

type RegisterMemoryAccessRoutesArgs = {
  app: FastifyInstance;
  env: Env;
  embedder: EmbeddingProvider | null;
  embeddingSurfacePolicy?: EmbeddingSurfacePolicy;
  liteWriteStore: MemoryAccessLiteStoreLike;
  writeAccessShadowMirrorV2: boolean;
  requireStoreFeatureCapability: (capability: "sessions_graph" | "packs_export" | "packs_import") => void;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (
    req: FastifyRequest,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: MemoryAccessRequestKind,
  ) => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: "write" | "recall") => Promise<void>;
  enforceTenantQuota: (req: FastifyRequest, reply: FastifyReply, kind: "write" | "recall", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "write" | "recall") => Promise<InflightGateToken>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function registerMemoryAccessRoutes(args: RegisterMemoryAccessRoutesArgs) {
  const {
    app,
    env,
    embedder,
    embeddingSurfacePolicy: embeddingSurfacePolicyArg,
    liteWriteStore,
    writeAccessShadowMirrorV2,
    requireStoreFeatureCapability,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  } = args;
  if (env.AIONIS_EDITION !== "lite") {
    throw new Error("aionis-lite memory-access routes only support AIONIS_EDITION=lite");
  }
  const embeddingSurfacePolicy =
    embeddingSurfacePolicyArg ?? createEmbeddingSurfacePolicy({ providerConfigured: !!embedder });
  const writeEmbedder = embeddingSurfacePolicy.providerFor("write_auto_embed", embedder);

  const writeDefaults = {
    defaultScope: env.MEMORY_SCOPE,
    defaultTenantId: env.MEMORY_TENANT_ID,
    maxTextLen: env.MAX_TEXT_LEN,
    piiRedaction: env.PII_REDACTION,
    allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
    shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
    shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
    writeAccessShadowMirrorV2,
    embedder: writeEmbedder,
    liteWriteStore,
  } satisfies SessionWriteOptionsLike;

  const runMemoryAccessRoute = async <TResult>(args: {
    req: MemoryAccessRequest;
    reply: FastifyReply;
    requestKind: MemoryAccessRequestKind;
    inflightKind: MemoryAccessInflightKind;
    requiredCapability?: "sessions_graph" | "packs_export" | "packs_import";
    bodyFactory?: (req: MemoryAccessRequest) => unknown;
    execute: (body: unknown) => Promise<TResult>;
  }): Promise<TResult> => {
    const { req, reply, requestKind, inflightKind, requiredCapability, bodyFactory, execute } = args;
    if (requiredCapability) requireStoreFeatureCapability(requiredCapability);
    const principal = await requireMemoryPrincipal(req);
    const rawBody = bodyFactory ? bodyFactory(req) : req.body;
    const body = withIdentityFromRequest(req, rawBody, principal, requestKind);
    await enforceRateLimit(req, reply, inflightKind);
    await enforceTenantQuota(req, reply, inflightKind, tenantFromBody(body));
    const gate = await acquireInflightSlot(inflightKind);
    try {
      return await execute(body);
    } finally {
      gate.release();
    }
  };
  const registerMemoryAccessRoute = <TResult>(args: {
    method: "get" | "post";
    path: string;
    requestKind: MemoryAccessRequestKind;
    inflightKind: MemoryAccessInflightKind;
    requiredCapability?: "sessions_graph" | "packs_export" | "packs_import";
    bodyFactory?: (req: MemoryAccessRequest) => unknown;
    execute: (body: unknown) => Promise<TResult>;
  }) => {
    const handler = async (req: MemoryAccessRequest, reply: FastifyReply) => {
      const out = await runMemoryAccessRoute({
        req,
        reply,
        requestKind: args.requestKind,
        inflightKind: args.inflightKind,
        requiredCapability: args.requiredCapability,
        bodyFactory: args.bodyFactory,
        execute: args.execute,
      });
      return reply.code(200).send(out);
    };
    if (args.method === "get") {
      app.get(args.path, handler);
      return;
    }
    app.post(args.path, handler);
  };

  registerMemoryAccessRoute({
    method: "post",
    path: "/v1/memory/sessions",
    requestKind: "write",
    inflightKind: "write",
    requiredCapability: "sessions_graph",
    execute: (body) => createSession({} as pg.PoolClient, body, writeDefaults),
  });

  registerMemoryAccessRoute({
    method: "get",
    path: "/v1/memory/sessions",
    requestKind: "find",
    inflightKind: "recall",
    requiredCapability: "sessions_graph",
    bodyFactory: (request) => asObject(request.query),
    execute: (input) =>
      listSessions({} as pg.PoolClient, input, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        liteWriteStore,
      }),
  });

  registerMemoryAccessRoute({
    method: "post",
    path: "/v1/memory/events",
    requestKind: "write",
    inflightKind: "write",
    requiredCapability: "sessions_graph",
    execute: (body) => writeSessionEvent({} as pg.PoolClient, body, writeDefaults),
  });

  app.get("/v1/memory/sessions/:session_id/events", async (req: FastifyRequest<{ Querystring: Record<string, unknown>; Params: SessionEventsParams }>, reply: FastifyReply) => {
    const out = await runMemoryAccessRoute({
      req: req as MemoryAccessRequest,
      reply,
      requestKind: "find",
      inflightKind: "recall",
      requiredCapability: "sessions_graph",
      bodyFactory: (request) => ({
        ...asObject(request.query),
        session_id: String((request.params as SessionEventsParams)?.session_id ?? ""),
      }),
      execute: (input) =>
        listSessionEvents({} as pg.PoolClient, input, {
          defaultScope: env.MEMORY_SCOPE,
          defaultTenantId: env.MEMORY_TENANT_ID,
          liteWriteStore,
        }),
    });
    return reply.code(200).send(out);
  });

  registerMemoryAccessRoute({
    method: "post",
    path: "/v1/memory/packs/export",
    requestKind: "find",
    inflightKind: "recall",
    requiredCapability: "packs_export",
    bodyFactory: (request) => request.body ?? {},
    execute: (body) => exportMemoryPack({} as pg.PoolClient, body, writeDefaults),
  });

  registerMemoryAccessRoute({
    method: "post",
    path: "/v1/memory/packs/import",
    requestKind: "write",
    inflightKind: "write",
    requiredCapability: "packs_import",
    bodyFactory: (request) => request.body ?? {},
    execute: (body) => importMemoryPack({} as pg.PoolClient, body, writeDefaults),
  });

  registerMemoryAccessRoute({
    method: "post",
    path: "/v1/memory/find",
    requestKind: "find",
    inflightKind: "recall",
    execute: (body) => memoryFindLite(liteWriteStore, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID),
  });

  registerMemoryAccessRoute({
    method: "post",
    path: "/v1/memory/resolve",
    requestKind: "resolve",
    inflightKind: "recall",
    execute: (body) => memoryResolveLite(liteWriteStore, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID),
  });
}
