export function ensure(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function envString(name, fallback = "") {
  const raw = process.env[name];
  if (typeof raw !== "string") return fallback;
  return raw.trim();
}

export function buildAuthHeaders({ includeAdmin = false, requireAdmin = false } = {}) {
  const apiKey = envString("API_KEY") || envString("PERF_API_KEY");
  const authBearer = envString("AUTH_BEARER") || envString("PERF_AUTH_BEARER");
  const adminToken = envString("ADMIN_TOKEN");

  if (requireAdmin) {
    ensure(Boolean(adminToken), "probe-common: ADMIN_TOKEN is required");
  }

  const headers = { "content-type": "application/json" };
  if (includeAdmin && adminToken) {
    headers["x-admin-token"] = adminToken;
  }
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  if (authBearer) {
    headers.authorization = `Bearer ${authBearer}`;
  }
  return headers;
}

export async function getJson(baseUrl, path, headers, label) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(`${label}: ${path} must return JSON`);
  }
  return { status: res.status, body };
}

export async function postJson(baseUrl, path, payload, headers, label) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(`${label}: ${path} must return JSON`);
  }
  return { status: res.status, body };
}

export function parseTriState(raw) {
  const normalized = String(raw || "auto")
    .trim()
    .toLowerCase();
  if (normalized === "true") return "true";
  if (normalized === "false") return "false";
  return "auto";
}
