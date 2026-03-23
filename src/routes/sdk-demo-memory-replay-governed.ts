import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { replayPlaybookRepairReview } from "../memory/replay.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";

type SdkDemoReplayGovernedRequest = FastifyRequest<{ Body: unknown }>;
type ReplayPlaybookReviewOptionsLike = Parameters<typeof replayPlaybookRepairReview>[2];
type SdkDemoReplayGovernedRequestKind = "replay_playbook_repair_review";
type SdkDemoReplayGovernedRateKind = "write";
type LiteWriteStoreLike = NonNullable<ReplayPlaybookReviewOptionsLike["writeAccess"]> & {
  withTx: <T>(fn: () => Promise<T>) => Promise<T>;
};

export function registerSdkDemoMemoryReplayGovernedRoutes(args: {
  app: FastifyInstance;
  env: { AIONIS_EDITION?: string };
  liteWriteStore: LiteWriteStoreLike;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (
    req: FastifyRequest,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: SdkDemoReplayGovernedRequestKind,
  ) => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: SdkDemoReplayGovernedRateKind) => Promise<void>;
  enforceTenantQuota: (
    req: FastifyRequest,
    reply: FastifyReply,
    kind: SdkDemoReplayGovernedRateKind,
    tenantId: string,
  ) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: SdkDemoReplayGovernedRateKind) => Promise<InflightGateToken>;
  withReplayRepairReviewDefaults: (body: unknown) => { body: Record<string, unknown>; resolution: unknown };
  buildReplayRepairReviewOptions: () => ReplayPlaybookReviewOptionsLike;
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
    withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions,
  } = args;

  if (env?.AIONIS_EDITION !== "lite") {
    throw new Error("aionis-lite sdk-demo replay routes only support AIONIS_EDITION=lite");
  }

  app.post("/v1/memory/replay/playbooks/repair/review", async (req: SdkDemoReplayGovernedRequest, reply: FastifyReply) => {
    const principal = await requireMemoryPrincipal(req);
    const identifiedBody = withIdentityFromRequest(req, req.body, principal, "replay_playbook_repair_review");
    const defaulted = withReplayRepairReviewDefaults(identifiedBody);
    const body = defaulted.body;
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? { ...(body.metadata as Record<string, unknown>) }
        : {};
    body.metadata = {
      ...metadata,
      auto_promote_policy_resolution: defaulted.resolution,
    };

    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    try {
      const reviewOptions = buildReplayRepairReviewOptions();
      reviewOptions.writeAccess = liteWriteStore;
      const out = await liteWriteStore.withTx(() =>
        replayPlaybookRepairReview({} as pg.PoolClient, body, reviewOptions),
      );
      if (out && typeof out === "object" && !Array.isArray(out)) {
        (out as Record<string, unknown>).auto_promote_policy_resolution = defaulted.resolution;
      }
      return reply.code(200).send(out);
    } finally {
      gate.release();
    }
  });
}
