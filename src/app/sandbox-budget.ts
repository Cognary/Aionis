import type { Db } from "../db.js";
import type { Env } from "../config.js";
import { assertEmbeddingSurfaceForbidden } from "../embeddings/surface-policy.js";
import { HttpError } from "../util/http.js";
import { sanitizeBudgetCap, type SandboxTenantBudgetPolicy } from "./runtime-services.js";

type ResolvedSandboxTenantBudget = {
  policy: SandboxTenantBudgetPolicy;
  scope_filter: string | null;
  project_filter: string | null;
  source:
    | "db_project_exact"
    | "db_project_default"
    | "db_project_global_scope"
    | "db_project_global_default"
    | "db_exact"
    | "db_tenant_default"
    | "db_global_scope"
    | "db_global_default"
    | "env_tenant_default"
    | "env_global_default";
};

export function normalizeSandboxBudgetScope(scopeRaw: string | null | undefined): string {
  const scope = String(scopeRaw ?? "").trim();
  return scope.length > 0 ? scope : "*";
}

function normalizeSandboxBudgetProject(projectRaw: string | null | undefined): string {
  const projectId = String(projectRaw ?? "").trim();
  return projectId.length > 0 ? projectId : "*";
}

function nullableBudgetCap(v: number | null | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function normalizePaginationInt(
  value: unknown,
  field: "limit" | "offset",
  fallback: number,
  bounds: { min: number; max: number },
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, "invalid_request", `${field} must be a finite number`);
  }
  return Math.max(bounds.min, Math.min(bounds.max, Math.trunc(n)));
}

