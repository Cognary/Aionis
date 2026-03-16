export function normalizeIp(input: unknown): string {
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

export function parseIpv4Int(input: string): number | null {
  const ip = normalizeIp(input);
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

export function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [baseRaw, prefixRaw] = String(cidr ?? "").split("/");
  const base = parseIpv4Int(baseRaw);
  const ipInt = parseIpv4Int(ip);
  const prefix = Number(prefixRaw);
  if (base == null || ipInt == null) return false;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (base & mask) === (ipInt & mask);
}

export function parseTrustedProxyCidrs(raw: string): string[] {
  return String(raw ?? "")
    .split(",")
    .map((value) => normalizeIp(value))
    .filter(Boolean);
}

export function ipAllowed(ip: string, allowlist: string[]): boolean {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp) return false;
  for (const entryRaw of allowlist) {
    const entry = normalizeIp(entryRaw);
    if (!entry) continue;
    if (entry.includes("/")) {
      if (isIpv4InCidr(normalizedIp, entry)) return true;
      continue;
    }
    if (entry === normalizedIp) return true;
  }
  return false;
}

export function forwardedClientIp(headers: Record<string, unknown>): string {
  const xff = headers["x-forwarded-for"];
  const xffValue =
    typeof xff === "string"
      ? xff
      : Array.isArray(xff) && typeof xff[0] === "string"
        ? xff[0]
        : "";
  if (xffValue.trim().length > 0) {
    const first = xffValue.split(",")[0];
    const ip = normalizeIp(first);
    if (ip) return ip;
  }
  const xri = headers["x-real-ip"];
  const xriValue =
    typeof xri === "string"
      ? xri
      : Array.isArray(xri) && typeof xri[0] === "string"
        ? xri[0]
        : "";
  return normalizeIp(xriValue);
}

export function resolveTrustedClientIp(input: {
  remoteAddress: string | undefined;
  headers: Record<string, unknown>;
  trustedProxyCidrs: string[];
}): string {
  const remoteIp = normalizeIp(input.remoteAddress);
  if (!remoteIp) return "";
  if (ipAllowed(remoteIp, input.trustedProxyCidrs)) {
    const forwarded = forwardedClientIp(input.headers);
    if (forwarded) return forwarded;
  }
  return remoteIp;
}
