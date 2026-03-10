import { z } from "zod";
import {
  countRecentControlAlertDeliveriesByRoute,
  createControlAlertRoute,
  enqueueControlIncidentPublishJob,
  findRecentControlAlertDeliveryByDedupe,
  getControlAlertRouteById,
  listActiveAlertRoutesForEvent,
  listControlAlertDeliveries,
  listControlAlertDeliveriesByIds,
  listControlAlertRoutes,
  listControlIncidentPublishJobs,
  recordControlAlertDelivery,
  replayControlIncidentPublishJobs,
  updateControlAlertDeliveriesMetadata,
  updateControlAlertRouteStatus,
} from "../control-plane.js";
import type { Env } from "../config.js";
import type { Db } from "../db.js";
import { automationTelemetry } from "../memory/automation.js";
import { HttpError } from "../util/http.js";

const ControlAlertRouteSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  channel: z.enum(["webhook", "slack_webhook", "pagerduty_events"]),
  label: z.string().max(256).optional().nullable(),
  events: z.array(z.string().min(1).max(128)).max(64).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  target: z.string().min(1).max(2048),
  secret: z.string().max(2048).optional().nullable(),
  headers: z.record(z.string().max(2048)).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlAlertRouteStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

const ControlAutomationAlertDispatchSchema = z.object({
  tenant_id: z.string().min(1).max(128).optional(),
  scope: z.string().min(1).max(256).optional(),
  automation_id: z.string().min(1).max(256).optional(),
  window_hours: z.number().int().min(1).max(24 * 30).optional(),
  incident_limit: z.number().int().min(1).max(100).optional(),
  candidate_codes: z.array(z.string().min(1).max(128)).max(32).optional(),
  dry_run: z.boolean().optional(),
  dedupe_ttl_seconds: z.number().int().min(60).max(7 * 24 * 3600).optional(),
});

const ControlAlertDeliveryReplaySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  dry_run: z.boolean().optional(),
  dedupe_ttl_seconds: z.number().int().min(60).max(7 * 24 * 3600).optional(),
  allow_disabled_route: z.boolean().optional(),
  override_target: z.string().min(1).max(2048).optional(),
});

const ControlAlertDeliveryAssignSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  owner: z.string().max(256).nullable().optional(),
  escalation_owner: z.string().max(256).nullable().optional(),
  sla_target_at: z.string().datetime().nullable().optional(),
  workflow_state: z.enum(["replay_backlog", "manual_review", "dead_letter"]).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  actor: z.string().min(1).max(256).optional(),
});

const ControlIncidentPublishJobSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  run_id: z.string().min(1).max(256),
  source_dir: z.string().min(1).max(4096),
  target: z.string().min(1).max(4096),
  max_attempts: z.number().int().min(1).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ControlIncidentPublishReplaySchema = z.object({
  tenant_id: z.string().min(1).max(128).optional(),
  statuses: z.array(z.enum(["failed", "dead_letter"])).max(8).optional(),
  ids: z.array(z.string().uuid()).max(500).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  reset_attempts: z.boolean().optional(),
  reason: z.string().min(1).max(256).optional(),
  dry_run: z.boolean().optional(),
  allow_all_tenants: z.boolean().optional(),
});

