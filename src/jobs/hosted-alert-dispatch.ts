import "dotenv/config";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import {
  getTenantApiKeyUsageReport,
  listActiveAlertRoutesForEvent,
  listStaleControlApiKeys,
  recordControlAlertDelivery,
} from "../control-plane.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

type RoutedEvent = {
  event_type: string;
  tenant_id: string;
  severity: "warning" | "critical";
  summary: string;
  payload: Record<string, unknown>;
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function asEventTypeSet(raw: string | null): Set<string> {
  const input = (raw ?? "key_rotation_sla_failed,key_usage_anomaly").trim();
  const out = new Set<string>();
  for (const part of input.split(",")) {
    const p = part.trim();
    if (p) out.add(p);
  }
  return out;
}

async function collectEvents(args: {
  tenant_id: string;
  event_types: Set<string>;
  key_sla_max_age_days: number;
  key_sla_warn_age_days: number;
  key_sla_rotation_window_days: number;
  key_usage_window_hours: number;
  key_usage_baseline_hours: number;
  key_usage_min_requests: number;
  key_usage_zscore_threshold: number;
}): Promise<RoutedEvent[]> {
  const out: RoutedEvent[] = [];

  if (args.event_types.has("key_rotation_sla_failed")) {
    const sla = await listStaleControlApiKeys(db, {
      max_age_days: args.key_sla_max_age_days,
      warn_age_days: args.key_sla_warn_age_days,
      rotation_window_days: args.key_sla_rotation_window_days,
      limit: 500,
    });
    const staleRows = Array.isArray((sla as any)?.stale?.sample) ? ((sla as any).stale.sample as any[]) : [];
    const staleForTenant = staleRows.filter((row) => String(row?.tenant_id ?? "") === args.tenant_id);
    const noRotationRows = Array.isArray((sla as any)?.tenants_without_recent_rotation)
      ? ((sla as any).tenants_without_recent_rotation as any[])
      : [];
    const noRotation = noRotationRows.find((row) => String(row?.tenant_id ?? "") === args.tenant_id) ?? null;
    if (staleForTenant.length > 0 || noRotation) {
      out.push({
        event_type: "key_rotation_sla_failed",
        tenant_id: args.tenant_id,
        severity: staleForTenant.length > 0 ? "critical" : "warning",
        summary:
          staleForTenant.length > 0
            ? `tenant ${args.tenant_id} has ${staleForTenant.length} stale active key(s)`
            : `tenant ${args.tenant_id} has no recent key rotation in configured window`,
        payload: {
          thresholds: (sla as any)?.thresholds ?? null,
          stale_count_for_tenant: staleForTenant.length,
          stale_sample_for_tenant: staleForTenant.slice(0, 50),
          tenant_without_recent_rotation: noRotation,
        },
      });
    }
  }

  if (args.event_types.has("key_usage_anomaly")) {
    const usage = await getTenantApiKeyUsageReport(db, {
      tenant_id: args.tenant_id,
      window_hours: args.key_usage_window_hours,
      baseline_hours: args.key_usage_baseline_hours,
      min_requests: args.key_usage_min_requests,
      zscore_threshold: args.key_usage_zscore_threshold,
      limit: 500,
      offset: 0,
      retention_hours: env.CONTROL_TELEMETRY_RETENTION_HOURS,
    });
    const items = Array.isArray((usage as any)?.items) ? ((usage as any).items as any[]) : [];
    const anomalies = items.filter((item) => !!item?.anomaly?.is_anomaly);
    if (anomalies.length > 0) {
      out.push({
        event_type: "key_usage_anomaly",
        tenant_id: args.tenant_id,
        severity: "warning",
        summary: `tenant ${args.tenant_id} has ${anomalies.length} key-usage anomaly signal(s)`,
        payload: {
          retention: (usage as any)?.retention ?? null,
          filters: (usage as any)?.filters ?? null,
          anomalies_count: anomalies.length,
          anomalies_sample: anomalies.slice(0, 100),
        },
      });
    }
  }

  return out;
}

function signedHeaders(secret: string, body: string): Record<string, string> {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return {
    "x-aionis-signature-ts": ts,
    "x-aionis-signature": sig,
  };
}

async function postJson(args: {
  url: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  secret?: string | null;
  timeout_ms: number;
}): Promise<{ ok: boolean; code: number | null; body: string; error: string | null }> {
  const raw = JSON.stringify(args.body);
  const h: Record<string, string> = {
    "content-type": "application/json",
    ...(args.headers ?? {}),
  };
  if (args.secret) {
    Object.assign(h, signedHeaders(args.secret, raw));
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), args.timeout_ms);
  try {
    const res = await fetch(args.url, {
      method: "POST",
      headers: h,
      body: raw,
      signal: ctl.signal,
    });
    const text = await res.text();
    return { ok: res.ok, code: res.status, body: text.slice(0, 2000), error: null };
  } catch (err: any) {
    return { ok: false, code: null, body: "", error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function deliverEvent(args: {
  route: any;
  event: RoutedEvent;
  timeout_ms: number;
  dry_run: boolean;
}): Promise<{ status: "sent" | "failed" | "skipped"; code: number | null; body: string; error: string | null }> {
  const route = args.route;
  const event = args.event;
  const channel = String(route?.channel ?? "");
  const target = typeof route?.target === "string" ? route.target.trim() : "";
  const secret = typeof route?.secret === "string" ? route.secret.trim() : "";
  const headers =
    route?.headers && typeof route.headers === "object" && !Array.isArray(route.headers)
      ? (route.headers as Record<string, string>)
      : {};

  if (args.dry_run) {
    return { status: "skipped", code: null, body: "", error: "dry_run" };
  }

  if (channel === "pagerduty_events") {
    const routingKey = secret;
    if (!routingKey) {
      return { status: "failed", code: null, body: "", error: "pagerduty routing key (secret) is required" };
    }
    const payload = {
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: `${event.tenant_id}:${event.event_type}`,
      payload: {
        summary: event.summary,
        source: "aionis-hosted-alert-dispatch",
        severity: event.severity,
        custom_details: event.payload,
      },
    };
    const res = await postJson({
      url: target || "https://events.pagerduty.com/v2/enqueue",
      body: payload,
      timeout_ms: args.timeout_ms,
    });
    return {
      status: res.ok ? "sent" : "failed",
      code: res.code,
      body: res.body,
      error: res.error,
    };
  }

  if (!target) {
    return { status: "failed", code: null, body: "", error: "target is required for webhook channel" };
  }

  const payload = {
    event_type: event.event_type,
    tenant_id: event.tenant_id,
    severity: event.severity,
    summary: event.summary,
    payload: event.payload,
    sent_at: new Date().toISOString(),
    route: {
      id: route.id,
      channel,
      label: route.label ?? null,
    },
  };
  const res = await postJson({
    url: target,
    body: payload,
    headers,
    secret: secret || null,
    timeout_ms: args.timeout_ms,
  });
  return {
    status: res.ok ? "sent" : "failed",
    code: res.code,
    body: res.body,
    error: res.error,
  };
}

async function main() {
  const tenantId = (argValue("--tenant-id") ?? env.MEMORY_TENANT_ID).trim();
  if (!tenantId) throw new Error("--tenant-id is required");
  const eventTypes = asEventTypeSet(argValue("--event-types"));
  const routeLimit = clampInt(Number(argValue("--route-limit") ?? "50"), 1, 200);
  const timeoutMs = clampInt(Number(argValue("--timeout-ms") ?? "8000"), 1000, 60000);
  const dryRun = hasFlag("--dry-run");
  const strict = hasFlag("--strict");
  const outFileArg = argValue("--out");

  const keySlaMaxAge = clampInt(Number(argValue("--key-sla-max-age-days") ?? "30"), 1, 3650);
  const keySlaWarnAge = clampInt(Number(argValue("--key-sla-warn-age-days") ?? "21"), 1, keySlaMaxAge);
  const keySlaWindow = clampInt(Number(argValue("--key-sla-rotation-window-days") ?? "30"), 1, 3650);
  const keyUsageWindow = clampInt(Number(argValue("--key-usage-window-hours") ?? "24"), 1, 24 * 365);
  const keyUsageBaseline = clampInt(Number(argValue("--key-usage-baseline-hours") ?? "168"), keyUsageWindow + 1, 24 * 365);
  const keyUsageMinReq = clampInt(Number(argValue("--key-usage-min-requests") ?? "30"), 1, 1_000_000);
  const keyUsageZscore = Math.max(0.5, Math.min(100, Number(argValue("--key-usage-zscore-threshold") ?? "3")));

  const events = await collectEvents({
    tenant_id: tenantId,
    event_types: eventTypes,
    key_sla_max_age_days: keySlaMaxAge,
    key_sla_warn_age_days: keySlaWarnAge,
    key_sla_rotation_window_days: keySlaWindow,
    key_usage_window_hours: keyUsageWindow,
    key_usage_baseline_hours: keyUsageBaseline,
    key_usage_min_requests: keyUsageMinReq,
    key_usage_zscore_threshold: keyUsageZscore,
  });

  const deliveries: any[] = [];
  for (const event of events) {
    const routes = await listActiveAlertRoutesForEvent(db, {
      tenant_id: tenantId,
      event_type: event.event_type,
      limit: routeLimit,
    });
    if (routes.length === 0) {
      deliveries.push({
        event_type: event.event_type,
        route_id: null,
        status: "skipped",
        reason: "no_active_route",
      });
      continue;
    }
    for (const route of routes) {
      const d = await deliverEvent({ route, event, timeout_ms: timeoutMs, dry_run: dryRun });
      await recordControlAlertDelivery(db, {
        route_id: String(route.id),
        tenant_id: tenantId,
        event_type: event.event_type,
        status: d.status,
        response_code: d.code,
        response_body: d.body,
        error: d.error,
        metadata: {
          dry_run: dryRun,
          channel: route.channel,
        },
      });
      deliveries.push({
        event_type: event.event_type,
        route_id: route.id,
        channel: route.channel,
        status: d.status,
        response_code: d.code,
        error: d.error,
      });
    }
  }

  const summary = {
    ok: deliveries.every((d) => d.status !== "failed"),
    strict,
    dry_run: dryRun,
    checked_at: new Date().toISOString(),
    tenant_id: tenantId,
    event_types: Array.from(eventTypes),
    events_detected: events.map((e) => ({ event_type: e.event_type, summary: e.summary, severity: e.severity })),
    delivery: {
      sent: deliveries.filter((d) => d.status === "sent").length,
      failed: deliveries.filter((d) => d.status === "failed").length,
      skipped: deliveries.filter((d) => d.status === "skipped").length,
      total: deliveries.length,
      rows: deliveries,
    },
  };

  if (outFileArg) {
    const outPath = path.resolve(outFileArg);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok && strict) {
    process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db).catch(() => {});
  });
