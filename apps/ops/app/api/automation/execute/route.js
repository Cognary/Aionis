import { NextResponse } from "next/server";

const BASE_URL = process.env.AIONIS_BASE_URL?.trim() || "http://127.0.0.1:3001";

function json(status, body) {
  return NextResponse.json(body, { status });
}

function normalizeBearer(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}

function resolveMemoryHeaders() {
  const apiKey =
    process.env.AIONIS_API_KEY?.trim() ||
    process.env.API_KEY?.trim() ||
    process.env.PERF_API_KEY?.trim() ||
    "";
  const bearer = normalizeBearer(
    process.env.AIONIS_AUTH_BEARER?.trim() ||
    process.env.AUTH_BEARER?.trim() ||
    process.env.PERF_AUTH_BEARER?.trim() ||
    "",
  );
  const headers = {
    "content-type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  if (bearer) headers.authorization = bearer;
  return {
    headers,
    hasApiKey: Boolean(apiKey),
    hasBearer: Boolean(bearer),
  };
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
        request_id: rid,
      },
    };
  }
  return {
    data,
    __ops: {
      request_id: rid,
    },
  };
}

async function forward(path, payload) {
  const memory = resolveMemoryHeaders();
  if (!memory.hasApiKey && !memory.hasBearer) {
    return {
      status: 500,
      ok: false,
      data: {
        error: "memory_auth_missing",
        message: "AIONIS_API_KEY or AIONIS_AUTH_BEARER is required",
      },
      requestId: "",
    };
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: memory.headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return {
    status: response.status,
    ok: response.ok,
    data,
    requestId: response.headers.get("x-request-id") || "",
  };
}

function normalizedText(input, max = 1000) {
  return String(input || "").trim().slice(0, max);
}

function buildPayload(payload) {
  const tenantId = normalizedText(payload?.tenant_id, 128);
  const scope = normalizedText(payload?.scope, 256);
  const runId = normalizedText(payload?.run_id, 128);
  const actor = normalizedText(payload?.actor, 256);
  const reason = normalizedText(payload?.reason, 1000);
  return {
    tenant_id: tenantId || undefined,
    scope: scope || undefined,
    run_id: runId,
    actor: actor || undefined,
    reason: reason || undefined,
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const op = normalizedText(body?.op, 128);
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

  try {
    if (
      op !== "automation_assign_reviewer" &&
      op !== "automation_promote" &&
      op !== "automation_shadow_review" &&
      op !== "automation_shadow_validate" &&
      op !== "automation_shadow_validate_dispatch" &&
      op !== "automation_run_assign_reviewer" &&
      op !== "automation_run_resume" &&
      op !== "automation_run_cancel" &&
      op !== "automation_run_approve_repair" &&
      op !== "automation_run_reject_repair" &&
      op !== "automation_run_compensation_retry" &&
      op !== "automation_run_compensation_assign" &&
      op !== "automation_run_compensation_record_action"
    ) {
      return json(400, { error: "unsupported_operation", op });
    }

    const pathByOp = {
      automation_assign_reviewer: "/v1/automations/assign_reviewer",
      automation_promote: "/v1/automations/promote",
      automation_shadow_review: "/v1/automations/shadow/review",
      automation_shadow_validate: "/v1/automations/shadow/validate",
      automation_shadow_validate_dispatch: "/v1/automations/shadow/validate/dispatch",
      automation_run_assign_reviewer: "/v1/automations/runs/assign_reviewer",
      automation_run_resume: "/v1/automations/runs/resume",
      automation_run_cancel: "/v1/automations/runs/cancel",
      automation_run_approve_repair: "/v1/automations/runs/approve_repair",
      automation_run_reject_repair: "/v1/automations/runs/reject_repair",
      automation_run_compensation_retry: "/v1/automations/runs/compensation/retry",
      automation_run_compensation_assign: "/v1/automations/runs/compensation/assign",
      automation_run_compensation_record_action: "/v1/automations/runs/compensation/record_action",
    };
    let requestPayload;
    if (op === "automation_promote") {
      const tenantId = normalizedText(payload?.tenant_id, 128);
      const scope = normalizedText(payload?.scope, 256);
      const automationId = normalizedText(payload?.automation_id, 128);
      const actor = normalizedText(payload?.actor, 256);
      const note = normalizedText(payload?.note, 1000);
      const targetStatus = normalizedText(payload?.target_status, 32);
      if (!automationId || !targetStatus) {
        return json(400, { error: "invalid_request", message: "automation_id and target_status are required" });
      }
      requestPayload = {
        tenant_id: tenantId || undefined,
        scope: scope || undefined,
        automation_id: automationId,
        actor: actor || undefined,
        target_status: targetStatus,
        note: note || undefined,
      };
    } else if (op === "automation_shadow_review") {
      const tenantId = normalizedText(payload?.tenant_id, 128);
      const scope = normalizedText(payload?.scope, 256);
      const automationId = normalizedText(payload?.automation_id, 128);
      const actor = normalizedText(payload?.actor, 256);
      const verdict = normalizedText(payload?.verdict, 32);
      const note = normalizedText(payload?.note, 1000);
      const shadowVersion = Number(payload?.shadow_version);
      if (!automationId || !verdict) {
        return json(400, { error: "invalid_request", message: "automation_id and verdict are required" });
      }
      requestPayload = {
        tenant_id: tenantId || undefined,
        scope: scope || undefined,
        automation_id: automationId,
        actor: actor || undefined,
        verdict,
        note: note || undefined,
        shadow_version: Number.isInteger(shadowVersion) && shadowVersion > 0 ? shadowVersion : undefined,
      };
    } else if (op === "automation_shadow_validate") {
      const tenantId = normalizedText(payload?.tenant_id, 128);
      const scope = normalizedText(payload?.scope, 256);
      const automationId = normalizedText(payload?.automation_id, 128);
      const actor = normalizedText(payload?.actor, 256);
      const mode = normalizedText(payload?.mode, 16);
      const note = normalizedText(payload?.note, 1000);
      const shadowVersion = Number(payload?.shadow_version);
      if (!automationId) {
        return json(400, { error: "invalid_request", message: "automation_id is required" });
      }
      requestPayload = {
        tenant_id: tenantId || undefined,
        scope: scope || undefined,
        automation_id: automationId,
        actor: actor || undefined,
        mode: mode || undefined,
        note: note || undefined,
        shadow_version: Number.isInteger(shadowVersion) && shadowVersion > 0 ? shadowVersion : undefined,
      };
    } else if (op === "automation_shadow_validate_dispatch") {
      const tenantId = normalizedText(payload?.tenant_id, 128);
      const scope = normalizedText(payload?.scope, 256);
      const automationId = normalizedText(payload?.automation_id, 128);
      const actor = normalizedText(payload?.actor, 256);
      const limit = Number(payload?.limit);
      requestPayload = {
        tenant_id: tenantId || undefined,
        scope: scope || undefined,
        automation_id: automationId || undefined,
        actor: actor || undefined,
        limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
        dry_run: payload?.dry_run === true,
      };
    } else if (op === "automation_assign_reviewer") {
      const tenantId = normalizedText(payload?.tenant_id, 128);
      const scope = normalizedText(payload?.scope, 256);
      const automationId = normalizedText(payload?.automation_id, 128);
      const actor = normalizedText(payload?.actor, 256);
      const reviewer = normalizedText(payload?.reviewer, 256);
      const note = normalizedText(payload?.note, 1000);
      if (!automationId || !reviewer) {
        return json(400, { error: "invalid_request", message: "automation_id and reviewer are required" });
      }
      requestPayload = {
        tenant_id: tenantId || undefined,
        scope: scope || undefined,
        automation_id: automationId,
        actor: actor || undefined,
        reviewer,
        note: note || undefined,
      };
    } else if (op === "automation_run_assign_reviewer") {
      const basePayload = buildPayload(payload);
      const reviewer = normalizedText(payload?.reviewer, 256);
      if (!basePayload.run_id || !reviewer) {
        return json(400, { error: "invalid_request", message: "run_id and reviewer are required" });
      }
      requestPayload = {
        ...basePayload,
        reviewer,
        note: basePayload.reason,
      };
      delete requestPayload.reason;
    } else if (op === "automation_run_compensation_record_action") {
      const basePayload = buildPayload(payload);
      const action = normalizedText(payload?.action, 64);
      const externalRef = normalizedText(payload?.external_ref, 512);
      if (!basePayload.run_id || !action) {
        return json(400, { error: "invalid_request", message: "run_id and action are required" });
      }
      requestPayload = {
        tenant_id: basePayload.tenant_id,
        scope: basePayload.scope,
        run_id: basePayload.run_id,
        actor: basePayload.actor,
        action,
        note: basePayload.reason,
        external_ref: externalRef || undefined,
      };
    } else if (op === "automation_run_compensation_assign") {
      const basePayload = buildPayload(payload);
      const owner = normalizedText(payload?.owner, 256);
      const escalationOwner = normalizedText(payload?.escalation_owner, 256);
      const slaTargetAt = normalizedText(payload?.sla_target_at, 64);
      if (!basePayload.run_id) {
        return json(400, { error: "invalid_request", message: "run_id is required" });
      }
      requestPayload = {
        tenant_id: basePayload.tenant_id,
        scope: basePayload.scope,
        run_id: basePayload.run_id,
        actor: basePayload.actor,
        owner: owner || undefined,
        escalation_owner: escalationOwner || undefined,
        sla_target_at: slaTargetAt || undefined,
        note: basePayload.reason,
      };
    } else {
      const basePayload = buildPayload(payload);
      if (!basePayload.run_id) {
        return json(400, { error: "invalid_request", message: "run_id is required" });
      }
      requestPayload = basePayload;
    }

    const out = await forward(pathByOp[op], requestPayload);
    return json(out.status, withOpsMeta(out.data, out.requestId));
  } catch (error) {
    return json(500, {
      error: "automation_execute_failed",
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
