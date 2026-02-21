import { randomBytes } from "node:crypto";
import type { Db } from "./db.js";
import { withClient } from "./db.js";
import { sha256Hex } from "./util/crypto.js";
import { TokenBucketLimiter } from "./util/ratelimit.js";

export type ApiKeyPrincipal = {
  tenant_id: string;
  agent_id: string | null;
  team_id: string | null;
  role: string | null;
};

export type ControlTenantInput = {
  tenant_id: string;
  display_name?: string | null;
  status?: "active" | "suspended";
  metadata?: Record<string, unknown>;
};

export type ControlProjectInput = {
  project_id: string;
  tenant_id: string;
  display_name?: string | null;
  status?: "active" | "archived";
  metadata?: Record<string, unknown>;
};

export type ControlApiKeyInput = {
  tenant_id: string;
  project_id?: string | null;
  label?: string | null;
  role?: string | null;
  agent_id?: string | null;
  team_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type TenantQuotaProfile = {
  tenant_id: string;
  recall_rps: number;
  recall_burst: number;
  write_rps: number;
  write_burst: number;
  write_max_wait_ms: number;
  debug_embed_rps: number;
  debug_embed_burst: number;
  recall_text_embed_rps: number;
  recall_text_embed_burst: number;
  recall_text_embed_max_wait_ms: number;
  updated_at: string;
};

type TenantQuotaDefaults = Omit<TenantQuotaProfile, "tenant_id" | "updated_at">;

type QuotaKind = "recall" | "write" | "debug_embeddings" | "recall_text_embed";

type QuotaLimit = {
  rps: number;
  burst: number;
  max_wait_ms: number;
};

type TenantQuotaResolved = Record<QuotaKind, QuotaLimit>;

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function asJson(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function f64(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function i32(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

export async function upsertControlTenant(db: Db, input: ControlTenantInput) {
  const tenantId = trimOrNull(input.tenant_id);
  if (!tenantId) throw new Error("tenant_id is required");
  const displayName = trimOrNull(input.display_name);
  const status = input.status ?? "active";
  const metadata = asJson(input.metadata);
  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      INSERT INTO control_tenants (tenant_id, display_name, status, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata
      RETURNING tenant_id, display_name, status, metadata, created_at, updated_at
      `,
      [tenantId, displayName, status, JSON.stringify(metadata)],
    );
    return q.rows[0];
  });
}

export async function listControlTenants(
  db: Db,
  opts: { status?: "active" | "suspended"; limit?: number; offset?: number } = {},
) {
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(500, Math.trunc(opts.limit!))) : 100;
  const offset = Number.isFinite(opts.offset) ? Math.max(0, Math.trunc(opts.offset!)) : 0;
  const status = opts.status ?? null;
  return await withClient(db, async (client) => {
    if (status) {
      const q = await client.query(
        `
        SELECT tenant_id, display_name, status, metadata, created_at, updated_at
        FROM control_tenants
        WHERE status = $1
        ORDER BY tenant_id ASC
        LIMIT $2 OFFSET $3
        `,
        [status, limit, offset],
      );
      return q.rows;
    }
    const q = await client.query(
      `
      SELECT tenant_id, display_name, status, metadata, created_at, updated_at
      FROM control_tenants
      ORDER BY tenant_id ASC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    );
    return q.rows;
  });
}

export async function upsertControlProject(db: Db, input: ControlProjectInput) {
  const projectId = trimOrNull(input.project_id);
  const tenantId = trimOrNull(input.tenant_id);
  if (!projectId) throw new Error("project_id is required");
  if (!tenantId) throw new Error("tenant_id is required");
  const displayName = trimOrNull(input.display_name);
  const status = input.status ?? "active";
  const metadata = asJson(input.metadata);
  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      INSERT INTO control_projects (project_id, tenant_id, display_name, status, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (project_id)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata
      RETURNING project_id, tenant_id, display_name, status, metadata, created_at, updated_at
      `,
      [projectId, tenantId, displayName, status, JSON.stringify(metadata)],
    );
    return q.rows[0];
  });
}

function generateApiKey(): string {
  const secret = randomBytes(24).toString("base64url");
  return `ak_live_${secret}`;
}

export async function createControlApiKey(db: Db, input: ControlApiKeyInput) {
  const tenantId = trimOrNull(input.tenant_id);
  if (!tenantId) throw new Error("tenant_id is required");
  const projectId = trimOrNull(input.project_id);
  const label = trimOrNull(input.label);
  const role = trimOrNull(input.role);
  const agentId = trimOrNull(input.agent_id);
  const teamId = trimOrNull(input.team_id);
  const metadata = asJson(input.metadata);

  const apiKey = generateApiKey();
  const keyHash = sha256Hex(apiKey);
  const keyPrefix = apiKey.slice(0, 14);

  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      INSERT INTO control_api_keys (tenant_id, project_id, label, role, agent_id, team_id, key_hash, key_prefix, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING id, tenant_id, project_id, label, role, agent_id, team_id, key_prefix, status, metadata, created_at, revoked_at
      `,
      [tenantId, projectId, label, role, agentId, teamId, keyHash, keyPrefix, JSON.stringify(metadata)],
    );
    return { ...q.rows[0], api_key: apiKey };
  });
}

