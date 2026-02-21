import { randomBytes } from "node:crypto";
import type { Db } from "./db.js";
import { withClient, withTx } from "./db.js";
import { sha256Hex } from "./util/crypto.js";
import { TokenBucketLimiter } from "./util/ratelimit.js";

export type ApiKeyPrincipal = {
  tenant_id: string;
  agent_id: string | null;
  team_id: string | null;
  role: string | null;
  key_prefix: string | null;
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

export type ControlApiKeyRotateInput = {
  label?: string | null;
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

export type ControlAuditEventInput = {
  actor?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  tenant_id?: string | null;
  request_id?: string | null;
  details?: Record<string, unknown>;
};

export type AlertChannel = "webhook" | "slack_webhook" | "pagerduty_events";
export type AlertRouteStatus = "active" | "disabled";

export type ControlAlertRouteInput = {
  tenant_id: string;
  channel: AlertChannel;
  label?: string | null;
  events?: string[];
  status?: AlertRouteStatus;
  target?: string | null;
  secret?: string | null;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type ControlAlertDeliveryInput = {
  route_id: string;
  tenant_id: string;
  event_type: string;
  status: "sent" | "failed" | "skipped";
  request_id?: string | null;
  response_code?: number | null;
  response_body?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

export type MemoryRequestTelemetryInput = {
  tenant_id: string;
  scope: string;
  endpoint: "write" | "recall" | "recall_text";
  status_code: number;
  latency_ms: number;
  api_key_prefix?: string | null;
  request_id?: string | null;
};

type TelemetryEndpoint = "write" | "recall" | "recall_text";

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function asJson(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function asStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const key = trimOrNull(k);
    const str = trimOrNull(val);
    if (!key || !str) continue;
    out[key] = str;
  }
  return out;
}

function asStringArray(v: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(v)) return fallback;
  const out: string[] = [];
  for (const item of v) {
    const s = trimOrNull(item);
    if (!s) continue;
    out.push(s);
  }
  return out.length > 0 ? out : fallback;
}

function f64(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function i32(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function round(v: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeIsoTimestamp(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
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

export async function rotateControlApiKey(db: Db, id: string, input: ControlApiKeyRotateInput = {}) {
  const keyId = trimOrNull(id);
  if (!keyId) throw new Error("id is required");
  const overrideLabel = trimOrNull(input.label);
  const overrideMetadata = asJson(input.metadata);
  const apiKey = generateApiKey();
  const keyHash = sha256Hex(apiKey);
  const keyPrefix = apiKey.slice(0, 14);

  return await withTx(db, async (client) => {
    const cur = await client.query(
      `
      SELECT id, tenant_id, project_id, label, role, agent_id, team_id, metadata, status
      FROM control_api_keys
      WHERE id = $1
      FOR UPDATE
      `,
      [keyId],
    );
    const oldRow = cur.rows[0];
    if (!oldRow) return null;
    if (String(oldRow.status) !== "active") return null;

    const mergedMetadata = {
      ...asJson(oldRow.metadata),
      ...overrideMetadata,
      rotated_from_key_id: keyId,
      rotated_at: nowIso(),
    };

    const ins = await client.query(
      `
      INSERT INTO control_api_keys (
        tenant_id, project_id, label, role, agent_id, team_id, key_hash, key_prefix, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING id, tenant_id, project_id, label, role, agent_id, team_id, key_prefix, status, metadata, created_at, revoked_at
      `,
      [
        String(oldRow.tenant_id),
        oldRow.project_id ?? null,
        overrideLabel ?? trimOrNull(oldRow.label),
        trimOrNull(oldRow.role),
        trimOrNull(oldRow.agent_id),
        trimOrNull(oldRow.team_id),
        keyHash,
        keyPrefix,
        JSON.stringify(mergedMetadata),
      ],
    );

    const revoked = await client.query(
      `
      UPDATE control_api_keys
      SET status = 'revoked', revoked_at = now()
      WHERE id = $1
      RETURNING id, tenant_id, project_id, label, role, agent_id, team_id, key_prefix, status, metadata, created_at, revoked_at
      `,
      [keyId],
    );

    return {
      rotated: ins.rows[0],
      revoked: revoked.rows[0] ?? null,
      api_key: apiKey,
    };
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
          SELECT k.tenant_id, k.agent_id, k.team_id, k.role, k.key_prefix
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
            key_prefix: trimOrNull(row.key_prefix),
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

export async function recordControlAuditEvent(db: Db, input: ControlAuditEventInput): Promise<void> {
  const action = trimOrNull(input.action);
  const resourceType = trimOrNull(input.resource_type);
  if (!action) throw new Error("action is required");
  if (!resourceType) throw new Error("resource_type is required");
  const actor = trimOrNull(input.actor) ?? "admin_token";
  const resourceId = trimOrNull(input.resource_id);
  const tenantId = trimOrNull(input.tenant_id);
  const requestId = trimOrNull(input.request_id);
  const details = asJson(input.details);
  try {
    await withClient(db, async (client) => {
      await client.query(
        `
        INSERT INTO control_audit_events (
          actor, action, resource_type, resource_id, tenant_id, request_id, details
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [actor, action, resourceType, resourceId, tenantId, requestId, JSON.stringify(details)],
      );
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return;
    throw err;
  }
}

export async function listControlAuditEvents(
  db: Db,
  opts: { tenant_id?: string; action?: string; limit?: number; offset?: number } = {},
) {
  const tenantId = trimOrNull(opts.tenant_id);
  const action = trimOrNull(opts.action);
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(500, Math.trunc(opts.limit!))) : 100;
  const offset = Number.isFinite(opts.offset) ? Math.max(0, Math.trunc(opts.offset!)) : 0;
  const where: string[] = [];
  const args: unknown[] = [];

  if (tenantId) {
    args.push(tenantId);
    where.push(`tenant_id = $${args.length}`);
  }
  if (action) {
    args.push(action);
    where.push(`action = $${args.length}`);
  }
  args.push(limit);
  args.push(offset);
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  try {
    return await withClient(db, async (client) => {
      const q = await client.query(
        `
        SELECT event_id, actor, action, resource_type, resource_id, tenant_id, request_id, details, created_at
        FROM control_audit_events
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${args.length - 1} OFFSET $${args.length}
        `,
        args,
      );
      return q.rows;
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return [];
    throw err;
  }
}

export async function createControlAlertRoute(db: Db, input: ControlAlertRouteInput) {
  const tenantId = trimOrNull(input.tenant_id);
  if (!tenantId) throw new Error("tenant_id is required");
  const channel = trimOrNull(input.channel);
  if (channel !== "webhook" && channel !== "slack_webhook" && channel !== "pagerduty_events") {
    throw new Error("channel must be one of: webhook|slack_webhook|pagerduty_events");
  }
  const label = trimOrNull(input.label);
  const status = input.status ?? "active";
  const target = trimOrNull(input.target);
  const secret = trimOrNull(input.secret);
  const events = asStringArray(input.events, ["*"]);
  const headers = asStringMap(input.headers);
  const metadata = asJson(input.metadata);

  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      INSERT INTO control_alert_routes (
        tenant_id, channel, label, events, status, target, secret, headers, metadata
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9::jsonb)
      RETURNING id, tenant_id, channel, label, events, status, target, headers, metadata, created_at, updated_at
      `,
      [tenantId, channel, label, JSON.stringify(events), status, target, secret, JSON.stringify(headers), JSON.stringify(metadata)],
    );
    return q.rows[0];
  });
}

export async function listControlAlertRoutes(
  db: Db,
  opts: {
    tenant_id?: string;
    channel?: AlertChannel;
    status?: AlertRouteStatus;
    limit?: number;
    offset?: number;
  } = {},
) {
  const tenantId = trimOrNull(opts.tenant_id);
  const channel = trimOrNull(opts.channel);
  const status = trimOrNull(opts.status);
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(500, Math.trunc(opts.limit!))) : 100;
  const offset = Number.isFinite(opts.offset) ? Math.max(0, Math.trunc(opts.offset!)) : 0;
  const where: string[] = [];
  const args: unknown[] = [];
  if (tenantId) {
    args.push(tenantId);
    where.push(`tenant_id = $${args.length}`);
  }
  if (channel) {
    args.push(channel);
    where.push(`channel = $${args.length}`);
  }
  if (status) {
    args.push(status);
    where.push(`status = $${args.length}`);
  }
  args.push(limit);
  args.push(offset);
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  try {
    return await withClient(db, async (client) => {
      const q = await client.query(
        `
        SELECT id, tenant_id, channel, label, events, status, target, headers, metadata, created_at, updated_at
        FROM control_alert_routes
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${args.length - 1} OFFSET $${args.length}
        `,
        args,
      );
      return q.rows;
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return [];
    throw err;
  }
}

export async function updateControlAlertRouteStatus(db: Db, idRaw: string, statusRaw: AlertRouteStatus) {
  const id = trimOrNull(idRaw);
  if (!id) throw new Error("id is required");
  const status = trimOrNull(statusRaw);
  if (status !== "active" && status !== "disabled") {
    throw new Error("status must be active|disabled");
  }
  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      UPDATE control_alert_routes
      SET status = $2
      WHERE id = $1
      RETURNING id, tenant_id, channel, label, events, status, target, headers, metadata, created_at, updated_at
      `,
      [id, status],
    );
    return q.rows[0] ?? null;
  });
}

export async function listActiveAlertRoutesForEvent(db: Db, args: { tenant_id: string; event_type: string; limit?: number }) {
  const tenantId = trimOrNull(args.tenant_id);
  const eventType = trimOrNull(args.event_type);
  if (!tenantId || !eventType) return [];
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(200, Math.trunc(args.limit!))) : 50;

  try {
    return await withClient(db, async (client) => {
      const q = await client.query(
        `
        SELECT id, tenant_id, channel, label, events, status, target, secret, headers, metadata, created_at, updated_at
        FROM control_alert_routes
        WHERE tenant_id = $1
          AND status = 'active'
          AND (events ? $2 OR events ? '*')
        ORDER BY created_at ASC
        LIMIT $3
        `,
        [tenantId, eventType, limit],
      );
      return q.rows;
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return [];
    throw err;
  }
}

export async function recordControlAlertDelivery(db: Db, input: ControlAlertDeliveryInput): Promise<void> {
  const routeId = trimOrNull(input.route_id);
  const tenantId = trimOrNull(input.tenant_id);
  const eventType = trimOrNull(input.event_type);
  const status = trimOrNull(input.status);
  if (!routeId || !tenantId || !eventType || !status) return;
  const requestId = trimOrNull(input.request_id);
  const responseCode = Number.isFinite(input.response_code) ? Math.trunc(Number(input.response_code)) : null;
  const responseBody = trimOrNull(input.response_body);
  const error = trimOrNull(input.error);
  const metadata = asJson(input.metadata);

  try {
    await withClient(db, async (client) => {
      await client.query(
        `
        INSERT INTO control_alert_deliveries (
          route_id, tenant_id, event_type, status, request_id, response_code, response_body, error, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        `,
        [routeId, tenantId, eventType, status, requestId, responseCode, responseBody, error, JSON.stringify(metadata)],
      );
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return;
    throw err;
  }
}

export async function listControlAlertDeliveries(
  db: Db,
  opts: {
    tenant_id?: string;
    event_type?: string;
    status?: "sent" | "failed" | "skipped";
    limit?: number;
    offset?: number;
  } = {},
) {
  const tenantId = trimOrNull(opts.tenant_id);
  const eventType = trimOrNull(opts.event_type);
  const status = trimOrNull(opts.status);
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(500, Math.trunc(opts.limit!))) : 100;
  const offset = Number.isFinite(opts.offset) ? Math.max(0, Math.trunc(opts.offset!)) : 0;
  const where: string[] = [];
  const args: unknown[] = [];
  if (tenantId) {
    args.push(tenantId);
    where.push(`tenant_id = $${args.length}`);
  }
  if (eventType) {
    args.push(eventType);
    where.push(`event_type = $${args.length}`);
  }
  if (status) {
    args.push(status);
    where.push(`status = $${args.length}`);
  }
  args.push(limit);
  args.push(offset);
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  try {
    return await withClient(db, async (client) => {
      const q = await client.query(
        `
        SELECT id, delivery_id, route_id, tenant_id, event_type, status, request_id, response_code, response_body, error, metadata, created_at
        FROM control_alert_deliveries
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${args.length - 1} OFFSET $${args.length}
        `,
        args,
      );
      return q.rows;
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return [];
    throw err;
  }
}

export async function recordMemoryRequestTelemetry(db: Db, input: MemoryRequestTelemetryInput): Promise<void> {
  const tenantId = trimOrNull(input.tenant_id);
  const scope = trimOrNull(input.scope);
  const endpoint = trimOrNull(input.endpoint);
  if (!tenantId || !scope || !endpoint) return;
  const statusCode = Number.isFinite(input.status_code) ? Math.trunc(input.status_code) : 0;
  const latencyMs = Number.isFinite(input.latency_ms) ? Math.max(0, input.latency_ms) : 0;
  const apiKeyPrefix = trimOrNull(input.api_key_prefix);
  const requestId = trimOrNull(input.request_id);
  try {
    await withClient(db, async (client) => {
      await client.query(
        `
        INSERT INTO memory_request_telemetry (
          tenant_id, scope, endpoint, status_code, latency_ms, api_key_prefix, request_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [tenantId, scope, endpoint, statusCode, latencyMs, apiKeyPrefix, requestId],
      );
    });
  } catch (err: any) {
    // During rollout, this table may not exist yet.
    if (String(err?.code ?? "") === "42P01") return;
    throw err;
  }
}

export async function listStaleControlApiKeys(
  db: Db,
  opts: {
    max_age_days?: number;
    warn_age_days?: number;
    rotation_window_days?: number;
    limit?: number;
  } = {},
) {
  const maxAgeDays = Number.isFinite(opts.max_age_days) ? Math.max(1, Math.trunc(opts.max_age_days!)) : 30;
  const warnAgeDays = Number.isFinite(opts.warn_age_days) ? Math.max(1, Math.trunc(opts.warn_age_days!)) : 21;
  const rotationWindowDays = Number.isFinite(opts.rotation_window_days) ? Math.max(1, Math.trunc(opts.rotation_window_days!)) : 30;
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(1000, Math.trunc(opts.limit!))) : 200;

  try {
    return await withClient(db, async (client) => {
      const stale = await client.query(
        `
        SELECT
          id,
          tenant_id,
          project_id,
          label,
          key_prefix,
          created_at,
          ROUND(EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0, 3) AS age_days
        FROM control_api_keys
        WHERE status = 'active'
          AND created_at <= now() - (($1::text || ' days')::interval)
        ORDER BY created_at ASC
        LIMIT $2
        `,
        [maxAgeDays, limit],
      );

      const warn = await client.query(
        `
        SELECT
          id,
          tenant_id,
          project_id,
          label,
          key_prefix,
          created_at,
          ROUND(EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0, 3) AS age_days
        FROM control_api_keys
        WHERE status = 'active'
          AND created_at <= now() - (($1::text || ' days')::interval)
          AND created_at > now() - (($2::text || ' days')::interval)
        ORDER BY created_at ASC
        LIMIT $3
        `,
        [warnAgeDays, maxAgeDays, limit],
      );

      const activeStats = await client.query(
        `
        SELECT
          tenant_id,
          COUNT(*)::bigint AS active_key_count,
          MIN(created_at) AS oldest_active_key_at,
          MAX(created_at) AS newest_active_key_at
        FROM control_api_keys
        WHERE status = 'active'
        GROUP BY tenant_id
        ORDER BY tenant_id ASC
        `,
      );

      const recentRotations = await client.query(
        `
        SELECT
          tenant_id,
          COUNT(*)::bigint AS recent_rotation_count
        FROM control_audit_events
        WHERE action = 'api_key.rotate'
          AND created_at >= now() - (($1::text || ' days')::interval)
          AND tenant_id IS NOT NULL
        GROUP BY tenant_id
        ORDER BY tenant_id ASC
        `,
        [rotationWindowDays],
      );

      const rotationsByTenant = new Map<string, number>();
      for (const r of recentRotations.rows) {
        rotationsByTenant.set(String(r.tenant_id), Number(r.recent_rotation_count ?? 0));
      }

      const tenantsWithoutRecentRotation = activeStats.rows
        .map((r) => ({
          tenant_id: String(r.tenant_id),
          active_key_count: Number(r.active_key_count ?? 0),
          oldest_active_key_at: r.oldest_active_key_at,
          newest_active_key_at: r.newest_active_key_at,
          recent_rotation_count: rotationsByTenant.get(String(r.tenant_id)) ?? 0,
        }))
        .filter((r) => r.active_key_count > 0 && r.recent_rotation_count === 0);

      return {
        ok: true,
        checked_at: nowIso(),
        thresholds: {
          max_age_days: maxAgeDays,
          warn_age_days: warnAgeDays,
          rotation_window_days: rotationWindowDays,
        },
        stale: {
          count: stale.rows.length,
          sample: stale.rows,
        },
        warning_window: {
          count: warn.rows.length,
          sample: warn.rows,
        },
        active_by_tenant: activeStats.rows,
        recent_rotations_by_tenant: recentRotations.rows,
        tenants_without_recent_rotation: tenantsWithoutRecentRotation,
      };
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      return {
        ok: false,
        checked_at: nowIso(),
        error: "control_plane_schema_missing",
      };
    }
    throw err;
  }
}

function tenantScopeCondition(args: unknown[], tenantId: string, defaultTenantId: string): { sql: string; args: unknown[] } {
  if (tenantId === defaultTenantId) {
    return { sql: "scope NOT LIKE 'tenant:%'", args };
  }
  args.push(`tenant:${tenantId}::scope:%`);
  return { sql: `scope LIKE $${args.length}`, args };
}

export async function getTenantDashboardSummary(db: Db, args: { tenant_id: string; default_tenant_id: string }) {
  const tenantId = trimOrNull(args.tenant_id);
  const defaultTenantId = trimOrNull(args.default_tenant_id) ?? "default";
  if (!tenantId) throw new Error("tenant_id is required");

  const scopeArgs: unknown[] = [];
  const scopeFilter = tenantScopeCondition(scopeArgs, tenantId, defaultTenantId);

  const out: Record<string, unknown> = {
    tenant_id: tenantId,
    generated_at: nowIso(),
    default_tenant_id: defaultTenantId,
  };

  try {
    await withClient(db, async (client) => {
      const activeKeys = await client.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')::bigint AS active,
          COUNT(*) FILTER (WHERE status = 'revoked')::bigint AS revoked
        FROM control_api_keys
        WHERE tenant_id = $1
        `,
        [tenantId],
      );
      const tenantState = await client.query(
        `
        SELECT status, created_at, updated_at
        FROM control_tenants
        WHERE tenant_id = $1
        LIMIT 1
        `,
        [tenantId],
      );
      const quota = await client.query(
        `
        SELECT *
        FROM control_tenant_quotas
        WHERE tenant_id = $1
        LIMIT 1
        `,
        [tenantId],
      );
      const nodes = await client.query(
        `
        SELECT COUNT(*)::bigint AS count
        FROM memory_nodes
        WHERE ${scopeFilter.sql}
        `,
        scopeFilter.args,
      );
      const edges = await client.query(
        `
        SELECT COUNT(*)::bigint AS count
        FROM memory_edges
        WHERE ${scopeFilter.sql}
        `,
        scopeFilter.args,
      );
      const outbox = await client.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE published_at IS NULL)::bigint AS pending,
          COUNT(*) FILTER (WHERE published_at IS NULL AND attempts > 0)::bigint AS retrying,
          COUNT(*) FILTER (WHERE failed_at IS NOT NULL)::bigint AS failed
        FROM memory_outbox
        WHERE ${scopeFilter.sql}
        `,
        scopeFilter.args,
      );
      const recall24h = await client.query(
        `
        SELECT COUNT(*)::bigint AS count
        FROM memory_recall_audit
        WHERE ${scopeFilter.sql}
          AND created_at >= now() - interval '24 hours'
        `,
        scopeFilter.args,
      );
      const commits24h = await client.query(
        `
        SELECT COUNT(*)::bigint AS count
        FROM memory_commits
        WHERE ${scopeFilter.sql}
          AND created_at >= now() - interval '24 hours'
        `,
        scopeFilter.args,
      );
      const activeRules = await client.query(
        `
        SELECT COUNT(*)::bigint AS count
        FROM memory_rule_defs
        WHERE ${scopeFilter.sql}
          AND state = 'active'
        `,
        scopeFilter.args,
      );

      out.tenant = tenantState.rows[0] ?? null;
      out.api_keys = {
        active: Number(activeKeys.rows[0]?.active ?? 0),
        revoked: Number(activeKeys.rows[0]?.revoked ?? 0),
      };
      out.quota_profile = quota.rows[0] ?? null;
      out.data_plane = {
        nodes: Number(nodes.rows[0]?.count ?? 0),
        edges: Number(edges.rows[0]?.count ?? 0),
        active_rules: Number(activeRules.rows[0]?.count ?? 0),
        recalls_24h: Number(recall24h.rows[0]?.count ?? 0),
        commits_24h: Number(commits24h.rows[0]?.count ?? 0),
      };
      out.outbox = {
        pending: Number(outbox.rows[0]?.pending ?? 0),
        retrying: Number(outbox.rows[0]?.retrying ?? 0),
        failed: Number(outbox.rows[0]?.failed ?? 0),
      };
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      out.warning = "schema_not_ready_for_dashboard";
      return out;
    }
    throw err;
  }

  return out;
}

export async function getTenantRequestTimeseries(
  db: Db,
  args: {
    tenant_id: string;
    window_hours?: number;
    bucket?: "hour";
    endpoint?: TelemetryEndpoint;
    limit?: number;
    offset?: number;
    retention_hours?: number;
    anchor_utc?: string;
  },
) {
  const tenantId = trimOrNull(args.tenant_id);
  if (!tenantId) throw new Error("tenant_id is required");
  const retentionHours = Number.isFinite(args.retention_hours)
    ? Math.max(1, Math.min(24 * 365, Math.trunc(args.retention_hours!)))
    : 24 * 30;
  const requestedWindowHours = Number.isFinite(args.window_hours) ? Math.max(1, Math.min(24 * 365, Math.trunc(args.window_hours!))) : 24 * 7;
  const windowHours = Math.min(requestedWindowHours, retentionHours);
  const endpoint = args.endpoint ?? null;
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(20_000, Math.trunc(args.limit!))) : 5000;
  const offset = Number.isFinite(args.offset) ? Math.max(0, Math.trunc(args.offset!)) : 0;
  const anchorRaw = trimOrNull(args.anchor_utc);
  const anchorUtc = normalizeIsoTimestamp(anchorRaw);
  const bucket = args.bucket ?? "hour";
  try {
    return await withClient(db, async (client) => {
      const totalRows = await client.query(
        `
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT date_trunc('hour', created_at) AS bucket_utc, endpoint
          FROM memory_request_telemetry
          WHERE tenant_id = $1
            AND created_at >= now() - (($2::text || ' hours')::interval)
            AND ($3::text IS NULL OR endpoint = $3::text)
            AND ($4::timestamptz IS NULL OR created_at <= $4::timestamptz)
          GROUP BY bucket_utc, endpoint
        ) t
        `,
        [tenantId, windowHours, endpoint, anchorUtc],
      );
      const total = Number(totalRows.rows[0]?.count ?? 0);

      const rows = await client.query(
        `
        SELECT
          date_trunc('hour', created_at) AS bucket_utc,
          endpoint,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE status_code >= 500)::bigint AS server_errors,
          COUNT(*) FILTER (WHERE status_code = 429)::bigint AS throttled,
          COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500 AND status_code <> 429)::bigint AS client_errors,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS latency_p50_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS latency_p95_ms,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS latency_p99_ms
        FROM memory_request_telemetry
        WHERE tenant_id = $1
          AND created_at >= now() - (($2::text || ' hours')::interval)
          AND ($3::text IS NULL OR endpoint = $3::text)
          AND ($6::timestamptz IS NULL OR created_at <= $6::timestamptz)
        GROUP BY bucket_utc, endpoint
        ORDER BY bucket_utc DESC, endpoint ASC
        OFFSET $4
        LIMIT $5
        `,
        [tenantId, windowHours, endpoint, offset, limit, anchorUtc],
      );

      const series = rows.rows.map((r) => {
        const total = Number(r.total ?? 0);
        const serverErrors = Number(r.server_errors ?? 0);
        const throttled = Number(r.throttled ?? 0);
        const budgetErrors = serverErrors + throttled;
        const errorRate = total > 0 ? budgetErrors / total : 0;
        return {
          bucket_utc: r.bucket_utc,
          endpoint: r.endpoint,
          total,
          server_errors: serverErrors,
          throttled,
          client_errors: Number(r.client_errors ?? 0),
          error_budget_consumed: budgetErrors,
          error_rate: round(errorRate),
          latency_p50_ms: Number(r.latency_p50_ms ?? 0),
          latency_p95_ms: Number(r.latency_p95_ms ?? 0),
          latency_p99_ms: Number(r.latency_p99_ms ?? 0),
        };
      });

      const endpointBudgetRows = await client.query(
        `
        SELECT
          endpoint,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE status_code >= 500)::bigint AS server_errors,
          COUNT(*) FILTER (WHERE status_code = 429)::bigint AS throttled
        FROM memory_request_telemetry
        WHERE tenant_id = $1
          AND created_at >= now() - (($2::text || ' hours')::interval)
          AND ($3::text IS NULL OR endpoint = $3::text)
          AND ($4::timestamptz IS NULL OR created_at <= $4::timestamptz)
        GROUP BY endpoint
        ORDER BY endpoint ASC
        `,
        [tenantId, windowHours, endpoint, anchorUtc],
      );

      const budget = endpointBudgetRows.rows.map((r) => {
        const total = Number(r.total ?? 0);
        const serverErrors = Number(r.server_errors ?? 0);
        const throttled = Number(r.throttled ?? 0);
        const consumed = serverErrors + throttled;
        return {
          endpoint: r.endpoint,
          total,
          server_errors: serverErrors,
          throttled,
          error_budget_consumed: consumed,
          error_rate: round(total > 0 ? consumed / total : 0),
        };
      });

      return {
        ok: true,
        tenant_id: tenantId,
        bucket,
        window_hours: windowHours,
        retention: {
          retention_hours: retentionHours,
          requested_window_hours: requestedWindowHours,
          applied_window_hours: windowHours,
          truncated: requestedWindowHours > windowHours,
        },
        filters: {
          endpoint,
        },
        page: {
          limit,
          offset,
          total,
          has_more: offset + series.length < total,
        },
        snapshot: {
          anchor_utc: anchorUtc ?? nowIso(),
        },
        generated_at: nowIso(),
        series,
        budget,
      };
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      return {
        ok: false,
        tenant_id: tenantId,
        bucket,
        window_hours: windowHours,
        retention: {
          retention_hours: retentionHours,
          requested_window_hours: requestedWindowHours,
          applied_window_hours: windowHours,
          truncated: requestedWindowHours > windowHours,
        },
        filters: {
          endpoint,
        },
        page: {
          limit,
          offset,
          total: 0,
          has_more: false,
        },
        snapshot: {
          anchor_utc: anchorUtc ?? nowIso(),
        },
        generated_at: nowIso(),
        warning: "request_telemetry_table_missing",
        series: [],
        budget: [],
      };
    }
    throw err;
  }
}

export async function getTenantApiKeyUsageReport(
  db: Db,
  args: {
    tenant_id: string;
    window_hours?: number;
    baseline_hours?: number;
    min_requests?: number;
    zscore_threshold?: number;
    endpoint?: TelemetryEndpoint;
    limit?: number;
    offset?: number;
    retention_hours?: number;
    anchor_utc?: string;
  },
) {
  const tenantId = trimOrNull(args.tenant_id);
  if (!tenantId) throw new Error("tenant_id is required");
  const retentionHours = Number.isFinite(args.retention_hours)
    ? Math.max(1, Math.min(24 * 365, Math.trunc(args.retention_hours!)))
    : 24 * 30;
  const requestedWindowHours = Number.isFinite(args.window_hours) ? Math.max(1, Math.min(24 * 365, Math.trunc(args.window_hours!))) : 24;
  const windowHours = Math.min(requestedWindowHours, retentionHours);
  const requestedBaselineHours = Number.isFinite(args.baseline_hours)
    ? Math.max(windowHours + 1, Math.min(24 * 365, Math.trunc(args.baseline_hours!)))
    : 24 * 7;
  const baselineHours = Math.max(windowHours + 1, Math.min(requestedBaselineHours, retentionHours * 3));
  const baselineSliceHours = Math.max(1, baselineHours - windowHours);
  const minRequests = Number.isFinite(args.min_requests) ? Math.max(1, Math.min(1_000_000, Math.trunc(args.min_requests!))) : 30;
  const zscoreThreshold = Number.isFinite(args.zscore_threshold)
    ? Math.max(0.5, Math.min(100, Number(args.zscore_threshold)))
    : 3;
  const endpoint = args.endpoint ?? null;
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(1000, Math.trunc(args.limit!))) : 200;
  const offset = Number.isFinite(args.offset) ? Math.max(0, Math.trunc(args.offset!)) : 0;
  const anchorRaw = trimOrNull(args.anchor_utc);
  const anchorUtc = normalizeIsoTimestamp(anchorRaw);

  try {
    return await withClient(db, async (client) => {
      const totalRows = await client.query(
        `
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT api_key_prefix, endpoint
          FROM memory_request_telemetry
          WHERE tenant_id = $1
            AND created_at >= now() - (($2::text || ' hours')::interval)
            AND api_key_prefix IS NOT NULL
            AND ($3::text IS NULL OR endpoint = $3::text)
            AND ($4::timestamptz IS NULL OR created_at <= $4::timestamptz)
          GROUP BY api_key_prefix, endpoint
        ) t
        `,
        [tenantId, windowHours, endpoint, anchorUtc],
      );
      const total = Number(totalRows.rows[0]?.count ?? 0);

      const q = await client.query(
        `
        WITH recent AS (
          SELECT
            api_key_prefix,
            endpoint,
            COUNT(*)::bigint AS recent_total,
            COUNT(*) FILTER (WHERE status_code >= 500)::bigint AS recent_server_errors,
            COUNT(*) FILTER (WHERE status_code = 429)::bigint AS recent_throttled,
            AVG(latency_ms) AS recent_latency_avg_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS recent_latency_p95_ms
          FROM memory_request_telemetry
          WHERE tenant_id = $1
            AND created_at >= now() - (($2::text || ' hours')::interval)
            AND api_key_prefix IS NOT NULL
            AND ($3::text IS NULL OR endpoint = $3::text)
            AND ($7::timestamptz IS NULL OR created_at <= $7::timestamptz)
          GROUP BY api_key_prefix, endpoint
        ),
        baseline AS (
          SELECT
            api_key_prefix,
            endpoint,
            COUNT(*)::bigint AS baseline_total,
            COUNT(*) FILTER (WHERE status_code >= 500)::bigint AS baseline_server_errors,
            COUNT(*) FILTER (WHERE status_code = 429)::bigint AS baseline_throttled,
            AVG(latency_ms) AS baseline_latency_avg_ms,
            stddev_pop(latency_ms) AS baseline_latency_stddev_ms
          FROM memory_request_telemetry
          WHERE tenant_id = $1
            AND created_at < now() - (($2::text || ' hours')::interval)
            AND created_at >= now() - (($4::text || ' hours')::interval)
            AND api_key_prefix IS NOT NULL
            AND ($3::text IS NULL OR endpoint = $3::text)
            AND ($7::timestamptz IS NULL OR created_at <= $7::timestamptz)
          GROUP BY api_key_prefix, endpoint
        )
        SELECT
          r.api_key_prefix,
          r.endpoint,
          r.recent_total,
          r.recent_server_errors,
          r.recent_throttled,
          r.recent_latency_avg_ms,
          r.recent_latency_p95_ms,
          COALESCE(b.baseline_total, 0)::bigint AS baseline_total,
          COALESCE(b.baseline_server_errors, 0)::bigint AS baseline_server_errors,
          COALESCE(b.baseline_throttled, 0)::bigint AS baseline_throttled,
          b.baseline_latency_avg_ms,
          b.baseline_latency_stddev_ms
        FROM recent r
        LEFT JOIN baseline b
          ON b.api_key_prefix = r.api_key_prefix
         AND b.endpoint = r.endpoint
        ORDER BY r.recent_total DESC, r.api_key_prefix ASC, r.endpoint ASC
        OFFSET $5
        LIMIT $6
        `,
        [tenantId, windowHours, endpoint, baselineHours, offset, limit, anchorUtc],
      );

      const items = q.rows.map((r) => {
        const recentTotal = Number(r.recent_total ?? 0);
        const recentServerErrors = Number(r.recent_server_errors ?? 0);
        const recentThrottled = Number(r.recent_throttled ?? 0);
        const recentBudgetErrors = recentServerErrors + recentThrottled;
        const recentErrorRate = recentTotal > 0 ? recentBudgetErrors / recentTotal : 0;
        const recentLatencyAvgMs = Number(r.recent_latency_avg_ms ?? 0);
        const recentLatencyP95Ms = Number(r.recent_latency_p95_ms ?? 0);

        const baselineTotal = Number(r.baseline_total ?? 0);
        const baselineServerErrors = Number(r.baseline_server_errors ?? 0);
        const baselineThrottled = Number(r.baseline_throttled ?? 0);
        const baselineBudgetErrors = baselineServerErrors + baselineThrottled;
        const baselineErrorRate = baselineTotal > 0 ? baselineBudgetErrors / baselineTotal : 0;
        const baselineLatencyAvgMs = Number(r.baseline_latency_avg_ms ?? 0);
        const baselineLatencyStddevMs = Number(r.baseline_latency_stddev_ms ?? 0);

        const expectedRecent = baselineTotal > 0 ? (baselineTotal * windowHours) / baselineSliceHours : 0;
        const trafficRatio = expectedRecent > 0 ? recentTotal / expectedRecent : recentTotal > 0 ? Number.POSITIVE_INFINITY : 1;
        const latencyZscore =
          baselineLatencyStddevMs > 0 ? (recentLatencyAvgMs - baselineLatencyAvgMs) / baselineLatencyStddevMs : 0;

        const anomalyReasons: string[] = [];
        if (recentTotal >= minRequests && Number.isFinite(trafficRatio) && trafficRatio >= 2) {
          anomalyReasons.push("request_spike");
        }
        if (recentTotal >= minRequests && latencyZscore >= zscoreThreshold) {
          anomalyReasons.push("latency_regression");
        }
        if (recentTotal >= minRequests && recentErrorRate >= 0.05 && recentErrorRate >= baselineErrorRate * 2) {
          anomalyReasons.push("error_budget_regression");
        }

        return {
          api_key_prefix: r.api_key_prefix,
          endpoint: r.endpoint,
          recent: {
            total: recentTotal,
            server_errors: recentServerErrors,
            throttled: recentThrottled,
            error_rate: round(recentErrorRate),
            latency_avg_ms: round(recentLatencyAvgMs),
            latency_p95_ms: round(recentLatencyP95Ms),
          },
          baseline: {
            total: baselineTotal,
            server_errors: baselineServerErrors,
            throttled: baselineThrottled,
            error_rate: round(baselineErrorRate),
            latency_avg_ms: round(baselineLatencyAvgMs),
            latency_stddev_ms: round(baselineLatencyStddevMs),
            slice_hours: baselineSliceHours,
          },
          anomaly: {
            is_anomaly: anomalyReasons.length > 0,
            reasons: anomalyReasons,
            traffic_ratio: Number.isFinite(trafficRatio) ? round(trafficRatio) : null,
            latency_zscore: round(latencyZscore),
          },
        };
      });

      return {
        ok: true,
        tenant_id: tenantId,
        generated_at: nowIso(),
        retention: {
          retention_hours: retentionHours,
          requested_window_hours: requestedWindowHours,
          applied_window_hours: windowHours,
          requested_baseline_hours: requestedBaselineHours,
          applied_baseline_hours: baselineHours,
          truncated: requestedWindowHours > windowHours || requestedBaselineHours > baselineHours,
        },
        filters: {
          endpoint,
          min_requests: minRequests,
          zscore_threshold: zscoreThreshold,
        },
        page: {
          limit,
          offset,
          total,
          has_more: offset + items.length < total,
        },
        snapshot: {
          anchor_utc: anchorUtc ?? nowIso(),
        },
        anomalies: {
          count_in_page: items.filter((item) => item.anomaly.is_anomaly).length,
        },
        items,
      };
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      return {
        ok: false,
        tenant_id: tenantId,
        generated_at: nowIso(),
        warning: "request_telemetry_table_missing",
        filters: {
          endpoint,
          min_requests: minRequests,
          zscore_threshold: zscoreThreshold,
        },
        page: {
          limit,
          offset,
          total: 0,
          has_more: false,
        },
        snapshot: {
          anchor_utc: anchorUtc ?? nowIso(),
        },
        items: [],
      };
    }
    throw err;
  }
}

export async function purgeMemoryRequestTelemetry(
  db: Db,
  args: {
    older_than_hours: number;
    tenant_id?: string | null;
    batch_limit?: number;
  },
) {
  const olderThanHours = Number.isFinite(args.older_than_hours)
    ? Math.max(1, Math.min(24 * 3650, Math.trunc(args.older_than_hours)))
    : 24 * 30;
  const tenantId = trimOrNull(args.tenant_id ?? null);
  const batchLimit = Number.isFinite(args.batch_limit) ? Math.max(1, Math.min(200_000, Math.trunc(args.batch_limit!))) : 20_000;

  try {
    return await withClient(db, async (client) => {
      const q = await client.query(
        `
        WITH victims AS (
          SELECT id
          FROM memory_request_telemetry
          WHERE created_at < now() - (($1::text || ' hours')::interval)
            AND ($2::text IS NULL OR tenant_id = $2::text)
          ORDER BY id ASC
          LIMIT $3
        )
        DELETE FROM memory_request_telemetry t
        USING victims v
        WHERE t.id = v.id
        RETURNING t.id
        `,
        [olderThanHours, tenantId, batchLimit],
      );
      return {
        ok: true,
        tenant_id: tenantId,
        older_than_hours: olderThanHours,
        batch_limit: batchLimit,
        deleted: q.rowCount ?? 0,
      };
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      return {
        ok: false,
        tenant_id: tenantId,
        older_than_hours: olderThanHours,
        batch_limit: batchLimit,
        warning: "request_telemetry_table_missing",
        deleted: 0,
      };
    }
    throw err;
  }
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
