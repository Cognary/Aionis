import type { Env } from "../config.js";
import { createEmbeddingSurfacePolicy, type EmbeddingSurfacePolicy } from "../embeddings/surface-policy.js";
import {
  replayPlaybookCandidate,
  replayPlaybookCompileFromRun,
  replayPlaybookGet,
  replayPlaybookPromote,
  replayPlaybookRepair,
  replayRunEnd,
  replayRunGet,
  replayRunStart,
  replayStepAfter,
  replayStepBefore,
} from "../memory/replay.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type GateLike = {
  release: () => void;
};

export function registerMemoryReplayCoreRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  embedder: any;
  embeddingSurfacePolicy?: EmbeddingSurfacePolicy;
  embeddedRuntime: any;
  liteReplayAccess?: any;
  liteReplayStore?: any;
  liteWriteStore?: any;
  writeAccessShadowMirrorV2: boolean;
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
    embeddingSurfacePolicy: embeddingSurfacePolicyArg,
    embeddedRuntime,
    liteReplayAccess,
    liteReplayStore,
    liteWriteStore,
    writeAccessShadowMirrorV2,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  } = args;
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
    embeddedRuntime,
    replayAccess: liteReplayAccess ?? null,
    replayMirror: liteReplayStore ?? null,
    writeAccess: liteWriteStore ?? null,
  };

  const liteModeActive = env.AIONIS_EDITION === "lite" && !!liteWriteStore;

  app.post("/v1/memory/replay/run/start", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_run_start");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteModeActive
        ? await liteWriteStore.withTx(() => replayRunStart({} as any, body, writeDefaults))
        : await store.withTx((client) => replayRunStart(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/step/before", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_step_before");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteModeActive
        ? await liteWriteStore.withTx(() => replayStepBefore({} as any, body, writeDefaults))
        : await store.withTx((client) => replayStepBefore(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/step/after", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_step_after");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteModeActive
        ? await liteWriteStore.withTx(() => replayStepAfter({} as any, body, writeDefaults))
        : await store.withTx((client) => replayStepAfter(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/run/end", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_run_end");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteModeActive
        ? await liteWriteStore.withTx(() => replayRunEnd({} as any, body, writeDefaults))
        : await store.withTx((client) => replayRunEnd(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/runs/get", async (req: any, reply: any) => {
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
          replayAccess: liteReplayAccess ?? null,
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/playbooks/compile_from_run", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_compile");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteModeActive
        ? await liteWriteStore.withTx(() => replayPlaybookCompileFromRun({} as any, body, writeDefaults))
        : await store.withTx((client) => replayPlaybookCompileFromRun(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/playbooks/get", async (req: any, reply: any) => {
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
          replayAccess: liteReplayAccess ?? null,
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/playbooks/candidate", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_candidate");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) =>
        replayPlaybookCandidate(client, body, {
          defaultScope: env.MEMORY_SCOPE,
          defaultTenantId: env.MEMORY_TENANT_ID,
          embeddedRuntime,
          replayAccess: liteReplayAccess ?? null,
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/playbooks/promote", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_promote");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteModeActive
        ? await liteWriteStore.withTx(() => replayPlaybookPromote({} as any, body, writeDefaults))
        : await store.withTx((client) => replayPlaybookPromote(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/playbooks/repair", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_repair");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = liteModeActive
        ? await liteWriteStore.withTx(() => replayPlaybookRepair({} as any, body, writeDefaults))
        : await store.withTx((client) => replayPlaybookRepair(client, body, writeDefaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });
}
