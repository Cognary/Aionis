import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import type { Env } from "../config.js";
import { createEmbeddingSurfacePolicy, type EmbeddingSurfacePolicy } from "../embeddings/surface-policy.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import type { InMemoryExecutionStateStore } from "../execution/state-store.js";
import { ExecutionStateV1Schema } from "../execution/types.js";
import { ExecutionStateTransitionV1Schema } from "../execution/transitions.js";
import { buildHandoffWriteBody, recoverHandoff } from "../memory/handoff.js";
import type { HandoffRecoverInput, HandoffStoreInput } from "../memory/schemas.js";
import { applyMemoryWrite, prepareMemoryWrite } from "../memory/write.js";
import { HandoffRecoverRequest, HandoffStoreRequest } from "../memory/schemas.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import type { WriteStoreAccess } from "../store/write-access.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";
import { commitLitePreparedWriteWithProjection, type LiteProjectedWriteStore } from "./lite-projected-write.js";

type LiteWriteStoreLike = NonNullable<NonNullable<Parameters<typeof recoverHandoff>[0]>["liteWriteStore"]> & WriteStoreAccess & {
  withTx: <T>(fn: () => Promise<T>) => Promise<T>;
} & LiteProjectedWriteStore;

type HandoffRouteKind = "handoff_store" | "handoff_recover";

type HandoffRequest = FastifyRequest<{ Body: unknown }>;

type HandoffNodeLike = {
  id: string;
  uri?: string | null;
  type: string;
  client_id?: string | null;
  slots?: Record<string, unknown> | null;
};

type HandoffWriteBodyNodeLike = {
  slots?: Record<string, unknown> | null;
};

type PreparedHandoffWrite = Awaited<ReturnType<typeof prepareMemoryWrite>>;
type HandoffWriteResult = Awaited<ReturnType<typeof applyMemoryWrite>>;

type RegisterHandoffRoutesArgs = {
  app: FastifyInstance;
  env: Env;
  embedder: EmbeddingProvider | null;
  embeddingSurfacePolicy?: EmbeddingSurfacePolicy;
  embeddedRuntime: EmbeddedMemoryRuntime | null;
  liteWriteStore: LiteWriteStoreLike;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (
    req: FastifyRequest,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: HandoffRouteKind,
  ) => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: "write" | "recall") => Promise<void>;
  enforceTenantQuota: (req: FastifyRequest, reply: FastifyReply, kind: "write" | "recall", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "write" | "recall") => Promise<InflightGateToken>;
  executionStateStore?: InMemoryExecutionStateStore | null;
};

function firstNode<T>(value: unknown): T | null {
  return Array.isArray(value) ? ((value[0] as T | undefined) ?? null) : null;
}

