import { NextResponse } from "next/server";

const BASE_URL = process.env.AIONIS_BASE_URL?.trim() || "http://127.0.0.1:3001";
const ADMIN_TOKEN = process.env.AIONIS_ADMIN_TOKEN?.trim() || process.env.ADMIN_TOKEN?.trim() || "";

function json(status, body) {
  return NextResponse.json(body, { status });
}

function normalizeBool(input, fallback = false) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function sanitizeStatuses(input) {
  if (!Array.isArray(input)) return ["failed", "dead_letter"];
  const out = input
    .map((v) => String(v || "").trim())
    .filter((v) => v === "failed" || v === "dead_letter");
  return out.length > 0 ? out : ["failed", "dead_letter"];
}

function sanitizeAlertChannel(input) {
  const raw = String(input || "").trim();
  if (raw === "slack_webhook" || raw === "pagerduty_events") return raw;
  return "webhook";
}

function sanitizeAlertEvents(input) {
  if (!Array.isArray(input)) return ["*"];
  const out = input
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return out.length > 0 ? out : ["*"];
}

function dangerousActionsEnabled() {
  return normalizeBool(process.env.OPS_DANGEROUS_ACTIONS_ENABLED, false);
}

function blockDangerousAction(reason) {
  return json(403, {
    error: "dangerous_actions_disabled",
    message: "Set OPS_DANGEROUS_ACTIONS_ENABLED=true to enable this operation",
    reason
  });
}

function withOpsMeta(data, requestId) {
  const rid = String(requestId || "").trim();
  if (!rid) return data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const ops = data.__ops && typeof data.__ops === "object" ? data.__ops : {};
    return {
      ...data,
      __ops: {
        ...ops,
        request_id: rid
      }
    };
  }
  return {
    data,
    __ops: {
      request_id: rid
    }
  };
}

async function forward(path, method, payload) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-admin-token": ADMIN_TOKEN
    },
    body: payload == null ? undefined : JSON.stringify(payload),
    cache: "no-store"
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  const requestId = response.headers.get("x-request-id") || "";
  return { status: response.status, ok: response.ok, data, requestId };
}

export async function POST(request) {
  if (!ADMIN_TOKEN) {
    return json(500, {
      error: "admin_token_missing",
      message: "AIONIS_ADMIN_TOKEN (or ADMIN_TOKEN) is required"
    });
  }

  const body = await request.json().catch(() => null);
  const op = String(body?.op || "").trim();
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

  try {
    if (op === "alert_route_create") {
      const tenantId = String(payload.tenant_id || "").trim();
      const channel = sanitizeAlertChannel(payload.channel);
      const target = String(payload.target || "").trim();
      if (!tenantId || !target) {
        return json(400, { error: "invalid_request", message: "tenant_id and target are required" });
      }
      const out = await forward("/v1/admin/control/alerts/routes", "POST", {
        tenant_id: tenantId,
        channel,
        target,
        label: payload.label == null ? null : String(payload.label),
        events: sanitizeAlertEvents(payload.events)
      });
      return json(out.status, withOpsMeta(out.data, out.requestId));
    }

    if (op === "incident_replay") {
      const dryRun = payload.dry_run !== false;
      const allowAllTenants = payload.allow_all_tenants === true;
      if (!dangerousActionsEnabled() && (!dryRun || allowAllTenants)) {
        return blockDangerousAction("incident_replay_non_dryrun_or_all_tenants");
      }
      const out = await forward("/v1/admin/control/incident-publish/jobs/replay", "POST", {
        tenant_id: payload.tenant_id == null ? undefined : String(payload.tenant_id || "").trim() || undefined,
        statuses: sanitizeStatuses(payload.statuses),
        limit: Math.max(1, Math.min(200, Number(payload.limit) || 50)),
        reset_attempts: payload.reset_attempts !== false,
        dry_run: dryRun,
        allow_all_tenants: allowAllTenants,
        reason: String(payload.reason || "ops_console")
      });
      return json(out.status, withOpsMeta(out.data, out.requestId));
    }

    if (op === "tenant_quota_upsert") {
      const tenantId = String(payload.tenant_id || "").trim();
      if (!tenantId) {
        return json(400, { error: "invalid_request", message: "tenant_id is required" });
      }
      const num = (key, fallback = 0) => {
        const raw = Number(payload[key]);
        return Number.isFinite(raw) ? raw : fallback;
      };
      const int = (key, fallback = 0) => Math.max(0, Math.trunc(num(key, fallback)));

      const out = await forward(`/v1/admin/control/tenant-quotas/${encodeURIComponent(tenantId)}`, "PUT", {
        recall_rps: num("recall_rps", 100),
        recall_burst: int("recall_burst", 200),
        write_rps: num("write_rps", 80),
        write_burst: int("write_burst", 120),
        write_max_wait_ms: int("write_max_wait_ms", 100),
        debug_embed_rps: num("debug_embed_rps", 5),
        debug_embed_burst: int("debug_embed_burst", 10),
        recall_text_embed_rps: num("recall_text_embed_rps", 30),
        recall_text_embed_burst: int("recall_text_embed_burst", 60),
        recall_text_embed_max_wait_ms: int("recall_text_embed_max_wait_ms", 200)
      });
      return json(out.status, withOpsMeta(out.data, out.requestId));
    }

    if (op === "tenant_quota_delete") {
      if (!dangerousActionsEnabled()) {
        return blockDangerousAction("tenant_quota_delete");
      }
      const tenantId = String(payload.tenant_id || "").trim();
      if (!tenantId) {
        return json(400, { error: "invalid_request", message: "tenant_id is required" });
      }
      const out = await forward(`/v1/admin/control/tenant-quotas/${encodeURIComponent(tenantId)}`, "DELETE", undefined);
      return json(out.status, withOpsMeta(out.data, out.requestId));
    }

    return json(400, { error: "unsupported_operation", op });
  } catch (error) {
    return json(500, {
      error: "control_execute_failed",
      message: error instanceof Error ? error.message : "unknown_error"
    });
  }
}
