import type { Env } from "../config.js";
import {
  cancelSandboxRun,
  createSandboxSession,
  enqueueSandboxRun,
  getSandboxRun,
  getSandboxRunArtifact,
  getSandboxRunLogs,
} from "../memory/sandbox.js";
import { HttpError } from "../util/http.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type SandboxExecutorLike = {
  executeSync: (runId: string) => Promise<void>;
  enqueue: (runId: string) => void;
  requestCancel: (runId: string) => void;
};

export function registerMemorySandboxRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  sandboxExecutor: SandboxExecutorLike;
  requireAdminToken: (req: any) => void;
  requireMemoryPrincipal: (req: any) => Promise<any>;
  withIdentityFromRequest: (req: any, body: unknown, principal: any, kind: any) => any;
  enforceRateLimit: (req: any, reply: any, kind: "sandbox_read" | "sandbox_write") => Promise<void>;
  enforceTenantQuota: (req: any, reply: any, kind: "recall" | "write", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  scopeFromBody: (body: unknown) => string;
  projectFromBody: (body: unknown) => string | null;
  enforceSandboxTenantBudget: (reply: any, tenantId: string, scope: string, projectId?: string | null) => Promise<void>;
}) {
  const {
    app,
    env,
    store,
    sandboxExecutor,
    requireAdminToken,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    scopeFromBody,
    projectFromBody,
    enforceSandboxTenantBudget,
  } = args;

  const assertSandboxEnabled = (req: any) => {
    if (!env.SANDBOX_ENABLED) {
      throw new HttpError(400, "sandbox_disabled", "sandbox interface is disabled");
    }
    if (env.SANDBOX_ADMIN_ONLY) {
      requireAdminToken(req);
    }
  };

  app.post("/v1/memory/sandbox/sessions", async (req: any, reply: any) => {
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

  app.post("/v1/memory/sandbox/execute", async (req: any, reply: any) => {
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

  app.post("/v1/memory/sandbox/runs/get", async (req: any, reply: any) => {
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

  app.post("/v1/memory/sandbox/runs/logs", async (req: any, reply: any) => {
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

  app.post("/v1/memory/sandbox/runs/artifact", async (req: any, reply: any) => {
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

  app.post("/v1/memory/sandbox/runs/cancel", async (req: any, reply: any) => {
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
}
