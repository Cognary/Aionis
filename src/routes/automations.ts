import type { Env } from "../config.js";
import {
  automationAssignReviewer,
  automationCompensationPolicyMatrix,
  automationCreate,
  automationGet,
  automationList,
  automationPromote,
  automationRun,
  automationRunApproveRepair,
  automationRunAssignReviewer,
  automationRunCancel,
  automationRunCompensationAssign,
  automationRunCompensationRecordAction,
  automationRunCompensationRetry,
  automationRunGet,
  automationRunList,
  automationRunRejectRepair,
  automationRunResume,
  automationShadowReport,
  automationShadowReview,
  automationShadowValidate,
  automationShadowValidateDispatch,
  automationTelemetry,
  automationValidate,
} from "../memory/automation.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type GateLike = {
  release: () => void;
};

export function registerAutomationRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  requireMemoryPrincipal: (req: any) => Promise<any>;
  withIdentityFromRequest: (req: any, body: unknown, principal: any, kind: any) => any;
  enforceRateLimit: (req: any, reply: any, kind: "write" | "recall") => Promise<void>;
  enforceTenantQuota: (req: any, reply: any, kind: "write" | "recall", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "write" | "recall") => Promise<GateLike>;
  buildAutomationReplayRunOptions: (reply: any, source: string) => any;
  buildAutomationTestHook: () => any;
}) {
  const {
    app,
    env,
    store,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    buildAutomationReplayRunOptions,
    buildAutomationTestHook,
  } = args;

  const defaults = {
    defaultScope: env.MEMORY_SCOPE,
    defaultTenantId: env.MEMORY_TENANT_ID,
  };

  app.post("/v1/automations/create", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_create");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withTx((client) => automationCreate(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/get", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_get");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationGet(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/list", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_get");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationList(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/telemetry", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_get");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationTelemetry(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/compensation/policy_matrix", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_get");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationCompensationPolicyMatrix(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/shadow/report", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_get");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationShadowReport(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/shadow/review", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_promote");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withTx((client) => automationShadowReview(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/shadow/validate", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) =>
        automationShadowValidate(client, body, {
          ...defaults,
          replayRunOptions: buildAutomationReplayRunOptions(reply, "automation_shadow_validate"),
          testHook: buildAutomationTestHook(),
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/shadow/validate/dispatch", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) =>
        automationShadowValidateDispatch(client, body, {
          ...defaults,
          replayRunOptions: buildAutomationReplayRunOptions(reply, "automation_shadow_validate_dispatch"),
          testHook: buildAutomationTestHook(),
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/assign_reviewer", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_promote");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withTx((client) => automationAssignReviewer(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/promote", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_promote");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withTx((client) => automationPromote(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/validate", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_validate");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationValidate(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/graph/validate", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_validate");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationValidate(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/run", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) =>
        automationRun(client, body, {
          ...defaults,
          replayRunOptions: buildAutomationReplayRunOptions(reply, "automation_run"),
          testHook: buildAutomationTestHook(),
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/get", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_get");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationRunGet(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/list", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_get");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) => automationRunList(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/assign_reviewer", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_get");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) => automationRunAssignReviewer(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/cancel", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_cancel");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) =>
        automationRunCancel(client, body, {
          ...defaults,
          replayRunOptions: buildAutomationReplayRunOptions(reply, "automation_run_cancel"),
          testHook: buildAutomationTestHook(),
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/resume", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_resume");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) =>
        automationRunResume(client, body, {
          ...defaults,
          replayRunOptions: buildAutomationReplayRunOptions(reply, "automation_run_resume"),
          testHook: buildAutomationTestHook(),
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/reject_repair", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_reject_repair");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) =>
        automationRunRejectRepair(client, body, {
          ...defaults,
          replayRunOptions: buildAutomationReplayRunOptions(reply, "automation_run_reject_repair"),
          testHook: buildAutomationTestHook(),
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/approve_repair", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_approve_repair");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) =>
        automationRunApproveRepair(client, body, {
          ...defaults,
          replayRunOptions: buildAutomationReplayRunOptions(reply, "automation_run_approve_repair"),
          testHook: buildAutomationTestHook(),
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/compensation/retry", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_compensation_retry");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withClient((client) =>
        automationRunCompensationRetry(client, body, {
          ...defaults,
          replayRunOptions: buildAutomationReplayRunOptions(reply, "automation_run_compensation_retry"),
          testHook: buildAutomationTestHook(),
        }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/compensation/record_action", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_compensation_record_action");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withTx((client) => automationRunCompensationRecordAction(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/automations/runs/compensation/assign", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "automation_run_compensation_record_action");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const gate = await acquireInflightSlot("write");
    let out: any;
    try {
      out = await store.withTx((client) => automationRunCompensationAssign(client, body, defaults));
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });
}