export function createSandboxBudgetService(args: {
  env: Env;
  db: Db;
  sandboxTenantBudgetPolicy: Map<string, SandboxTenantBudgetPolicy>;
}) {
  const { env, db, sandboxTenantBudgetPolicy } = args;

  const listSandboxBudgetProfiles = async (input: {
    tenant_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<Record<string, unknown>>> => {
    const tenantId = typeof input.tenant_id === "string" && input.tenant_id.trim().length > 0 ? input.tenant_id.trim() : null;
    const limit = normalizePaginationInt(input.limit, "limit", 100, { min: 1, max: 500 });
    const offset = normalizePaginationInt(input.offset, "offset", 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
    try {
      const out = await db.pool.query(
        `
        SELECT
          tenant_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap,
          updated_at::text AS updated_at
        FROM memory_sandbox_budget_profiles
        WHERE ($1::text IS NULL OR tenant_id = $1)
        ORDER BY tenant_id ASC, scope ASC
        LIMIT $2 OFFSET $3
        `,
        [tenantId, limit, offset],
      );
      return out.rows;
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") return [];
      throw err;
    }
  };

  const getSandboxBudgetProfile = async (tenantIdRaw: string, scopeRaw: string): Promise<Record<string, unknown> | null> => {
    const tenantId = String(tenantIdRaw ?? "").trim();
    const scope = normalizeSandboxBudgetScope(scopeRaw);
    if (!tenantId) return null;
    try {
      const out = await db.pool.query(
        `
        SELECT
          tenant_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap,
          updated_at::text AS updated_at
        FROM memory_sandbox_budget_profiles
        WHERE tenant_id = $1
          AND scope = $2
        LIMIT 1
        `,
        [tenantId, scope],
      );
      return out.rows[0] ?? null;
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") return null;
      throw err;
    }
  };

  const upsertSandboxBudgetProfile = async (input: {
    tenant_id: string;
    scope: string;
    daily_run_cap?: number | null;
    daily_timeout_cap?: number | null;
    daily_failure_cap?: number | null;
  }): Promise<Record<string, unknown>> => {
    const tenantId = String(input.tenant_id ?? "").trim();
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    const scope = normalizeSandboxBudgetScope(input.scope);
    const runCap = nullableBudgetCap(input.daily_run_cap);
    const timeoutCap = nullableBudgetCap(input.daily_timeout_cap);
    const failureCap = nullableBudgetCap(input.daily_failure_cap);
    if (runCap === null && timeoutCap === null && failureCap === null) {
      throw new HttpError(400, "invalid_request", "at least one positive cap is required");
    }
    try {
      const out = await db.pool.query(
        `
        INSERT INTO memory_sandbox_budget_profiles (
          tenant_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, scope)
        DO UPDATE
        SET
          daily_run_cap = EXCLUDED.daily_run_cap,
          daily_timeout_cap = EXCLUDED.daily_timeout_cap,
          daily_failure_cap = EXCLUDED.daily_failure_cap,
          updated_at = now()
        RETURNING
          tenant_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap,
          updated_at::text AS updated_at
        `,
        [tenantId, scope, runCap, timeoutCap, failureCap],
      );
      return out.rows[0] ?? {};
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") {
        throw new HttpError(503, "sandbox_budget_table_missing", "sandbox budget table is unavailable", {
          table: "memory_sandbox_budget_profiles",
        });
      }
      throw err;
    }
  };

  const deleteSandboxBudgetProfile = async (tenantIdRaw: string, scopeRaw: string): Promise<boolean> => {
    const tenantId = String(tenantIdRaw ?? "").trim();
    const scope = normalizeSandboxBudgetScope(scopeRaw);
    if (!tenantId) return false;
    try {
      const out = await db.pool.query(
        `
        DELETE FROM memory_sandbox_budget_profiles
        WHERE tenant_id = $1
          AND scope = $2
        `,
        [tenantId, scope],
      );
      return Number(out.rowCount ?? 0) > 0;
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") return false;
      throw err;
    }
  };

  const listSandboxProjectBudgetProfiles = async (input: {
    tenant_id?: string;
    project_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<Record<string, unknown>>> => {
    const tenantId = typeof input.tenant_id === "string" && input.tenant_id.trim().length > 0 ? input.tenant_id.trim() : null;
    const projectId = typeof input.project_id === "string" && input.project_id.trim().length > 0 ? input.project_id.trim() : null;
    const limit = normalizePaginationInt(input.limit, "limit", 100, { min: 1, max: 500 });
    const offset = normalizePaginationInt(input.offset, "offset", 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
    try {
      const out = await db.pool.query(
        `
        SELECT
          tenant_id,
          project_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap,
          updated_at::text AS updated_at
        FROM memory_sandbox_project_budget_profiles
        WHERE ($1::text IS NULL OR tenant_id = $1)
          AND ($2::text IS NULL OR project_id = $2)
        ORDER BY tenant_id ASC, project_id ASC, scope ASC
        LIMIT $3 OFFSET $4
        `,
        [tenantId, projectId, limit, offset],
      );
      return out.rows;
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") return [];
      throw err;
    }
  };

  const getSandboxProjectBudgetProfile = async (
    tenantIdRaw: string,
    projectIdRaw: string,
    scopeRaw: string,
  ): Promise<Record<string, unknown> | null> => {
    const tenantId = String(tenantIdRaw ?? "").trim();
    const projectId = normalizeSandboxBudgetProject(projectIdRaw);
    const scope = normalizeSandboxBudgetScope(scopeRaw);
    if (!tenantId || !projectId) return null;
    try {
      const out = await db.pool.query(
        `
        SELECT
          tenant_id,
          project_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap,
          updated_at::text AS updated_at
        FROM memory_sandbox_project_budget_profiles
        WHERE tenant_id = $1
          AND project_id = $2
          AND scope = $3
        LIMIT 1
        `,
        [tenantId, projectId, scope],
      );
      return out.rows[0] ?? null;
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") return null;
      throw err;
    }
  };

  const upsertSandboxProjectBudgetProfile = async (input: {
    tenant_id: string;
    project_id: string;
    scope: string;
    daily_run_cap?: number | null;
    daily_timeout_cap?: number | null;
    daily_failure_cap?: number | null;
  }): Promise<Record<string, unknown>> => {
    const tenantId = String(input.tenant_id ?? "").trim();
    const projectId = normalizeSandboxBudgetProject(input.project_id);
    if (!tenantId) throw new HttpError(400, "invalid_request", "tenant_id is required");
    if (!projectId) throw new HttpError(400, "invalid_request", "project_id is required");
    const scope = normalizeSandboxBudgetScope(input.scope);
    const runCap = nullableBudgetCap(input.daily_run_cap);
    const timeoutCap = nullableBudgetCap(input.daily_timeout_cap);
    const failureCap = nullableBudgetCap(input.daily_failure_cap);
    if (runCap === null && timeoutCap === null && failureCap === null) {
      throw new HttpError(400, "invalid_request", "at least one positive cap is required");
    }
    try {
      const out = await db.pool.query(
        `
        INSERT INTO memory_sandbox_project_budget_profiles (
          tenant_id,
          project_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, project_id, scope)
        DO UPDATE
        SET
          daily_run_cap = EXCLUDED.daily_run_cap,
          daily_timeout_cap = EXCLUDED.daily_timeout_cap,
          daily_failure_cap = EXCLUDED.daily_failure_cap,
          updated_at = now()
        RETURNING
          tenant_id,
          project_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap,
          updated_at::text AS updated_at
        `,
        [tenantId, projectId, scope, runCap, timeoutCap, failureCap],
      );
      return out.rows[0] ?? {};
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") {
        throw new HttpError(503, "sandbox_project_budget_table_missing", "sandbox project budget table is unavailable", {
          table: "memory_sandbox_project_budget_profiles",
        });
      }
      throw err;
    }
  };

  const deleteSandboxProjectBudgetProfile = async (
    tenantIdRaw: string,
    projectIdRaw: string,
    scopeRaw: string,
  ): Promise<boolean> => {
    const tenantId = String(tenantIdRaw ?? "").trim();
    const projectId = normalizeSandboxBudgetProject(projectIdRaw);
    const scope = normalizeSandboxBudgetScope(scopeRaw);
    if (!tenantId || !projectId) return false;
    try {
      const out = await db.pool.query(
        `
        DELETE FROM memory_sandbox_project_budget_profiles
        WHERE tenant_id = $1
          AND project_id = $2
          AND scope = $3
        `,
        [tenantId, projectId, scope],
      );
      return Number(out.rowCount ?? 0) > 0;
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") return false;
      throw err;
    }
  };

  const resolveSandboxTenantBudget = async (
    tenantIdRaw: string,
    scopeRaw: string,
    projectIdRaw?: string | null,
  ): Promise<ResolvedSandboxTenantBudget | null> => {
    const tenantId = String(tenantIdRaw ?? "").trim() || env.MEMORY_TENANT_ID;
    const scope = String(scopeRaw ?? "").trim() || env.MEMORY_SCOPE;
    const projectId = String(projectIdRaw ?? "").trim();
    if (projectId) {
      try {
        const out = await db.pool.query<{
          tenant_id: string;
          project_id: string;
          scope: string;
          daily_run_cap: number | null;
          daily_timeout_cap: number | null;
          daily_failure_cap: number | null;
        }>(
          `
          SELECT
            tenant_id,
            project_id,
            scope,
            daily_run_cap,
            daily_timeout_cap,
            daily_failure_cap
          FROM memory_sandbox_project_budget_profiles
          WHERE
            (tenant_id = $1 AND project_id = $2 AND scope = $3)
            OR (tenant_id = $1 AND project_id = $2 AND scope = '*')
            OR (tenant_id = '*' AND project_id = $2 AND scope = $3)
            OR (tenant_id = '*' AND project_id = $2 AND scope = '*')
            OR (tenant_id = $1 AND project_id = '*' AND scope = $3)
            OR (tenant_id = $1 AND project_id = '*' AND scope = '*')
            OR (tenant_id = '*' AND project_id = '*' AND scope = $3)
            OR (tenant_id = '*' AND project_id = '*' AND scope = '*')
          ORDER BY
            CASE
              WHEN tenant_id = $1 AND project_id = $2 AND scope = $3 THEN 1
              WHEN tenant_id = $1 AND project_id = $2 AND scope = '*' THEN 2
              WHEN tenant_id = '*' AND project_id = $2 AND scope = $3 THEN 3
              WHEN tenant_id = '*' AND project_id = $2 AND scope = '*' THEN 4
              WHEN tenant_id = $1 AND project_id = '*' AND scope = $3 THEN 5
              WHEN tenant_id = $1 AND project_id = '*' AND scope = '*' THEN 6
              WHEN tenant_id = '*' AND project_id = '*' AND scope = $3 THEN 7
              ELSE 8
            END
          LIMIT 1
          `,
          [tenantId, projectId, scope],
        );
        const row = out.rows[0] ?? null;
        if (row) {
          return {
            policy: {
              daily_run_cap: sanitizeBudgetCap(row.daily_run_cap),
              daily_timeout_cap: sanitizeBudgetCap(row.daily_timeout_cap),
              daily_failure_cap: sanitizeBudgetCap(row.daily_failure_cap),
            },
            scope_filter: row.scope === "*" ? null : row.scope,
            project_filter: row.project_id === "*" ? null : row.project_id,
            source:
              row.tenant_id === tenantId && row.project_id === projectId && row.scope === scope
                ? "db_project_exact"
                : row.tenant_id === tenantId && row.project_id === projectId && row.scope === "*"
                  ? "db_project_default"
                  : row.tenant_id === "*" && row.project_id === projectId && row.scope === scope
                    ? "db_project_global_scope"
                    : "db_project_global_default",
          };
        }
      } catch (err: any) {
        if (String(err?.code ?? "") !== "42P01") throw err;
      }
    }

    try {
      const out = await db.pool.query<{
        tenant_id: string;
        scope: string;
        daily_run_cap: number | null;
        daily_timeout_cap: number | null;
        daily_failure_cap: number | null;
      }>(
        `
        SELECT
          tenant_id,
          scope,
          daily_run_cap,
          daily_timeout_cap,
          daily_failure_cap
        FROM memory_sandbox_budget_profiles
        WHERE
          (tenant_id = $1 AND scope = $2)
          OR (tenant_id = $1 AND scope = '*')
          OR (tenant_id = '*' AND scope = $2)
          OR (tenant_id = '*' AND scope = '*')
        ORDER BY
          CASE
            WHEN tenant_id = $1 AND scope = $2 THEN 1
            WHEN tenant_id = $1 AND scope = '*' THEN 2
            WHEN tenant_id = '*' AND scope = $2 THEN 3
            ELSE 4
          END
        LIMIT 1
        `,
        [tenantId, scope],
      );
      const row = out.rows[0] ?? null;
      if (row) {
        return {
          policy: {
            daily_run_cap: sanitizeBudgetCap(row.daily_run_cap),
            daily_timeout_cap: sanitizeBudgetCap(row.daily_timeout_cap),
            daily_failure_cap: sanitizeBudgetCap(row.daily_failure_cap),
          },
          scope_filter: row.scope === "*" ? null : row.scope,
          project_filter: null,
          source:
            row.tenant_id === tenantId && row.scope === scope
              ? "db_exact"
              : row.tenant_id === tenantId && row.scope === "*"
                ? "db_tenant_default"
                : row.tenant_id === "*" && row.scope === scope
                  ? "db_global_scope"
                  : "db_global_default",
        };
      }
    } catch (err: any) {
      if (String(err?.code ?? "") !== "42P01") throw err;
    }

    if (sandboxTenantBudgetPolicy.size === 0) return null;
    const tenantPolicy = sandboxTenantBudgetPolicy.get(tenantId);
    if (tenantPolicy) {
      return {
        policy: tenantPolicy,
        scope_filter: null,
        project_filter: null,
        source: "env_tenant_default",
      };
    }
    const globalPolicy = sandboxTenantBudgetPolicy.get("*");
    if (globalPolicy) {
      return {
        policy: globalPolicy,
        scope_filter: null,
        project_filter: null,
        source: "env_global_default",
      };
    }
    return null;
  };

  const enforceSandboxTenantBudget = async (
    reply: any,
    tenantIdRaw: string,
    scopeRaw: string,
    projectIdRaw?: string | null,
  ): Promise<void> => {
    assertEmbeddingSurfaceForbidden("sandbox_budget_gate");
    const resolved = await resolveSandboxTenantBudget(tenantIdRaw, scopeRaw, projectIdRaw);
    if (!resolved) return;

    const tenantId = String(tenantIdRaw ?? "").trim() || env.MEMORY_TENANT_ID;
    const scope = String(scopeRaw ?? "").trim() || env.MEMORY_SCOPE;
    const projectId = String(projectIdRaw ?? "").trim() || null;
    const windowHours = env.SANDBOX_TENANT_BUDGET_WINDOW_HOURS;
    const policy = resolved.policy;
    let usage: { total_runs: number; timeout_runs: number; failed_runs: number };
    try {
      const out = await db.pool.query<{
        total_runs: string;
        timeout_runs: string;
        failed_runs: string;
      }>(
        `
        SELECT
          count(*)::text AS total_runs,
          count(*) FILTER (WHERE status = 'timeout')::text AS timeout_runs,
          count(*) FILTER (WHERE status IN ('failed', 'timeout'))::text AS failed_runs
        FROM memory_sandbox_runs
        WHERE tenant_id = $1
          AND created_at >= now() - make_interval(hours => $2::int)
          AND ($3::text IS NULL OR scope = $3)
          AND ($4::text IS NULL OR project_id = $4)
        `,
        [tenantId, windowHours, resolved.scope_filter, resolved.project_filter],
      );
      usage = {
        total_runs: Number(out.rows[0]?.total_runs ?? "0"),
        timeout_runs: Number(out.rows[0]?.timeout_runs ?? "0"),
        failed_runs: Number(out.rows[0]?.failed_runs ?? "0"),
      };
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01" || String(err?.code ?? "") === "42703") {
        throw new HttpError(503, "sandbox_budget_unavailable", "sandbox budget table is unavailable", {
          tenant_id: tenantId,
          table: "memory_sandbox_runs",
        });
      }
      throw err;
    }

    const raise = (code: string, metric: "total_runs" | "timeout_runs" | "failed_runs", cap: number) => {
      reply.header("retry-after", "60");
      throw new HttpError(429, code, "sandbox tenant budget exceeded; retry later", {
        tenant_id: tenantId,
        project_id: projectId,
        metric,
        used: usage[metric],
        cap,
        window_hours: windowHours,
        scope,
        scope_filter: resolved.scope_filter,
        project_filter: resolved.project_filter,
        policy_source: resolved.source,
      });
    };

    const projectScoped = resolved.source.startsWith("db_project_");
    if (policy.daily_run_cap && usage.total_runs >= policy.daily_run_cap) {
      raise(projectScoped ? "sandbox_project_budget_run_cap_exceeded" : "sandbox_tenant_budget_run_cap_exceeded", "total_runs", policy.daily_run_cap);
    }
    if (policy.daily_timeout_cap && usage.timeout_runs >= policy.daily_timeout_cap) {
      raise(
        projectScoped ? "sandbox_project_budget_timeout_cap_exceeded" : "sandbox_tenant_budget_timeout_cap_exceeded",
        "timeout_runs",
        policy.daily_timeout_cap,
      );
    }
    if (policy.daily_failure_cap && usage.failed_runs >= policy.daily_failure_cap) {
      raise(
        projectScoped ? "sandbox_project_budget_failure_cap_exceeded" : "sandbox_tenant_budget_failure_cap_exceeded",
        "failed_runs",
        policy.daily_failure_cap,
      );
    }
  };

  return {
    listSandboxBudgetProfiles,
    getSandboxBudgetProfile,
    upsertSandboxBudgetProfile,
    deleteSandboxBudgetProfile,
    listSandboxProjectBudgetProfiles,
    getSandboxProjectBudgetProfile,
    upsertSandboxProjectBudgetProfile,
    deleteSandboxProjectBudgetProfile,
    enforceSandboxTenantBudget,
  };
}
