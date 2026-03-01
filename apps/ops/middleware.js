import { NextResponse } from "next/server";

function normalizeBool(input, fallback = false) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function decodeBasicCredentials(value) {
  if (!value || typeof value !== "string") return null;
  if (!value.startsWith("Basic ")) return null;
  const token = value.slice(6).trim();
  if (!token) return null;
  try {
    const decoded = atob(token);
    const idx = decoded.indexOf(":");
    if (idx <= 0) return null;
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    return { user, pass };
  } catch {
    return null;
  }
}

function normalizeIp(input) {
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

function parseIpv4Int(input) {
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

function isIpv4InCidr(ip, cidr) {
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

function readClientIp(request) {
  const xff = String(request.headers.get("x-forwarded-for") ?? "").trim();
  if (xff) {
    const first = xff.split(",")[0];
    const ip = normalizeIp(first);
    if (ip) return ip;
  }
  const xri = normalizeIp(request.headers.get("x-real-ip"));
  if (xri) return xri;
  const rip = normalizeIp(request.ip);
  if (rip) return rip;
  return "";
}

function readIpAllowlist() {
  const raw = String(process.env.OPS_IP_ALLOWLIST ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => normalizeIp(v))
    .filter(Boolean);
}

function ipAllowed(ip, allowlist) {
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

function unauthorizedResponse() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Aionis Ops", charset="UTF-8"'
    }
  });
}

export function middleware(request) {
  const ipAllowlist = readIpAllowlist();
  if (ipAllowlist.length > 0) {
    const clientIp = readClientIp(request);
    if (!ipAllowed(clientIp, ipAllowlist)) {
      return new NextResponse("Forbidden: IP is not in OPS_IP_ALLOWLIST", { status: 403 });
    }
  }

  const username = String(process.env.OPS_BASIC_AUTH_USER ?? "").trim();
  const password = String(process.env.OPS_BASIC_AUTH_PASS ?? "").trim();
  const explicitEnabled = normalizeBool(process.env.OPS_BASIC_AUTH_ENABLED, false);
  const enabled = explicitEnabled || (username.length > 0 && password.length > 0);

  if (!enabled) return NextResponse.next();
  if (!username || !password) {
    return new NextResponse("Ops auth misconfigured: set OPS_BASIC_AUTH_USER and OPS_BASIC_AUTH_PASS", { status: 500 });
  }

  const auth = decodeBasicCredentials(request.headers.get("authorization"));
  if (!auth) return unauthorizedResponse();
  if (auth.user !== username || auth.pass !== password) return unauthorizedResponse();
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
