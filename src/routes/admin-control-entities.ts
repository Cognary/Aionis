import { z } from "zod";
import {
  createControlApiKey,
  listControlApiKeys,
  listStaleControlApiKeys,
  listControlTenants,
  revokeControlApiKey,
  rotateControlApiKey,
  upsertControlProject,
  upsertControlTenant,
} from "../control-plane.js";
import type { Db } from "../db.js";

const ControlTenantSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  display_name: z.string().max(256).optional().nullable(),
  status: z.enum(["active", "suspended"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlProjectSchema = z.object({
  project_id: z.string().min(1).max(128),
  tenant_id: z.string().min(1).max(128),
  display_name: z.string().max(256).optional().nullable(),
  status: z.enum(["active", "archived"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlApiKeySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  project_id: z.string().max(128).optional().nullable(),
  label: z.string().max(256).optional().nullable(),
  role: z.string().max(128).optional().nullable(),
  agent_id: z.string().max(128).optional().nullable(),
  team_id: z.string().max(128).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlApiKeyRotateSchema = z.object({
  label: z.string().max(256).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export function registerAdminControlEntityRoutes(args: {
  app: any;
  db: Db;
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
}) {
  const { app, db, requireAdminToken, emitControlAudit } = args;

  app.post("/v1/admin/control/tenants", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlTenantSchema.parse(req.body ?? {});
    const out = await upsertControlTenant(db, body);
    await emitControlAudit(req, {
      action: "tenant.upsert",
      resource_type: "tenant",
      resource_id: String(out.tenant_id),
      tenant_id: String(out.tenant_id),
      details: { status: out.status },
    });
    return reply.code(200).send({ ok: true, tenant: out });
  });

  app.get("/v1/admin/control/tenants", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const status = q?.status === "active" || q?.status === "suspended" ? q.status : undefined;
    const limit = typeof q?.limit === "string" ? Number(q.limit) : undefined;
    const offset = typeof q?.offset === "string" ? Number(q.offset) : undefined;
    const rows = await listControlTenants(db, { status, limit, offset });
    return reply.code(200).send({ ok: true, tenants: rows });
  });

  app.post("/v1/admin/control/projects", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlProjectSchema.parse(req.body ?? {});
    const out = await upsertControlProject(db, body);
    await emitControlAudit(req, {
      action: "project.upsert",
      resource_type: "project",
      resource_id: String(out.project_id),
      tenant_id: String(out.tenant_id),
      details: { status: out.status },
    });
    return reply.code(200).send({ ok: true, project: out });
  });

  app.post("/v1/admin/control/api-keys", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlApiKeySchema.parse(req.body ?? {});
    const out = await createControlApiKey(db, body);
    await emitControlAudit(req, {
      action: "api_key.create",
      resource_type: "api_key",
      resource_id: String(out.id),
      tenant_id: String(out.tenant_id),
      details: { project_id: out.project_id ?? null, key_prefix: out.key_prefix },
    });
    return reply.code(200).send({ ok: true, key: out });
  });

  app.get("/v1/admin/control/api-keys", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const rows = await listControlApiKeys(db, {
      tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
      project_id: typeof q?.project_id === "string" ? q.project_id : undefined,
      status: q?.status === "active" || q?.status === "revoked" ? q.status : undefined,
      limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
      offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
    });
    return reply.code(200).send({ ok: true, keys: rows });
  });

  app.get("/v1/admin/control/api-keys/stale", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const out = await listStaleControlApiKeys(db, {
      max_age_days: typeof q?.max_age_days === "string" ? Number(q.max_age_days) : undefined,
      warn_age_days: typeof q?.warn_age_days === "string" ? Number(q.warn_age_days) : undefined,
      rotation_window_days: typeof q?.rotation_window_days === "string" ? Number(q.rotation_window_days) : undefined,
      limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
    });
    return reply.code(200).send(out);
  });

  app.post("/v1/admin/control/api-keys/:id/revoke", async (req: any, reply: any) => {
    requireAdminToken(req);
    const id = String((req.params as any)?.id ?? "");
    const out = await revokeControlApiKey(db, id);
    if (!out) return reply.code(404).send({ error: "not_found", message: "api key not found" });
    await emitControlAudit(req, {
      action: "api_key.revoke",
      resource_type: "api_key",
      resource_id: String(out.id),
      tenant_id: String(out.tenant_id),
      details: { key_prefix: out.key_prefix },
    });
    return reply.code(200).send({ ok: true, key: out });
  });

  app.post("/v1/admin/control/api-keys/:id/rotate", async (req: any, reply: any) => {
    requireAdminToken(req);
    const id = String((req.params as any)?.id ?? "");
    const body = ControlApiKeyRotateSchema.parse(req.body ?? {});
    const out = await rotateControlApiKey(db, id, body);
    if (!out) return reply.code(404).send({ error: "not_found", message: "active api key not found" });
    await emitControlAudit(req, {
      action: "api_key.rotate",
      resource_type: "api_key",
      resource_id: String(out.rotated.id),
      tenant_id: String(out.rotated.tenant_id),
      details: {
        revoked_key_id: out.revoked?.id ?? id,
        key_prefix: out.rotated.key_prefix,
      },
    });
    return reply.code(200).send({ ok: true, key: out });
  });
}
