import type { Env } from "../config.js";
import { memoryFind } from "../memory/find.js";
import { exportMemoryPack, importMemoryPack } from "../memory/packs.js";
import { memoryResolve } from "../memory/resolve.js";
import { createSession, listSessionEvents, writeSessionEvent } from "../memory/sessions.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type GateLike = {
  release: () => void;
};

export function registerMemoryAccessRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  embedder: any;
  embeddedRuntime: any;
  liteWriteStore?: any;
  writeAccessShadowMirrorV2: boolean;
  requireAdminToken: (req: any) => void;
  requireStoreFeatureCapability: (capability: "sessions_graph" | "packs_export" | "packs_import") => void;
  requireMemoryPrincipal: (req: any) => Promise<any>;
  withIdentityFromRequest: (req: any, body: unknown, principal: any, kind: any) => any;
  enforceRateLimit: (req: any, reply: any, kind: "write" | "recall") => Promise<void>;
  enforceTenantQuota: (req: any, reply: any, kind: "write" | "recall", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "write" | "recall") => Promise<GateLike>;
}) {
  const {
    app,
    env,
    store,
    embedder,
    embeddedRuntime,
    liteWriteStore,
    writeAccessShadowMirrorV2,
    requireAdminToken,
    requireStoreFeatureCapability,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  } = args;

  const writeDefaults = {
    defaultScope: env.MEMORY_SCOPE,
    defaultTenantId: env.MEMORY_TENANT_ID,
    maxTextLen: env.MAX_TEXT_LEN,
    piiRedaction: env.PII_REDACTION,
    allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
    shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
    shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
      writeAccessShadowMirrorV2,
      embedder,
      embeddedRuntime,
      liteWriteStore,
    };

  app.post("/v1/memory/sessions", async (req: any, reply: any) => {
    requireStoreFeatureCapability("sessions_graph");
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "write");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteWriteStore
        ? await createSession({} as any, body, writeDefaults)
        : await store.withTx((client) => createSession(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/events", async (req: any, reply: any) => {
    requireStoreFeatureCapability("sessions_graph");
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "write");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteWriteStore
        ? await writeSessionEvent({} as any, body, writeDefaults)
        : await store.withTx((client) => writeSessionEvent(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.get("/v1/memory/sessions/:session_id/events", async (req: any, reply: any) => {
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
      out = liteWriteStore
        ? await listSessionEvents({} as any, input, {
            defaultScope: env.MEMORY_SCOPE,
            defaultTenantId: env.MEMORY_TENANT_ID,
            embeddedRuntime,
            liteWriteStore,
          })
        : await store.withClient((client) =>
            listSessionEvents(client, input, {
              defaultScope: env.MEMORY_SCOPE,
              defaultTenantId: env.MEMORY_TENANT_ID,
              embeddedRuntime,
              liteWriteStore,
            }),
          );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/packs/export", async (req: any, reply: any) => {
    requireStoreFeatureCapability("packs_export");
    requireAdminToken(req);
    const body = req.body ?? {};
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => exportMemoryPack(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/packs/import", async (req: any, reply: any) => {
    requireStoreFeatureCapability("packs_import");
    requireAdminToken(req);
    const body = req.body ?? {};
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withTx((client) => importMemoryPack(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/find", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "find");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => memoryFind(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/resolve", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "resolve");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => memoryResolve(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });
}
