import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { suppressPatternAnchorLite, unsuppressPatternAnchorLite } from "../memory/pattern-operator-override.js";
import { rehydrateAnchorPayloadLite } from "../memory/rehydrate-anchor.js";
import { selectTools } from "../memory/tools-select.js";
import { toolSelectionFeedback } from "../memory/tools-feedback.js";
import {
  buildLiteGovernanceRuntimeProviders,
  type LiteGovernanceRuntimeProviderBuilderOptions,
} from "../app/governance-runtime-providers.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import type { RecallStoreAccess } from "../store/recall-access.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";

type SdkDemoMemoryFeedbackToolKind =
  | "tools_select"
  | "tools_feedback"
  | "patterns_suppress"
  | "patterns_unsuppress"
  | "rehydrate_payload";
type SdkDemoMemoryFeedbackInflightKind = "write" | "recall";
type SdkDemoMemoryFeedbackRequest = FastifyRequest<{ Body: unknown }>;

type SdkDemoLiteFeedbackStoreLike =
  NonNullable<NonNullable<Parameters<typeof selectTools>[4]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof toolSelectionFeedback>[4]>["liteWriteStore"]>
  & Pick<Parameters<typeof suppressPatternAnchorLite>[0]["liteWriteStore"], "findNodes" | "updateNodeAnchorState">
  & Parameters<typeof rehydrateAnchorPayloadLite>[0]
  & {
    withTx: <T>(fn: () => Promise<T>) => Promise<T>;
  };

export function registerSdkDemoMemoryFeedbackToolRoutes(args: {
  app: FastifyInstance;
  env: Env;
  embedder: EmbeddingProvider | null;
  embeddedRuntime: EmbeddedMemoryRuntime | null;
  liteRecallAccess: RecallStoreAccess;
  liteWriteStore: SdkDemoLiteFeedbackStoreLike;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (
    req: FastifyRequest,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: SdkDemoMemoryFeedbackToolKind,
  ) => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: SdkDemoMemoryFeedbackInflightKind) => Promise<void>;
  enforceTenantQuota: (
    req: FastifyRequest,
    reply: FastifyReply,
    kind: SdkDemoMemoryFeedbackInflightKind,
    tenantId: string,
  ) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: SdkDemoMemoryFeedbackInflightKind) => Promise<InflightGateToken>;
  governanceRuntimeProviderBuilderOptions?: LiteGovernanceRuntimeProviderBuilderOptions;
}) {
  const {
    app,
    env,
    embedder,
    embeddedRuntime,
    liteRecallAccess,
    liteWriteStore,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  } = args;

  if (env.AIONIS_EDITION !== "lite") {
    throw new Error("aionis-lite sdk-demo memory-feedback routes only support AIONIS_EDITION=lite");
  }

  const governanceProviders = buildLiteGovernanceRuntimeProviders(
    env,
    args.governanceRuntimeProviderBuilderOptions,
  );

  const runSdkDemoFeedbackRoute = async <TResult>(args: {
    req: SdkDemoMemoryFeedbackRequest;
    reply: FastifyReply;
    requestKind: SdkDemoMemoryFeedbackToolKind;
    inflightKind: SdkDemoMemoryFeedbackInflightKind;
    withGate?: boolean;
    execute: (body: unknown) => Promise<TResult>;
  }): Promise<TResult> => {
    const { req, reply, requestKind, inflightKind, withGate = true, execute } = args;
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, requestKind);
    await enforceRateLimit(req, reply, inflightKind);
    await enforceTenantQuota(req, reply, inflightKind, tenantFromBody(body));
    if (!withGate) {
      return await execute(body);
    }
    const gate = await acquireInflightSlot(inflightKind);
    try {
      return await execute(body);
    } finally {
      gate.release();
    }
  };

  app.post("/v1/memory/tools/select", async (req: SdkDemoMemoryFeedbackRequest, reply: FastifyReply) => {
    const out = await runSdkDemoFeedbackRoute({
      req,
      reply,
      requestKind: "tools_select",
      inflightKind: "recall",
      execute: (body) =>
        selectTools(null, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
          embeddedRuntime,
          recallAccess: liteRecallAccess,
          embedder,
          liteWriteStore,
        }),
    });
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/tools/feedback", async (req: SdkDemoMemoryFeedbackRequest, reply: FastifyReply) => {
    const out = await runSdkDemoFeedbackRoute({
      req,
      reply,
      requestKind: "tools_feedback",
      inflightKind: "write",
      withGate: false,
      execute: (body) =>
        liteWriteStore.withTx(() =>
          toolSelectionFeedback(null, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
            maxTextLen: env.MAX_TEXT_LEN,
            piiRedaction: env.PII_REDACTION,
            embedder,
            embeddedRuntime,
            governanceReviewProviders: governanceProviders.toolsFeedback,
            liteWriteStore,
          }),
        ),
    });
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/patterns/suppress", async (req: SdkDemoMemoryFeedbackRequest, reply: FastifyReply) => {
    const out = await runSdkDemoFeedbackRoute({
      req,
      reply,
      requestKind: "patterns_suppress",
      inflightKind: "write",
      withGate: false,
      execute: (body) =>
        liteWriteStore.withTx(() =>
          suppressPatternAnchorLite({
            body,
            defaultScope: env.MEMORY_SCOPE,
            defaultTenantId: env.MEMORY_TENANT_ID,
            liteWriteStore,
          }),
        ),
    });
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/patterns/unsuppress", async (req: SdkDemoMemoryFeedbackRequest, reply: FastifyReply) => {
    const out = await runSdkDemoFeedbackRoute({
      req,
      reply,
      requestKind: "patterns_unsuppress",
      inflightKind: "write",
      withGate: false,
      execute: (body) =>
        liteWriteStore.withTx(() =>
          unsuppressPatternAnchorLite({
            body,
            defaultScope: env.MEMORY_SCOPE,
            defaultTenantId: env.MEMORY_TENANT_ID,
            liteWriteStore,
          }),
        ),
    });
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/tools/rehydrate_payload", async (req: SdkDemoMemoryFeedbackRequest, reply: FastifyReply) => {
    const out = await runSdkDemoFeedbackRoute({
      req,
      reply,
      requestKind: "rehydrate_payload",
      inflightKind: "recall",
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
