const DEFAULT_BASE_URL = "http://127.0.0.1:3001";

export const siteConfig = {
  name: "Aionis Ops",
  title: "Aionis Ops | Control & Observability Console",
  description: "Control and observability console for Aionis admin/control APIs.",
  docsUrl: "https://doc.aionisos.com",
  websiteUrl: "https://aionisos.com",
  apiContractUrl: "https://doc.aionisos.com/API_CONTRACT"
};

function firstValue(input) {
  if (Array.isArray(input)) return input[0];
  return input;
}

function normalizeText(input, fallback = "") {
  const v = String(firstValue(input) ?? "").trim();
  return v.length > 0 ? v : fallback;
}

function normalizeInt(input, fallback, min, max) {
  const raw = Number(firstValue(input));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

function normalizeBool(input, fallback = false) {
  const raw = String(firstValue(input) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

export function readDashboardQuery(searchParams) {
  const tenantId = normalizeText(searchParams?.tenant_id, "default");
  const scope = normalizeText(searchParams?.scope, "");
  const windowMinutes = normalizeInt(searchParams?.window_minutes, 60, 5, 1440);
  const windowHours = normalizeInt(searchParams?.window_hours, 168, 1, 24 * 30);
  const endpoint = normalizeText(searchParams?.endpoint, "");
  const endpointFilter = endpoint === "write" || endpoint === "recall" || endpoint === "recall_text" ? endpoint : "";

  return {
    tenantId,
    scope,
    windowMinutes,
    windowHours,
    endpointFilter
  };
}

export function readAuditQuery(searchParams) {
  return {
    tenantId: normalizeText(searchParams?.tenant_id, "default"),
    action: normalizeText(searchParams?.action, ""),
    limit: normalizeInt(searchParams?.limit, 100, 1, 500),
    offset: normalizeInt(searchParams?.offset, 0, 0, 100000),
    writeOnly: normalizeBool(searchParams?.write_only, true),
    focusRequestId: normalizeText(searchParams?.focus_request_id, ""),
    focusLatest: normalizeBool(searchParams?.focus_latest, false)
  };
}

export function readGovernanceQuery(searchParams) {
  return {
    tenantId: normalizeText(searchParams?.tenant_id, "default"),
    scope: normalizeText(searchParams?.scope, ""),
    windowHours: normalizeInt(searchParams?.window_hours, 168, 1, 24 * 30),
    decisionId: normalizeText(searchParams?.decision_id, ""),
    auditLimit: normalizeInt(searchParams?.audit_limit, 100, 10, 500)
  };
}

export function withQuery(path, query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s.length > 0 ? `${path}?${s}` : path;
}

function parseMaybeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function normalizeBearer(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  return /^Bearer\s+/i.test(v) ? v : `Bearer ${v}`;
}

function resolveMemoryAuthHeaders() {
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
  const headers = {};
  if (apiKey) headers["x-api-key"] = apiKey;
  if (bearer) headers.authorization = bearer;
  return {
    headers,
    hasApiKey: Boolean(apiKey),
    hasBearer: Boolean(bearer)
  };
}

async function requestOps(path, { method = "GET", body, admin = false, memoryAuth = false } = {}) {
  const baseUrl = process.env.AIONIS_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const adminToken = process.env.AIONIS_ADMIN_TOKEN?.trim() || process.env.ADMIN_TOKEN?.trim() || "";
  const memoryAuthState = resolveMemoryAuthHeaders();

  if (admin && !adminToken) {
    return {
      ok: false,
      status: 0,
      skipped: true,
      path,
      baseUrl,
      error: "missing_admin_token"
    };
  }

  const headers = {
    accept: "application/json"
  };
  if (admin) headers["x-admin-token"] = adminToken;
  if (memoryAuth) Object.assign(headers, memoryAuthState.headers);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store"
    });
    const text = await response.text();
    const data = parseMaybeJson(text);

    return {
      ok: response.ok,
      status: response.status,
      skipped: false,
      path,
      baseUrl,
      data,
      auth: memoryAuth
        ? {
            has_api_key: memoryAuthState.hasApiKey,
            has_bearer: memoryAuthState.hasBearer
          }
        : undefined,
      error: response.ok ? null : data?.error || `http_${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      skipped: false,
      path,
      baseUrl,
      auth: memoryAuth
        ? {
            has_api_key: memoryAuthState.hasApiKey,
            has_bearer: memoryAuthState.hasBearer
          }
        : undefined,
      error: error instanceof Error ? error.message : "network_error"
    };
  }
}

export async function fetchOps(path, { admin = false } = {}) {
  return requestOps(path, { method: "GET", admin, memoryAuth: false });
}

export async function postOps(path, body, { admin = false, memoryAuth = false } = {}) {
  return requestOps(path, { method: "POST", body, admin, memoryAuth });
}

export function formatNumber(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPct(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

export function formatMs(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n)} ms`;
}

export function formatIso(input) {
  const t = String(input ?? "").trim();
  if (!t) return "-";
  return t.replace("T", " ").replace("Z", " UTC");
}
