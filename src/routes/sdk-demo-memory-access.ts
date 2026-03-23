import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config.js";
import { buildExecutionMemoryIntrospectionLite } from "../memory/execution-introspection.js";
import { rehydrateAnchorPayloadLite } from "../memory/rehydrate-anchor.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";

type SdkDemoMemoryAccessRequestKind = "rehydrate_payload" | "execution_introspect";
type SdkDemoMemoryAccessRequest = FastifyRequest<{
  Body: unknown;
  Querystring: Record<string, unknown>;
  Params: Record<string, unknown>;
}>;

type SdkDemoMemoryAccessLiteStoreLike =
  Parameters<typeof rehydrateAnchorPayloadLite>[0];

export function registerSdkDemoMemoryAccessRoutes(args: {
  app: FastifyInstance;
  env: Env;
  liteWriteStore: SdkDemoMemoryAccessLiteStoreLike;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (
    req: FastifyRequest,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: SdkDemoMemoryAccessRequestKind,
  ) => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: "recall") => Promise<void>;
  enforceTenantQuota: (req: FastifyRequest, reply: FastifyReply, kind: "recall", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "recall") => Promise<InflightGateToken>;
}) {
  const {
    app,
    env,
    liteWriteStore,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  } = args;

  if (env.AIONIS_EDITION !== "lite") {
    throw new Error("aionis-lite sdk-demo memory-access routes only support AIONIS_EDITION=lite");
  }

  const runSdkDemoMemoryAccessRoute = async <TResult>(args: {
    req: SdkDemoMemoryAccessRequest;
    reply: FastifyReply;
    requestKind: SdkDemoMemoryAccessRequestKind;
    execute: (body: unknown) => Promise<TResult>;
  }): Promise<TResult> => {
    const { req, reply, requestKind, execute } = args;
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, requestKind);
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    try {
      return await execute(body);
    } finally {
      gate.release();
    }
  };

  app.post("/v1/memory/execution/introspect", async (req: SdkDemoMemoryAccessRequest, reply: FastifyReply) => {
    const out = await runSdkDemoMemoryAccessRoute({
      req,
      reply,
      requestKind: "execution_introspect",
      execute: (body) =>
        buildExecutionMemoryIntrospectionLite(
          liteWriteStore,
          body,
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          env.LITE_LOCAL_ACTOR_ID,
        ),
    });
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/anchors/rehydrate_payload", async (req: SdkDemoMemoryAccessRequest, reply: FastifyReply) => {
    const out = await runSdkDemoMemoryAccessRoute({
      req,
      reply,
      requestKind: "rehydrate_payload",
      execute: (body) =>
        rehydrateAnchorPayloadLite(
          liteWriteStore,
          body,
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          env.LITE_LOCAL_ACTOR_ID,
        ),
    });
    return reply.code(200).send(out);
  });
}
