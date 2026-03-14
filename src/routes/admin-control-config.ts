import { z } from "zod";
import {
  deleteTenantQuotaProfile,
  getTenantQuotaProfile,
  listControlAuditEvents,
  upsertTenantQuotaProfile,
} from "../control-plane.js";
import type { Db } from "../db.js";
import {
  EMBEDDING_ALLOWED_SURFACES,
  EMBEDDING_FORBIDDEN_SURFACES,
  type EmbeddingSurfacePolicy,
} from "../embeddings/surface-policy.js";
import { normalizeSandboxBudgetScope } from "../app/sandbox-budget.js";
import { HttpError } from "../util/http.js";

const ControlTenantQuotaSchema = z.object({
  recall_rps: z.number().positive(),
  recall_burst: z.number().int().positive(),
  write_rps: z.number().positive(),
  write_burst: z.number().int().positive(),
  write_max_wait_ms: z.number().int().min(0),
  debug_embed_rps: z.number().positive(),
  debug_embed_burst: z.number().int().positive(),
  recall_text_embed_rps: z.number().positive(),
  recall_text_embed_burst: z.number().int().positive(),
  recall_text_embed_max_wait_ms: z.number().int().min(0),
});

const ControlSandboxBudgetUpsertSchema = z
  .object({
    scope: z.string().min(1).max(256).optional(),
    daily_run_cap: z.number().int().min(0).nullable().optional(),
    daily_timeout_cap: z.number().int().min(0).nullable().optional(),
    daily_failure_cap: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (v) => v.daily_run_cap !== undefined || v.daily_timeout_cap !== undefined || v.daily_failure_cap !== undefined,
    { message: "at least one cap field is required" },
  );

const ControlSandboxProjectBudgetUpsertSchema = z
  .object({
    scope: z.string().min(1).max(256).optional(),
    daily_run_cap: z.number().int().min(0).nullable().optional(),
    daily_timeout_cap: z.number().int().min(0).nullable().optional(),
    daily_failure_cap: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (v) => v.daily_run_cap !== undefined || v.daily_timeout_cap !== undefined || v.daily_failure_cap !== undefined,
    { message: "at least one cap field is required" },
  );

type TenantQuotaResolverLike = {
  invalidate: (tenantId?: string) => void;
};

export function registerAdminControlConfigRoutes(args: {
  app: any;
  db: Db;
  embeddingSurfacePolicy: EmbeddingSurfacePolicy;
  embeddingProviderName?: string | null;
  requireAdminToken: (req: any) => void;
  emitControlAudit: (
    req: any,
    input: {
      action: string;
      resource_type: string;
      resource_id?: string | null;
      tenant_id?: string | null;
      details?: Record<string, unknown>;
    },
  ) => Promise<void>;
  tenantQuotaResolver: TenantQuotaResolverLike;
  listSandboxBudgetProfiles: (args: { tenant_id?: string; limit?: number; offset?: number }) => Promise<Array<Record<string, unknown>>>;
  getSandboxBudgetProfile: (tenantId: string, scope: string) => Promise<Record<string, unknown> | null>;
  upsertSandboxBudgetProfile: (args: {
    tenant_id: string;
    scope: string;
    daily_run_cap?: number | null;
    daily_timeout_cap?: number | null;
    daily_failure_cap?: number | null;
  }) => Promise<Record<string, unknown>>;
  deleteSandboxBudgetProfile: (tenantId: string, scope: string) => Promise<boolean>;
  listSandboxProjectBudgetProfiles: (args: {
    tenant_id?: string;
    project_id?: string;
    limit?: number;
    offset?: number;
  }) => Promise<Array<Record<string, unknown>>>;
  getSandboxProjectBudgetProfile: (tenantId: string, projectId: string, scope: string) => Promise<Record<string, unknown> | null>;
  upsertSandboxProjectBudgetProfile: (args: {
    tenant_id: string;
    project_id: string;
    scope: string;
    daily_run_cap?: number | null;
    daily_timeout_cap?: number | null;
    daily_failure_cap?: number | null;
  }) => Promise<Record<string, unknown>>;
  deleteSandboxProjectBudgetProfile: (tenantId: string, projectId: string, scope: string) => Promise<boolean>;
}) {
  const {
    app,
    db,
    embeddingSurfacePolicy,
    embeddingProviderName,
    requireAdminToken,
    emitControlAudit,
    tenantQuotaResolver,
    listSandboxBudgetProfiles,
    getSandboxBudgetProfile,
    upsertSandboxBudgetProfile,
    deleteSandboxBudgetProfile,
    listSandboxProjectBudgetProfiles,
    getSandboxProjectBudgetProfile,
    upsertSandboxProjectBudgetProfile,
    deleteSandboxProjectBudgetProfile,
  } = args;

  app.get("/v1/admin/control/runtime-config", async (req: any, reply: any) => {
    requireAdminToken(req);
    return reply.code(200).send({
      ok: true,
      runtime_config: {
        embeddings: {
          provider: embeddingProviderName ?? null,
          provider_configured: embeddingSurfacePolicy.provider_configured,
          enabled_surfaces: [...embeddingSurfacePolicy.enabled_surfaces],
          allowed_surfaces: [...EMBEDDING_ALLOWED_SURFACES],
          forbidden_surfaces: [...EMBEDDING_FORBIDDEN_SURFACES],
        },
      },
    });
  });

  app.put("/v1/admin/control/tenant-quotas/:tenant_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const body = ControlTenantQuotaSchema.parse(req.body ?? {});
    const out = await upsertTenantQuotaProfile(db, tenantId, body);
    tenantQuotaResolver.invalidate(tenantId);
    await emitControlAudit(req, {
      action: "tenant_quota.upsert",
      resource_type: "tenant_quota",
      resource_id: tenantId,
      tenant_id: tenantId,
      details: body,
    });
    return reply.code(200).send({ ok: true, quota: out });
  });

  app.get("/v1/admin/control/tenant-quotas/:tenant_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const out = await getTenantQuotaProfile(db, tenantId);
    if (!out) return reply.code(404).send({ error: "not_found", message: "tenant quota profile not found" });
    return reply.code(200).send({ ok: true, quota: out });
  });

  app.delete("/v1/admin/control/tenant-quotas/:tenant_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const deleted = await deleteTenantQuotaProfile(db, tenantId);
    tenantQuotaResolver.invalidate(tenantId);
    if (deleted) {
      await emitControlAudit(req, {
        action: "tenant_quota.delete",
        resource_type: "tenant_quota",
        resource_id: tenantId,
        tenant_id: tenantId,
        details: { deleted: true },
      });
    }
    return reply.code(200).send({ ok: true, deleted });
  });

  app.put("/v1/admin/control/sandbox-budgets/:tenant_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const body = ControlSandboxBudgetUpsertSchema.parse(req.body ?? {});
    const out = await upsertSandboxBudgetProfile({
      tenant_id: tenantId,
      scope: body.scope ?? "*",
      daily_run_cap: body.daily_run_cap,
      daily_timeout_cap: body.daily_timeout_cap,
      daily_failure_cap: body.daily_failure_cap,
    });
    await emitControlAudit(req, {
      action: "sandbox_budget.upsert",
      resource_type: "sandbox_budget",
      resource_id: `${tenantId}:${normalizeSandboxBudgetScope(body.scope)}`,
      tenant_id: tenantId,
      details: out as Record<string, unknown>,
    });
    return reply.code(200).send({ ok: true, budget: out });
  });

  app.get("/v1/admin/control/sandbox-budgets/:tenant_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const q = req.query as Record<string, unknown> | undefined;
    const scope = typeof q?.scope === "string" ? q.scope : "*";
    const out = await getSandboxBudgetProfile(tenantId, scope);
    if (!out) return reply.code(404).send({ error: "not_found", message: "sandbox budget profile not found" });
    return reply.code(200).send({ ok: true, budget: out });
  });

  app.delete("/v1/admin/control/sandbox-budgets/:tenant_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const q = req.query as Record<string, unknown> | undefined;
    const scope = typeof q?.scope === "string" ? q.scope : "*";
    const deleted = await deleteSandboxBudgetProfile(tenantId, scope);
    if (deleted) {
      await emitControlAudit(req, {
        action: "sandbox_budget.delete",
        resource_type: "sandbox_budget",
        resource_id: `${tenantId}:${normalizeSandboxBudgetScope(scope)}`,
        tenant_id: tenantId,
        details: { deleted: true },
      });
    }
    return reply.code(200).send({ ok: true, deleted });
  });

  app.get("/v1/admin/control/sandbox-budgets", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const budgets = await listSandboxBudgetProfiles({
      tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
      limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
      offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
    });
    return reply.code(200).send({ ok: true, budgets });
  });

  app.put("/v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    const projectId = String((req.params as any)?.project_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    if (!projectId) throw new HttpError(400, "invalid_request", "project_id is required");
    const body = ControlSandboxProjectBudgetUpsertSchema.parse(req.body ?? {});
    const out = await upsertSandboxProjectBudgetProfile({
      tenant_id: tenantId,
      project_id: projectId,
      scope: body.scope ?? "*",
      daily_run_cap: body.daily_run_cap,
      daily_timeout_cap: body.daily_timeout_cap,
      daily_failure_cap: body.daily_failure_cap,
    });
    await emitControlAudit(req, {
      action: "sandbox_project_budget.upsert",
      resource_type: "sandbox_project_budget",
      resource_id: `${tenantId}:${projectId}:${normalizeSandboxBudgetScope(body.scope)}`,
      tenant_id: tenantId,
      details: out as Record<string, unknown>,
    });
    return reply.code(200).send({ ok: true, budget: out });
  });

  app.get("/v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    const projectId = String((req.params as any)?.project_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    if (!projectId) throw new HttpError(400, "invalid_request", "project_id is required");
    const q = req.query as Record<string, unknown> | undefined;
    const scope = typeof q?.scope === "string" ? q.scope : "*";
    const out = await getSandboxProjectBudgetProfile(tenantId, projectId, scope);
    if (!out) return reply.code(404).send({ error: "not_found", message: "sandbox project budget profile not found" });
    return reply.code(200).send({ ok: true, budget: out });
  });

  app.delete("/v1/admin/control/sandbox-project-budgets/:tenant_id/:project_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    const projectId = String((req.params as any)?.project_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    if (!projectId) throw new HttpError(400, "invalid_request", "project_id is required");
    const q = req.query as Record<string, unknown> | undefined;
    const scope = typeof q?.scope === "string" ? q.scope : "*";
    const deleted = await deleteSandboxProjectBudgetProfile(tenantId, projectId, scope);
    if (deleted) {
      await emitControlAudit(req, {
        action: "sandbox_project_budget.delete",
        resource_type: "sandbox_project_budget",
        resource_id: `${tenantId}:${projectId}:${normalizeSandboxBudgetScope(scope)}`,
        tenant_id: tenantId,
        details: { deleted: true },
      });
    }
    return reply.code(200).send({ ok: true, deleted });
  });

  app.get("/v1/admin/control/sandbox-project-budgets", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const budgets = await listSandboxProjectBudgetProfiles({
      tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
      project_id: typeof q?.project_id === "string" ? q.project_id : undefined,
      limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
      offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
    });
    return reply.code(200).send({ ok: true, budgets });
  });

  app.get("/v1/admin/control/audit-events", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const events = await listControlAuditEvents(db, {
      tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
      action: typeof q?.action === "string" ? q.action : undefined,
      limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
      offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
    });
    return reply.code(200).send({ ok: true, events });
  });
}
