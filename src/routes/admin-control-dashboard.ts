import { z } from "zod";
import {
  getTenantApiKeyUsageReport,
  getTenantDashboardSummary,
  getTenantIncidentPublishRollup,
  getTenantIncidentPublishSloReport,
  getTenantOperabilityDiagnostics,
  getTenantRequestTimeseries,
} from "../control-plane.js";
import type { Env } from "../config.js";
import type { Db } from "../db.js";
import { HttpError } from "../util/http.js";

type TelemetryEndpoint = "write" | "recall" | "recall_text" | "planning_context" | "context_assemble";

type DashboardCursor = {
  v: 1;
  kind: "timeseries" | "key_usage";
  tenant_id: string;
  endpoint?: TelemetryEndpoint | null;
  window_hours: number;
  baseline_hours?: number;
  limit: number;
  offset: number;
  anchor_utc: string;
};

const ControlTenantDiagnosticsQuerySchema = z.object({
  scope: z.string().min(1).max(256).optional(),
  window_minutes: z.coerce.number().int().min(5).max(24 * 60).optional(),
});

function parseTelemetryEndpoint(v: unknown): TelemetryEndpoint | undefined {
  if (typeof v !== "string") return undefined;
  if (v === "write" || v === "recall" || v === "recall_text" || v === "planning_context" || v === "context_assemble") {
    return v;
  }
  return undefined;
}

function encodeDashboardCursor(cursor: DashboardCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeDashboardCursor(raw: string): DashboardCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as DashboardCursor;
    if (!parsed || parsed.v !== 1 || !parsed.kind || !parsed.tenant_id || !parsed.anchor_utc) {
      throw new Error("malformed cursor");
    }
    if (!Number.isFinite(parsed.window_hours) || !Number.isFinite(parsed.limit) || !Number.isFinite(parsed.offset)) {
      throw new Error("malformed cursor numeric fields");
    }
    const d = new Date(parsed.anchor_utc);
    if (!Number.isFinite(d.getTime())) throw new Error("invalid cursor anchor");
    return {
      ...parsed,
      anchor_utc: d.toISOString(),
    };
  } catch {
    throw new HttpError(400, "invalid_request", "invalid cursor");
  }
}

function parseCursor(raw: unknown, kind: DashboardCursor["kind"], tenantId: string): DashboardCursor | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const cursor = decodeDashboardCursor(raw.trim());
  if (cursor.kind !== kind) throw new HttpError(400, "invalid_request", `cursor kind mismatch: expected ${kind}`);
  if (cursor.tenant_id !== tenantId) throw new HttpError(400, "invalid_request", "cursor tenant mismatch");
  return cursor;
}

