import type { Env } from "../config.js";
import { buildHandoffWriteBody, recoverHandoff } from "../memory/handoff.js";
import { applyMemoryWrite, prepareMemoryWrite } from "../memory/write.js";
import { HandoffRecoverRequest, HandoffStoreRequest } from "../memory/schemas.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type LiteWriteStoreLike = {
  withTx: <T>(fn: () => Promise<T>) => Promise<T>;
  findNodes: (...args: any[]) => Promise<any>;
  resolveNode: (...args: any[]) => Promise<any>;
};

type GateLike = {
  release: () => void;
};

export function registerHandoffRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  embedder: any;
  embeddedRuntime: any;
  liteWriteStore?: LiteWriteStoreLike | null;
  writeAccessForClient: (client: any) => any;
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
    writeAccessForClient,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  } = args;

  app.post("/v1/handoff/store", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = HandoffStoreRequest.parse(withIdentityFromRequest(req, req.body, principal, "handoff_store"));
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    try {
      const writeBody = buildHandoffWriteBody({
        ...body,
        ...(principal?.agent_id ? { producer_agent_id: principal.agent_id } : {}),
        ...(principal?.agent_id ? { owner_agent_id: principal.agent_id } : {}),
        ...(!principal?.agent_id && principal?.team_id ? { owner_team_id: principal.team_id } : {}),
      });
      const prepared = await prepareMemoryWrite(
        writeBody,
        env.MEMORY_SCOPE,
        env.MEMORY_TENANT_ID,
        {
          maxTextLen: env.MAX_TEXT_LEN,
          piiRedaction: env.PII_REDACTION,
          allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        },
        embedder,
      );
      const out = liteWriteStore
        ? await liteWriteStore.withTx(() =>
            applyMemoryWrite({} as any, prepared, {
              maxTextLen: env.MAX_TEXT_LEN,
              piiRedaction: env.PII_REDACTION,
              allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
              shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
              shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
              write_access: liteWriteStore as any,
            }),
          )
        : await store.withTx((client) =>
            applyMemoryWrite(client, prepared, {
              maxTextLen: env.MAX_TEXT_LEN,
              piiRedaction: env.PII_REDACTION,
              allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
              shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
              shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
              write_access: writeAccessForClient(client),
            }),
          );

      if (embeddedRuntime) {
        await embeddedRuntime.applyWrite(prepared, out);
      }

      const handoffNode = Array.isArray(out.nodes) ? out.nodes[0] : null;
      return reply.code(200).send({
        tenant_id: out.tenant_id,
        scope: out.scope,
        commit_id: out.commit_id,
        commit_uri: out.commit_uri,
        handoff: handoffNode
          ? {
              id: handoffNode.id,
              uri: handoffNode.uri ?? null,
              type: handoffNode.type,
              client_id: handoffNode.client_id ?? null,
              handoff_kind: body.handoff_kind,
              anchor: body.anchor,
              file_path: body.file_path,
              repo_root: body.repo_root ?? null,
              symbol: body.symbol ?? null,
              summary: body.summary,
              handoff_text: body.handoff_text,
              risk: body.risk ?? null,
              acceptance_checks: body.acceptance_checks ?? [],
              tags: body.tags ?? [],
              memory_lane: body.memory_lane,
            }
          : null,
      });
    } finally {
      gate.release();
    }
  });

  app.post("/v1/handoff/recover", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = HandoffRecoverRequest.parse(withIdentityFromRequest(req, req.body, principal, "handoff_recover"));
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    try {
      const out = liteWriteStore
        ? await recoverHandoff({
            liteWriteStore: liteWriteStore as any,
            input: body,
            defaultScope: env.MEMORY_SCOPE,
            defaultTenantId: env.MEMORY_TENANT_ID,
            consumerAgentId: principal?.agent_id ?? null,
            consumerTeamId: principal?.team_id ?? null,
          })
        : await store.withClient((client) =>
            recoverHandoff({
              client,
              input: body,
              defaultScope: env.MEMORY_SCOPE,
              defaultTenantId: env.MEMORY_TENANT_ID,
              consumerAgentId: principal?.agent_id ?? null,
              consumerTeamId: principal?.team_id ?? null,
            }),
          );
      return reply.code(200).send(out);
    } finally {
      gate.release();
    }
  });
}
