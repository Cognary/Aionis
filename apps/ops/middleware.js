import { NextResponse } from "next/server";

import { ipAllowed, readIpAllowlist, readTrustedProxyCidrs, resolveClientIp, validateProxyConfig } from "./app/lib/ip-guard.mjs";

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

const proxyConfigError = validateProxyConfig();
if (proxyConfigError) {
  throw new Error(proxyConfigError);
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
    const trustedProxyCidrs = readTrustedProxyCidrs();
    const clientIp = resolveClientIp(request, trustedProxyCidrs);
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
