import type { Env } from "../config.js";
import { activateMemoryNodes } from "../memory/nodes-activate.js";
import { rehydrateArchiveNodes } from "../memory/rehydrate.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

export function registerMemoryLifecycleRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  requireMemoryPrincipal: (req: any) => Promise<any>;
  withIdentityFromRequest: (req: any, body: unknown, principal: any, kind: any) => any;
  enforceRateLimit: (req: any, reply: any, kind: "write") => Promise<void>;
  enforceTenantQuota: (req: any, reply: any, kind: "write", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
}) {
  const {
    app,
    env,
    store,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
  } = args;

  app.post("/v1/memory/archive/rehydrate", async (req: any, reply: any) => {
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

  app.post("/v1/memory/nodes/activate", async (req: any, reply: any) => {
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
}