function asSlots(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readSlot(slots: Record<string, unknown> | null, key: string) {
  return slots && key in slots ? slots[key] : undefined;
}

export function registerHandoffRoutes(args: RegisterHandoffRoutesArgs) {
  const {
    app,
    env,
    embedder,
    embeddingSurfacePolicy: embeddingSurfacePolicyArg,
    embeddedRuntime,
    liteWriteStore,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    executionStateStore,
  } = args;
  if (env.AIONIS_EDITION !== "lite") {
    throw new Error("aionis-lite handoff routes only support AIONIS_EDITION=lite");
  }
  const embeddingSurfacePolicy =
    embeddingSurfacePolicyArg ?? createEmbeddingSurfacePolicy({ providerConfigured: !!embedder });
  const writeEmbedder = embeddingSurfacePolicy.providerFor("write_auto_embed", embedder);
  const buildPrincipalHandoffWriteBody = (body: HandoffStoreInput, principal: AuthPrincipal | null) => {
    const actorId = typeof body.actor === "string" && body.actor.trim().length > 0 ? body.actor.trim() : null;
    return buildHandoffWriteBody({
      ...body,
      ...(principal?.agent_id ? { producer_agent_id: principal.agent_id } : actorId ? { producer_agent_id: actorId } : {}),
      ...(principal?.agent_id ? { owner_agent_id: principal.agent_id } : actorId ? { owner_agent_id: actorId } : {}),
      ...(!principal?.agent_id && principal?.team_id ? { owner_team_id: principal.team_id } : {}),
    });
  };
  const runCommittedHandoffWrite = async (prepared: PreparedHandoffWrite): Promise<HandoffWriteResult> =>
    (
      await commitLitePreparedWriteWithProjection({
      prepared: prepared as any,
      liteWriteStore,
      embedder: writeEmbedder,
      writeOptions: {
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        associativeLinkOrigin: "handoff_store",
      },
      })
    ).out;
  const applyHandoffExecutionTransitions = (args: {
    writeSlots: Record<string, unknown> | null;
  }) => {
    if (!executionStateStore || !args.writeSlots || readSlot(args.writeSlots, "execution_state_v1") === undefined) {
      return undefined;
    }
    const executionState = ExecutionStateV1Schema.parse(readSlot(args.writeSlots, "execution_state_v1"));
    let storedState = executionStateStore.put(executionState);
    const rawTransitions = readSlot(args.writeSlots, "execution_transitions_v1");
    if (!Array.isArray(rawTransitions)) return undefined;
    const appliedTransitions: Array<Record<string, unknown>> = [];
    for (const rawTransition of rawTransitions) {
      const parsed = ExecutionStateTransitionV1Schema.parse(rawTransition);
      const transition = {
        ...parsed,
        expected_revision: storedState.revision,
      };
      storedState = executionStateStore.applyTransition(transition);
      appliedTransitions.push(transition as Record<string, unknown>);
    }
    return appliedTransitions;
  };
  const buildHandoffStoreResponse = (args: {
    body: HandoffStoreInput;
    writeBody: ReturnType<typeof buildHandoffWriteBody>;
    out: HandoffWriteResult;
    appliedExecutionTransitions: Array<Record<string, unknown>> | undefined;
  }) => {
    const handoffNode = firstNode<HandoffNodeLike>(args.out.nodes);
    const handoffSlots = asSlots(handoffNode?.slots);
    const writeNode = firstNode<HandoffWriteBodyNodeLike>(args.writeBody.nodes);
    const writeSlots = asSlots(writeNode?.slots);
    const continuitySlots = handoffSlots ?? writeSlots;
    return {
      tenant_id: args.out.tenant_id,
      scope: args.out.scope,
      commit_id: args.out.commit_id,
      commit_uri: args.out.commit_uri,
      handoff: handoffNode
        ? {
            id: handoffNode.id,
            uri: handoffNode.uri ?? null,
            type: handoffNode.type,
            client_id: handoffNode.client_id ?? null,
            handoff_kind: args.body.handoff_kind,
            anchor: args.body.anchor,
            file_path: args.body.file_path ?? null,
            repo_root: args.body.repo_root ?? null,
            symbol: args.body.symbol ?? null,
            summary: args.body.summary,
            handoff_text: args.body.handoff_text,
            risk: args.body.risk ?? null,
            acceptance_checks: args.body.acceptance_checks ?? [],
            tags: args.body.tags ?? [],
            target_files: args.body.target_files ?? [],
            next_action: args.body.next_action ?? args.body.handoff_text,
            must_change: args.body.must_change ?? [],
            must_remove: args.body.must_remove ?? [],
            must_keep: args.body.must_keep ?? [],
            memory_lane: args.body.memory_lane,
          }
        : null,
      execution_result_summary: readSlot(continuitySlots, "execution_result_summary"),
      execution_artifacts: readSlot(continuitySlots, "execution_artifacts"),
      execution_evidence: readSlot(continuitySlots, "execution_evidence"),
      execution_state_v1: readSlot(continuitySlots, "execution_state_v1"),
      execution_packet_v1: readSlot(continuitySlots, "execution_packet_v1"),
      control_profile_v1: readSlot(continuitySlots, "control_profile_v1"),
      execution_transitions_v1:
        args.appliedExecutionTransitions ?? readSlot(continuitySlots, "execution_transitions_v1"),
    };
  };
  const runHandoffRecoverForPrincipal = (body: HandoffRecoverInput, principal: AuthPrincipal | null) =>
    recoverHandoff({
      liteWriteStore,
      executionStateStore,
      input: body,
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
      consumerAgentId: principal?.agent_id ?? null,
      consumerTeamId: principal?.team_id ?? null,
    });

  const runHandoffRoute = async <TBody, TResult>(args: {
    req: HandoffRequest;
    reply: FastifyReply;
    requestKind: HandoffRouteKind;
    inflightKind: "write" | "recall";
    parseBody: (input: unknown) => TBody;
    execute: (body: TBody, principal: AuthPrincipal | null) => Promise<TResult>;
  }): Promise<TResult> => {
    const { req, reply, requestKind, inflightKind, parseBody, execute } = args;
    const principal = await requireMemoryPrincipal(req);
    const body = parseBody(withIdentityFromRequest(req, req.body, principal, requestKind));
    await enforceRateLimit(req, reply, inflightKind);
    await enforceTenantQuota(req, reply, inflightKind, tenantFromBody(body));
    const gate = await acquireInflightSlot(inflightKind);
    try {
      return await execute(body, principal);
    } finally {
      gate.release();
    }
  };

  app.post("/v1/handoff/store", async (req: HandoffRequest, reply: FastifyReply) => {
    const out = await runHandoffRoute<HandoffStoreInput, unknown>({
      req,
      reply,
      requestKind: "handoff_store",
      inflightKind: "write",
      parseBody: (input) => HandoffStoreRequest.parse(input),
      execute: async (body, principal) => {
      const writeBody = buildPrincipalHandoffWriteBody(body, principal);
      const prepared = await prepareMemoryWrite(
        writeBody,
        env.MEMORY_SCOPE,
        env.MEMORY_TENANT_ID,
        {
          maxTextLen: env.MAX_TEXT_LEN,
          piiRedaction: env.PII_REDACTION,
          allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        },
        writeEmbedder,
      );
      const out = await runCommittedHandoffWrite(prepared);

      if (embeddedRuntime) {
        await embeddedRuntime.applyWrite(prepared, out);
      }
      const writeNode = firstNode<HandoffWriteBodyNodeLike>(writeBody.nodes);
      const writeSlots = asSlots(writeNode?.slots);
      const appliedExecutionTransitions = applyHandoffExecutionTransitions({ writeSlots });
      return buildHandoffStoreResponse({
        body,
        writeBody,
        out,
        appliedExecutionTransitions,
      });
      },
    });
    return reply.code(200).send(out);
  });

  app.post("/v1/handoff/recover", async (req: HandoffRequest, reply: FastifyReply) => {
    const out = await runHandoffRoute<HandoffRecoverInput, unknown>({
      req,
      reply,
      requestKind: "handoff_recover",
      inflightKind: "recall",
      parseBody: (input) => HandoffRecoverRequest.parse(input),
      execute: (body, principal) => runHandoffRecoverForPrincipal(body, principal),
    });
    return reply.code(200).send(out);
  });
}
