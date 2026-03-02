import { NextResponse } from "next/server";
import { OPERATION_MAP } from "@/app/lib/operations";

const DEFAULT_BASE_URL = "http://127.0.0.1:3001";
const TIMEOUT_MS = 30_000;

function json(status, body) {
  return NextResponse.json(body, { status });
}

function normalizeBaseUrl(input) {
  const raw = String(input || "").trim();
  return raw ? raw.replace(/\/+$/, "") : DEFAULT_BASE_URL;
}

function normalizeBearer(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return /^bearer\s+/i.test(raw) ? raw : `Bearer ${raw}`;
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const opKey = String(body?.operation || "").trim();
  const payload = body?.payload;
  const connection = body?.connection && typeof body.connection === "object" ? body.connection : {};

  if (!opKey || !OPERATION_MAP[opKey]) {
    return json(400, {
      ok: false,
      error: "unsupported_operation",
      message: "operation is required and must be one of the supported playground operations"
    });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, {
      ok: false,
      error: "invalid_payload",
      message: "payload must be a JSON object"
    });
  }

  const op = OPERATION_MAP[opKey];
  const baseUrl = normalizeBaseUrl(connection.base_url);
  const apiKey = String(connection.api_key || "").trim();
  const bearer = normalizeBearer(connection.bearer_token);
  const adminToken = String(connection.admin_token || "").trim();

  const headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  if (bearer) headers.authorization = bearer;
  if (adminToken) headers["x-admin-token"] = adminToken;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${op.path}`, {
      method: op.method,
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal
    });

    const text = await response.text();
    const data = parseJsonSafe(text);
    const durationMs = Date.now() - startedAt;
    const requestId = response.headers.get("x-request-id") || "";

    return json(200, {
      ok: response.ok,
      status: response.status,
      operation: opKey,
      method: op.method,
      path: op.path,
      base_url: baseUrl,
      request_id: requestId,
      duration_ms: durationMs,
      auth_used: {
        has_api_key: Boolean(apiKey),
        has_bearer: Boolean(bearer),
        has_admin_token: Boolean(adminToken)
      },
      data,
      error: response.ok ? null : data?.error || `http_${response.status}`
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const aborted = error instanceof Error && error.name === "AbortError";
    return json(200, {
      ok: false,
      status: 0,
      operation: opKey,
      method: op.method,
      path: op.path,
      base_url: baseUrl,
      request_id: "",
      duration_ms: durationMs,
      auth_used: {
        has_api_key: Boolean(apiKey),
        has_bearer: Boolean(bearer),
        has_admin_token: Boolean(adminToken)
      },
      data: null,
      error: aborted ? "request_timeout" : error instanceof Error ? error.message : "network_error"
    });
  } finally {
    clearTimeout(timeout);
  }
}
