import { createHash, randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { lookup } from "node:dns/promises";
import { mkdir } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type pg from "pg";
import { HttpError, badRequest } from "../util/http.js";
import {
  SandboxExecuteRequest,
  SandboxRunArtifactRequest,
  SandboxRunCancelRequest,
  SandboxRunGetRequest,
  SandboxRunLogsRequest,
  SandboxSessionCreateRequest,
} from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
import { summarizeToolResult } from "./tool-result-summary.js";

type SandboxDefaults = {
  defaultScope: string;
  defaultTenantId: string;
  defaultTimeoutMs: number;
};

type SandboxRunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled" | "timeout";
type SandboxMode = "async" | "sync";

type SandboxRunRow = {
  id: string;
  session_id: string;
  tenant_id: string;
  scope: string;
  project_id?: string | null;
  planner_run_id: string | null;
  decision_id: string | null;
  action_kind: "command";
  action_json: any;
  mode: SandboxMode;
  status: SandboxRunStatus;
  timeout_ms: number;
  stdout_text: string;
  stderr_text: string;
  output_truncated: boolean;
  exit_code: number | null;
  error: string | null;
  cancel_requested: boolean;
  cancel_reason: string | null;
  metadata: any;
  result_json: any;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type SandboxSessionRow = {
  id: string;
  tenant_id: string;
  scope: string;
  profile: "default" | "restricted";
  metadata: any;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SandboxExecutorConfig = {
  enabled: boolean;
  mode: "mock" | "local_process" | "http_remote";
  maxConcurrency: number;
  defaultTimeoutMs: number;
  stdioMaxBytes: number;
  workdir: string;
  allowedCommands: Set<string>;
  remote: {
    url: string | null;
    authHeader: string;
    authToken: string;
    timeoutMs: number;
    allowedHosts: Set<string>;
    allowedEgressCidrs: Set<string>;
    denyPrivateIps: boolean;
    mtlsCertPem: string;
    mtlsKeyPem: string;
    mtlsCaPem: string;
    mtlsServerName: string;
  };
  artifactObjectStoreBaseUri: string | null;
  heartbeatIntervalMs: number;
  staleAfterMs: number;
  recoveryPollIntervalMs: number;
  recoveryBatchSize: number;
};

type SandboxStore = {
  withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
};

type ActiveRunState =
  | {
      kind: "local_process";
      child: ChildProcessWithoutNullStreams;
      timedOut: boolean;
      canceled: boolean;
    }
  | {
      kind: "http_remote";
      abort: AbortController;
      timedOut: boolean;
      canceled: boolean;
    };

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const out = v.trim();
  return out.length > 0 ? out : null;
}

function jsonObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function normalizeTimeoutMs(input: number | undefined, defaultTimeoutMs: number): number {
  if (!Number.isFinite(input)) return defaultTimeoutMs;
  return Math.max(100, Math.min(600000, Math.trunc(input!)));
}

function tailText(input: string, maxBytes: number): string {
  const text = String(input ?? "");
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const buf = Buffer.from(text, "utf8");
  return buf.subarray(Math.max(0, buf.length - maxBytes)).toString("utf8");
}

function clampOutputAppend(current: string, chunk: Buffer, maxBytes: number): { next: string; truncated: boolean } {
  if (maxBytes <= 0) return { next: "", truncated: true };
  const cur = Buffer.from(current, "utf8");
  if (cur.length >= maxBytes) return { next: cur.toString("utf8"), truncated: true };
  const remaining = maxBytes - cur.length;
  const take = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
  const merged = Buffer.concat([cur, take], Math.min(maxBytes, cur.length + take.length));
  return { next: merged.toString("utf8"), truncated: chunk.length > remaining };
}

const TERMINAL_SANDBOX_STATUSES = new Set<SandboxRunStatus>(["succeeded", "failed", "canceled", "timeout"]);

function normalizeSandboxStatus(input: unknown): SandboxRunStatus | null {
  const raw = trimOrNull(input);
  if (!raw) return null;
  if (raw === "queued" || raw === "running" || raw === "succeeded" || raw === "failed" || raw === "canceled" || raw === "timeout") {
    return raw;
  }
  return null;
}

function asFiniteIntOrNull(input: unknown): number | null {
  if (!Number.isFinite(Number(input))) return null;
  return Math.trunc(Number(input));
}

function sandboxRemoteHostAllowed(hostname: string, allowlist: Set<string>): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (allowlist.size === 0) return true;
  for (const raw of allowlist.values()) {
    const rule = raw.trim().toLowerCase();
    if (!rule) continue;
    if (rule.startsWith("*.")) {
      const suffix = rule.slice(2);
      if (!suffix) continue;
      if (host === suffix || host.endsWith(`.${suffix}`)) return true;
      continue;
    }
    if (host === rule) return true;
  }
  return false;
}

type ParsedCidr = {
  family: 4 | 6;
  prefix: number;
  network: bigint;
  mask: bigint;
};

function trimTrailingSlash(v: string): string {
  return v.replace(/\/+$/g, "");
}

function sha256Text(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

function normalizeIpv4(ip: string): string | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (!Number.isFinite(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets.join(".");
}

function parseIpv6ToHextets(raw: string): number[] | null {
  const input = raw.trim().toLowerCase();
  if (!input) return null;
  const zone = input.indexOf("%");
  const stripped = zone >= 0 ? input.slice(0, zone) : input;
  const hasDouble = stripped.includes("::");
  if (hasDouble && stripped.indexOf("::") !== stripped.lastIndexOf("::")) return null;
  const [leftRaw, rightRaw] = hasDouble ? stripped.split("::") : [stripped, ""];
  const left = leftRaw.length > 0 ? leftRaw.split(":") : [];
  const right = rightRaw.length > 0 ? rightRaw.split(":") : [];

  const parsePart = (part: string): number[] | null => {
    if (!part) return [];
    if (part.includes(".")) {
      const normalized = normalizeIpv4(part);
      if (!normalized) return null;
      const octets = normalized.split(".").map((x) => Number(x));
      return [((octets[0] << 8) | octets[1]) & 0xffff, ((octets[2] << 8) | octets[3]) & 0xffff];
    }
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    return [Number.parseInt(part, 16)];
  };

  const leftNums: number[] = [];
  for (const part of left) {
    const parsed = parsePart(part);
    if (!parsed) return null;
    leftNums.push(...parsed);
  }
  const rightNums: number[] = [];
  for (const part of right) {
    const parsed = parsePart(part);
    if (!parsed) return null;
    rightNums.push(...parsed);
  }

  if (hasDouble) {
    const zeros = 8 - (leftNums.length + rightNums.length);
    if (zeros < 0) return null;
    return [...leftNums, ...new Array(zeros).fill(0), ...rightNums];
  }
  if (leftNums.length !== 8) return null;
  return leftNums;
}

function ipToBigInt(ipRaw: string): { family: 4 | 6; value: bigint } | null {
  const ip = ipRaw.trim();
  const family = isIP(ip);
  if (family === 4) {
    const normalized = normalizeIpv4(ip);
    if (!normalized) return null;
    const value = normalized
      .split(".")
      .map((x) => BigInt(Number(x)))
      .reduce((acc, oct) => (acc << 8n) + oct, 0n);
    return { family: 4, value };
  }
  if (family === 6) {
    const hextets = parseIpv6ToHextets(ip);
    if (!hextets || hextets.length !== 8) return null;
    let value = 0n;
    for (const h of hextets) value = (value << 16n) + BigInt(h);
    return { family: 6, value };
  }
  return null;
}

function parseCidrRule(raw: string): ParsedCidr | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const slash = v.lastIndexOf("/");
  if (slash <= 0 || slash >= v.length - 1) return null;
  const ipPart = v.slice(0, slash).trim();
  const prefixRaw = v.slice(slash + 1).trim();
  const ip = ipToBigInt(ipPart);
  if (!ip) return null;
  const bits = ip.family === 4 ? 32 : 128;
  const prefix = Number(prefixRaw);
  if (!Number.isFinite(prefix) || Math.trunc(prefix) !== prefix || prefix < 0 || prefix > bits) return null;
  const shift = BigInt(bits - prefix);
  const fullMask = (1n << BigInt(bits)) - 1n;
  const mask = prefix === 0 ? 0n : (fullMask << shift) & fullMask;
  return {
    family: ip.family,
    prefix,
    network: ip.value & mask,
    mask,
  };
}

function ipInCidrs(ip: string, cidrs: ParsedCidr[]): boolean {
  const parsedIp = ipToBigInt(ip);
  if (!parsedIp) return false;
  for (const cidr of cidrs) {
    if (cidr.family !== parsedIp.family) continue;
    if ((parsedIp.value & cidr.mask) === cidr.network) return true;
  }
  return false;
}

function isPrivateOrLocalIp(ipRaw: string): boolean {
  const parsed = ipToBigInt(ipRaw);
  if (!parsed) return true;
  if (parsed.family === 4) {
    const n = Number(parsed.value);
    const b1 = (n >>> 24) & 0xff;
    const b2 = (n >>> 16) & 0xff;
    if (b1 === 10) return true;
    if (b1 === 127) return true;
    if (b1 === 0) return true;
    if (b1 === 169 && b2 === 254) return true;
    if (b1 === 172 && b2 >= 16 && b2 <= 31) return true;
    if (b1 === 192 && b2 === 168) return true;
    if (b1 >= 224) return true;
    return false;
  }
  const ip = parseIpv6ToHextets(ipRaw);
  if (!ip || ip.length !== 8) return true;
  if (ip.every((x) => x === 0)) return true; // ::
  if (ip[0] === 0 && ip[1] === 0 && ip[2] === 0 && ip[3] === 0 && ip[4] === 0 && ip[5] === 0 && ip[6] === 0 && ip[7] === 1) return true; // ::1
  if ((ip[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((ip[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if (ip[0] === 0xff00) return true; // ff00::/8 multicast
  if (
    ip[0] === 0
    && ip[1] === 0
    && ip[2] === 0
    && ip[3] === 0
    && ip[4] === 0
    && ip[5] === 0xffff
  ) {
    const b1 = (ip[6] >>> 8) & 0xff;
    const b2 = ip[6] & 0xff;
    const b3 = (ip[7] >>> 8) & 0xff;
    const b4 = ip[7] & 0xff;
    return isPrivateOrLocalIp(`${b1}.${b2}.${b3}.${b4}`);
  }
  return false;
}

export async function postJsonWithTls(
  target: URL,
  payload: string,
  headers: Record<string, string>,
  timeoutMs: number,
  signal: AbortSignal,
  tls: {
    certPem: string;
    keyPem: string;
    caPem: string;
    serverName: string;
  },
  opts?: {
    resolvedAddress?: string | null;
    maxBodyBytes?: number;
  },
): Promise<{ status: number; bodyText: string }> {
  const isHttps = target.protocol === "https:";
  const defaultPort = isHttps ? 443 : 80;
  const path = `${target.pathname}${target.search}`;
  const maxBodyBytes = Math.max(1024, Math.trunc(Number(opts?.maxBodyBytes ?? 512 * 1024)));
  const forcedAddress = trimOrNull(opts?.resolvedAddress);
  const forcedFamily = forcedAddress ? isIP(forcedAddress) : 0;
  const forcedLookup =
    forcedAddress && (forcedFamily === 4 || forcedFamily === 6)
      ? (_hostname: string, optionsOrCallback: unknown, callbackMaybe?: unknown) => {
          const options =
            optionsOrCallback && typeof optionsOrCallback === "object" && !Array.isArray(optionsOrCallback)
              ? (optionsOrCallback as Record<string, unknown>)
              : null;
          const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : callbackMaybe;
          if (typeof callback !== "function") return;
          if (options?.all === true) {
            callback(null, [{ address: forcedAddress, family: forcedFamily }]);
            return;
          }
          callback(null, forcedAddress, forcedFamily);
        }
      : undefined;

  return await new Promise((resolve, reject) => {
    let settled = false;
    let abortHandler: (() => void) | null = null;
    let req: any = null;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (abortHandler) signal.removeEventListener("abort", abortHandler);
      fn();
    };
    const onAbort = () => done(() => reject(new Error("aborted")));
    if (signal.aborted) {
      onAbort();
      return;
    }

    const onResponse = (res: any) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      res.on("data", (chunk: Buffer | string) => {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        totalBytes += part.length;
        if (totalBytes > maxBodyBytes) {
          try {
            res.destroy(new Error("response_too_large"));
          } catch {
            // ignore best-effort stream abort errors
          }
          done(() => reject(new Error("response_too_large")));
          return;
        }
        chunks.push(part);
      });
      res.on("end", () => {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        done(() => resolve({ status: Number(res.statusCode ?? 0), bodyText }));
      });
      res.on("error", (err: unknown) => done(() => reject(err)));
    };
    req = isHttps
      ? httpsRequest(
          {
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port ? Number(target.port) : defaultPort,
            method: "POST",
            path,
            headers,
            timeout: timeoutMs,
            lookup: forcedLookup,
            cert: tls.certPem || undefined,
            key: tls.keyPem || undefined,
            ca: tls.caPem || undefined,
            servername: tls.serverName || target.hostname,
            rejectUnauthorized: true,
          },
          onResponse,
        )
      : httpRequest(
          {
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port ? Number(target.port) : defaultPort,
            method: "POST",
            path,
            headers,
            timeout: timeoutMs,
            lookup: forcedLookup,
          },
          onResponse,
        );
    abortHandler = () => {
      try {
        req.destroy(new Error("aborted"));
      } catch {
        // ignore
      }
      onAbort();
    };
    signal.addEventListener("abort", abortHandler);
    req.on("timeout", () => {
      try {
        req.destroy(new Error("request_timeout"));
      } catch {
        // ignore
      }
    });
    req.on("error", (err: unknown) => done(() => reject(err)));
    req.write(payload, "utf8");
    req.end();
  });
}

function toRunPayload(row: SandboxRunRow) {
  const resultSummary = summarizeToolResult({
    stdout: row.stdout_text,
    stderr: row.stderr_text,
    result: row.result_json ?? {},
    exit_code: row.exit_code,
    error: row.error,
    truncated: row.output_truncated,
  });
  return {
    run_id: row.id,
    session_id: row.session_id,
    project_id: row.project_id ?? null,
    planner_run_id: row.planner_run_id,
    decision_id: row.decision_id,
    action: {
      kind: row.action_kind,
      ...(row.action_json ?? {}),
    },
    mode: row.mode,
    status: row.status,
    timeout_ms: row.timeout_ms,
    output: {
      stdout: row.stdout_text ?? "",
      stderr: row.stderr_text ?? "",
      truncated: !!row.output_truncated,
    },
    exit_code: row.exit_code,
    error: row.error,
    cancel_requested: row.cancel_requested,
    cancel_reason: row.cancel_reason,
    result: row.result_json ?? {},
    result_summary: resultSummary,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isoToMs(v: string | null): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function deltaMs(startMs: number | null, endMs: number | null): number {
  if (!Number.isFinite(startMs ?? NaN) || !Number.isFinite(endMs ?? NaN)) return 0;
  return Math.max(0, Number(endMs) - Number(startMs));
}

function normalizeTelemetryErrorCode(v: string | null): string | null {
  const raw = trimOrNull(v);
  if (!raw) return null;
  const compact = raw.toLowerCase().replace(/[^a-z0-9:_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!compact) return null;
  return compact.slice(0, 120);
}

function telemetryExecutor(row: SandboxRunRow): string | null {
  const value = row.result_json && typeof row.result_json === "object" ? (row.result_json as any).executor : null;
  const normalized = trimOrNull(typeof value === "string" ? value : null);
  return normalized ? normalized.slice(0, 32) : null;
}

function isTerminalStatus(status: SandboxRunStatus): boolean {
  return TERMINAL_SANDBOX_STATUSES.has(status);
}

async function recordSandboxRunTelemetryRow(client: pg.PoolClient, row: SandboxRunRow): Promise<void> {
  if (!isTerminalStatus(row.status)) return;
  const createdMs = isoToMs(row.created_at);
  const startedMs = isoToMs(row.started_at);
  const finishedMs = isoToMs(row.finished_at) ?? isoToMs(row.updated_at);

  const queueWaitMs = startedMs !== null ? deltaMs(createdMs, startedMs) : deltaMs(createdMs, finishedMs);
  const runtimeMs = startedMs !== null ? deltaMs(startedMs, finishedMs) : 0;
  const totalLatencyMs = deltaMs(createdMs, finishedMs);

  try {
    await client.query(
      `
      INSERT INTO memory_sandbox_run_telemetry (
        run_id,
        session_id,
        tenant_id,
        scope,
        mode,
        status,
        executor,
        timeout_ms,
        queue_wait_ms,
        runtime_ms,
        total_latency_ms,
        cancel_requested,
        output_truncated,
        exit_code,
        error_code
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15
      )
      ON CONFLICT (run_id) DO NOTHING
      `,
      [
        row.id,
        row.session_id,
        row.tenant_id,
        row.scope,
        row.mode,
        row.status,
        telemetryExecutor(row),
        row.timeout_ms,
        queueWaitMs,
        runtimeMs,
        totalLatencyMs,
        row.cancel_requested,
        row.output_truncated,
        row.exit_code,
        normalizeTelemetryErrorCode(row.error),
      ],
    );
  } catch (err: any) {
    if (String(err?.code ?? "") === "42P01") return;
    throw err;
  }
}

export async function createSandboxSession(
  client: pg.PoolClient,
  body: unknown,
  defaults: Omit<SandboxDefaults, "defaultTimeoutMs">,
) {
  const parsed = SandboxSessionCreateRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope: defaults.defaultScope, defaultTenantId: defaults.defaultTenantId },
  );
  const expiresAt =
    parsed.ttl_seconds && Number.isFinite(parsed.ttl_seconds)
      ? new Date(Date.now() + parsed.ttl_seconds * 1000).toISOString()
      : null;
  const row = await client.query<SandboxSessionRow>(
    `
    INSERT INTO memory_sandbox_sessions (
      tenant_id, scope, profile, metadata, expires_at
    )
    VALUES ($1, $2, $3, $4::jsonb, $5)
    RETURNING
      id::text,
      tenant_id,
      scope,
      profile::text AS profile,
      metadata,
      expires_at::text AS expires_at,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    `,
    [tenancy.tenant_id, tenancy.scope, parsed.profile, JSON.stringify(jsonObject(parsed.metadata)), expiresAt],
  );
  const session = row.rows[0];
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    session: {
      session_id: session.id,
      profile: session.profile,
      metadata: session.metadata ?? {},
      expires_at: session.expires_at,
      created_at: session.created_at,
      updated_at: session.updated_at,
    },
  };
}

export async function enqueueSandboxRun(
  client: pg.PoolClient,
  body: unknown,
  defaults: SandboxDefaults,
) {
  const parsed = SandboxExecuteRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope: defaults.defaultScope, defaultTenantId: defaults.defaultTenantId },
  );

  const sessionRes = await client.query<{ id: string; expires_at: string | null }>(
    `
    SELECT id::text, expires_at::text AS expires_at
    FROM memory_sandbox_sessions
    WHERE id = $1
      AND tenant_id = $2
      AND scope = $3
    LIMIT 1
    `,
    [parsed.session_id, tenancy.tenant_id, tenancy.scope],
  );
  const session = sessionRes.rows[0] ?? null;
  if (!session) {
    throw new HttpError(404, "sandbox_session_not_found", "sandbox session was not found in this tenant/scope", {
      session_id: parsed.session_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
  }
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    throw new HttpError(409, "sandbox_session_expired", "sandbox session is expired", {
      session_id: parsed.session_id,
      expires_at: session.expires_at,
    });
  }

  const timeoutMs = normalizeTimeoutMs(parsed.timeout_ms, defaults.defaultTimeoutMs);
  const runId = randomUUID();
  const out = await client.query<SandboxRunRow>(
    `
    INSERT INTO memory_sandbox_runs (
      id,
      session_id,
      tenant_id,
      scope,
      project_id,
      planner_run_id,
      decision_id,
      action_kind,
      action_json,
      mode,
      status,
      timeout_ms,
      metadata
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, 'command', $8::jsonb, $9, 'queued', $10, $11::jsonb
    )
    RETURNING
      id::text,
      session_id::text,
      tenant_id,
      scope,
      project_id,
      planner_run_id,
      decision_id::text,
      action_kind::text AS action_kind,
      action_json,
      mode::text,
      status::text,
      timeout_ms,
      stdout_text,
      stderr_text,
      output_truncated,
      exit_code,
      error,
      cancel_requested,
      cancel_reason,
      metadata,
      result_json,
      started_at::text,
      finished_at::text,
      created_at::text,
      updated_at::text
    `,
    [
      runId,
      parsed.session_id,
      tenancy.tenant_id,
      tenancy.scope,
      trimOrNull(parsed.project_id),
      trimOrNull(parsed.planner_run_id),
      parsed.decision_id ?? null,
      JSON.stringify({ argv: parsed.action.argv }),
      parsed.mode,
      timeoutMs,
      JSON.stringify(jsonObject(parsed.metadata)),
    ],
  );
  const row = out.rows[0];
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run: toRunPayload(row),
  };
}

export async function getSandboxRun(client: pg.PoolClient, body: unknown, defaults: Omit<SandboxDefaults, "defaultTimeoutMs">) {
  const parsed = SandboxRunGetRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope: defaults.defaultScope, defaultTenantId: defaults.defaultTenantId },
  );
  const out = await client.query<SandboxRunRow>(
    `
    SELECT
      id::text,
      session_id::text,
      tenant_id,
      scope,
      project_id,
      planner_run_id,
      decision_id::text,
      action_kind::text AS action_kind,
      action_json,
      mode::text,
      status::text,
      timeout_ms,
      stdout_text,
      stderr_text,
      output_truncated,
      exit_code,
      error,
      cancel_requested,
      cancel_reason,
      metadata,
      result_json,
      started_at::text,
      finished_at::text,
      created_at::text,
      updated_at::text
    FROM memory_sandbox_runs
    WHERE id = $1
      AND tenant_id = $2
      AND scope = $3
    LIMIT 1
    `,
    [parsed.run_id, tenancy.tenant_id, tenancy.scope],
  );
  const row = out.rows[0] ?? null;
  if (!row) {
    throw new HttpError(404, "sandbox_run_not_found", "sandbox run was not found in this tenant/scope", {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
  }
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run: toRunPayload(row),
  };
}

export async function getSandboxRunLogs(client: pg.PoolClient, body: unknown, defaults: Omit<SandboxDefaults, "defaultTimeoutMs">) {
  const parsed = SandboxRunLogsRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope: defaults.defaultScope, defaultTenantId: defaults.defaultTenantId },
  );
  const out = await client.query<Pick<SandboxRunRow, "id" | "status" | "stdout_text" | "stderr_text" | "output_truncated">>(
    `
    SELECT
      id::text,
      status::text,
      stdout_text,
      stderr_text,
      output_truncated
    FROM memory_sandbox_runs
    WHERE id = $1
      AND tenant_id = $2
      AND scope = $3
    LIMIT 1
    `,
    [parsed.run_id, tenancy.tenant_id, tenancy.scope],
  );
  const row = out.rows[0] ?? null;
  if (!row) {
    throw new HttpError(404, "sandbox_run_not_found", "sandbox run was not found in this tenant/scope", {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
  }
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run_id: row.id,
    status: row.status,
    logs: {
      tail_bytes: parsed.tail_bytes,
      stdout: tailText(row.stdout_text, parsed.tail_bytes),
      stderr: tailText(row.stderr_text, parsed.tail_bytes),
      truncated: !!row.output_truncated,
      summary: summarizeToolResult({
        stdout: row.stdout_text,
        stderr: row.stderr_text,
        exit_code: null,
        error: null,
        truncated: row.output_truncated,
      }),
    },
  };
}

export async function getSandboxRunArtifact(
  client: pg.PoolClient,
  body: unknown,
  defaults: Omit<SandboxDefaults, "defaultTimeoutMs"> & { artifactObjectStoreBaseUri?: string | null },
) {
  const parsed = SandboxRunArtifactRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope: defaults.defaultScope, defaultTenantId: defaults.defaultTenantId },
  );
  const out = await client.query<SandboxRunRow>(
    `
    SELECT
      id::text,
      session_id::text,
      tenant_id,
      scope,
      project_id,
      planner_run_id,
      decision_id::text,
      action_kind::text AS action_kind,
      action_json,
      mode::text,
      status::text,
      timeout_ms,
      stdout_text,
      stderr_text,
      output_truncated,
      exit_code,
      error,
      cancel_requested,
      cancel_reason,
      metadata,
      result_json,
      started_at::text,
      finished_at::text,
      created_at::text,
      updated_at::text
    FROM memory_sandbox_runs
    WHERE id = $1
      AND tenant_id = $2
      AND scope = $3
    LIMIT 1
    `,
    [parsed.run_id, tenancy.tenant_id, tenancy.scope],
  );
  const row = out.rows[0] ?? null;
  if (!row) {
    throw new HttpError(404, "sandbox_run_not_found", "sandbox run was not found in this tenant/scope", {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
  }
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    artifact: {
      artifact_version: "sandbox_run_artifact_v2",
      run_id: row.id,
      session_id: row.session_id,
      uri: `aionis://${row.tenant_id}/${row.scope}/sandbox_run/${row.id}`,
      project_id: row.project_id ?? null,
      planner_run_id: row.planner_run_id,
      decision_id: row.decision_id,
      mode: row.mode,
      status: row.status,
      timeout_ms: row.timeout_ms,
      action: parsed.include_action
        ? {
            kind: row.action_kind,
            ...(row.action_json ?? {}),
          }
        : undefined,
      output: parsed.include_output
        ? {
            tail_bytes: parsed.tail_bytes,
            stdout: tailText(row.stdout_text, parsed.tail_bytes),
            stderr: tailText(row.stderr_text, parsed.tail_bytes),
            truncated: !!row.output_truncated,
          }
        : undefined,
      summary: summarizeToolResult({
        stdout: row.stdout_text,
        stderr: row.stderr_text,
        result: row.result_json ?? {},
        exit_code: row.exit_code,
        error: row.error,
        truncated: row.output_truncated,
      }),
      exit_code: row.exit_code,
      error: row.error,
      result: parsed.include_result ? row.result_json ?? {} : undefined,
      metadata: parsed.include_metadata ? row.metadata ?? {} : undefined,
      bundle: (() => {
        const bundleBase = trimOrNull(defaults.artifactObjectStoreBaseUri);
        const objectPrefix = `sandbox/${encodeURIComponent(row.tenant_id)}/${encodeURIComponent(row.scope)}/${row.id}`;
        const objectUriFor = (name: string): string | null => {
          if (!bundleBase) return null;
          return `${trimTrailingSlash(bundleBase)}/${objectPrefix}/${name}`;
        };
        const objects: Array<Record<string, unknown>> = [];
        const addObject = (
          name: string,
          mediaType: "application/json" | "text/plain",
          payload: unknown,
        ) => {
          const serialized = mediaType === "text/plain" ? String(payload ?? "") : JSON.stringify(payload ?? {});
          objects.push({
            name,
            media_type: mediaType,
            bytes: Buffer.byteLength(serialized, "utf8"),
            sha256: sha256Text(serialized),
            uri: objectUriFor(name),
            inline: parsed.bundle_inline ? payload : undefined,
          });
        };

        if (parsed.include_action) {
          addObject("action.json", "application/json", {
            kind: row.action_kind,
            ...(row.action_json ?? {}),
          });
        }
        if (parsed.include_output) {
          addObject("output.json", "application/json", {
            tail_bytes: parsed.tail_bytes,
            stdout: tailText(row.stdout_text, parsed.tail_bytes),
            stderr: tailText(row.stderr_text, parsed.tail_bytes),
            truncated: !!row.output_truncated,
          });
        }
        if (parsed.include_result) {
          addObject("result.json", "application/json", row.result_json ?? {});
        }
        addObject(
          "summary.json",
          "application/json",
          summarizeToolResult({
            stdout: row.stdout_text,
            stderr: row.stderr_text,
            result: row.result_json ?? {},
            exit_code: row.exit_code,
            error: row.error,
            truncated: row.output_truncated,
          }),
        );
        if (parsed.include_metadata) {
          addObject("metadata.json", "application/json", row.metadata ?? {});
        }
        addObject("run.json", "application/json", {
          run_id: row.id,
          session_id: row.session_id,
          project_id: row.project_id ?? null,
          tenant_id: row.tenant_id,
          scope: row.scope,
          planner_run_id: row.planner_run_id,
          decision_id: row.decision_id,
          mode: row.mode,
          status: row.status,
          timeout_ms: row.timeout_ms,
          exit_code: row.exit_code,
          error: row.error,
          result_summary: summarizeToolResult({
            stdout: row.stdout_text,
            stderr: row.stderr_text,
            result: row.result_json ?? {},
            exit_code: row.exit_code,
            error: row.error,
            truncated: row.output_truncated,
          }),
          started_at: row.started_at,
          finished_at: row.finished_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });

        return {
          manifest_version: "sandbox_artifact_bundle_manifest_v1",
          object_store_base_uri: bundleBase ?? null,
          object_prefix: objectPrefix,
          generated_at: new Date().toISOString(),
          objects,
        };
      })(),
      started_at: row.started_at,
      finished_at: row.finished_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}

export async function cancelSandboxRun(client: pg.PoolClient, body: unknown, defaults: Omit<SandboxDefaults, "defaultTimeoutMs">) {
  const parsed = SandboxRunCancelRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope: defaults.defaultScope, defaultTenantId: defaults.defaultTenantId },
  );
  const reason = trimOrNull(parsed.reason);
  const out = await client.query<Pick<SandboxRunRow, "id" | "status" | "cancel_requested" | "cancel_reason">>(
    `
    UPDATE memory_sandbox_runs
    SET
      cancel_requested = true,
      cancel_reason = COALESCE($4, cancel_reason),
      updated_at = now()
    WHERE id = $1
      AND tenant_id = $2
      AND scope = $3
    RETURNING
      id::text,
      status::text,
      cancel_requested,
      cancel_reason
    `,
    [parsed.run_id, tenancy.tenant_id, tenancy.scope, reason],
  );
  const row = out.rows[0] ?? null;
  if (!row) {
    throw new HttpError(404, "sandbox_run_not_found", "sandbox run was not found in this tenant/scope", {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
  }

  if (row.status === "queued") {
    const canceled = await client.query<SandboxRunRow>(
      `
      UPDATE memory_sandbox_runs
      SET
        status = 'canceled',
        finished_at = now(),
        error = COALESCE(error, 'canceled_before_execution'),
        result_json = COALESCE(result_json, '{}'::jsonb) || jsonb_build_object('canceled', true),
        updated_at = now()
      WHERE id = $1
        AND status = 'queued'
      RETURNING
        id::text,
        session_id::text,
        tenant_id,
        scope,
        project_id,
        planner_run_id,
        decision_id::text,
        action_kind::text AS action_kind,
        action_json,
        mode::text,
        status::text,
        timeout_ms,
        stdout_text,
        stderr_text,
        output_truncated,
        exit_code,
        error,
        cancel_requested,
        cancel_reason,
        metadata,
        result_json,
        started_at::text,
        finished_at::text,
        created_at::text,
        updated_at::text
      `,
      [parsed.run_id],
    );
    const canceledRow = canceled.rows[0] ?? null;
    if (canceledRow) {
      row.status = "canceled";
      await recordSandboxRunTelemetryRow(client, canceledRow);
    }
  }

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run_id: row.id,
    status: row.status,
    cancel_requested: row.cancel_requested,
    cancel_reason: row.cancel_reason,
  };
}

export class SandboxExecutor {
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private readonly active = new Map<string, ActiveRunState>();
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly recoveryTimer: NodeJS.Timeout | null;
  private readonly remoteAllowedCidrs: ParsedCidr[];
  private running = 0;
  private pumping = false;
  private shuttingDown = false;
  private recoveryInFlight = false;

  constructor(
    private readonly store: SandboxStore,
    private readonly config: SandboxExecutorConfig,
  ) {
    this.remoteAllowedCidrs = [...this.config.remote.allowedEgressCidrs.values()]
      .map((rule) => parseCidrRule(rule))
      .filter((rule): rule is ParsedCidr => !!rule);
    this.recoveryTimer =
      this.config.enabled && this.config.recoveryPollIntervalMs > 0
        ? setInterval(() => {
            void this.recoverStaleRuns();
          }, this.config.recoveryPollIntervalMs)
        : null;
  }

  enqueue(runId: string): void {
    if (!this.config.enabled || this.shuttingDown) return;
    const id = String(runId ?? "").trim();
    if (!id || this.queued.has(id)) return;
    this.queue.push(id);
    this.queued.add(id);
    this.kick();
  }

  async executeSync(runId: string): Promise<void> {
    if (!this.config.enabled) throw new HttpError(400, "sandbox_disabled", "sandbox interface is disabled");
    await this.processRun(String(runId ?? "").trim());
  }

  healthSnapshot() {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      queue_depth: this.queue.length,
      active_runs: this.active.size,
      max_concurrency: this.config.maxConcurrency,
      remote_executor_configured: this.config.mode === "http_remote" ? !!this.config.remote.url : false,
      remote_executor_timeout_ms: this.config.mode === "http_remote" ? this.config.remote.timeoutMs : null,
      remote_executor_allowlist_count: this.config.mode === "http_remote" ? this.config.remote.allowedHosts.size : null,
      remote_executor_egress_cidr_count: this.config.mode === "http_remote" ? this.remoteAllowedCidrs.length : null,
      remote_executor_deny_private_ips: this.config.mode === "http_remote" ? this.config.remote.denyPrivateIps : null,
      remote_executor_mtls_enabled:
        this.config.mode === "http_remote"
          ? !!(
              trimOrNull(this.config.remote.mtlsCertPem)
              || trimOrNull(this.config.remote.mtlsKeyPem)
              || trimOrNull(this.config.remote.mtlsCaPem)
              || trimOrNull(this.config.remote.mtlsServerName)
            )
          : null,
      heartbeat_interval_ms: this.config.heartbeatIntervalMs,
      stale_after_ms: this.config.staleAfterMs,
      recovery_poll_interval_ms: this.config.recoveryPollIntervalMs,
    };
  }

  requestCancel(runId: string): boolean {
    const id = String(runId ?? "").trim();
    const state = this.active.get(id);
    if (!state) return false;
    state.canceled = true;
    if (state.kind === "local_process") {
      try {
        state.child.kill("SIGKILL");
      } catch {
        // ignore best-effort cancel kill errors
      }
    } else {
      try {
        state.abort.abort();
      } catch {
        // ignore best-effort remote cancel errors
      }
    }
    return true;
  }

  shutdown(): void {
    this.shuttingDown = true;
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    for (const t of this.heartbeatTimers.values()) clearInterval(t);
    this.heartbeatTimers.clear();
    for (const state of this.active.values()) {
      state.canceled = true;
      if (state.kind === "local_process") {
        try {
          state.child.kill("SIGKILL");
        } catch {
          // ignore best-effort shutdown kill errors
        }
      } else {
        try {
          state.abort.abort();
        } catch {
          // ignore best-effort remote shutdown errors
        }
      }
    }
    this.active.clear();
    this.queue.length = 0;
    this.queued.clear();
  }

  private kick(): void {
    if (this.pumping || this.shuttingDown) return;
    this.pumping = true;
    setImmediate(async () => {
      try {
        while (!this.shuttingDown && this.running < this.config.maxConcurrency && this.queue.length > 0) {
          const nextId = this.queue.shift()!;
          this.queued.delete(nextId);
          this.running += 1;
          void this.processRun(nextId).finally(() => {
            this.running = Math.max(0, this.running - 1);
            this.kick();
          });
        }
      } finally {
        this.pumping = false;
      }
    });
  }

  private async processRun(runId: string): Promise<void> {
    if (!runId) return;
    let run = await this.claimQueuedRun(runId);
    if (!run) {
      run = await this.loadRunningRun(runId);
      if (!run) return;
    }
    if (run.cancel_requested) {
      await this.finalize(run.id, {
        status: "canceled",
        stdout: run.stdout_text ?? "",
        stderr: run.stderr_text ?? "",
        truncated: !!run.output_truncated,
        exitCode: run.exit_code,
        error: run.error ?? "canceled_before_execution",
        result: { canceled: true, stage: "pre_start" },
      });
      return;
    }
    if (this.config.mode === "mock") {
      const stopHeartbeat = this.startRunHeartbeat(run.id);
      try {
        await this.executeMock(run);
      } finally {
        stopHeartbeat();
      }
      return;
    }
    if (this.config.mode === "local_process") {
      const stopHeartbeat = this.startRunHeartbeat(run.id);
      try {
        await this.executeLocalProcess(run);
      } finally {
        stopHeartbeat();
      }
      return;
    }
    const stopHeartbeat = this.startRunHeartbeat(run.id);
    try {
      await this.executeRemote(run);
    } finally {
      stopHeartbeat();
    }
  }

  private startRunHeartbeat(runId: string): () => void {
    const intervalMs = this.config.heartbeatIntervalMs;
    if (intervalMs <= 0) return () => {};
    const id = String(runId ?? "").trim();
    if (!id) return () => {};
    const prev = this.heartbeatTimers.get(id);
    if (prev) clearInterval(prev);
    const timer = setInterval(() => {
      void this.store.withClient(async (client) => {
        if (!client || typeof (client as { query?: unknown }).query !== "function") {
          return;
        }
        await client.query(
          `
          UPDATE memory_sandbox_runs
          SET updated_at = now()
          WHERE id = $1
            AND status = 'running'
          `,
          [id],
        );
      }).catch(() => {
        // heartbeat failures are best-effort and should not crash executor loop
      });
    }, intervalMs);
    this.heartbeatTimers.set(id, timer);
    return () => {
      const active = this.heartbeatTimers.get(id);
      if (active) clearInterval(active);
      this.heartbeatTimers.delete(id);
    };
  }

  private async recoverStaleRuns(): Promise<void> {
    if (!this.config.enabled || this.shuttingDown || this.recoveryInFlight || this.config.recoveryPollIntervalMs <= 0) return;
    this.recoveryInFlight = true;
    try {
      const staleRows = await this.store.withClient(async (client) => {
        if (!client || typeof (client as { query?: unknown }).query !== "function") {
          return [] as SandboxRunRow[];
        }
        const out = await client.query<SandboxRunRow>(
          `
          SELECT
            id::text,
            session_id::text,
            tenant_id,
            scope,
            project_id,
            planner_run_id,
            decision_id::text,
            action_kind::text AS action_kind,
            action_json,
            mode::text,
            status::text,
            timeout_ms,
            stdout_text,
            stderr_text,
            output_truncated,
            exit_code,
            error,
            cancel_requested,
            cancel_reason,
            metadata,
            result_json,
            started_at::text,
            finished_at::text,
            created_at::text,
            updated_at::text
          FROM memory_sandbox_runs
          WHERE status = 'running'
            AND updated_at < now() - make_interval(secs => $1::int)
          ORDER BY updated_at ASC
          LIMIT $2
          `,
          [Math.max(1, Math.trunc(this.config.staleAfterMs / 1000)), this.config.recoveryBatchSize],
        );
        return out.rows;
      });

      for (const row of staleRows) {
        if (this.active.has(row.id)) continue;
        await this.finalizeIfRunning(row.id, {
          status: "timeout",
          stdout: row.stdout_text ?? "",
          stderr: row.stderr_text ?? "",
          truncated: !!row.output_truncated,
          exitCode: row.exit_code,
          error: row.error ?? "executor_stale_recovered",
          result: {
            ...(row.result_json && typeof row.result_json === "object" ? row.result_json : {}),
            recovery: {
              stale_recovered: true,
              stale_after_ms: this.config.staleAfterMs,
            },
          },
        });
      }
    } finally {
      this.recoveryInFlight = false;
    }
  }

  private async executeMock(run: SandboxRunRow): Promise<void> {
    const argv = Array.isArray(run.action_json?.argv) ? run.action_json.argv.map((x: any) => String(x)) : [];
    await new Promise((resolve) => setTimeout(resolve, 25));
    await this.finalize(run.id, {
      status: "succeeded",
      stdout: `mock executor: ${argv.join(" ")}`.trim(),
      stderr: "",
      truncated: false,
      exitCode: 0,
      error: null,
      result: { executor: "mock", argv },
    });
  }

  private async parseCommandArgv(
    run: SandboxRunRow,
    executor: "local_process" | "http_remote",
  ): Promise<{ argv: string[]; file: string } | null> {
    const argvRaw = Array.isArray(run.action_json?.argv) ? run.action_json.argv : null;
    if (!argvRaw || argvRaw.length === 0) {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "invalid_command_argv",
        result: { executor },
      });
      return null;
    }
    const argv = argvRaw.map((v: any) => String(v));
    const file = String(argv[0] ?? "").trim();
    if (!file) {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "invalid_command_name",
        result: { executor },
      });
      return null;
    }
    if (!this.config.allowedCommands.has(file)) {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "sandbox_command_not_allowed",
        result: { executor, command: file },
      });
      return null;
    }
    return { argv, file };
  }

  private async executeLocalProcess(run: SandboxRunRow): Promise<void> {
    const command = await this.parseCommandArgv(run, "local_process");
    if (!command) return;
    const { argv, file } = command;

    await mkdir(this.config.workdir, { recursive: true });
    const args = argv.slice(1);
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let spawnErr: string | null = null;
    let exitCode: number | null = null;
    let signal: NodeJS.Signals | null = null;

    const child = spawn(file, args, {
      cwd: this.config.workdir,
      shell: false,
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end();
    const state: ActiveRunState = { kind: "local_process", child, timedOut: false, canceled: false };
    this.active.set(run.id, state);

    const timeoutMs = normalizeTimeoutMs(run.timeout_ms, this.config.defaultTimeoutMs);
    const timer = setTimeout(() => {
      state.timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore best-effort timeout kill errors
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const out = clampOutputAppend(stdout, chunk, this.config.stdioMaxBytes);
      stdout = out.next;
      if (out.truncated) truncated = true;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const out = clampOutputAppend(stderr, chunk, this.config.stdioMaxBytes);
      stderr = out.next;
      if (out.truncated) truncated = true;
    });
    child.on("error", (err: Error) => {
      spawnErr = String(err?.message ?? err);
    });

    await new Promise<void>((resolve) => {
      child.on("close", (code, sig) => {
        exitCode = Number.isFinite(code ?? NaN) ? Number(code) : null;
        signal = sig ?? null;
        resolve();
      });
    });

    clearTimeout(timer);
    this.active.delete(run.id);

    let status: SandboxRunStatus = "failed";
    let error: string | null = null;
    if (state.canceled || run.cancel_requested) {
      status = "canceled";
      error = "canceled_by_request";
    } else if (state.timedOut) {
      status = "timeout";
      error = "execution_timeout";
    } else if (spawnErr) {
      status = "failed";
      error = spawnErr;
    } else if (exitCode === 0) {
      status = "succeeded";
      error = null;
    } else {
      status = "failed";
      error = `non_zero_exit_code:${String(exitCode ?? "null")}`;
    }

    await this.finalize(run.id, {
      status,
      stdout,
      stderr,
      truncated,
      exitCode,
      error,
      result: {
        executor: "local_process",
        command: file,
        argv,
        signal,
        timed_out: state.timedOut,
        canceled: state.canceled,
      },
    });
  }

  private async executeRemote(run: SandboxRunRow): Promise<void> {
    const command = await this.parseCommandArgv(run, "http_remote");
    if (!command) return;
    const remoteUrl = trimOrNull(this.config.remote.url);
    if (!remoteUrl) {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "remote_executor_not_configured",
        result: { executor: "http_remote" },
      });
      return;
    }
    let parsedRemoteUrl: URL;
    try {
      parsedRemoteUrl = new URL(remoteUrl);
    } catch {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "remote_executor_url_invalid",
        result: { executor: "http_remote" },
      });
      return;
    }
    if (!sandboxRemoteHostAllowed(parsedRemoteUrl.hostname, this.config.remote.allowedHosts)) {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "remote_executor_host_not_allowed",
        result: { executor: "http_remote", host: parsedRemoteUrl.hostname },
      });
      return;
    }
    let resolvedIps: string[] = [];
    try {
      const resolved = await lookup(parsedRemoteUrl.hostname, { all: true, verbatim: true });
      resolvedIps = resolved
        .map((entry) => String(entry?.address ?? "").trim())
        .filter((entry) => isIP(entry) !== 0);
    } catch {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "remote_executor_dns_lookup_failed",
        result: { executor: "http_remote", host: parsedRemoteUrl.hostname },
      });
      return;
    }
    if (resolvedIps.length === 0) {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "remote_executor_no_resolved_ip",
        result: { executor: "http_remote", host: parsedRemoteUrl.hostname },
      });
      return;
    }
    if (this.remoteAllowedCidrs.length > 0) {
      const blocked = resolvedIps.filter((ip) => !ipInCidrs(ip, this.remoteAllowedCidrs));
      if (blocked.length > 0) {
        await this.finalize(run.id, {
          status: "failed",
          stdout: "",
          stderr: "",
          truncated: false,
          exitCode: null,
          error: "remote_executor_egress_cidr_blocked",
          result: {
            executor: "http_remote",
            host: parsedRemoteUrl.hostname,
            resolved_ips: resolvedIps,
            blocked_ips: blocked,
          },
        });
        return;
      }
    }
    if (this.config.remote.denyPrivateIps) {
      const blockedPrivate = resolvedIps.filter(
        (ip) => isPrivateOrLocalIp(ip) && !ipInCidrs(ip, this.remoteAllowedCidrs),
      );
      if (blockedPrivate.length > 0) {
        await this.finalize(run.id, {
          status: "failed",
          stdout: "",
          stderr: "",
          truncated: false,
          exitCode: null,
          error: "remote_executor_private_egress_blocked",
          result: {
            executor: "http_remote",
            host: parsedRemoteUrl.hostname,
            resolved_ips: resolvedIps,
            blocked_private_ips: blockedPrivate,
          },
        });
        return;
      }
    }

    const timeoutMs = normalizeTimeoutMs(
      Math.min(run.timeout_ms, this.config.remote.timeoutMs),
      Math.min(this.config.defaultTimeoutMs, this.config.remote.timeoutMs),
    );
    const connectIp = resolvedIps[0] ?? null;
    const maxRemoteResponseBytes = Math.max(this.config.stdioMaxBytes * 8, 256 * 1024);
    const startedAt = Date.now();
    const abort = new AbortController();
    const state: ActiveRunState = { kind: "http_remote", abort, timedOut: false, canceled: false };
    this.active.set(run.id, state);
    const timer = setTimeout(() => {
      state.timedOut = true;
      try {
        abort.abort();
      } catch {
        // ignore best-effort timeout abort errors
      }
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let exitCode: number | null = null;
    let status: SandboxRunStatus = "failed";
    let error: string | null = null;
    let result: Record<string, unknown> = {
      executor: "http_remote",
      command: command.file,
      argv: command.argv,
      host: parsedRemoteUrl.hostname,
      resolved_ips: resolvedIps,
      connect_ip: connectIp,
      remote_response_max_bytes: maxRemoteResponseBytes,
    };

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const authHeader = trimOrNull(this.config.remote.authHeader);
      const authToken = trimOrNull(this.config.remote.authToken);
      if (authHeader && authToken) headers[authHeader.toLowerCase()] = authToken;

      const requestBody = JSON.stringify({
        run_id: run.id,
        tenant_id: run.tenant_id,
        scope: run.scope,
        project_id: run.project_id ?? null,
        session_id: run.session_id,
        planner_run_id: run.planner_run_id,
        decision_id: run.decision_id,
        mode: run.mode,
        timeout_ms: timeoutMs,
        action: {
          kind: "command",
          argv: command.argv,
        },
        metadata: jsonObject(run.metadata),
      });
      const remoteResponse = await postJsonWithTls(
        parsedRemoteUrl,
        requestBody,
        headers,
        timeoutMs,
        abort.signal,
        {
          certPem: this.config.remote.mtlsCertPem,
          keyPem: this.config.remote.mtlsKeyPem,
          caPem: this.config.remote.mtlsCaPem,
          serverName: this.config.remote.mtlsServerName,
        },
        {
          resolvedAddress: connectIp,
          maxBodyBytes: maxRemoteResponseBytes,
        },
      );
      const rawBodyText = remoteResponse.bodyText;
      const body = rawBodyText.length > 0 ? (() => {
        try {
          return JSON.parse(rawBodyText);
        } catch {
          return null;
        }
      })() : null;
      const outputObj = body && typeof body === "object" ? (body as any).output : null;
      const rawStdout = body && typeof body === "object" ? (body as any).stdout : null;
      const rawStderr = body && typeof body === "object" ? (body as any).stderr : null;
      stdout = tailText(
        typeof rawStdout === "string"
          ? rawStdout
          : outputObj && typeof outputObj.stdout === "string"
            ? outputObj.stdout
            : "",
        this.config.stdioMaxBytes,
      );
      stderr = tailText(
        typeof rawStderr === "string"
          ? rawStderr
          : outputObj && typeof outputObj.stderr === "string"
            ? outputObj.stderr
            : "",
        this.config.stdioMaxBytes,
      );
      truncated = !!(
        (outputObj && typeof outputObj === "object" && (outputObj as any).truncated)
        || (body && typeof body === "object" && (body as any).output_truncated)
      );
      exitCode = asFiniteIntOrNull(body && typeof body === "object" ? (body as any).exit_code : null);
      if (remoteResponse.status < 200 || remoteResponse.status >= 300) {
        status = "failed";
        error = `remote_executor_http_${remoteResponse.status}`;
      } else {
        status = normalizeSandboxStatus(body && typeof body === "object" ? (body as any).status : null) ?? (exitCode === 0 ? "succeeded" : "failed");
        if (!TERMINAL_SANDBOX_STATUSES.has(status)) {
          status = "failed";
          error = "remote_executor_non_terminal_status";
        }
        if (!error) {
          error = trimOrNull(body && typeof body === "object" ? (body as any).error : null);
          if (!error && status !== "succeeded") error = "remote_executor_failed";
        }
      }
      const resultPayload = body && typeof body === "object" && body.result && typeof body.result === "object" ? body.result : {};
      result = {
        ...result,
        remote_http_status: remoteResponse.status,
        remote_request_ms: Math.max(0, Date.now() - startedAt),
        result: resultPayload,
      };
    } catch (err: any) {
      if (state.canceled || run.cancel_requested) {
        status = "canceled";
        error = "canceled_by_request";
      } else if (state.timedOut) {
        status = "timeout";
        error = "execution_timeout";
      } else if (String(err?.message ?? err) === "response_too_large") {
        status = "failed";
        error = "remote_executor_response_too_large";
      } else {
        status = "failed";
        error = `remote_executor_error:${String(err?.message ?? err)}`;
      }
      result = {
        ...result,
        remote_request_ms: Math.max(0, Date.now() - startedAt),
      };
    } finally {
      clearTimeout(timer);
      this.active.delete(run.id);
    }

    if (state.canceled || run.cancel_requested) {
      status = "canceled";
      error = "canceled_by_request";
    } else if (state.timedOut) {
      status = "timeout";
      error = "execution_timeout";
    }

    await this.finalize(run.id, {
      status,
      stdout,
      stderr,
      truncated,
      exitCode,
      error,
      result,
    });
  }

  private async claimQueuedRun(runId: string): Promise<SandboxRunRow | null> {
    return await this.store.withTx(async (client) => {
      const res = await client.query<SandboxRunRow>(
        `
        UPDATE memory_sandbox_runs
        SET
          status = 'running',
          started_at = COALESCE(started_at, now()),
          updated_at = now()
        WHERE id = $1
          AND status = 'queued'
        RETURNING
          id::text,
          session_id::text,
          tenant_id,
          scope,
          project_id,
          planner_run_id,
          decision_id::text,
          action_kind::text AS action_kind,
          action_json,
          mode::text,
          status::text,
          timeout_ms,
          stdout_text,
          stderr_text,
          output_truncated,
          exit_code,
          error,
          cancel_requested,
          cancel_reason,
          metadata,
          result_json,
          started_at::text,
          finished_at::text,
          created_at::text,
          updated_at::text
        `,
        [runId],
      );
      return res.rows[0] ?? null;
    });
  }

  private async loadRunningRun(runId: string): Promise<SandboxRunRow | null> {
    return await this.store.withClient(async (client) => {
      const res = await client.query<SandboxRunRow>(
        `
        SELECT
          id::text,
          session_id::text,
          tenant_id,
          scope,
          project_id,
          planner_run_id,
          decision_id::text,
          action_kind::text AS action_kind,
          action_json,
          mode::text,
          status::text,
          timeout_ms,
          stdout_text,
          stderr_text,
          output_truncated,
          exit_code,
          error,
          cancel_requested,
          cancel_reason,
          metadata,
          result_json,
          started_at::text,
          finished_at::text,
          created_at::text,
          updated_at::text
        FROM memory_sandbox_runs
        WHERE id = $1
          AND status = 'running'
        LIMIT 1
        `,
        [runId],
      );
      return res.rows[0] ?? null;
    });
  }

  private async finalize(
    runId: string,
    args: {
      status: SandboxRunStatus;
      stdout: string;
      stderr: string;
      truncated: boolean;
      exitCode: number | null;
      error: string | null;
      result: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.store.withClient(async (client) => {
      const out = await client.query<SandboxRunRow>(
        `
        UPDATE memory_sandbox_runs
        SET
          status = $2,
          stdout_text = $3,
          stderr_text = $4,
          output_truncated = $5,
          exit_code = $6,
          error = $7,
          result_json = $8::jsonb,
          finished_at = now(),
          updated_at = now()
        WHERE id = $1
        RETURNING
          id::text,
          session_id::text,
          tenant_id,
          scope,
          project_id,
          planner_run_id,
          decision_id::text,
          action_kind::text AS action_kind,
          action_json,
          mode::text,
          status::text,
          timeout_ms,
          stdout_text,
          stderr_text,
          output_truncated,
          exit_code,
          error,
          cancel_requested,
          cancel_reason,
          metadata,
          result_json,
          started_at::text,
          finished_at::text,
          created_at::text,
          updated_at::text
        `,
        [runId, args.status, args.stdout, args.stderr, args.truncated, args.exitCode, args.error, JSON.stringify(args.result)],
      );
      const row = out.rows[0] ?? null;
      if (row) {
        await recordSandboxRunTelemetryRow(client, row);
      }
    });
  }

  private async finalizeIfRunning(
    runId: string,
    args: {
      status: SandboxRunStatus;
      stdout: string;
      stderr: string;
      truncated: boolean;
      exitCode: number | null;
      error: string | null;
      result: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.store.withClient(async (client) => {
      const out = await client.query<SandboxRunRow>(
        `
        UPDATE memory_sandbox_runs
        SET
          status = $2,
          stdout_text = $3,
          stderr_text = $4,
          output_truncated = $5,
          exit_code = $6,
          error = $7,
          result_json = $8::jsonb,
          finished_at = now(),
          updated_at = now()
        WHERE id = $1
          AND status = 'running'
        RETURNING
          id::text,
          session_id::text,
          tenant_id,
          scope,
          project_id,
          planner_run_id,
          decision_id::text,
          action_kind::text AS action_kind,
          action_json,
          mode::text,
          status::text,
          timeout_ms,
          stdout_text,
          stderr_text,
          output_truncated,
          exit_code,
          error,
          cancel_requested,
          cancel_reason,
          metadata,
          result_json,
          started_at::text,
          finished_at::text,
          created_at::text,
          updated_at::text
        `,
        [runId, args.status, args.stdout, args.stderr, args.truncated, args.exitCode, args.error, JSON.stringify(args.result)],
      );
      const row = out.rows[0] ?? null;
      if (row) {
        await recordSandboxRunTelemetryRow(client, row);
      }
    });
  }
}

export function parseAllowedSandboxCommands(raw: string): Set<string> {
  let parsed: unknown = [];
  try {
    parsed = raw.trim().length > 0 ? JSON.parse(raw) : [];
  } catch {
    badRequest("invalid_sandbox_allowed_commands", "SANDBOX_ALLOWED_COMMANDS_JSON must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    badRequest("invalid_sandbox_allowed_commands", "SANDBOX_ALLOWED_COMMANDS_JSON must be a JSON array");
  }
  const out = new Set<string>();
  for (const v of parsed) {
    if (typeof v !== "string") continue;
    const cmd = v.trim();
    if (!cmd) continue;
    out.add(cmd);
  }
  return out;
}