type StoreLike = {
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

function summarizeIncidentPublishReplayRows(rows: any[], sampleLimit = 20) {
  return rows.slice(0, sampleLimit).map((row) => ({
    id: String(row.id),
    tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
    run_id: row.run_id == null ? null : String(row.run_id),
    status: row.status == null ? null : String(row.status),
    attempts: Number.isFinite(Number(row.attempts)) ? Number(row.attempts) : null,
    max_attempts: Number.isFinite(Number(row.max_attempts)) ? Number(row.max_attempts) : null,
    target: row.target == null ? null : String(row.target),
    next_attempt_at: row.next_attempt_at == null ? null : String(row.next_attempt_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  }));
}

function buildAutomationAlertDispatchEventPayload(args: {
  telemetry: any;
  candidate: any;
  route: any;
  requestId: string;
  dedupeKey: string;
}) {
  const severity = String(args.candidate?.severity || "warning").trim() || "warning";
  const eventType = String(args.candidate?.recommended_event_type || "").trim();
  const tenantId = String(args.telemetry?.tenant_id || "").trim();
  const scope = String(args.telemetry?.scope || "").trim();
  const automationId = String(args.telemetry?.automation_id || "").trim();
  const summary = String(args.candidate?.summary || eventType || "automation alert").trim();
  const payload = {
    source: "aionis_automation",
    tenant_id: tenantId || null,
    scope: scope || null,
    automation_id: automationId || null,
    event_type: eventType || null,
    code: String(args.candidate?.code || "").trim() || null,
    severity,
    summary,
    threshold: args.candidate?.threshold ?? null,
    current_value: args.candidate?.current_value ?? null,
    suggested_action: args.candidate?.suggested_action ?? null,
    telemetry_summary: args.telemetry?.summary ?? {},
    request_id: args.requestId || null,
    dedupe_key: args.dedupeKey,
    generated_at: new Date().toISOString(),
  };

  if (args.route?.channel === "slack_webhook") {
    return {
      text: `[${severity.toUpperCase()}] ${summary}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${summary}*\nseverity: \`${severity}\`\nevent: \`${eventType || "-"}\`\nautomation: \`${automationId || "-"}\``,
          },
        },
      ],
      metadata: payload,
    };
  }

  if (args.route?.channel === "pagerduty_events") {
    const routingKey = typeof args.route?.secret === "string" ? args.route.secret.trim() : "";
    if (!routingKey) {
      throw new HttpError(400, "invalid_alert_route_secret", "pagerduty_events route requires secret integration key");
    }
    return {
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: args.dedupeKey,
      payload: {
        summary,
        severity: severity === "critical" ? "critical" : "warning",
        source: "aionis",
        component: automationId || "automation",
        group: tenantId || "default",
        class: eventType || "automation_alert",
        custom_details: payload,
      },
    };
  }

  return payload;
}

function asAutomationAlertDispatchPolicy(rawRoute: any, requestDedupeTtlSeconds: number) {
  const metadata =
    rawRoute?.metadata && typeof rawRoute.metadata === "object" && !Array.isArray(rawRoute.metadata)
      ? rawRoute.metadata
      : {};
  const policyRaw =
    metadata?.automation_dispatch_policy &&
    typeof metadata.automation_dispatch_policy === "object" &&
    !Array.isArray(metadata.automation_dispatch_policy)
      ? metadata.automation_dispatch_policy
      : {};
  const cooldownRaw = Number(policyRaw.cooldown_seconds);
  const retryMaxAttemptsRaw = Number(policyRaw.retry_max_attempts);
  const retryBackoffMsRaw = Number(policyRaw.retry_backoff_ms);
  const replayBackoffSecondsRaw = Number(policyRaw.replay_backoff_seconds);
  const maxDispatchesPerWindowRaw = Number(policyRaw.max_dispatches_per_window);
  const windowSecondsRaw = Number(policyRaw.window_seconds);
  const retryOnHttp5xxRaw = policyRaw.retry_on_http_5xx;
  const retryOnNetworkErrorRaw = policyRaw.retry_on_network_error;
  const cooldownSeconds = Number.isFinite(cooldownRaw)
    ? Math.max(0, Math.min(7 * 24 * 3600, Math.trunc(cooldownRaw)))
    : Math.max(0, Math.min(7 * 24 * 3600, Math.trunc(requestDedupeTtlSeconds)));
  const maxDispatchesPerWindow = Number.isFinite(maxDispatchesPerWindowRaw)
    ? Math.max(1, Math.min(1000, Math.trunc(maxDispatchesPerWindowRaw)))
    : null;
  const windowSeconds =
    maxDispatchesPerWindow != null
      ? Number.isFinite(windowSecondsRaw)
        ? Math.max(60, Math.min(7 * 24 * 3600, Math.trunc(windowSecondsRaw)))
        : Math.max(60, cooldownSeconds || 300)
      : null;

  return {
    cooldown_seconds: cooldownSeconds,
    retry_max_attempts: Number.isFinite(retryMaxAttemptsRaw)
      ? Math.max(1, Math.min(4, Math.trunc(retryMaxAttemptsRaw)))
      : 1,
    retry_backoff_ms: Number.isFinite(retryBackoffMsRaw)
      ? Math.max(0, Math.min(5000, Math.trunc(retryBackoffMsRaw)))
      : 250,
    replay_backoff_seconds: Number.isFinite(replayBackoffSecondsRaw)
      ? Math.max(0, Math.min(7 * 24 * 3600, Math.trunc(replayBackoffSecondsRaw)))
      : 300,
    retry_on_http_5xx: retryOnHttp5xxRaw === false ? false : true,
    retry_on_network_error: retryOnNetworkErrorRaw === false ? false : true,
    max_dispatches_per_window: maxDispatchesPerWindow,
    window_seconds: windowSeconds,
  };
}

