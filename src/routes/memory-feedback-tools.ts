import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import type { Env } from "../config.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { ruleFeedback } from "../memory/feedback.js";
import { updateRuleState } from "../memory/rules.js";
import { evaluateRules } from "../memory/rules-evaluate.js";
import { rehydrateAnchorPayloadLite } from "../memory/rehydrate-anchor.js";
import { selectTools } from "../memory/tools-select.js";
import { getToolsDecisionById } from "../memory/tools-decision.js";
import { getToolsRunLifecycle, listToolsRuns } from "../memory/tools-run.js";
import { toolSelectionFeedback } from "../memory/tools-feedback.js";
import { suppressPatternAnchorLite, unsuppressPatternAnchorLite } from "../memory/pattern-operator-override.js";
import {
  buildLiteGovernanceRuntimeProviders,
  type LiteGovernanceRuntimeProviderBuilderOptions,
} from "../app/governance-runtime-providers.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import type { RecallStoreAccess } from "../store/recall-access.js";
import type { LiteWriteStore } from "../store/lite-write-store.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";

type MemoryFeedbackToolKind =
  | "feedback"
  | "rules_state"
  | "rules_evaluate"
  | "tools_select"
  | "tools_decision"
  | "tools_run"
  | "tools_feedback"
  | "patterns_suppress"
  | "patterns_unsuppress"
  | "rehydrate_payload";
type MemoryFeedbackInflightKind = "write" | "recall";

type MemoryFeedbackToolRequest = FastifyRequest<{ Body: unknown }>;

type LiteFeedbackStoreLike =
  NonNullable<NonNullable<Parameters<typeof updateRuleState>[4]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof evaluateRules>[4]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof selectTools>[4]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof getToolsDecisionById>[4]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof getToolsRunLifecycle>[4]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof listToolsRuns>[4]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof toolSelectionFeedback>[4]>["liteWriteStore"]>
  & Pick<LiteWriteStore, "findNodes" | "updateNodeAnchorState">
  & Parameters<typeof rehydrateAnchorPayloadLite>[0]
  & {
    withTx: <T>(fn: () => Promise<T>) => Promise<T>;
  };

type RegisterMemoryFeedbackToolRoutesArgs = {
  app: FastifyInstance;
  env: Env;
  embedder: EmbeddingProvider | null;
  embeddedRuntime: EmbeddedMemoryRuntime | null;
  liteRecallAccess: RecallStoreAccess;
  liteWriteStore: LiteFeedbackStoreLike;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (
    req: FastifyRequest,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: MemoryFeedbackToolKind,
  ) => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: "write" | "recall") => Promise<void>;
  enforceTenantQuota: (req: FastifyRequest, reply: FastifyReply, kind: "write" | "recall", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "write" | "recall") => Promise<InflightGateToken>;
  governanceRuntimeProviderBuilderOptions?: LiteGovernanceRuntimeProviderBuilderOptions;
};

