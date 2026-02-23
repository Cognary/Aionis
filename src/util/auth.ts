import { createHmac, timingSafeEqual } from "node:crypto";

export type AuthMode = "off" | "api_key" | "jwt" | "api_key_or_jwt";

export type AuthPrincipal = {
  tenant_id: string;
  agent_id: string | null;
  team_id: string | null;
  role: string | null;
  source: "api_key" | "jwt";
};

type ApiKeyRecord = {
  tenant_id: string;
  agent_id: string | null;
  team_id: string | null;
  role: string | null;
};

export type AuthResolver = {
  mode: AuthMode;
  required_header_hint: "none" | "x-api-key" | "authorization" | "x-api-key_or_authorization";
  resolve: (headers: Record<string, unknown>) => AuthPrincipal | null;
};

function asTrimmed(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function firstHeader(v: unknown): string | null {
  if (typeof v === "string") return asTrimmed(v);
  if (Array.isArray(v) && v.length > 0) return firstHeader(v[0]);
  return null;
}

function parseApiKeys(rawJson: string): Map<string, ApiKeyRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e: any) {
    throw new Error(`MEMORY_API_KEYS_JSON must be valid JSON: ${String(e?.message ?? e)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MEMORY_API_KEYS_JSON must be a JSON object");
  }

  const out = new Map<string, ApiKeyRecord>();
  for (const [apiKey, value] of Object.entries(parsed as Record<string, unknown>)) {
    const key = apiKey.trim();
    if (!key) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`invalid API key record for key=${key}`);
    }
    const row = value as Record<string, unknown>;
    const tenant = asTrimmed(row.tenant_id);
    if (!tenant) {
      throw new Error(`API key record requires tenant_id: key=${key}`);
    }
    out.set(key, {
      tenant_id: tenant,
      agent_id: asTrimmed(row.agent_id),
      team_id: asTrimmed(row.team_id),
      role: asTrimmed(row.role),
    });
  }
  return out;
}

function decodeBase64Url(input: string): Buffer {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, "base64");
}

function parseJsonBase64Url(input: string): Record<string, unknown> | null {
  try {
    const raw = decodeBase64Url(input).toString("utf8");
    const out = JSON.parse(raw);
    if (!out || typeof out !== "object" || Array.isArray(out)) return null;
    return out as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseBearerToken(headers: Record<string, unknown>): string | null {
  const auth = firstHeader(headers["authorization"]);
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  const tok = m[1].trim();
  return tok.length > 0 ? tok : null;
}

function verifyJwtHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [hB64, pB64, sB64] = parts;
  if (!hB64 || !pB64 || !sB64) return null;

  const header = parseJsonBase64Url(hB64);
  if (!header) return null;
  if (String(header.alg ?? "") !== "HS256") return null;

  const sigGiven = decodeBase64Url(sB64);
  const sigExpected = createHmac("sha256", secret).update(`${hB64}.${pB64}`).digest();
  if (sigGiven.length !== sigExpected.length) return null;
  if (!timingSafeEqual(sigGiven, sigExpected)) return null;

  return parseJsonBase64Url(pB64);
}

function jwtClaimsToPrincipal(payload: Record<string, unknown>): AuthPrincipal | null {
  const tenantId = asTrimmed(payload.tenant_id) ?? asTrimmed(payload.tenant);
  if (!tenantId) return null;
  return {
    tenant_id: tenantId,
    agent_id: asTrimmed(payload.agent_id) ?? asTrimmed(payload.sub),
    team_id: asTrimmed(payload.team_id),
    role: asTrimmed(payload.role),
    source: "jwt",
  };
}

function jwtNotExpired(
  payload: Record<string, unknown>,
  nowSec: number,
  skewSec: number,
  requireExp: boolean,
): boolean {
  const exp = typeof payload.exp === "number" ? payload.exp : Number.NaN;
  if (requireExp && !Number.isFinite(exp)) return false;
  if (Number.isFinite(exp) && nowSec > exp + skewSec) return false;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : Number.NaN;
  if (Number.isFinite(nbf) && nowSec + skewSec < nbf) return false;
  return true;
}

export function createAuthResolver(args: {
  mode: AuthMode;
  apiKeysJson: string;
  jwtHs256Secret?: string;
  jwtClockSkewSec?: number;
  jwtRequireExp?: boolean;
}): AuthResolver {
  const mode = args.mode;
  const apiKeys =
    mode === "api_key" || mode === "api_key_or_jwt" ? parseApiKeys(args.apiKeysJson) : new Map<string, ApiKeyRecord>();
  const jwtSecret = mode === "jwt" || mode === "api_key_or_jwt" ? String(args.jwtHs256Secret ?? "") : "";
  const skewSec = Number.isFinite(args.jwtClockSkewSec) ? Math.max(0, Math.trunc(args.jwtClockSkewSec!)) : 30;
  const jwtRequireExp = args.jwtRequireExp === true;

  const required_header_hint: AuthResolver["required_header_hint"] =
    mode === "off"
      ? "none"
      : mode === "api_key"
        ? "x-api-key"
        : mode === "jwt"
          ? "authorization"
          : "x-api-key_or_authorization";

  return {
    mode,
    required_header_hint,
    resolve: (headers: Record<string, unknown>) => {
      if (mode === "off") return null;

      if (mode === "api_key" || mode === "api_key_or_jwt") {
        const apiKey = firstHeader(headers["x-api-key"]);
        if (apiKey) {
          const rec = apiKeys.get(apiKey);
          if (!rec) return null;
          return {
            tenant_id: rec.tenant_id,
            agent_id: rec.agent_id,
            team_id: rec.team_id,
            role: rec.role,
            source: "api_key",
          };
        }
        if (mode === "api_key") return null;
      }

      if (mode === "jwt" || mode === "api_key_or_jwt") {
        const token = parseBearerToken(headers);
        if (!token) return null;
        if (!jwtSecret) return null;
        const payload = verifyJwtHs256(token, jwtSecret);
        if (!payload) return null;
        const nowSec = Math.floor(Date.now() / 1000);
        if (!jwtNotExpired(payload, nowSec, skewSec, jwtRequireExp)) return null;
        return jwtClaimsToPrincipal(payload);
      }

      return null;
    },
  };
}
