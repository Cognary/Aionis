import { badRequest } from "../util/http.js";

const TENANT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export type TenantScope = {
  tenant_id: string;
  scope: string;
  scope_key: string;
};

export function normalizeTenantId(raw: string | undefined, fallback: string): string {
  const v = (raw ?? fallback).trim();
  if (!v) badRequest("invalid_tenant_id", "tenant_id must be non-empty");
  if (!TENANT_ID_RE.test(v)) {
    badRequest(
      "invalid_tenant_id",
      "tenant_id must match ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$",
      { tenant_id: v },
    );
  }
  return v;
}

export function normalizeScope(raw: string | undefined, fallback: string): string {
  const v = (raw ?? fallback).trim();
  if (!v) badRequest("invalid_scope", "scope must be non-empty");
  return v;
}

export function toTenantScopeKey(scope: string, tenantId: string, defaultTenantId: string): string {
  // Backward compatibility: default tenant uses the legacy scope key directly.
  if (tenantId === defaultTenantId) return scope;
  return `tenant:${tenantId}::scope:${scope}`;
}

export function resolveTenantScope(
  req: { scope?: string; tenant_id?: string },
  defaults: { defaultScope: string; defaultTenantId: string },
): TenantScope {
  const tenant_id = normalizeTenantId(req.tenant_id, defaults.defaultTenantId);
  const scope = normalizeScope(req.scope, defaults.defaultScope);
  const scope_key = toTenantScopeKey(scope, tenant_id, defaults.defaultTenantId);
  return { tenant_id, scope, scope_key };
}
