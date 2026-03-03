import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import type pg from "pg";
import { HttpError, badRequest } from "../util/http.js";
import {
  SandboxExecuteRequest,
  SandboxRunCancelRequest,
  SandboxRunGetRequest,
  SandboxRunLogsRequest,
  SandboxSessionCreateRequest,
} from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";

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
  mode: "mock" | "local_process";
  maxConcurrency: number;
  defaultTimeoutMs: number;
  stdioMaxBytes: number;
  workdir: string;
  allowedCommands: Set<string>;
};

type SandboxStore = {
  withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
};

type ActiveRunState = {
  child: ChildProcessWithoutNullStreams;
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

function toRunPayload(row: SandboxRunRow) {
  return {
    run_id: row.id,
    session_id: row.session_id,
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
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
      $1, $2, $3, $4, $5, $6, 'command', $7::jsonb, $8, 'queued', $9, $10::jsonb
    )
    RETURNING
      id::text,
      session_id::text,
      tenant_id,
      scope,
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
    const canceled = await client.query<{ id: string; status: string }>(
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
      RETURNING id::text, status::text
      `,
      [parsed.run_id],
    );
    if (canceled.rowCount) row.status = "canceled";
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
  private running = 0;
  private pumping = false;
  private shuttingDown = false;

  constructor(
    private readonly store: SandboxStore,
    private readonly config: SandboxExecutorConfig,
  ) {}

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

  requestCancel(runId: string): boolean {
    const id = String(runId ?? "").trim();
    const state = this.active.get(id);
    if (!state) return false;
    state.canceled = true;
    try {
      state.child.kill("SIGKILL");
    } catch {
      // ignore best-effort cancel kill errors
    }
    return true;
  }

  shutdown(): void {
    this.shuttingDown = true;
    for (const state of this.active.values()) {
      try {
        state.canceled = true;
        state.child.kill("SIGKILL");
      } catch {
        // ignore best-effort shutdown kill errors
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
      await this.executeMock(run);
      return;
    }
    await this.executeLocalProcess(run);
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

  private async executeLocalProcess(run: SandboxRunRow): Promise<void> {
    const argvRaw = Array.isArray(run.action_json?.argv) ? run.action_json.argv : null;
    if (!argvRaw || argvRaw.length === 0) {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "invalid_command_argv",
        result: { executor: "local_process" },
      });
      return;
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
        result: { executor: "local_process" },
      });
      return;
    }
    if (!this.config.allowedCommands.has(file)) {
      await this.finalize(run.id, {
        status: "failed",
        stdout: "",
        stderr: "",
        truncated: false,
        exitCode: null,
        error: "sandbox_command_not_allowed",
        result: { executor: "local_process", command: file },
      });
      return;
    }

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
    const state: ActiveRunState = { child, timedOut: false, canceled: false };
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
      await client.query(
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
        `,
        [runId, args.status, args.stdout, args.stderr, args.truncated, args.exitCode, args.error, JSON.stringify(args.result)],
      );
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