export async function listControlApiKeys(
  db: Db,
  opts: {
    tenant_id?: string;
    project_id?: string;
    status?: "active" | "revoked";
    limit?: number;
    offset?: number;
  } = {},
) {
  const tenantId = trimOrNull(opts.tenant_id);
  const projectId = trimOrNull(opts.project_id);
  const status = opts.status ?? null;
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(500, Math.trunc(opts.limit!))) : 100;
  const offset = Number.isFinite(opts.offset) ? Math.max(0, Math.trunc(opts.offset!)) : 0;

  const where: string[] = [];
  const args: unknown[] = [];
  if (tenantId) {
    args.push(tenantId);
    where.push(`tenant_id = $${args.length}`);
  }
  if (projectId) {
    args.push(projectId);
    where.push(`project_id = $${args.length}`);
  }
  if (status) {
    args.push(status);
    where.push(`status = $${args.length}`);
  }
  args.push(limit);
  args.push(offset);
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      SELECT id, tenant_id, project_id, label, role, agent_id, team_id, key_prefix, status, metadata, created_at, revoked_at
      FROM control_api_keys
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}
      `,
      args,
    );
    return q.rows;
  });
}

export async function revokeControlApiKey(db: Db, id: string) {
  const keyId = trimOrNull(id);
  if (!keyId) throw new Error("id is required");
  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      UPDATE control_api_keys
      SET status = 'revoked', revoked_at = now()
      WHERE id = $1
      RETURNING id, tenant_id, project_id, label, role, agent_id, team_id, key_prefix, status, metadata, created_at, revoked_at
      `,
      [keyId],
    );
    return q.rows[0] ?? null;
  });
}

export function createApiKeyPrincipalResolver(db: Db, opts?: { ttl_ms?: number; negative_ttl_ms?: number }) {
  const ttlMs = Math.max(5_000, Math.trunc(opts?.ttl_ms ?? 60_000));
  const negativeTtlMs = Math.max(1_000, Math.trunc(opts?.negative_ttl_ms ?? 10_000));
  const cache = new Map<string, { expires_at: number; principal: ApiKeyPrincipal | null }>();

  return async (rawApiKey: string): Promise<ApiKeyPrincipal | null> => {
    const key = trimOrNull(rawApiKey);
    if (!key) return null;
    const hash = sha256Hex(key);
    const now = Date.now();
    const cached = cache.get(hash);
    if (cached && cached.expires_at > now) return cached.principal;

    try {
      const row = await withClient(db, async (client) => {
        const q = await client.query(
          `
          SELECT k.tenant_id, k.agent_id, k.team_id, k.role
          FROM control_api_keys k
          JOIN control_tenants t ON t.tenant_id = k.tenant_id
          WHERE k.key_hash = $1
            AND k.status = 'active'
            AND t.status = 'active'
          LIMIT 1
          `,
          [hash],
        );
        return q.rows[0] ?? null;
      });
      const principal: ApiKeyPrincipal | null = row
        ? {
            tenant_id: String(row.tenant_id),
            agent_id: trimOrNull(row.agent_id),
            team_id: trimOrNull(row.team_id),
            role: trimOrNull(row.role),
          }
        : null;
      cache.set(hash, { expires_at: now + (principal ? ttlMs : negativeTtlMs), principal });
      return principal;
    } catch (err: any) {
      // table missing during migration rollout should not block existing env key auth.
      if (String(err?.code ?? "") === "42P01") return null;
      throw err;
    }
  };
}

