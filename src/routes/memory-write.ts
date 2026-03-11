import type { Env } from "../config.js";
import { applyMemoryWrite, computeEffectiveWritePolicy, prepareMemoryWrite } from "../memory/write.js";
import type { WriteStoreAccess } from "../store/write-access.js";
import { HttpError } from "../util/http.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type LiteWriteStoreLike = WriteStoreAccess & {
  withTx: <T>(fn: () => Promise<T>) => Promise<T>;
  close?: () => Promise<void>;
  healthSnapshot?: () => unknown;
};

type GateLike = {
  release: () => void;
  wait_ms: number;
};

export function registerMemoryWriteRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  embedder: any;
  embeddedRuntime: any;
  liteWriteStore?: LiteWriteStoreLike | null;
  writeAccessForClient: (client: any) => any;
  requireMemoryPrincipal: (req: any) => Promise<any>;
  withIdentityFromRequest: (req: any, body: unknown, principal: any, kind: any) => any;
  enforceRateLimit: (req: any, reply: any, kind: "write") => Promise<void>;
  enforceTenantQuota: (req: any, reply: any, kind: "write", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "write") => Promise<GateLike>;
  runTopicClusterForEventIds: (client: any, args: any) => Promise<any>;
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
    runTopicClusterForEventIds,
  } = args;

  app.post("/v1/memory/write", async (req: any, reply: any) => {
    const t0 = performance.now();
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "write");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    try {
      const prepared = await prepareMemoryWrite(
        body,
        env.MEMORY_SCOPE,
        env.MEMORY_TENANT_ID,
        {
          maxTextLen: env.MAX_TEXT_LEN,
          piiRedaction: env.PII_REDACTION,
          allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        },
        embedder,
      );
      if (env.MEMORY_WRITE_REQUIRE_NODES && prepared.nodes.length === 0) {
        throw new HttpError(
          400,
          "write_nodes_required",
          "write request must include at least one node when MEMORY_WRITE_REQUIRE_NODES=true",
          {
            tenant_id: prepared.tenant_id,
            scope: prepared.scope_public,
            node_count: prepared.nodes.length,
            edge_count: prepared.edges.length,
          },
        );
      }

      const policy = computeEffectiveWritePolicy(prepared, {
        autoTopicClusterOnWrite: env.AUTO_TOPIC_CLUSTER_ON_WRITE,
        topicClusterAsyncOnWrite: env.TOPIC_CLUSTER_ASYNC_ON_WRITE,
      });

      const liteModeActive = env.AIONIS_EDITION === "lite" && !!liteWriteStore;
      const forcedLiteTopicClusterAsync = liteModeActive && policy.trigger_topic_cluster && !policy.topic_cluster_async;
      const out = liteModeActive
        ? await (async () => {
            (prepared as any).trigger_topic_cluster = policy.trigger_topic_cluster;
            // Lite write path cannot safely run sync clustering inside the SQLite write transaction.
            (prepared as any).topic_cluster_async = policy.trigger_topic_cluster
              ? true
              : policy.topic_cluster_async;

            return liteWriteStore.withTx(() => applyMemoryWrite({} as any, prepared, {
              maxTextLen: env.MAX_TEXT_LEN,
              piiRedaction: env.PII_REDACTION,
              allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
              shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
              shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
              write_access: liteWriteStore,
            }));
          })()
        : await store.withTx(async (client) => {
            (prepared as any).trigger_topic_cluster = policy.trigger_topic_cluster;
            (prepared as any).topic_cluster_async = policy.topic_cluster_async;

            const writeRes = await applyMemoryWrite(client, prepared, {
              maxTextLen: env.MAX_TEXT_LEN,
              piiRedaction: env.PII_REDACTION,
              allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
              shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
              shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
              write_access: writeAccessForClient(client),
            });

            if (policy.trigger_topic_cluster && !policy.topic_cluster_async) {
              const eventIds = prepared.nodes.filter((n) => n.type === "event").map((n) => n.id);
              if (eventIds.length > 0) {
                const clusterRes = await runTopicClusterForEventIds(client, {
                  scope: prepared.scope,
                  eventIds,
                  simThreshold: env.TOPIC_SIM_THRESHOLD,
                  minEventsPerTopic: env.TOPIC_MIN_EVENTS_PER_TOPIC,
                  maxCandidatesPerEvent: env.TOPIC_MAX_CANDIDATES_PER_EVENT,
                  maxTextLen: env.MAX_TEXT_LEN,
                  piiRedaction: env.PII_REDACTION,
                  strategy: env.TOPIC_CLUSTER_STRATEGY,
                });
                if (clusterRes.processed_events > 0) {
                  writeRes.topic_cluster = clusterRes;
                }
              }
            }

            return writeRes;
          });

      const warnings: Array<{ code: string; message: string; details?: Record<string, unknown> }> = [];
      if (forcedLiteTopicClusterAsync) {
        warnings.push({
          code: "lite_topic_cluster_forced_async",
          message: "lite edition forces topic clustering to async mode during memory write",
          details: {
            scope: out.scope ?? prepared.scope_public ?? env.MEMORY_SCOPE,
            tenant_id: out.tenant_id ?? prepared.tenant_id ?? env.MEMORY_TENANT_ID,
            requested_async: false,
            applied_async: true,
          },
        });
      }
      if ((out.nodes?.length ?? 0) === 0) {
        warnings.push({
          code: "write_no_nodes",
          message: "write committed with 0 nodes; no new recallable memory was added by this request",
          details: {
            scope: out.scope ?? prepared.scope_public ?? env.MEMORY_SCOPE,
            tenant_id: out.tenant_id ?? prepared.tenant_id ?? env.MEMORY_TENANT_ID,
            edge_count: out.edges?.length ?? 0,
          },
        });
      }

      const response = warnings.length > 0 ? { ...out, warnings } : out;
      if (embeddedRuntime) {
        await embeddedRuntime.applyWrite(prepared as any, out as any);
      }

      const ms = performance.now() - t0;
      req.log.info(
        {
          write: {
            scope: out.scope ?? prepared.scope_public ?? env.MEMORY_SCOPE,
            tenant_id: out.tenant_id ?? prepared.tenant_id ?? env.MEMORY_TENANT_ID,
            commit_id: out.commit_id,
            nodes: out.nodes?.length ?? 0,
            edges: out.edges?.length ?? 0,
            embedding_backfill_enqueued: !!out.embedding_backfill?.enqueued,
            embedding_pending_nodes: out.embedding_backfill?.pending_nodes ?? 0,
            topic_cluster_enqueued: (out as any).topic_cluster?.enqueued === true,
            distillation_enabled: (out as any).distillation?.enabled === true,
            distillation_sources: (out as any).distillation?.sources_considered ?? 0,
            distilled_evidence_nodes: (out as any).distillation?.generated_evidence_nodes ?? 0,
            distilled_fact_nodes: (out as any).distillation?.generated_fact_nodes ?? 0,
            warnings: warnings.map((w) => w.code),
            ms,
          },
        },
        "memory write",
      );
      return reply.code(200).send(response);
    } finally {
      gate.release();
    }
  });
}
