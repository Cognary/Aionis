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

export type ControlIncidentPublishJobInput = {
  tenant_id: string;
  run_id: string;
  source_dir: string;
  target: string;
  max_attempts?: number;
  metadata?: Record<string, unknown>;
};

export type ControlIncidentPublishReplayInput = {
  tenant_id?: string;
  statuses?: Array<"failed" | "dead_letter">;
  ids?: string[];
  limit?: number;
  reset_attempts?: boolean;
  reason?: string;
  dry_run?: boolean;
  allow_all_tenants?: boolean;
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

export async function findRecentControlAlertDeliveryByDedupe(
  db: Db,
  args: {
    route_id: string;
    dedupe_key: string;
    ttl_seconds: number;
  },
) {
  const routeId = trimOrNull(args.route_id);
  const dedupeKey = trimOrNull(args.dedupe_key);
  if (!routeId || !dedupeKey) return null;
  const ttlSeconds = Number.isFinite(args.ttl_seconds) ? Math.max(60, Math.min(7 * 24 * 3600, Math.trunc(args.ttl_seconds))) : 1800;
  try {
    return await withClient(db, async (client) => {
      const q = await client.query(
        `
        SELECT id, delivery_id, route_id, tenant_id, event_type, status, created_at, metadata
        FROM control_alert_deliveries
        WHERE route_id = $1
          AND status = 'sent'
          AND (metadata->>'dedupe_key') = $2
          AND created_at >= now() - (($3::text || ' seconds')::interval)
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [routeId, dedupeKey, ttlSeconds],
      );
      return q.rows[0] ?? null;
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return null;
    throw err;
  }
}

export async function enqueueControlIncidentPublishJob(db: Db, input: ControlIncidentPublishJobInput) {
  const tenantId = trimOrNull(input.tenant_id);
  const runId = trimOrNull(input.run_id);
  const sourceDir = trimOrNull(input.source_dir);
  const target = trimOrNull(input.target);
  if (!tenantId) throw new Error("tenant_id is required");
  if (!runId) throw new Error("run_id is required");
  if (!sourceDir) throw new Error("source_dir is required");
  if (!target) throw new Error("target is required");
  const maxAttempts = Number.isFinite(input.max_attempts) ? Math.max(1, Math.min(100, Math.trunc(input.max_attempts!))) : 5;
  const metadata = asJson(input.metadata);

  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      INSERT INTO control_incident_publish_jobs (
        tenant_id, run_id, source_dir, target, max_attempts, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING
        id, tenant_id, run_id, source_dir, target, status, attempts, max_attempts,
        next_attempt_at, locked_at, locked_by, published_uri, last_error, last_response, metadata,
        created_at, updated_at
      `,
      [tenantId, runId, sourceDir, target, maxAttempts, JSON.stringify(metadata)],
    );
    return q.rows[0];
  });
}

export async function listControlIncidentPublishJobs(
  db: Db,
  opts: {
    tenant_id?: string;
    status?: "pending" | "processing" | "succeeded" | "failed" | "dead_letter";
    limit?: number;
    offset?: number;
  } = {},
) {
  const tenantId = trimOrNull(opts.tenant_id);
  const status = trimOrNull(opts.status);
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(500, Math.trunc(opts.limit!))) : 100;
  const offset = Number.isFinite(opts.offset) ? Math.max(0, Math.trunc(opts.offset!)) : 0;
  const where: string[] = [];
  const args: unknown[] = [];
  if (tenantId) {
    args.push(tenantId);
    where.push(`tenant_id = $${args.length}`);
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
        SELECT
          id, tenant_id, run_id, source_dir, target, status, attempts, max_attempts,
          next_attempt_at, locked_at, locked_by, published_uri, last_error, last_response, metadata,
          created_at, updated_at
        FROM control_incident_publish_jobs
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

export async function replayControlIncidentPublishJobs(db: Db, input: ControlIncidentPublishReplayInput = {}) {
  const tenantId = trimOrNull(input.tenant_id);
  const statusSet = new Set<string>();
  for (const raw of input.statuses ?? []) {
    const s = trimOrNull(raw);
    if (s === "failed" || s === "dead_letter") statusSet.add(s);
  }
  const statuses = statusSet.size > 0 ? Array.from(statusSet) : ["dead_letter", "failed"];
  const ids = (input.ids ?? [])
    .map((x) => trimOrNull(x))
    .filter((x): x is string => !!x)
    .slice(0, 500);
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(200, Math.trunc(input.limit!))) : 50;
  const resetAttempts = input.reset_attempts ?? true;
  const reason = trimOrNull(input.reason) ?? "manual_replay";
  const dryRun = input.dry_run ?? false;
  const allowAllTenants = input.allow_all_tenants ?? false;
  if (!tenantId && ids.length === 0 && !allowAllTenants) {
    throw new Error("tenant_id or ids is required unless allow_all_tenants=true");
  }

  try {
    if (dryRun) {
      return await withClient(db, async (client) => {
        const q = await client.query(
          `
          SELECT
            id, tenant_id, run_id, source_dir, target, status, attempts, max_attempts,
            next_attempt_at, locked_at, locked_by, published_uri, last_error, last_response, metadata,
            created_at, updated_at
          FROM control_incident_publish_jobs
          WHERE ($1::text IS NULL OR tenant_id = $1::text)
            AND status = ANY($2::text[])
            AND ($3::text[] IS NULL OR id::text = ANY($3::text[]))
          ORDER BY created_at ASC
          LIMIT $4
          `,
          [tenantId, statuses, ids.length > 0 ? ids : null, limit],
        );
        return q.rows;
      });
    }

    return await withTx(db, async (client) => {
      const q = await client.query(
        `
        WITH candidates AS (
          SELECT id
          FROM control_incident_publish_jobs
          WHERE ($1::text IS NULL OR tenant_id = $1::text)
            AND status = ANY($2::text[])
            AND ($3::text[] IS NULL OR id::text = ANY($3::text[]))
          ORDER BY created_at ASC
          LIMIT $4
          FOR UPDATE SKIP LOCKED
        )
        UPDATE control_incident_publish_jobs j
        SET
          status = 'pending',
          attempts = CASE
            WHEN $5::boolean THEN 0
            ELSE LEAST(j.attempts, GREATEST(j.max_attempts - 1, 0))
          END,
          next_attempt_at = now(),
          locked_at = NULL,
          locked_by = NULL,
          last_error = NULL,
          last_response = '{}'::jsonb,
          metadata = COALESCE(j.metadata, '{}'::jsonb) || jsonb_build_object(
            'replayed_at', now(),
            'replay_reason', $6::text
          )
        FROM candidates
        WHERE j.id = candidates.id
        RETURNING
          j.id, j.tenant_id, j.run_id, j.source_dir, j.target, j.status, j.attempts, j.max_attempts,
          j.next_attempt_at, j.locked_at, j.locked_by, j.published_uri, j.last_error, j.last_response, j.metadata,
          j.created_at, j.updated_at
        `,
        [tenantId, statuses, ids.length > 0 ? ids : null, limit, resetAttempts, reason],
      );
      return q.rows;
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return [];
    throw err;
  }
}

export async function claimControlIncidentPublishJob(
  db: Db,
  args: {
    worker_id: string;
    tenant_id?: string;
  },
) {
  const workerId = trimOrNull(args.worker_id);
  const tenantId = trimOrNull(args.tenant_id);
  if (!workerId) throw new Error("worker_id is required");

  try {
    return await withTx(db, async (client) => {
      const q = await client.query(
        `
        WITH pick AS (
          SELECT id
          FROM control_incident_publish_jobs
          WHERE status IN ('pending', 'failed')
            AND next_attempt_at <= now()
            AND attempts < max_attempts
            AND ($1::text IS NULL OR tenant_id = $1::text)
          ORDER BY next_attempt_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE control_incident_publish_jobs j
        SET
          status = 'processing',
          attempts = j.attempts + 1,
          locked_at = now(),
          locked_by = $2
        FROM pick
        WHERE j.id = pick.id
        RETURNING
          j.id, j.tenant_id, j.run_id, j.source_dir, j.target, j.status, j.attempts, j.max_attempts,
          j.next_attempt_at, j.locked_at, j.locked_by, j.published_uri, j.last_error, j.last_response, j.metadata,
          j.created_at, j.updated_at
        `,
        [tenantId, workerId],
      );
      return q.rows[0] ?? null;
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return null;
    throw err;
  }
}

export async function markControlIncidentPublishJobSucceeded(
  db: Db,
  args: {
    id: string;
    published_uri?: string | null;
    response?: Record<string, unknown>;
  },
) {
  const id = trimOrNull(args.id);
  if (!id) throw new Error("id is required");
  const publishedUri = trimOrNull(args.published_uri);
  const response = asJson(args.response);
  return await withClient(db, async (client) => {
    const q = await client.query(
      `
      UPDATE control_incident_publish_jobs
      SET
        status = 'succeeded',
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = now(),
        published_uri = $2,
        last_error = NULL,
        last_response = $3::jsonb
      WHERE id = $1
      RETURNING
        id, tenant_id, run_id, source_dir, target, status, attempts, max_attempts,
        next_attempt_at, locked_at, locked_by, published_uri, last_error, last_response, metadata,
        created_at, updated_at
      `,
      [id, publishedUri, JSON.stringify(response)],
    );
    return q.rows[0] ?? null;
  });
}

export async function markControlIncidentPublishJobFailed(
  db: Db,
  args: {
    id: string;
    retry_delay_seconds?: number;
    error?: string | null;
    response?: Record<string, unknown>;
  },
) {
  const id = trimOrNull(args.id);
  if (!id) throw new Error("id is required");
  const retryDelaySeconds = Number.isFinite(args.retry_delay_seconds)
    ? Math.max(1, Math.min(7 * 24 * 3600, Math.trunc(args.retry_delay_seconds!)))
    : 60;
  const error = trimOrNull(args.error);
  const response = asJson(args.response);

  try {
    return await withClient(db, async (client) => {
      const q = await client.query(
        `
        UPDATE control_incident_publish_jobs
        SET
          status = CASE WHEN attempts >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
          next_attempt_at = CASE
            WHEN attempts >= max_attempts THEN next_attempt_at
            ELSE now() + (($2::text || ' seconds')::interval)
          END,
          locked_at = NULL,
          locked_by = NULL,
          last_error = $3,
          last_response = $4::jsonb
        WHERE id = $1
        RETURNING
          id, tenant_id, run_id, source_dir, target, status, attempts, max_attempts,
          next_attempt_at, locked_at, locked_by, published_uri, last_error, last_response, metadata,
          created_at, updated_at
        `,
        [id, retryDelaySeconds, error, JSON.stringify(response)],
      );
      return q.rows[0] ?? null;
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return null;
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

function tenantScopeConditionForColumn(
  args: unknown[],
  tenantId: string,
  defaultTenantId: string,
  columnSql: string,
): { sql: string; args: unknown[] } {
  if (tenantId === defaultTenantId) {
    return { sql: `${columnSql} NOT LIKE 'tenant:%'`, args };
  }
  args.push(`tenant:${tenantId}::scope:%`);
  return { sql: `${columnSql} LIKE $${args.length}`, args };
}

function tenantScopeKey(scope: string, tenantId: string, defaultTenantId: string): string {
  return tenantId === defaultTenantId ? scope : `tenant:${tenantId}::scope:${scope}`;
}

export async function getTenantOperabilityDiagnostics(
  db: Db,
  args: { tenant_id: string; default_tenant_id: string; scope?: string; window_minutes?: number },
) {
  const tenantId = trimOrNull(args.tenant_id);
  const defaultTenantId = trimOrNull(args.default_tenant_id) ?? "default";
  const scope = trimOrNull(args.scope);
  const windowMinutes = Number.isFinite(args.window_minutes)
    ? Math.max(5, Math.min(24 * 60, Math.trunc(args.window_minutes!)))
    : 60;
  if (!tenantId) throw new Error("tenant_id is required");

  const telemetryArgs: unknown[] = [tenantId];
  let scopeFilterTelemetry = scope
    ? (() => {
        telemetryArgs.push(tenantScopeKey(scope, tenantId, defaultTenantId));
        return { sql: `t.scope = $${telemetryArgs.length}`, args: telemetryArgs };
      })()
    : tenantScopeConditionForColumn(telemetryArgs, tenantId, defaultTenantId, "t.scope");

  const memoryArgs: unknown[] = [];
  let scopeFilterMemory = scope
    ? (() => {
        memoryArgs.push(tenantScopeKey(scope, tenantId, defaultTenantId));
        return { sql: `scope = $${memoryArgs.length}`, args: memoryArgs };
      })()
    : tenantScopeCondition(memoryArgs, tenantId, defaultTenantId);

  const out: Record<string, unknown> = {
    tenant_id: tenantId,
    default_tenant_id: defaultTenantId,
    scope: scope ?? null,
    window_minutes: windowMinutes,
    generated_at: nowIso(),
  };

  try {
    await withClient(db, async (client) => {
      const requestTelemetry = await client.query(
        `
        SELECT
          t.endpoint,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE t.status_code >= 400)::bigint AS errors,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY t.latency_ms) AS latency_p50_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY t.latency_ms) AS latency_p95_ms,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY t.latency_ms) AS latency_p99_ms
        FROM memory_request_telemetry t
        WHERE t.tenant_id = $1
          AND ${scopeFilterTelemetry.sql}
          AND t.created_at >= now() - (($${scopeFilterTelemetry.args.length + 1}::text || ' minutes')::interval)
        GROUP BY t.endpoint
        ORDER BY t.endpoint ASC
        `,
        [...scopeFilterTelemetry.args, windowMinutes],
      );

      const recallAudit = await client.query(
        `
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE seed_count = 0)::bigint AS empty_seed,
          COUNT(*) FILTER (WHERE node_count = 0)::bigint AS empty_nodes,
          COUNT(*) FILTER (WHERE edge_count = 0)::bigint AS empty_edges,
          AVG(seed_count)::double precision AS seed_avg,
          AVG(node_count)::double precision AS node_avg,
          AVG(edge_count)::double precision AS edge_avg
        FROM memory_recall_audit
        WHERE ${scopeFilterMemory.sql}
          AND created_at >= now() - (($${scopeFilterMemory.args.length + 1}::text || ' minutes')::interval)
        `,
        [...scopeFilterMemory.args, windowMinutes],
      );

      const outboxByType = await client.query(
        `
        SELECT
          event_type,
          COUNT(*) FILTER (WHERE published_at IS NULL AND failed_at IS NULL)::bigint AS pending,
          COUNT(*) FILTER (WHERE published_at IS NULL AND failed_at IS NULL AND attempts > 0)::bigint AS retrying,
          COUNT(*) FILTER (WHERE failed_at IS NOT NULL)::bigint AS failed,
          MAX(
            CASE
              WHEN published_at IS NULL AND failed_at IS NULL THEN EXTRACT(EPOCH FROM (now() - created_at))
              ELSE NULL
            END
          )::double precision AS oldest_pending_age_sec
        FROM memory_outbox
        WHERE ${scopeFilterMemory.sql}
        GROUP BY event_type
        ORDER BY event_type ASC
        `,
        scopeFilterMemory.args,
      );

      const endpointRows = requestTelemetry.rows.map((r: any) => {
        const total = Number(r.total ?? 0);
        const errors = Number(r.errors ?? 0);
        return {
          endpoint: String(r.endpoint ?? "unknown"),
          total,
          errors,
          error_rate: total > 0 ? round(errors / total) : 0,
          latency_p50_ms: round(Number(r.latency_p50_ms ?? 0)),
          latency_p95_ms: round(Number(r.latency_p95_ms ?? 0)),
          latency_p99_ms: round(Number(r.latency_p99_ms ?? 0)),
        };
      });

      const recallRow = recallAudit.rows[0] ?? {};
      const recallTotal = Number(recallRow.total ?? 0);
      const emptySeed = Number(recallRow.empty_seed ?? 0);
      const emptyNodes = Number(recallRow.empty_nodes ?? 0);
      const emptyEdges = Number(recallRow.empty_edges ?? 0);

      const outboxRows = outboxByType.rows.map((r: any) => ({
        event_type: String(r.event_type ?? "unknown"),
        pending: Number(r.pending ?? 0),
        retrying: Number(r.retrying ?? 0),
        failed: Number(r.failed ?? 0),
        oldest_pending_age_sec: round(Number(r.oldest_pending_age_sec ?? 0)),
      }));
      const outboxTotals = outboxRows.reduce(
        (acc, r) => {
          acc.pending += r.pending;
          acc.retrying += r.retrying;
          acc.failed += r.failed;
          acc.oldest_pending_age_sec = Math.max(acc.oldest_pending_age_sec, r.oldest_pending_age_sec);
          return acc;
        },
        { pending: 0, retrying: 0, failed: 0, oldest_pending_age_sec: 0 },
      );

      out.request_telemetry = {
        endpoints: endpointRows,
      };
      out.recall_pipeline = {
        total: recallTotal,
        empty_seed: emptySeed,
        empty_nodes: emptyNodes,
        empty_edges: emptyEdges,
        empty_seed_rate: recallTotal > 0 ? round(emptySeed / recallTotal) : 0,
        empty_node_rate: recallTotal > 0 ? round(emptyNodes / recallTotal) : 0,
        empty_edge_rate: recallTotal > 0 ? round(emptyEdges / recallTotal) : 0,
        seed_avg: round(Number(recallRow.seed_avg ?? 0)),
        node_avg: round(Number(recallRow.node_avg ?? 0)),
        edge_avg: round(Number(recallRow.edge_avg ?? 0)),
      };
      out.outbox = {
        totals: outboxTotals,
        by_event_type: outboxRows,
      };
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      out.warning = "schema_not_ready_for_operability_diagnostics";
      return out;
    }
    throw err;
  }

  return out;
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

export async function getTenantIncidentPublishRollup(
  db: Db,
  args: {
    tenant_id: string;
    window_hours?: number;
    sample_limit?: number;
  },
) {
  const tenantId = trimOrNull(args.tenant_id);
  if (!tenantId) throw new Error("tenant_id is required");
  const windowHours = Number.isFinite(args.window_hours)
    ? Math.max(1, Math.min(24 * 365, Math.trunc(args.window_hours!)))
    : 24 * 7;
  const sampleLimit = Number.isFinite(args.sample_limit) ? Math.max(1, Math.min(100, Math.trunc(args.sample_limit!))) : 20;

  try {
    return await withClient(db, async (client) => {
      const statusRows = await client.query(
        `
        SELECT status, COUNT(*)::bigint AS count
        FROM control_incident_publish_jobs
        WHERE tenant_id = $1
          AND created_at >= now() - (($2::text || ' hours')::interval)
        GROUP BY status
        ORDER BY status ASC
        `,
        [tenantId, windowHours],
      );

      const replayRows = await client.query(
        `
        SELECT
          action,
          COUNT(*)::bigint AS events,
          SUM(
            CASE
              WHEN (details->>'replayed_count') ~ '^[0-9]+$' THEN (details->>'replayed_count')::bigint
              ELSE 0
            END
          )::bigint AS replayed_count,
          SUM(
            CASE
              WHEN (details->>'candidate_count') ~ '^[0-9]+$' THEN (details->>'candidate_count')::bigint
              ELSE 0
            END
          )::bigint AS candidate_count
        FROM control_audit_events
        WHERE tenant_id = $1
          AND action IN ('incident_publish.replay', 'incident_publish.replay.preview')
          AND created_at >= now() - (($2::text || ' hours')::interval)
        GROUP BY action
        ORDER BY action ASC
        `,
        [tenantId, windowHours],
      );

      const sampleRows = await client.query(
        `
        SELECT
          id,
          run_id,
          status,
          attempts,
          max_attempts,
          target,
          last_error,
          updated_at
        FROM control_incident_publish_jobs
        WHERE tenant_id = $1
          AND status IN ('failed', 'dead_letter')
        ORDER BY updated_at DESC
        LIMIT $2
        `,
        [tenantId, sampleLimit],
      );

      const statusCounts: Record<string, number> = {};
      let total = 0;
      for (const r of statusRows.rows) {
        const status = String(r.status);
        const count = Number(r.count ?? 0);
        statusCounts[status] = count;
        total += count;
      }

      const replayAgg = {
        replay_events: 0,
        preview_events: 0,
        replayed_count: 0,
        candidate_count: 0,
      };
      for (const r of replayRows.rows) {
        const action = String(r.action);
        const events = Number(r.events ?? 0);
        const replayedCount = Number(r.replayed_count ?? 0);
        const candidateCount = Number(r.candidate_count ?? 0);
        if (action === "incident_publish.replay") replayAgg.replay_events += events;
        if (action === "incident_publish.replay.preview") replayAgg.preview_events += events;
        replayAgg.replayed_count += replayedCount;
        replayAgg.candidate_count += candidateCount;
      }

      const failedSample = sampleRows.rows.map((r) => ({
        id: String(r.id),
        run_id: r.run_id == null ? null : String(r.run_id),
        status: r.status == null ? null : String(r.status),
        attempts: Number(r.attempts ?? 0),
        max_attempts: Number(r.max_attempts ?? 0),
        target: r.target == null ? null : String(r.target),
        last_error: r.last_error == null ? null : String(r.last_error),
        updated_at: r.updated_at,
      }));

      return {
        ok: true,
        tenant_id: tenantId,
        window_hours: windowHours,
        generated_at: nowIso(),
        jobs: {
          total,
          status_counts: statusCounts,
          failed_or_dead_letter: (statusCounts.failed ?? 0) + (statusCounts.dead_letter ?? 0),
        },
        replay: replayAgg,
        failed_sample: failedSample,
      };
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      return {
        ok: false,
        tenant_id: tenantId,
        window_hours: windowHours,
        generated_at: nowIso(),
        warning: "incident_publish_schema_missing",
        jobs: {
          total: 0,
          status_counts: {},
          failed_or_dead_letter: 0,
        },
        replay: {
          replay_events: 0,
          preview_events: 0,
          replayed_count: 0,
          candidate_count: 0,
        },
        failed_sample: [],
      };
    }
    throw err;
  }
}

export async function getTenantIncidentPublishSloReport(
  db: Db,
  args: {
    tenant_id: string;
    window_hours?: number;
    baseline_hours?: number;
    anchor_utc?: string;
    min_jobs?: number;
    adaptive_multiplier?: number;
    failure_rate_floor?: number;
    dead_letter_rate_floor?: number;
    backlog_warning_abs?: number;
    dead_letter_backlog_warning_abs?: number;
    dead_letter_backlog_critical_abs?: number;
  },
) {
  const tenantId = trimOrNull(args.tenant_id);
  if (!tenantId) throw new Error("tenant_id is required");
  const windowHours = Number.isFinite(args.window_hours) ? Math.max(1, Math.min(24 * 365, Math.trunc(args.window_hours!))) : 24;
  const baselineHours = Number.isFinite(args.baseline_hours)
    ? Math.max(windowHours + 1, Math.min(24 * 365, Math.trunc(args.baseline_hours!)))
    : Math.max(windowHours + 1, 24 * 7);
  const minJobs = Number.isFinite(args.min_jobs) ? Math.max(1, Math.min(1_000_000, Math.trunc(args.min_jobs!))) : 20;
  const adaptiveMultiplier = Number.isFinite(args.adaptive_multiplier)
    ? Math.max(1, Math.min(20, Number(args.adaptive_multiplier)))
    : 2;
  const failureRateFloor = Number.isFinite(args.failure_rate_floor) ? Math.max(0, Math.min(1, Number(args.failure_rate_floor))) : 0.05;
  const deadLetterRateFloor = Number.isFinite(args.dead_letter_rate_floor)
    ? Math.max(0, Math.min(1, Number(args.dead_letter_rate_floor)))
    : 0.02;
  const backlogWarningAbs = Number.isFinite(args.backlog_warning_abs)
    ? Math.max(1, Math.min(1_000_000, Math.trunc(args.backlog_warning_abs!)))
    : 200;
  const deadLetterBacklogWarningAbs = Number.isFinite(args.dead_letter_backlog_warning_abs)
    ? Math.max(1, Math.min(1_000_000, Math.trunc(args.dead_letter_backlog_warning_abs!)))
    : 20;
  const deadLetterBacklogCriticalAbs = Number.isFinite(args.dead_letter_backlog_critical_abs)
    ? Math.max(deadLetterBacklogWarningAbs, Math.min(1_000_000, Math.trunc(args.dead_letter_backlog_critical_abs!)))
    : Math.max(deadLetterBacklogWarningAbs, 50);
  const anchor = normalizeIsoTimestamp(trimOrNull(args.anchor_utc)) ?? nowIso();

  function countByStatus(rows: Array<{ status: string; count: string | number }>) {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const status = String(r.status);
      out[status] = Number(r.count ?? 0);
    }
    return out;
  }

  function buildMetrics(statusCounts: Record<string, number>) {
    const succeeded = Number(statusCounts.succeeded ?? 0);
    const failed = Number(statusCounts.failed ?? 0);
    const deadLetter = Number(statusCounts.dead_letter ?? 0);
    const total = succeeded + failed + deadLetter;
    const failureRate = total > 0 ? (failed + deadLetter) / total : 0;
    const deadLetterRate = total > 0 ? deadLetter / total : 0;
    return {
      succeeded,
      failed,
      dead_letter: deadLetter,
      total_processed: total,
      failure_rate: round(failureRate),
      dead_letter_rate: round(deadLetterRate),
    };
  }

  try {
    return await withClient(db, async (client) => {
      const curRows = await client.query(
        `
        SELECT status, COUNT(*)::bigint AS count
        FROM control_incident_publish_jobs
        WHERE tenant_id = $1
          AND updated_at > ($2::timestamptz - (($3::text || ' hours')::interval))
          AND updated_at <= $2::timestamptz
        GROUP BY status
        `,
        [tenantId, anchor, windowHours],
      );
      const baseRows = await client.query(
        `
        SELECT status, COUNT(*)::bigint AS count
        FROM control_incident_publish_jobs
        WHERE tenant_id = $1
          AND updated_at > ($2::timestamptz - (($4::text || ' hours')::interval))
          AND updated_at <= ($2::timestamptz - (($3::text || ' hours')::interval))
        GROUP BY status
        `,
        [tenantId, anchor, windowHours, baselineHours],
      );
      const backlogRow = await client.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE status IN ('pending', 'processing', 'failed'))::bigint AS open_backlog,
          COUNT(*) FILTER (WHERE status = 'dead_letter')::bigint AS dead_letter_backlog
        FROM control_incident_publish_jobs
        WHERE tenant_id = $1
        `,
        [tenantId],
      );

      const currentCounts = countByStatus(curRows.rows as any[]);
      const baselineCounts = countByStatus(baseRows.rows as any[]);
      const current = buildMetrics(currentCounts);
      const baseline = buildMetrics(baselineCounts);
      const openBacklog = Number(backlogRow.rows[0]?.open_backlog ?? 0);
      const deadLetterBacklog = Number(backlogRow.rows[0]?.dead_letter_backlog ?? 0);

      const failureRateThreshold = Math.max(
        failureRateFloor,
        baseline.total_processed >= minJobs ? baseline.failure_rate * adaptiveMultiplier : failureRateFloor,
      );
      const deadLetterRateThreshold = Math.max(
        deadLetterRateFloor,
        baseline.total_processed >= minJobs ? baseline.dead_letter_rate * adaptiveMultiplier : deadLetterRateFloor,
      );

      const warningSignals: string[] = [];
      const criticalSignals: string[] = [];

      if (current.total_processed >= minJobs && current.failure_rate > failureRateThreshold) {
        warningSignals.push("failure_rate_above_threshold");
      }
      if (current.total_processed >= minJobs && current.dead_letter_rate > deadLetterRateThreshold) {
        warningSignals.push("dead_letter_rate_above_threshold");
      }
      if (openBacklog > backlogWarningAbs) {
        warningSignals.push("open_backlog_above_threshold");
      }
      if (deadLetterBacklog > deadLetterBacklogWarningAbs) {
        warningSignals.push("dead_letter_backlog_above_threshold");
      }

      if (current.total_processed >= minJobs && current.failure_rate > failureRateThreshold * 1.5) {
        criticalSignals.push("failure_rate_far_above_threshold");
      }
      if (current.total_processed >= minJobs && current.dead_letter_rate > deadLetterRateThreshold * 1.5) {
        criticalSignals.push("dead_letter_rate_far_above_threshold");
      }
      if (deadLetterBacklog > deadLetterBacklogCriticalAbs) {
        criticalSignals.push("dead_letter_backlog_critical");
      }

      const degraded = warningSignals.length > 0 || criticalSignals.length > 0;
      const severity = criticalSignals.length > 0 ? "critical" : warningSignals.length > 0 ? "warning" : null;

      return {
        ok: true,
        tenant_id: tenantId,
        generated_at: nowIso(),
        snapshot: {
          anchor_utc: anchor,
          window_hours: windowHours,
          baseline_hours: baselineHours,
        },
        thresholds: {
          min_jobs: minJobs,
          adaptive_multiplier: round(adaptiveMultiplier),
          failure_rate_floor: round(failureRateFloor),
          dead_letter_rate_floor: round(deadLetterRateFloor),
          failure_rate_threshold: round(failureRateThreshold),
          dead_letter_rate_threshold: round(deadLetterRateThreshold),
          backlog_warning_abs: backlogWarningAbs,
          dead_letter_backlog_warning_abs: deadLetterBacklogWarningAbs,
          dead_letter_backlog_critical_abs: deadLetterBacklogCriticalAbs,
        },
        metrics: {
          current,
          baseline,
          backlog: {
            open_backlog: openBacklog,
            dead_letter_backlog: deadLetterBacklog,
          },
        },
        degraded,
        severity,
        warning_signals: warningSignals,
        critical_signals: criticalSignals,
      };
    });
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") {
      return {
        ok: false,
        tenant_id: tenantId,
        generated_at: nowIso(),
        warning: "incident_publish_schema_missing",
        degraded: false,
        severity: null,
        warning_signals: [],
        critical_signals: [],
      };
    }
    throw err;
  }
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
