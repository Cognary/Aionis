export function normalizeIp(input) {
  let raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("[")) {
    const idx = raw.indexOf("]");
    raw = idx > 0 ? raw.slice(1, idx) : raw;
  }
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  if (raw.includes(".") && raw.includes(":")) {
    raw = raw.split(":")[0];
  }
  return raw;
}

export function parseIpv4Int(input) {
  const ip = normalizeIp(input);
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

export function isIpv4InCidr(ip, cidr) {
  const [baseRaw, prefixRaw] = String(cidr || "").split("/");
  const base = parseIpv4Int(baseRaw);
  const ipInt = parseIpv4Int(ip);
  const prefix = Number(prefixRaw);
  if (base == null || ipInt == null) return false;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (base & mask) === (ipInt & mask);
}

export function readClientIp(request) {
  const rip = normalizeIp(request.ip);
  if (!rip) return "";
  return rip;
}

export function readIpAllowlist() {
  const raw = String(process.env.OPS_IP_ALLOWLIST ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => normalizeIp(v))
    .filter(Boolean);
}

export function readTrustedProxyCidrs() {
  const raw = String(process.env.OPS_TRUSTED_PROXY_CIDRS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => normalizeIp(v))
    .filter(Boolean);
}

export function ipAllowed(ip, allowlist) {
  if (!ip) return false;
  for (const entry of allowlist) {
    if (!entry) continue;
    if (entry.includes("/")) {
      if (isIpv4InCidr(ip, entry)) return true;
      continue;
    }
    if (normalizeIp(entry) === normalizeIp(ip)) return true;
  }
  return false;
}

export function isTrustedProxy(remoteIp, trustedProxyCidrs) {
  return ipAllowed(remoteIp, trustedProxyCidrs);
}

export function readForwardedClientIp(request) {
  const xff = String(request.headers.get("x-forwarded-for") ?? "").trim();
  if (xff) {
    const first = xff.split(",")[0];
    const ip = normalizeIp(first);
    if (ip) return ip;
  }
  const xri = normalizeIp(request.headers.get("x-real-ip"));
  if (xri) return xri;
  return "";
}

export function resolveClientIp(request, trustedProxyCidrs) {
  const remoteIp = readClientIp(request);
  if (!remoteIp) return "";
  if (isTrustedProxy(remoteIp, trustedProxyCidrs)) {
    const forwardedIp = readForwardedClientIp(request);
    if (forwardedIp) return forwardedIp;
  }
  return remoteIp;
}

export function validateProxyConfig() {
  const nodeEnv = String(process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv !== "production") return null;
  const ipAllowlist = readIpAllowlist();
  if (ipAllowlist.length === 0) return null;
  const trustedProxyCidrs = readTrustedProxyCidrs();
  if (trustedProxyCidrs.length > 0) return null;
  return "Ops middleware misconfigured: NODE_ENV=production with OPS_IP_ALLOWLIST requires OPS_TRUSTED_PROXY_CIDRS.";
}