export function registerAdminControlDashboardRoutes(args: {
  app: any;
  db: Db;
  env: Env;
  requireAdminToken: (req: any) => void;
}) {
  const { app, db, env, requireAdminToken } = args;

  app.get("/v1/admin/control/dashboard/tenant/:tenant_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const dashboard = await getTenantDashboardSummary(db, {
      tenant_id: tenantId,
      default_tenant_id: env.MEMORY_TENANT_ID,
    });
    return reply.code(200).send({ ok: true, dashboard });
  });

  app.get("/v1/admin/control/diagnostics/tenant/:tenant_id", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const q = ControlTenantDiagnosticsQuerySchema.parse(req.query ?? {});
    const diagnostics = await getTenantOperabilityDiagnostics(db, {
      tenant_id: tenantId,
      default_tenant_id: env.MEMORY_TENANT_ID,
      scope: q.scope,
      window_minutes: q.window_minutes,
    });
    return reply.code(200).send({ ok: true, diagnostics });
  });

  app.get("/v1/admin/control/dashboard/tenant/:tenant_id/incident-publish-rollup", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const q = req.query as Record<string, unknown> | undefined;
    const windowHours = typeof q?.window_hours === "string" ? Number(q.window_hours) : undefined;
    const sampleLimit = typeof q?.sample_limit === "string" ? Number(q.sample_limit) : undefined;
    const rollup = await getTenantIncidentPublishRollup(db, {
      tenant_id: tenantId,
      window_hours: windowHours,
      sample_limit: sampleLimit,
    });
    return reply.code(200).send({ ok: true, rollup });
  });

  app.get("/v1/admin/control/dashboard/tenant/:tenant_id/incident-publish-slo", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const q = req.query as Record<string, unknown> | undefined;
    const report = await getTenantIncidentPublishSloReport(db, {
      tenant_id: tenantId,
      window_hours: typeof q?.window_hours === "string" ? Number(q.window_hours) : undefined,
      baseline_hours: typeof q?.baseline_hours === "string" ? Number(q.baseline_hours) : undefined,
      min_jobs: typeof q?.min_jobs === "string" ? Number(q.min_jobs) : undefined,
      adaptive_multiplier: typeof q?.adaptive_multiplier === "string" ? Number(q.adaptive_multiplier) : undefined,
      failure_rate_floor: typeof q?.failure_rate_floor === "string" ? Number(q.failure_rate_floor) : undefined,
      dead_letter_rate_floor:
        typeof q?.dead_letter_rate_floor === "string" ? Number(q.dead_letter_rate_floor) : undefined,
      backlog_warning_abs: typeof q?.backlog_warning_abs === "string" ? Number(q.backlog_warning_abs) : undefined,
      dead_letter_backlog_warning_abs:
        typeof q?.dead_letter_backlog_warning_abs === "string" ? Number(q.dead_letter_backlog_warning_abs) : undefined,
      dead_letter_backlog_critical_abs:
        typeof q?.dead_letter_backlog_critical_abs === "string"
          ? Number(q.dead_letter_backlog_critical_abs)
          : undefined,
    });
    return reply.code(200).send({ ok: true, report });
  });

  app.get("/v1/admin/control/dashboard/tenant/:tenant_id/timeseries", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const q = req.query as Record<string, unknown> | undefined;
    const cursor = parseCursor(q?.cursor, "timeseries", tenantId);
    const endpointRaw = typeof q?.endpoint === "string" ? q.endpoint : undefined;
    const endpoint = parseTelemetryEndpoint(endpointRaw ?? cursor?.endpoint ?? undefined);
    if (endpointRaw && !endpoint && endpointRaw.trim().length > 0) {
      throw new HttpError(
        400,
        "invalid_request",
        "endpoint must be one of: write|recall|recall_text|planning_context|context_assemble",
      );
    }
    const windowHours = typeof q?.window_hours === "string" ? Number(q.window_hours) : cursor?.window_hours;
    const limit = typeof q?.limit === "string" ? Number(q.limit) : cursor?.limit;
    const offset = typeof q?.offset === "string" ? Number(q.offset) : cursor?.offset;
    const anchorUtc = cursor?.anchor_utc ?? new Date().toISOString();
    const out = await getTenantRequestTimeseries(db, {
      tenant_id: tenantId,
      window_hours: windowHours,
      endpoint,
      limit,
      offset,
      retention_hours: env.CONTROL_TELEMETRY_RETENTION_HOURS,
      anchor_utc: anchorUtc,
      bucket: "hour",
    });
    const page = (out as any)?.page ?? null;
    const nextCursor =
      out && (out as any).ok && page?.has_more
        ? encodeDashboardCursor({
            v: 1,
            kind: "timeseries",
            tenant_id: tenantId,
            endpoint: endpoint ?? null,
            window_hours: Number((out as any).window_hours ?? windowHours ?? 0),
            limit: Number(page.limit ?? limit ?? 0),
            offset: Number(page.offset ?? offset ?? 0) + Number(page.limit ?? limit ?? 0),
            anchor_utc: String((out as any)?.snapshot?.anchor_utc ?? anchorUtc),
          })
        : null;
    return reply.code(200).send({ ...out, cursor: { next: nextCursor } });
  });

  app.get("/v1/admin/control/dashboard/tenant/:tenant_id/key-usage", async (req: any, reply: any) => {
    requireAdminToken(req);
    const tenantId = String((req.params as any)?.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const q = req.query as Record<string, unknown> | undefined;
    const cursor = parseCursor(q?.cursor, "key_usage", tenantId);
    const endpointRaw = typeof q?.endpoint === "string" ? q.endpoint : undefined;
    const endpoint = parseTelemetryEndpoint(endpointRaw ?? cursor?.endpoint ?? undefined);
    if (endpointRaw && !endpoint && endpointRaw.trim().length > 0) {
      throw new HttpError(
        400,
        "invalid_request",
        "endpoint must be one of: write|recall|recall_text|planning_context|context_assemble",
      );
    }
    const windowHours = typeof q?.window_hours === "string" ? Number(q.window_hours) : cursor?.window_hours;
    const baselineHours = typeof q?.baseline_hours === "string" ? Number(q.baseline_hours) : cursor?.baseline_hours;
    const minRequests = typeof q?.min_requests === "string" ? Number(q.min_requests) : undefined;
    const zscoreThreshold = typeof q?.zscore_threshold === "string" ? Number(q.zscore_threshold) : undefined;
    const limit = typeof q?.limit === "string" ? Number(q.limit) : cursor?.limit;
    const offset = typeof q?.offset === "string" ? Number(q.offset) : cursor?.offset;
    const anchorUtc = cursor?.anchor_utc ?? new Date().toISOString();
    const out = await getTenantApiKeyUsageReport(db, {
      tenant_id: tenantId,
      window_hours: windowHours,
      baseline_hours: baselineHours,
      min_requests: minRequests,
      zscore_threshold: zscoreThreshold,
      endpoint,
      limit,
      offset,
      retention_hours: env.CONTROL_TELEMETRY_RETENTION_HOURS,
      anchor_utc: anchorUtc,
    });
    const page = (out as any)?.page ?? null;
    const nextCursor =
      out && (out as any).ok && page?.has_more
        ? encodeDashboardCursor({
            v: 1,
            kind: "key_usage",
            tenant_id: tenantId,
            endpoint: endpoint ?? null,
            window_hours: Number((out as any)?.retention?.applied_window_hours ?? windowHours ?? 0),
            baseline_hours: Number((out as any)?.retention?.applied_baseline_hours ?? baselineHours ?? 0),
            limit: Number(page.limit ?? limit ?? 0),
            offset: Number(page.offset ?? offset ?? 0) + Number(page.limit ?? limit ?? 0),
            anchor_utc: String((out as any)?.snapshot?.anchor_utc ?? anchorUtc),
          })
        : null;
    return reply.code(200).send({ ...out, cursor: { next: nextCursor } });
  });
}
