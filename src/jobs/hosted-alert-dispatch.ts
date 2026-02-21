import "dotenv/config";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import {
  findRecentControlAlertDeliveryByDedupe,
  getTenantApiKeyUsageReport,
  getTenantIncidentPublishSloReport,
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

type AlertSeverity = "warning" | "critical";

type AlertPolicy = {
  severity_thresholds?: Record<string, Record<string, unknown>>;
  quiet_windows?: Array<{
    days?: number[];
    start?: string;
    end?: string;
    timezone?: string;
    mode?: "suppress" | "warning_only";
  }>;
  dedupe?: {
    key?: string;
    ttl_seconds?: number;
  };
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
  const input = (raw ?? "key_rotation_sla_failed,key_usage_anomaly,incident_publish_slo_degraded").trim();
  const out = new Set<string>();
  for (const part of input.split(",")) {
    const p = part.trim();
    if (p) out.add(p);
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true") return true;
    if (t === "false") return false;
  }
  return fallback;
}

function parsePolicy(route: any): AlertPolicy {
  const md = asRecord(route?.metadata);
  const raw = md.policy ?? md.alert_policy ?? {};
  const p = asRecord(raw);
  const out: AlertPolicy = {};
  if (p.severity_thresholds && typeof p.severity_thresholds === "object" && !Array.isArray(p.severity_thresholds)) {
    out.severity_thresholds = p.severity_thresholds as Record<string, Record<string, unknown>>;
  }
  if (Array.isArray(p.quiet_windows)) {
    out.quiet_windows = p.quiet_windows
      .map((x) => asRecord(x))
      .map((x) => {
        const daysRaw = Array.isArray(x.days) ? x.days.map((d) => Number(d)).filter((d) => Number.isFinite(d)) : undefined;
        return {
          days: daysRaw?.map((d) => Math.max(0, Math.min(6, Math.trunc(d)))),
          start: typeof x.start === "string" ? x.start : undefined,
          end: typeof x.end === "string" ? x.end : undefined,
          timezone: typeof x.timezone === "string" ? x.timezone : undefined,
          mode: x.mode === "warning_only" ? "warning_only" : "suppress",
        };
      });
  }
  if (p.dedupe && typeof p.dedupe === "object" && !Array.isArray(p.dedupe)) {
    const d = asRecord(p.dedupe);
    out.dedupe = {
      key: typeof d.key === "string" ? d.key : undefined,
      ttl_seconds: Number.isFinite(Number(d.ttl_seconds)) ? Math.trunc(Number(d.ttl_seconds)) : undefined,
    };
  }
  return out;
}

function severityRank(v: AlertSeverity): number {
  return v === "critical" ? 2 : 1;
}

function maxSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function applySeverityThresholds(event: RoutedEvent, policy: AlertPolicy): RoutedEvent | null {
  const thresholdMap = asRecord(policy.severity_thresholds ?? {});
  const threshold = asRecord(thresholdMap[event.event_type]);
  if (Object.keys(threshold).length === 0) return event;

  if (event.event_type === "key_usage_anomaly") {
    const anomalies = Math.max(0, Math.trunc(asNumber(event.payload.anomalies_count, 0)));
    const criticalAnomalies = Math.max(1, Math.trunc(asNumber(threshold.critical_anomalies, Number.POSITIVE_INFINITY)));
    const warningAnomalies = Math.max(1, Math.trunc(asNumber(threshold.warning_anomalies, 1)));
    if (anomalies >= criticalAnomalies) {
      return { ...event, severity: "critical" };
    }
    if (anomalies >= warningAnomalies) {
      return { ...event, severity: "warning" };
    }
    return null;
  }

  if (event.event_type === "key_rotation_sla_failed") {
    const staleCount = Math.max(0, Math.trunc(asNumber(event.payload.stale_count_for_tenant, 0)));
    const hasNoRecentRotation = !!event.payload.tenant_without_recent_rotation;
    const criticalStale = Math.max(1, Math.trunc(asNumber(threshold.critical_stale_count, 1)));
    const warningStale = Math.max(1, Math.trunc(asNumber(threshold.warning_stale_count, 1)));
    const warningNoRecentRotation = asBool(threshold.warning_no_recent_rotation, true);

    let sev: AlertSeverity | null = null;
    if (staleCount >= criticalStale) sev = "critical";
    else if (staleCount >= warningStale) sev = "warning";
    if (hasNoRecentRotation && warningNoRecentRotation) {
      sev = sev ? maxSeverity(sev, "warning") : "warning";
    }
    if (!sev) return null;
    return { ...event, severity: sev };
  }

  if (event.event_type === "incident_publish_slo_degraded") {
    const warningSignalCount = Math.max(0, Math.trunc(asNumber(event.payload.warning_signal_count, 0)));
    const criticalSignalCount = Math.max(0, Math.trunc(asNumber(event.payload.critical_signal_count, 0)));
    const deadLetterBacklog = Math.max(0, Math.trunc(asNumber(event.payload.dead_letter_backlog, 0)));
    const criticalSignalsThreshold = Math.max(1, Math.trunc(asNumber(threshold.critical_signals, 1)));
    const warningSignalsThreshold = Math.max(1, Math.trunc(asNumber(threshold.warning_signals, 1)));
    const criticalDeadLetterBacklog = Math.max(
      1,
      Math.trunc(asNumber(threshold.critical_dead_letter_backlog, Number.POSITIVE_INFINITY)),
    );

    if (criticalSignalCount >= criticalSignalsThreshold || deadLetterBacklog >= criticalDeadLetterBacklog) {
      return { ...event, severity: "critical" };
    }
    if (warningSignalCount >= warningSignalsThreshold) {
      return { ...event, severity: "warning" };
    }
    return null;
  }

  return event;
}

function parseHmMinutes(raw: string | undefined, fallback: number): number {
  if (!raw || !/^\d{2}:\d{2}$/.test(raw)) return fallback;
  const [hh, mm] = raw.split(":").map((v) => Number(v));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return hh * 60 + mm;
}

function weekdayNum(name: string): number {
  switch (name) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return 0;
  }
}