async function dispatchControlAlertWithPayload(args: {
  db: Db;
  route: any;
  tenantId: string;
  eventType: string;
  requestId: string;
  dedupeKey: string;
  dispatchPolicy: Record<string, unknown>;
  body: unknown;
  dryRun: boolean;
  resultBase: Record<string, unknown>;
  deliveryMetadata: Record<string, unknown>;
}) {
  if (args.dryRun) {
    return {
      ...args.resultBase,
      status: "dry_run",
      preview_body: args.body,
      attempts: 0,
    };
  }

  const routeHeaders =
    args.route?.headers && typeof args.route.headers === "object" && !Array.isArray(args.route.headers)
      ? Object.fromEntries(Object.entries(args.route.headers).map(([k, v]) => [String(k), String(v)]))
      : {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "aionis-control-alert/1.0",
    "x-aionis-alert-event": args.eventType,
    "x-aionis-dedupe-key": args.dedupeKey,
    ...routeHeaders,
  };
  if (args.route?.channel === "webhook" && typeof args.route?.secret === "string" && args.route.secret.trim()) {
    headers["x-aionis-route-secret"] = args.route.secret.trim();
  }

  const dispatchPolicy: any = args.dispatchPolicy ?? {};
  let attempt = 0;
  let lastStatus: number | null = null;
  let lastResponseBody: string | null = null;
  let lastError: string | null = null;
  let finalState: "sent" | "failed" = "failed";

  while (attempt < Number(dispatchPolicy.retry_max_attempts || 1)) {
    attempt += 1;
    const attemptController = new AbortController();
    const attemptTimeout = setTimeout(() => attemptController.abort(), 8000);
    try {
      const response = await fetch(String(args.route?.target || ""), {
        method: "POST",
        headers,
        body: JSON.stringify(args.body),
        signal: attemptController.signal,
      });
      const responseBody = await response.text();
      clearTimeout(attemptTimeout);
      lastStatus = response.status;
      lastResponseBody = responseBody.slice(0, 4000) || null;
      lastError = response.ok ? null : `http_${response.status}`;
      if (response.ok) {
        finalState = "sent";
        break;
      }
      const shouldRetryHttp =
        response.status >= 500 && dispatchPolicy.retry_on_http_5xx && attempt < dispatchPolicy.retry_max_attempts;
      if (!shouldRetryHttp) break;
    } catch (err: any) {
      clearTimeout(attemptTimeout);
      lastStatus = null;
      lastResponseBody = null;
      lastError = err instanceof Error ? err.message : "dispatch_failed";
      const shouldRetryNetwork = dispatchPolicy.retry_on_network_error && attempt < dispatchPolicy.retry_max_attempts;
      if (!shouldRetryNetwork) break;
    }
    const backoffMs = Number(dispatchPolicy.retry_backoff_ms || 0) * Math.max(1, attempt);
    if (backoffMs > 0) await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  await recordControlAlertDelivery(args.db, {
    route_id: String(args.route?.id || "").trim(),
    tenant_id: args.tenantId,
    event_type: args.eventType,
    status: finalState,
    request_id: args.requestId,
    response_code: lastStatus,
    response_body: lastResponseBody,
    error: finalState === "sent" ? null : lastError,
    metadata: {
      ...args.deliveryMetadata,
      dispatch_policy: dispatchPolicy,
      attempts: attempt,
      payload_snapshot: args.body,
      route_snapshot: {
        id: String(args.route?.id || "").trim() || null,
        label: args.route?.label ?? null,
        channel: args.route?.channel ?? null,
        status: args.route?.status ?? null,
        target: args.route?.target ?? null,
      },
    },
  });

  return {
    ...args.resultBase,
    status: finalState,
    response_code: lastStatus,
    error: finalState === "sent" ? null : lastError,
    attempts: attempt,
  };
}

async function sendAutomationAlertRoute(args: {
  db: Db;
  route: any;
  telemetry: any;
  candidate: any;
  dryRun: boolean;
  dedupeTtlSeconds: number;
  requestId: string;
}) {
  const routeId = String(args.route?.id || "").trim();
  const tenantId = String(args.telemetry?.tenant_id || "").trim();
  const eventType = String(args.candidate?.recommended_event_type || "").trim();
  const code = String(args.candidate?.code || "").trim();
  const automationId = String(args.telemetry?.automation_id || "").trim();
  const scope = String(args.telemetry?.scope || "").trim();
  const windowHours = Number(args.telemetry?.window_hours || 0) || null;
  const dedupeKey = [tenantId, scope, automationId, eventType, code].filter(Boolean).join(":");
  const dispatchPolicy = asAutomationAlertDispatchPolicy(args.route, args.dedupeTtlSeconds);
  const resultBase = {
    route_id: routeId,
    route_label: args.route?.label ?? null,
    channel: args.route?.channel ?? null,
    event_type: eventType,
    code: code || null,
    severity: args.candidate?.severity ?? null,
    dedupe_key: dedupeKey,
    dispatch_policy: dispatchPolicy,
  };

  if (!routeId || !tenantId || !eventType) {
    return {
      ...resultBase,
      status: "failed",
      error: "invalid_dispatch_context",
    };
  }

  if (!args.dryRun) {
    const prior = await findRecentControlAlertDeliveryByDedupe(args.db, {
      route_id: routeId,
      dedupe_key: dedupeKey,
      ttl_seconds: dispatchPolicy.cooldown_seconds,
    });
    if (prior) {
      await recordControlAlertDelivery(args.db, {
        route_id: routeId,
        tenant_id: tenantId,
        event_type: eventType,
        status: "skipped",
        request_id: args.requestId,
        metadata: {
          dedupe_key: dedupeKey,
          reason: "recent_sent_delivery",
          candidate_code: code || null,
          prior_delivery_id: prior.delivery_id ?? prior.id ?? null,
          automation_id: automationId || null,
          scope: scope || null,
          window_hours: windowHours,
          dispatch_policy: dispatchPolicy,
        },
      });
      return {
        ...resultBase,
        status: "skipped",
        skipped_reason: "dedupe_recent_sent",
        attempts: 0,
      };
    }

    if (dispatchPolicy.max_dispatches_per_window != null && dispatchPolicy.window_seconds != null) {
      const recentSentCount = await countRecentControlAlertDeliveriesByRoute(args.db, {
        route_id: routeId,
        ttl_seconds: dispatchPolicy.window_seconds,
        status: "sent",
      });
      if (recentSentCount >= dispatchPolicy.max_dispatches_per_window) {
        await recordControlAlertDelivery(args.db, {
          route_id: routeId,
          tenant_id: tenantId,
          event_type: eventType,
          status: "skipped",
          request_id: args.requestId,
          metadata: {
            dedupe_key: dedupeKey,
            reason: "dispatch_rate_limit_budget_exhausted",
            candidate_code: code || null,
            automation_id: automationId || null,
            scope: scope || null,
            window_hours: windowHours,
            dispatch_policy: dispatchPolicy,
            recent_sent_count: recentSentCount,
          },
        });
        return {
          ...resultBase,
          status: "skipped",
          skipped_reason: "rate_limit_budget_exhausted",
          attempts: 0,
          recent_sent_count: recentSentCount,
        };
      }
    }
  }

  let body: unknown;
  try {
    body = buildAutomationAlertDispatchEventPayload({
      telemetry: args.telemetry,
      candidate: args.candidate,
      route: args.route,
      requestId: args.requestId,
      dedupeKey,
    });
  } catch (err: any) {
    if (!args.dryRun) {
      await recordControlAlertDelivery(args.db, {
        route_id: routeId,
        tenant_id: tenantId,
        event_type: eventType,
        status: "failed",
        request_id: args.requestId,
        error: err instanceof Error ? err.message : "payload_build_failed",
        metadata: {
          dedupe_key: dedupeKey,
          candidate_code: code || null,
          automation_id: automationId || null,
          scope: scope || null,
          window_hours: windowHours,
          dispatch_policy: dispatchPolicy,
        },
      });
    }
    return {
      ...resultBase,
      status: "failed",
      error: err instanceof Error ? err.message : "payload_build_failed",
      attempts: 0,
    };
  }

  if (args.dryRun) {
    return {
      ...resultBase,
      status: "dry_run",
      preview_body: body,
      attempts: 0,
    };
  }

  return dispatchControlAlertWithPayload({
    db: args.db,
    route: args.route,
    tenantId,
    eventType,
    requestId: args.requestId,
    dedupeKey,
    dispatchPolicy,
    body,
    dryRun: args.dryRun,
    resultBase,
    deliveryMetadata: {
      dedupe_key: dedupeKey,
      candidate_code: code || null,
      automation_id: automationId || null,
      scope: scope || null,
      window_hours: windowHours,
    },
  });
}

export function registerAdminControlAlertRoutes(args: {
  app: any;
  db: Db;
  env: Env;
  store: StoreLike;
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
  const { app, db, env, store, requireAdminToken, emitControlAudit } = args;

  app.post("/v1/admin/control/alerts/routes", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlAlertRouteSchema.parse(req.body ?? {});
    const out = await createControlAlertRoute(db, body);
    await emitControlAudit(req, {
      action: "alert_route.create",
      resource_type: "alert_route",
      resource_id: String(out.id),
      tenant_id: String(out.tenant_id),
      details: {
        channel: out.channel,
        status: out.status,
        events: out.events,
        label: out.label ?? null,
      },
    });
    return reply.code(200).send({ ok: true, route: out });
  });

  app.get("/v1/admin/control/alerts/routes", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const rows = await listControlAlertRoutes(db, {
      tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
      channel:
        q?.channel === "webhook" || q?.channel === "slack_webhook" || q?.channel === "pagerduty_events"
          ? q.channel
          : undefined,
      status: q?.status === "active" || q?.status === "disabled" ? q.status : undefined,
      limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
      offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
    });
    return reply.code(200).send({ ok: true, routes: rows });
  });

  app.post("/v1/admin/control/alerts/routes/:id/status", async (req: any, reply: any) => {
    requireAdminToken(req);
    const id = String((req.params as any)?.id ?? "").trim();
    if (!id) throw new HttpError(400, "invalid_request", "id is required");
    const body = ControlAlertRouteStatusSchema.parse(req.body ?? {});
    const out = await updateControlAlertRouteStatus(db, id, body.status);
    if (!out) return reply.code(404).send({ error: "not_found", message: "alert route not found" });
    await emitControlAudit(req, {
      action: "alert_route.status",
      resource_type: "alert_route",
      resource_id: String(out.id),
      tenant_id: String(out.tenant_id),
      details: { status: out.status },
    });
    return reply.code(200).send({ ok: true, route: out });
  });

  app.get("/v1/admin/control/alerts/deliveries", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const deliveries = await listControlAlertDeliveries(db, {
      tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
      event_type: typeof q?.event_type === "string" ? q.event_type : undefined,
      status: q?.status === "sent" || q?.status === "failed" || q?.status === "skipped" ? q.status : undefined,
      limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
      offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
    });
    return reply.code(200).send({ ok: true, deliveries });
  });

  app.post("/v1/admin/control/alerts/deliveries/replay", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlAlertDeliveryReplaySchema.parse(req.body ?? {});
    const deliveries = await listControlAlertDeliveriesByIds(db, body.ids);
    const byId = new Map(deliveries.map((row: any) => [String(row.delivery_id), row]));
    const results = [];

    for (const id of body.ids) {
      const row = byId.get(String(id));
      if (!row) {
        results.push({ delivery_id: id, status: "skipped", skipped_reason: "delivery_not_found" });
        continue;
      }
      if (row.status !== "failed" && row.status !== "skipped") {
        results.push({
          delivery_id: String(row.delivery_id),
          route_id: row.route_id ?? null,
          status: "skipped",
          skipped_reason: "delivery_not_replayable",
        });
        continue;
      }
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
      const payloadSnapshot = metadata.payload_snapshot;
      if (payloadSnapshot == null) {
        results.push({
          delivery_id: String(row.delivery_id),
          route_id: row.route_id ?? null,
          status: "skipped",
          skipped_reason: "payload_snapshot_missing",
        });
        continue;
      }

      const route = await getControlAlertRouteById(db, String(row.route_id || ""));
      if (!route) {
        results.push({
          delivery_id: String(row.delivery_id),
          route_id: row.route_id ?? null,
          status: "skipped",
          skipped_reason: "route_not_found",
        });
        continue;
      }
      if (route.status !== "active" && body.allow_disabled_route !== true) {
        results.push({
          delivery_id: String(row.delivery_id),
          route_id: String(route.id),
          status: "skipped",
          skipped_reason: "route_disabled",
        });
        continue;
      }

      const routeForDispatch =
        body.override_target && String(body.override_target).trim()
          ? { ...route, target: String(body.override_target).trim() }
          : route;
      const dedupeKey = typeof metadata.dedupe_key === "string" ? metadata.dedupe_key.trim() : "";
      const eventType = String(row.event_type || "").trim();
      const dispatchPolicy = asAutomationAlertDispatchPolicy(routeForDispatch, body.dedupe_ttl_seconds ?? 1800);
      const resultBase = {
        delivery_id: String(row.delivery_id),
        route_id: String(route.id),
        route_label: route.label ?? null,
        channel: route.channel ?? null,
        event_type: eventType,
        code: typeof metadata.candidate_code === "string" ? metadata.candidate_code : null,
        dedupe_key: dedupeKey || null,
        dispatch_policy: dispatchPolicy,
        replay_of_delivery_id: String(row.delivery_id),
      };

      const out = await dispatchControlAlertWithPayload({
        db,
        route: routeForDispatch,
        tenantId: String(row.tenant_id || ""),
        eventType,
        requestId: String(req.id ?? ""),
        dedupeKey: dedupeKey || [String(row.tenant_id || ""), String(row.route_id || ""), eventType, "replay"].filter(Boolean).join(":"),
        dispatchPolicy,
        body: payloadSnapshot,
        dryRun: body.dry_run === true,
        resultBase,
        deliveryMetadata: {
          ...(metadata && typeof metadata === "object" ? metadata : {}),
          replay_of_delivery_id: String(row.delivery_id),
          replay_source_status: row.status ?? null,
          replay_request: {
            override_target: body.override_target ?? null,
            allow_disabled_route: body.allow_disabled_route === true,
          },
        },
      });
      results.push(out);
    }

    await emitControlAudit(req, {
      action: body.dry_run === true ? "alert_delivery.replay.preview" : "alert_delivery.replay",
      resource_type: "alert_delivery",
      resource_id: body.ids[0] ?? "batch",
      tenant_id: deliveries[0]?.tenant_id == null ? "" : String(deliveries[0].tenant_id),
      details: {
        delivery_count: body.ids.length,
        found_count: deliveries.length,
        dry_run: body.dry_run === true,
        allow_disabled_route: body.allow_disabled_route === true,
        override_target: body.override_target ?? null,
        replayed: results.filter((item: any) => item.status === "sent").length,
        failed: results.filter((item: any) => item.status === "failed").length,
        skipped: results.filter((item: any) => item.status === "skipped").length,
        dry_run_rows: results.filter((item: any) => item.status === "dry_run").length,
      },
    });

    return reply.code(200).send({
      ok: true,
      dry_run: body.dry_run === true,
      found_deliveries: deliveries.length,
      replayed: results.filter((item: any) => item.status === "sent").length,
      failed: results.filter((item: any) => item.status === "failed").length,
      skipped: results.filter((item: any) => item.status === "skipped").length,
      dry_run_rows: results.filter((item: any) => item.status === "dry_run").length,
      results,
    });
  });

  app.post("/v1/admin/control/alerts/deliveries/assign", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlAlertDeliveryAssignSchema.parse(req.body ?? {});
    const actor = String(body.actor || "ops").trim();
    const nowIso = new Date().toISOString();
    const updated = await updateControlAlertDeliveriesMetadata(db, body.ids, (row) => {
      const metadata =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {};
      const workflow =
        metadata.alert_workflow && typeof metadata.alert_workflow === "object" && !Array.isArray(metadata.alert_workflow)
          ? { ...(metadata.alert_workflow as Record<string, unknown>) }
          : {};
      const history = Array.isArray(workflow.history) ? [...workflow.history] : [];
      const nextWorkflow: Record<string, unknown> = {
        ...workflow,
        ...(body.owner !== undefined ? { owner: body.owner && String(body.owner).trim() ? String(body.owner).trim() : null } : {}),
        ...(body.escalation_owner !== undefined
          ? {
              escalation_owner:
                body.escalation_owner && String(body.escalation_owner).trim() ? String(body.escalation_owner).trim() : null,
            }
          : {}),
        ...(body.sla_target_at !== undefined ? { sla_target_at: body.sla_target_at ?? null } : {}),
        ...(body.workflow_state !== undefined ? { state: body.workflow_state ?? null } : {}),
        ...(body.note !== undefined ? { note: body.note && String(body.note).trim() ? String(body.note).trim() : null } : {}),
        updated_at: nowIso,
        updated_by: actor,
      };
      history.push({
        action: "assignment_updated",
        at: nowIso,
        actor,
        owner: nextWorkflow.owner ?? workflow.owner ?? null,
        escalation_owner: nextWorkflow.escalation_owner ?? workflow.escalation_owner ?? null,
        sla_target_at: nextWorkflow.sla_target_at ?? workflow.sla_target_at ?? null,
        workflow_state: nextWorkflow.state ?? workflow.state ?? null,
        note: nextWorkflow.note ?? workflow.note ?? null,
      });
      nextWorkflow.history = history.slice(-20);
      return {
        ...metadata,
        alert_workflow: nextWorkflow,
      };
    });

    await emitControlAudit(req, {
      action: "alert_delivery.assign",
      resource_type: "alert_delivery",
      resource_id: body.ids[0] ?? "batch",
      tenant_id: updated[0]?.tenant_id == null ? "" : String(updated[0].tenant_id),
      details: {
        delivery_count: body.ids.length,
        updated_count: updated.length,
        actor,
        owner: body.owner ?? null,
        escalation_owner: body.escalation_owner ?? null,
        sla_target_at: body.sla_target_at ?? null,
        workflow_state: body.workflow_state ?? null,
        note: body.note ?? null,
      },
    });

    return reply.code(200).send({
      ok: true,
      updated: updated.length,
      deliveries: updated,
    });
  });

  app.post("/v1/admin/control/automations/alerts/preview", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = req.body ?? {};
    const telemetry = await store.withClient((client) =>
      automationTelemetry(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
      }),
    );
    const candidates = Array.isArray((telemetry as any)?.alert_candidates) ? (telemetry as any).alert_candidates : [];
    const previews = [];
    for (const candidate of candidates) {
      const eventType = typeof candidate?.recommended_event_type === "string" ? candidate.recommended_event_type.trim() : "";
      if (!eventType) {
        previews.push({
          ...candidate,
          route_count: 0,
          dispatch_ready: false,
          routes: [],
        });
        continue;
      }
      const routes = await listActiveAlertRoutesForEvent(db, {
        tenant_id: String((telemetry as any)?.tenant_id || ""),
        event_type: eventType,
        limit: 20,
      });
      previews.push({
        ...candidate,
        route_count: routes.length,
        dispatch_ready: routes.length > 0,
        routes: routes.map((route: any) => ({
          id: String(route.id),
          label: route.label ?? null,
          channel: route.channel,
          status: route.status,
          target: route.target,
          dispatch_policy: asAutomationAlertDispatchPolicy(route, 1800),
        })),
      });
    }
    return reply.code(200).send({
      ok: true,
      tenant_id: (telemetry as any)?.tenant_id ?? null,
      scope: (telemetry as any)?.scope ?? null,
      window_hours: (telemetry as any)?.window_hours ?? null,
      automation_id: (telemetry as any)?.automation_id ?? null,
      summary: (telemetry as any)?.summary ?? {},
      alert_previews: previews,
    });
  });

  app.post("/v1/admin/control/automations/alerts/dispatch", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlAutomationAlertDispatchSchema.parse(req.body ?? {});
    const telemetry = await store.withClient((client) =>
      automationTelemetry(client, body, {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
      }),
    );
    const filterCodes = new Set((body.candidate_codes ?? []).map((v) => String(v).trim()).filter(Boolean));
    const candidates = (Array.isArray((telemetry as any)?.alert_candidates) ? (telemetry as any).alert_candidates : []).filter((candidate: any) => {
      if (filterCodes.size === 0) return true;
      const code = typeof candidate?.code === "string" ? candidate.code.trim() : "";
      return code ? filterCodes.has(code) : false;
    });
    const results = [];
    for (const candidate of candidates) {
      const eventType = typeof candidate?.recommended_event_type === "string" ? candidate.recommended_event_type.trim() : "";
      if (!eventType) {
        results.push({
          code: candidate?.code ?? null,
          severity: candidate?.severity ?? null,
          event_type: null,
          status: "skipped",
          skipped_reason: "missing_event_type",
        });
        continue;
      }
      const routes = await listActiveAlertRoutesForEvent(db, {
        tenant_id: String((telemetry as any)?.tenant_id || ""),
        event_type: eventType,
        limit: 20,
      });
      if (!routes.length) {
        results.push({
          code: candidate?.code ?? null,
          severity: candidate?.severity ?? null,
          event_type: eventType,
          status: "skipped",
          skipped_reason: "no_matching_route",
        });
        continue;
      }
      for (const route of routes) {
        results.push(
          await sendAutomationAlertRoute({
            db,
            route,
            telemetry,
            candidate,
            dryRun: body.dry_run !== false,
            dedupeTtlSeconds: body.dedupe_ttl_seconds ?? 1800,
            requestId: String(req.id ?? ""),
          }),
        );
      }
    }
    await emitControlAudit(req, {
      action: body.dry_run !== false ? "automation_alert.dispatch.preview" : "automation_alert.dispatch",
      resource_type: "automation_alert_dispatch",
      resource_id: String((telemetry as any)?.automation_id || "tenant_scope"),
      tenant_id: String((telemetry as any)?.tenant_id || ""),
      details: {
        automation_id: (telemetry as any)?.automation_id ?? null,
        scope: (telemetry as any)?.scope ?? null,
        window_hours: (telemetry as any)?.window_hours ?? null,
        candidate_count: candidates.length,
        result_count: results.length,
        dry_run: body.dry_run !== false,
      },
    });
    return reply.code(200).send({
      ok: true,
      tenant_id: (telemetry as any)?.tenant_id ?? null,
      scope: (telemetry as any)?.scope ?? null,
      window_hours: (telemetry as any)?.window_hours ?? null,
      automation_id: (telemetry as any)?.automation_id ?? null,
      dry_run: body.dry_run !== false,
      summary: (telemetry as any)?.summary ?? {},
      candidates_considered: candidates.length,
      matched_routes: results.filter((item: any) => item.route_id).length,
      dispatched: results.filter((item: any) => item.status === "sent").length,
      failed: results.filter((item: any) => item.status === "failed").length,
      skipped: results.filter((item: any) => item.status === "skipped").length,
      dry_run_rows: results.filter((item: any) => item.status === "dry_run").length,
      results,
    });
  });

  app.post("/v1/admin/control/incident-publish/jobs", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlIncidentPublishJobSchema.parse(req.body ?? {});
    const out = await enqueueControlIncidentPublishJob(db, body);
    await emitControlAudit(req, {
      action: "incident_publish.enqueue",
      resource_type: "incident_publish_job",
      resource_id: String(out.id),
      tenant_id: String(out.tenant_id),
      details: {
        run_id: out.run_id,
        target: out.target,
        max_attempts: out.max_attempts,
      },
    });
    return reply.code(200).send({ ok: true, job: out });
  });

  app.get("/v1/admin/control/incident-publish/jobs", async (req: any, reply: any) => {
    requireAdminToken(req);
    const q = req.query as Record<string, unknown> | undefined;
    const statusRaw = typeof q?.status === "string" ? q.status : undefined;
    const status =
      statusRaw === "pending" ||
      statusRaw === "processing" ||
      statusRaw === "succeeded" ||
      statusRaw === "failed" ||
      statusRaw === "dead_letter"
        ? statusRaw
        : undefined;
    const jobs = await listControlIncidentPublishJobs(db, {
      tenant_id: typeof q?.tenant_id === "string" ? q.tenant_id : undefined,
      status,
      limit: typeof q?.limit === "string" ? Number(q.limit) : undefined,
      offset: typeof q?.offset === "string" ? Number(q.offset) : undefined,
    });
    return reply.code(200).send({ ok: true, jobs });
  });

  app.post("/v1/admin/control/incident-publish/jobs/replay", async (req: any, reply: any) => {
    requireAdminToken(req);
    const body = ControlIncidentPublishReplaySchema.parse(req.body ?? {});
    const hasIds = Array.isArray(body.ids) && body.ids.length > 0;
    if (!body.tenant_id && !hasIds && !body.allow_all_tenants) {
      throw new HttpError(400, "invalid_request", "tenant_id or ids is required unless allow_all_tenants=true");
    }
    const jobs = await replayControlIncidentPublishJobs(db, body);
    const jobsSample = summarizeIncidentPublishReplayRows(jobs, 20);
    const dryRun = body.dry_run ?? false;
    const tenantId = body.tenant_id ?? (jobs[0]?.tenant_id ? String(jobs[0].tenant_id) : null);
    await emitControlAudit(req, {
      action: dryRun ? "incident_publish.replay.preview" : "incident_publish.replay",
      resource_type: "incident_publish_job_batch",
      resource_id: `${tenantId ?? "all"}:${new Date().toISOString()}`,
      tenant_id: tenantId,
      details: {
        replayed_count: dryRun ? 0 : jobs.length,
        candidate_count: jobs.length,
        statuses: body.statuses ?? ["dead_letter", "failed"],
        limit: body.limit ?? 50,
        reset_attempts: body.reset_attempts ?? true,
        dry_run: dryRun,
        allow_all_tenants: body.allow_all_tenants ?? false,
        reason: body.reason ?? "manual_replay",
        sample_job_ids: jobsSample.map((x) => String(x.id)),
      },
    });
    return reply.code(200).send({
      ok: true,
      dry_run: dryRun,
      replayed_count: dryRun ? 0 : jobs.length,
      candidate_count: jobs.length,
      jobs_sample: jobsSample,
    });
  });
}