export async function upsertTenantQuotaProfile(
  db: Db,
  tenantIdRaw: string,
  values: Omit<TenantQuotaProfile, "tenant_id" | "updated_at">,
) {
  const tenantId = trimOrNull(tenantIdRaw);
  if (!tenantId) throw new Error("tenant_id is required");
  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      INSERT INTO control_tenant_quotas (
        tenant_id,
        recall_rps, recall_burst,
        write_rps, write_burst, write_max_wait_ms,
        debug_embed_rps, debug_embed_burst,
        recall_text_embed_rps, recall_text_embed_burst, recall_text_embed_max_wait_ms
      )
      VALUES (
        $1,
        $2, $3,
        $4, $5, $6,
        $7, $8,
        $9, $10, $11
      )
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        recall_rps = EXCLUDED.recall_rps,
        recall_burst = EXCLUDED.recall_burst,
        write_rps = EXCLUDED.write_rps,
        write_burst = EXCLUDED.write_burst,
        write_max_wait_ms = EXCLUDED.write_max_wait_ms,
        debug_embed_rps = EXCLUDED.debug_embed_rps,
        debug_embed_burst = EXCLUDED.debug_embed_burst,
        recall_text_embed_rps = EXCLUDED.recall_text_embed_rps,
        recall_text_embed_burst = EXCLUDED.recall_text_embed_burst,
        recall_text_embed_max_wait_ms = EXCLUDED.recall_text_embed_max_wait_ms
      RETURNING *
      `,
      [
        tenantId,
        values.recall_rps,
        values.recall_burst,
        values.write_rps,
        values.write_burst,
        values.write_max_wait_ms,
        values.debug_embed_rps,
        values.debug_embed_burst,
        values.recall_text_embed_rps,
        values.recall_text_embed_burst,
        values.recall_text_embed_max_wait_ms,
      ],
    );
    return q.rows[0] as TenantQuotaProfile;
  });
}

export async function getTenantQuotaProfile(db: Db, tenantIdRaw: string): Promise<TenantQuotaProfile | null> {
  const tenantId = trimOrNull(tenantIdRaw);
  if (!tenantId) return null;
  return await withClient(db, async (client) => {
    const q = await client.query("SELECT * FROM control_tenant_quotas WHERE tenant_id = $1 LIMIT 1", [tenantId]);
    return (q.rows[0] as TenantQuotaProfile | undefined) ?? null;
  });
}

export async function deleteTenantQuotaProfile(db: Db, tenantIdRaw: string): Promise<boolean> {
  const tenantId = trimOrNull(tenantIdRaw);
  if (!tenantId) return false;
  return await withClient(db, async (client) => {
    const q = await client.query("DELETE FROM control_tenant_quotas WHERE tenant_id = $1", [tenantId]);
    return (q.rowCount ?? 0) > 0;
  });
}

export function createTenantQuotaResolver(db: Db, args: { defaults: TenantQuotaDefaults; cache_ttl_ms?: number }) {
  const defaults = args.defaults;
  const cacheTtlMs = Math.max(1_000, Math.trunc(args.cache_ttl_ms ?? 30_000));
  const cache = new Map<string, { expires_at: number; profile: TenantQuotaProfile | null }>();
  const limiterByConfig = new Map<string, TokenBucketLimiter>();

  const toResolved = (profile: TenantQuotaProfile | null): TenantQuotaResolved => {
    if (!profile) {
      return {
        recall: { rps: defaults.recall_rps, burst: defaults.recall_burst, max_wait_ms: 0 },
        write: { rps: defaults.write_rps, burst: defaults.write_burst, max_wait_ms: defaults.write_max_wait_ms },
        debug_embeddings: { rps: defaults.debug_embed_rps, burst: defaults.debug_embed_burst, max_wait_ms: 0 },
        recall_text_embed: {
          rps: defaults.recall_text_embed_rps,
          burst: defaults.recall_text_embed_burst,
          max_wait_ms: defaults.recall_text_embed_max_wait_ms,
        },
      };
    }
    return {
      recall: { rps: f64(profile.recall_rps, defaults.recall_rps), burst: i32(profile.recall_burst, defaults.recall_burst), max_wait_ms: 0 },
      write: {
        rps: f64(profile.write_rps, defaults.write_rps),
        burst: i32(profile.write_burst, defaults.write_burst),
        max_wait_ms: i32(profile.write_max_wait_ms, defaults.write_max_wait_ms),
      },
      debug_embeddings: {
        rps: f64(profile.debug_embed_rps, defaults.debug_embed_rps),
        burst: i32(profile.debug_embed_burst, defaults.debug_embed_burst),
        max_wait_ms: 0,
      },
      recall_text_embed: {
        rps: f64(profile.recall_text_embed_rps, defaults.recall_text_embed_rps),
        burst: i32(profile.recall_text_embed_burst, defaults.recall_text_embed_burst),
        max_wait_ms: i32(profile.recall_text_embed_max_wait_ms, defaults.recall_text_embed_max_wait_ms),
      },
    };
  };

  const fetchProfile = async (tenantId: string): Promise<TenantQuotaProfile | null> => {
    const now = Date.now();
    const cached = cache.get(tenantId);
    if (cached && cached.expires_at > now) return cached.profile;
    try {
      const profile = await getTenantQuotaProfile(db, tenantId);
      cache.set(tenantId, { expires_at: now + cacheTtlMs, profile });
      return profile;
    } catch (err: any) {
      if (String(err?.code ?? "") === "42P01") {
        cache.set(tenantId, { expires_at: now + cacheTtlMs, profile: null });
        return null;
      }
      throw err;
    }
  };

  const getLimiter = (tenantId: string, kind: QuotaKind, cfg: QuotaLimit) => {
    const key = `${tenantId}:${kind}:${cfg.rps}:${cfg.burst}`;
    let lim = limiterByConfig.get(key);
    if (!lim) {
      lim = new TokenBucketLimiter({
        rate_per_sec: cfg.rps,
        burst: cfg.burst,
        ttl_ms: 10 * 60 * 1000,
        sweep_every_n: 300,
      });
      limiterByConfig.set(key, lim);
      if (limiterByConfig.size > 10_000) limiterByConfig.clear();
    }
    return lim;
  };

  const invalidate = (tenantId?: string) => {
    if (tenantId) cache.delete(tenantId);
    else cache.clear();
  };

  return {
    async resolve(tenantIdRaw: string): Promise<TenantQuotaResolved> {
      const tenantId = trimOrNull(tenantIdRaw) ?? "default";
      return toResolved(await fetchProfile(tenantId));
    },
    limiterFor(tenantIdRaw: string, kind: QuotaKind, cfg: QuotaLimit) {
      const tenantId = trimOrNull(tenantIdRaw) ?? "default";
      return getLimiter(tenantId, kind, cfg);
    },
    invalidate,
    defaults,
    nowIso,
  };
}