function zonedWeekdayMinute(now: Date, timezone: string): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = weekdayNum(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return {
    weekday,
    minute: Math.max(0, Math.min(23, Number.isFinite(hour) ? hour : 0)) * 60 + Math.max(0, Math.min(59, Number.isFinite(minute) ? minute : 0)),
  };
}

function inWindow(currentMinute: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return currentMinute >= start && currentMinute < end;
  return currentMinute >= start || currentMinute < end;
}

function applyQuietWindows(
  event: RoutedEvent,
  policy: AlertPolicy,
  now: Date,
): { event: RoutedEvent | null; quiet_hit: boolean; quiet_mode: string | null } {
  const windows = Array.isArray(policy.quiet_windows) ? policy.quiet_windows : [];
  if (windows.length === 0) return { event, quiet_hit: false, quiet_mode: null };

  let current = event;
  for (const w of windows) {
    const timezone = w.timezone && w.timezone.trim().length > 0 ? w.timezone.trim() : "UTC";
    const startMin = parseHmMinutes(w.start, 0);
    const endMin = parseHmMinutes(w.end, 24 * 60);
    const days = Array.isArray(w.days) && w.days.length > 0 ? w.days : [0, 1, 2, 3, 4, 5, 6];
    const mode = w.mode === "warning_only" ? "warning_only" : "suppress";
    let zoned: { weekday: number; minute: number };
    try {
      zoned = zonedWeekdayMinute(now, timezone);
    } catch {
      zoned = zonedWeekdayMinute(now, "UTC");
    }
    if (!days.includes(zoned.weekday)) continue;
    if (!inWindow(zoned.minute, startMin, endMin)) continue;
    if (mode === "suppress") {
      return { event: null, quiet_hit: true, quiet_mode: "suppress" };
    }
    if (mode === "warning_only" && current.severity === "critical") {
      current = { ...current, severity: "warning" };
    }
    return { event: current, quiet_hit: true, quiet_mode: mode };
  }
  return { event: current, quiet_hit: false, quiet_mode: null };
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (_m, k) => vars[k] ?? "");
}