export function registerMemoryFeedbackToolRoutes(args: RegisterMemoryFeedbackToolRoutesArgs) {
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
    throw new Error("aionis-lite memory-feedback-tools routes only support AIONIS_EDITION=lite");
  }
  const governanceProviders = buildLiteGovernanceRuntimeProviders(
    env,
    args.governanceRuntimeProviderBuilderOptions,
  );

  const runFeedbackRoute = async <TResult>(args: {
    req: MemoryFeedbackToolRequest;
    reply: FastifyReply;
    requestKind: MemoryFeedbackToolKind;
    inflightKind: MemoryFeedbackInflightKind;
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
  const executeFeedbackWriteOperation = <TResult>(args: {
    executeLite: (liteStore: LiteFeedbackStoreLike) => Promise<TResult>;
  }) =>
    args.executeLite(liteWriteStore);
  const executeFeedbackReadOperation = <TResult>(args: {
    executeLite: (liteStore: LiteFeedbackStoreLike) => Promise<TResult>;
  }) =>
    args.executeLite(liteWriteStore);
  const registerFeedbackPostRoute = <TResult>(args: {
    path: string;
    requestKind: MemoryFeedbackToolKind;
    inflightKind: MemoryFeedbackInflightKind;
    withGate?: boolean;
    execute: (body: unknown) => Promise<TResult>;
  }) => {
    app.post(args.path, async (req: MemoryFeedbackToolRequest, reply: FastifyReply) => {
      const out = await runFeedbackRoute({
        req,
        reply,
        requestKind: args.requestKind,
        inflightKind: args.inflightKind,
        withGate: args.withGate,
        execute: args.execute,
      });
      return reply.code(200).send(out);
    });
  };

  registerFeedbackPostRoute({
    path: "/v1/memory/feedback",
    requestKind: "feedback",
    inflightKind: "write",
    withGate: false,
    execute: (body) =>
      liteWriteStore.withTx(() =>
        ruleFeedback({} as pg.PoolClient, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
          maxTextLen: env.MAX_TEXT_LEN,
          piiRedaction: env.PII_REDACTION,
          embeddedRuntime,
          liteWriteStore,
        }),
      ),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/rules/state",
    requestKind: "rules_state",
    inflightKind: "write",
    withGate: false,
    execute: (body) =>
      executeFeedbackWriteOperation({
        executeLite: (liteStore) =>
          liteStore.withTx(() =>
            updateRuleState({} as pg.PoolClient, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
              embeddedRuntime,
              liteWriteStore: liteStore,
            }),
          ),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/rules/evaluate",
    requestKind: "rules_evaluate",
    inflightKind: "recall",
    execute: (body) =>
      executeFeedbackReadOperation({
        executeLite: (liteStore) =>
          evaluateRules({} as pg.PoolClient, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
            embeddedRuntime,
            liteWriteStore: liteStore,
          }),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/tools/select",
    requestKind: "tools_select",
    inflightKind: "recall",
    execute: (body) =>
      executeFeedbackReadOperation({
        executeLite: (liteStore) =>
          selectTools(null, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
            embeddedRuntime,
            recallAccess: liteRecallAccess,
            embedder,
            liteWriteStore: liteStore,
          }),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/tools/decision",
    requestKind: "tools_decision",
    inflightKind: "recall",
    execute: (body) =>
      executeFeedbackReadOperation({
        executeLite: (liteStore) =>
          getToolsDecisionById(null, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
            liteWriteStore: liteStore,
          }),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/tools/run",
    requestKind: "tools_run",
    inflightKind: "recall",
    execute: (body) =>
      executeFeedbackReadOperation({
        executeLite: (liteStore) =>
          getToolsRunLifecycle(null, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
            liteWriteStore: liteStore,
          }),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/tools/runs/list",
    requestKind: "tools_run",
    inflightKind: "recall",
    execute: (body) =>
      executeFeedbackReadOperation({
        executeLite: (liteStore) =>
          listToolsRuns(null, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
            liteWriteStore: liteStore,
          }),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/tools/feedback",
    requestKind: "tools_feedback",
    inflightKind: "write",
    withGate: false,
    execute: (body) =>
      executeFeedbackWriteOperation({
        executeLite: (liteStore) =>
          liteStore.withTx(() =>
            toolSelectionFeedback(null, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
              maxTextLen: env.MAX_TEXT_LEN,
              piiRedaction: env.PII_REDACTION,
              embedder,
              embeddedRuntime,
              governanceReviewProviders: governanceProviders.toolsFeedback,
              liteWriteStore: liteStore,
            }),
          ),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/patterns/suppress",
    requestKind: "patterns_suppress",
    inflightKind: "write",
    withGate: false,
    execute: (body) =>
      executeFeedbackWriteOperation({
        executeLite: (liteStore) =>
          liteStore.withTx(() =>
            suppressPatternAnchorLite({
              body,
              defaultScope: env.MEMORY_SCOPE,
              defaultTenantId: env.MEMORY_TENANT_ID,
              liteWriteStore: liteStore,
            }),
          ),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/patterns/unsuppress",
    requestKind: "patterns_unsuppress",
    inflightKind: "write",
    withGate: false,
    execute: (body) =>
      executeFeedbackWriteOperation({
        executeLite: (liteStore) =>
          liteStore.withTx(() =>
            unsuppressPatternAnchorLite({
              body,
              defaultScope: env.MEMORY_SCOPE,
              defaultTenantId: env.MEMORY_TENANT_ID,
              liteWriteStore: liteStore,
            }),
          ),
      }),
  });
  registerFeedbackPostRoute({
    path: "/v1/memory/tools/rehydrate_payload",
    requestKind: "rehydrate_payload",
    inflightKind: "recall",
    execute: (body) =>
      executeFeedbackReadOperation({
        executeLite: (liteStore) =>
          rehydrateAnchorPayloadLite(liteStore, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, env.LITE_LOCAL_ACTOR_ID),
      }),
  });
}
