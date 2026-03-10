import { ReplayPlaybookRunRequest } from "../memory/schemas.js";
import { replayPlaybookRepairReview, replayPlaybookRun } from "../memory/replay.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type GateLike = {
  release: () => void;
  wait_ms?: number;
};

export function registerMemoryReplayGovernedRoutes(args: {
  app: any;
  store: StoreLike;
  requireMemoryPrincipal: (req: any) => Promise<any>;
  withIdentityFromRequest: (req: any, body: unknown, principal: any, kind: any) => any;
  enforceRateLimit: (req: any, reply: any, kind: "write" | "recall") => Promise<void>;
  enforceTenantQuota: (req: any, reply: any, kind: "write" | "recall", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "write" | "recall") => Promise<GateLike>;
  withReplayRepairReviewDefaults: (body: unknown) => { body: Record<string, unknown>; resolution: any };
  buildReplayRepairReviewOptions: () => any;
  buildReplayPlaybookRunOptions: (reply: any, source: string) => any;
}) {
  const {
    app,
    store,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions,
    buildReplayPlaybookRunOptions,
  } = args;

  app.post("/v1/memory/replay/playbooks/repair/review", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const bodyRaw = withIdentityFromRequest(req, req.body, principal, "replay_playbook_repair_review");
    const defaulted = withReplayRepairReviewDefaults(bodyRaw);
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
    let out: any;
    try {
      out = await store.withTx((client) =>
        replayPlaybookRepairReview(client, body, buildReplayRepairReviewOptions()),
      );
    } finally {
      gate.release();
    }
    if (out && typeof out === "object" && !Array.isArray(out)) {
      out.auto_promote_policy_resolution = defaulted.resolution;
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/replay/playbooks/run", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "replay_playbook_run");
    const parsedForMode = ReplayPlaybookRunRequest.safeParse(body);
    const replayMode = parsedForMode.success ? parsedForMode.data.mode : "simulate";
    const rateKind = replayMode === "simulate" ? "recall" : "write";
    await enforceRateLimit(req, reply, rateKind);
    await enforceTenantQuota(req, reply, rateKind, tenantFromBody(body));
    const gate = await acquireInflightSlot(rateKind);
    let out: any;
    try {
      out = await store.withClient((client) =>
        replayPlaybookRun(client, body, buildReplayPlaybookRunOptions(reply, "replay_playbook_run")),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });
}