function dedupeConfig(
  policy: AlertPolicy,
  args: { route_id: string; channel: string; tenant_id: string; event_type: string; severity: AlertSeverity },
): { dedupe_key: string; ttl_seconds: number } {
  const dedupe = asRecord(policy.dedupe ?? {});
  const template =
    typeof dedupe.key === "string" && dedupe.key.trim().length > 0
      ? dedupe.key
      : "{{tenant_id}}:{{event_type}}:{{severity}}:{{route_id}}";
  const ttlSeconds = Math.max(60, Math.min(7 * 24 * 3600, Math.trunc(asNumber(dedupe.ttl_seconds, 1800))));
  const dedupeKey = renderTemplate(template, {
    tenant_id: args.tenant_id,
    event_type: args.event_type,
    severity: args.severity,
    channel: args.channel,
    route_id: args.route_id,
  });
  return {
    dedupe_key: dedupeKey,
    ttl_seconds: ttlSeconds,
  };
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
  incident_slo_window_hours: number;
  incident_slo_baseline_hours: number;
  incident_slo_min_jobs: number;
  incident_slo_adaptive_multiplier: number;
  incident_slo_failure_rate_floor: number;
  incident_slo_dead_letter_rate_floor: number;
  incident_slo_backlog_warning_abs: number;
  incident_slo_dead_letter_backlog_warning_abs: number;
  incident_slo_dead_letter_backlog_critical_abs: number;
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

  if (args.event_types.has("incident_publish_slo_degraded")) {
    const slo = await getTenantIncidentPublishSloReport(db, {
      tenant_id: args.tenant_id,
      window_hours: args.incident_slo_window_hours,
      baseline_hours: args.incident_slo_baseline_hours,
      min_jobs: args.incident_slo_min_jobs,
      adaptive_multiplier: args.incident_slo_adaptive_multiplier,
      failure_rate_floor: args.incident_slo_failure_rate_floor,
      dead_letter_rate_floor: args.incident_slo_dead_letter_rate_floor,
      backlog_warning_abs: args.incident_slo_backlog_warning_abs,
      dead_letter_backlog_warning_abs: args.incident_slo_dead_letter_backlog_warning_abs,
      dead_letter_backlog_critical_abs: args.incident_slo_dead_letter_backlog_critical_abs,
    });
    if ((slo as any)?.degraded) {
      const warningSignals = Array.isArray((slo as any)?.warning_signals) ? ((slo as any).warning_signals as string[]) : [];
      const criticalSignals = Array.isArray((slo as any)?.critical_signals)
        ? ((slo as any).critical_signals as string[])
        : [];
      const severity = (slo as any)?.severity === "critical" ? "critical" : "warning";
      out.push({
        event_type: "incident_publish_slo_degraded",
        tenant_id: args.tenant_id,
        severity,
        summary: `tenant ${args.tenant_id} incident publish SLO degraded (${warningSignals.length} warning / ${criticalSignals.length} critical signal(s))`,
        payload: {
          degraded: true,
          severity,
          warning_signal_count: warningSignals.length,
          critical_signal_count: criticalSignals.length,
          warning_signals: warningSignals,
          critical_signals: criticalSignals,
          dead_letter_backlog: Number((slo as any)?.metrics?.backlog?.dead_letter_backlog ?? 0),
          open_backlog: Number((slo as any)?.metrics?.backlog?.open_backlog ?? 0),
          current: (slo as any)?.metrics?.current ?? null,
          baseline: (slo as any)?.metrics?.baseline ?? null,
          thresholds: (slo as any)?.thresholds ?? null,
          snapshot: (slo as any)?.snapshot ?? null,
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
  dedupe_key: string;
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
      dedup_key: args.dedupe_key,
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
  const incidentSloWindow = clampInt(Number(argValue("--incident-slo-window-hours") ?? "24"), 1, 24 * 365);
  const incidentSloBaseline = clampInt(
    Number(argValue("--incident-slo-baseline-hours") ?? "168"),
    incidentSloWindow + 1,
    24 * 365,
  );
  const incidentSloMinJobs = clampInt(Number(argValue("--incident-slo-min-jobs") ?? "20"), 1, 1_000_000);
  const incidentSloAdaptiveMultiplier = Math.max(
    1,
    Math.min(20, Number(argValue("--incident-slo-adaptive-multiplier") ?? "2")),
  );
  const incidentSloFailureRateFloor = Math.max(0, Math.min(1, Number(argValue("--incident-slo-failure-rate-floor") ?? "0.05")));
  const incidentSloDeadLetterRateFloor = Math.max(
    0,
    Math.min(1, Number(argValue("--incident-slo-dead-letter-rate-floor") ?? "0.02")),
  );
  const incidentSloBacklogWarningAbs = clampInt(Number(argValue("--incident-slo-backlog-warning-abs") ?? "200"), 1, 1_000_000);
  const incidentSloDeadLetterBacklogWarningAbs = clampInt(
    Number(argValue("--incident-slo-dead-letter-backlog-warning-abs") ?? "20"),
    1,
    1_000_000,
  );
  const incidentSloDeadLetterBacklogCriticalAbs = clampInt(
    Number(argValue("--incident-slo-dead-letter-backlog-critical-abs") ?? "50"),
    incidentSloDeadLetterBacklogWarningAbs,
    1_000_000,
  );

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
    incident_slo_window_hours: incidentSloWindow,
    incident_slo_baseline_hours: incidentSloBaseline,
    incident_slo_min_jobs: incidentSloMinJobs,
    incident_slo_adaptive_multiplier: incidentSloAdaptiveMultiplier,
    incident_slo_failure_rate_floor: incidentSloFailureRateFloor,
    incident_slo_dead_letter_rate_floor: incidentSloDeadLetterRateFloor,
    incident_slo_backlog_warning_abs: incidentSloBacklogWarningAbs,
    incident_slo_dead_letter_backlog_warning_abs: incidentSloDeadLetterBacklogWarningAbs,
    incident_slo_dead_letter_backlog_critical_abs: incidentSloDeadLetterBacklogCriticalAbs,
  });

  const now = new Date();
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
      const routeId = String(route.id);
      const channel = String(route.channel ?? "");
      const policy = parsePolicy(route);

      const thresholded = applySeverityThresholds(event, policy);
      if (!thresholded) {
        await recordControlAlertDelivery(db, {
          route_id: routeId,
          tenant_id: tenantId,
          event_type: event.event_type,
          status: "skipped",
          error: "below_route_threshold",
          metadata: {
            dry_run: dryRun,
            channel,
            policy_applied: true,
            reason: "severity_threshold",
          },
        });
        deliveries.push({
          event_type: event.event_type,
          route_id: routeId,
          channel,
          status: "skipped",
          reason: "below_route_threshold",
        });
        continue;
      }

      const quietRes = applyQuietWindows(thresholded, policy, now);
      if (!quietRes.event) {
        await recordControlAlertDelivery(db, {
          route_id: routeId,
          tenant_id: tenantId,
          event_type: event.event_type,
          status: "skipped",
          error: "quiet_window_suppressed",
          metadata: {
            dry_run: dryRun,
            channel,
            policy_applied: true,
            reason: "quiet_window",
            quiet_mode: quietRes.quiet_mode,
          },
        });
        deliveries.push({
          event_type: event.event_type,
          route_id: routeId,
          channel,
          status: "skipped",
          reason: "quiet_window_suppressed",
        });
        continue;
      }

      const effectiveEvent = quietRes.event;
      const dedupe = dedupeConfig(policy, {
        route_id: routeId,
        channel,
        tenant_id: tenantId,
        event_type: effectiveEvent.event_type,
        severity: effectiveEvent.severity,
      });
      const dedupeHit = await findRecentControlAlertDeliveryByDedupe(db, {
        route_id: routeId,
        dedupe_key: dedupe.dedupe_key,
        ttl_seconds: dedupe.ttl_seconds,
      });
      if (dedupeHit) {
        await recordControlAlertDelivery(db, {
          route_id: routeId,
          tenant_id: tenantId,
          event_type: event.event_type,
          status: "skipped",
          error: "dedupe_hit",
          metadata: {
            dry_run: dryRun,
            channel,
            policy_applied: true,
            dedupe_key: dedupe.dedupe_key,
            dedupe_ttl_seconds: dedupe.ttl_seconds,
            dedupe_last_delivery_at: dedupeHit.created_at ?? null,
          },
        });
        deliveries.push({
          event_type: event.event_type,
          route_id: routeId,
          channel,
          status: "skipped",
          reason: "dedupe_hit",
        });
        continue;
      }

      const d = await deliverEvent({
        route,
        event: effectiveEvent,
        dedupe_key: dedupe.dedupe_key,
        timeout_ms: timeoutMs,
        dry_run: dryRun,
      });
      await recordControlAlertDelivery(db, {
        route_id: routeId,
        tenant_id: tenantId,
        event_type: event.event_type,
        status: d.status,
        response_code: d.code,
        response_body: d.body,
        error: d.error,
        metadata: {
          dry_run: dryRun,
          channel,
          policy_applied: true,
          quiet_window_hit: quietRes.quiet_hit,
          quiet_mode: quietRes.quiet_mode,
          severity_input: event.severity,
          severity_output: effectiveEvent.severity,
          dedupe_key: dedupe.dedupe_key,
          dedupe_ttl_seconds: dedupe.ttl_seconds,
        },
      });
      deliveries.push({
        event_type: event.event_type,
        route_id: routeId,
        channel,
        status: d.status,
        severity: effectiveEvent.severity,
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
