function trimTrailingSlashes(input) {
  return String(input || "").replace(/\/+$/, "");
}

function normalizeHost(input) {
  let raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("[") && raw.endsWith("]") && raw.length > 2) {
    raw = raw.slice(1, -1);
  }
  return raw;
}

function isLoopbackHost(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  return host === "127.0.0.1" || host.startsWith("127.");
}

export function normalizePlaygroundBaseUrl(input, label = "base_url") {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new Error(`${label} must be a non-empty absolute http(s) URL`);
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid absolute http(s) URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not include username/password`);
  }
  if (url.search || url.hash) {
    throw new Error(`${label} must not include query or fragment`);
  }

  return trimTrailingSlashes(url.toString());
}

export function parseAllowedBaseUrlsEnv(raw, label = "allowed base URLs") {
  const input = String(raw || "").trim();
  if (!input) return [];

  let entries;
  if (input.startsWith("[")) {
    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new Error(`${label} must be a JSON array or comma-separated list of absolute URLs`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON array or comma-separated list of absolute URLs`);
    }
    entries = parsed;
  } else {
    entries = input.split(/[\n,]+/);
  }

  const out = [];
  const seen = new Set();
  for (const entry of entries) {
    const normalized = normalizePlaygroundBaseUrl(entry, label);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function resolvePlaygroundBaseUrl(
  input,
  {
    defaultBaseUrl,
    allowedBaseUrlsEnv = "",
    allowedBaseUrlsEnvName = "PLAYGROUND_ALLOWED_BASE_URLS",
    label = "base_url",
    allowLoopbackInDev = true,
  },
) {
  const normalizedDefault = normalizePlaygroundBaseUrl(defaultBaseUrl, `${label} default`);
  const normalizedRequested = String(input || "").trim()
    ? normalizePlaygroundBaseUrl(input, label)
    : normalizedDefault;

  const allowed = new Set([
    normalizedDefault,
    ...parseAllowedBaseUrlsEnv(allowedBaseUrlsEnv, allowedBaseUrlsEnvName),
  ]);

  if (allowed.has(normalizedRequested)) return normalizedRequested;

  const hostname = new URL(normalizedRequested).hostname;
  if (allowLoopbackInDev && process.env.NODE_ENV !== "production" && isLoopbackHost(hostname)) {
    return normalizedRequested;
  }

  throw new Error(
    `${label} is not allowed; add the exact base URL to ${allowedBaseUrlsEnvName} or use the configured default`,
  );
}

export const PLAYGROUND_EXECUTE_ALLOWED_BASE_URLS_ENV = "PLAYGROUND_EXECUTE_ALLOWED_BASE_URLS";
export const PLAYGROUND_CHAT_ALLOWED_BASE_URLS_ENV = "PLAYGROUND_CHAT_ALLOWED_BASE_URLS";
