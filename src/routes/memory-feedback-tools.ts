import type { Env } from "../config.js";
import { ruleFeedback } from "../memory/feedback.js";
import { updateRuleState } from "../memory/rules.js";
import { evaluateRules } from "../memory/rules-evaluate.js";
import { selectTools } from "../memory/tools-select.js";
import { getToolsDecisionById } from "../memory/tools-decision.js";
import { getToolsRunLifecycle } from "../memory/tools-run.js";
import { toolSelectionFeedback } from "../memory/tools-feedback.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type GateLike = {
  release: () => void;
};

export function registerMemoryFeedbackToolRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  embeddedRuntime: any;
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
    embeddedRuntime,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  } = args;

  app.post("/v1/memory/feedback", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "feedback");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const out = await store.withTx((client) =>
      ruleFeedback(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        embeddedRuntime,
      }),
    );
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/rules/state", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "rules_state");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const out = await store.withTx((client) =>
      updateRuleState(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
        embeddedRuntime,
      }),
    );
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/rules/evaluate", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "rules_evaluate");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) =>
        evaluateRules(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, { embeddedRuntime }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/tools/select", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "tools_select");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) =>
        selectTools(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, { embeddedRuntime }),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/tools/decision", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "tools_decision");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) =>
        getToolsDecisionById(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/tools/run", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "tools_run");
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantFromBody(body));
    const gate = await acquireInflightSlot("recall");
    let out: any;
    try {
      out = await store.withClient((client) =>
        getToolsRunLifecycle(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID),
      );
    } finally {
      gate.release();
    }
    return reply.code(200).send(out);
  });

  app.post("/v1/memory/tools/feedback", async (req: any, reply: any) => {
    const principal = await requireMemoryPrincipal(req);
    const body = withIdentityFromRequest(req, req.body, principal, "tools_feedback");
    await enforceRateLimit(req, reply, "write");
    await enforceTenantQuota(req, reply, "write", tenantFromBody(body));
    const out = await store.withTx((client) =>
      toolSelectionFeedback(client, body, env.MEMORY_SCOPE, env.MEMORY_TENANT_ID, {
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        embeddedRuntime,
      }),
    );
    return reply.code(200).send(out);
  });
}
