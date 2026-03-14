#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { AionisApiError, AionisClient, AionisNetworkError } from "./index.js";

type Command = "dev" | "stop" | "health" | "doctor" | "selfcheck" | "help";

type CliOptions = {
  baseUrl: string;
  host: string;
  port: number;
  runtimeRoot?: string;
  foreground: boolean;
  json: boolean;
  timeoutMs: number;
};

type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3321;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_STATE_DIR = join(homedir(), ".aionis", "dev");

async function main() {
  const argv = process.argv.slice(2);
  const command = resolveCommand(argv[0]);
  const flags = parseFlags(argv.slice(command === "help" ? 0 : 1));
  const options = resolveOptions(flags);

  switch (command) {
    case "dev":
      await runDev(options);
      return;
    case "stop":
      await runStop(options);
      return;
    case "health":
      await runHealth(options);
      return;
    case "doctor":
      await runDoctor(options);
      return;
    case "selfcheck":
      await runSelfcheck(options);
      return;
    case "help":
    default:
      printHelp();
  }
}

function resolveCommand(raw: string | undefined): Command {
  if (!raw || raw === "--help" || raw === "-h" || raw === "help") return "help";
  if (raw === "dev" || raw === "stop" || raw === "health" || raw === "doctor" || raw === "selfcheck") return raw;
  return "help";
}

function parseFlags(argv: string[]): Map<string, string | boolean> {
  const out = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "foreground" || key === "json") {
      out.set(key, true);
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out.set(key, true);
      continue;
    }
    out.set(key, value);
    i += 1;
  }
  return out;
}

function resolveOptions(flags: Map<string, string | boolean>): CliOptions {
  const host = String(flags.get("host") || process.env.AIONIS_DEV_HOST || DEFAULT_HOST);
  const port = Number(flags.get("port") || process.env.AIONIS_DEV_PORT || DEFAULT_PORT);
  const baseUrl = String(flags.get("base-url") || process.env.AIONIS_BASE_URL || `http://${host}:${port}`);
  const runtimeRoot = typeof flags.get("runtime-root") === "string" ? String(flags.get("runtime-root")) : process.env.AIONIS_RUNTIME_ROOT;
  const foreground = Boolean(flags.get("foreground"));
  const json = Boolean(flags.get("json"));
  const timeoutMs = Number(flags.get("timeout-ms") || process.env.AIONIS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return { baseUrl, host, port, runtimeRoot, foreground, json, timeoutMs };
}

function printHelp() {
  process.stdout.write(
    [
      "Aionis CLI (Phase 1)",
      "",
      "Usage:",
      "  aionis dev [--port 3321] [--host 127.0.0.1] [--runtime-root /path/to/Aionis] [--foreground]",
      "  aionis stop [--port 3321] [--json]",
      "  aionis health [--base-url http://127.0.0.1:3321] [--json]",
      "  aionis doctor [--runtime-root /path/to/Aionis] [--base-url http://127.0.0.1:3321] [--json]",
      "  aionis selfcheck [--base-url http://127.0.0.1:3321] [--json]",
      "",
      "Notes:",
      "  - Phase 1 is a local Lite developer CLI.",
      "  - `aionis dev` starts or attaches to a local Lite runtime.",
      "  - If runtime root is not given, the CLI searches the current tree and common local paths.",
      "",
    ].join("\n"),
  );
}

function runtimePidFile(port: number) {
  return join(DEFAULT_STATE_DIR, `lite-${port}.pid`);
}

function runtimeLogFile(port: number) {
  return join(DEFAULT_STATE_DIR, `lite-${port}.log`);
}

function runtimeWriteDbFile(port: number) {
  return join(DEFAULT_STATE_DIR, `lite-write-${port}.sqlite`);
}

function runtimeReplayDbFile(port: number) {
  return join(DEFAULT_STATE_DIR, `lite-replay-${port}.sqlite`);
}

function ensureStateDir() {
  mkdirSync(DEFAULT_STATE_DIR, { recursive: true });
}

function readPidFile(path: string): number | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8").trim();
  const pid = Number(raw);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function fileStatSummary(path: string): { exists: boolean; bytes: number | null } {
  if (!existsSync(path)) return { exists: false, bytes: null };
  try {
    const st = statSync(path);
    return { exists: true, bytes: st.size };
  } catch {
    return { exists: true, bytes: null };
  }
}

function filePathFromHere(...parts: string[]) {
  return resolve(dirname(fileURLToPath(import.meta.url)), ...parts);
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isRuntimeRoot(path: string): boolean {
  const pkg = readJson(join(path, "package.json"));
  return Boolean(pkg && pkg.name === "aionis-memory-graph" && typeof pkg.scripts === "object" && pkg.scripts && "start:lite" in pkg.scripts);
}

function walkUp(start: string): string[] {
  const out: string[] = [];
  let current = resolve(start);
  while (true) {
    out.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return out;
}

function resolveRuntimeRoot(explicit?: string): string | null {
  const candidates = new Set<string>();
  if (explicit) candidates.add(resolve(explicit));
  for (const p of walkUp(process.cwd())) candidates.add(p);
  for (const p of walkUp(filePathFromHere(".."))) candidates.add(p);
  candidates.add(resolve(homedir(), "Desktop", "Aionis"));
  candidates.add(resolve(process.cwd(), "Aionis"));
  candidates.add(resolve(process.cwd(), "..", "Aionis"));
  for (const candidate of candidates) {
    if (isRuntimeRoot(candidate)) return candidate;
  }
  return null;
}

function hasNodeSqliteSupport(): boolean {
  const probe = spawnSync(process.execPath, ["-e", 'import("node:sqlite").then(()=>process.exit(0)).catch(()=>process.exit(1))'], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

function canBuildRuntime(runtimeRoot: string): boolean {
  return existsSync(join(runtimeRoot, "package.json"));
}

function ensureRuntimeBuilt(runtimeRoot: string) {
  if (existsSync(join(runtimeRoot, "dist", "index.js"))) return;
  const built = spawnSync("npm", ["run", "-s", "build"], {
    cwd: runtimeRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (built.status !== 0) {
    throw new Error(`failed to build runtime in ${runtimeRoot}`);
  }
}

async function healthCheck(baseUrl: string, timeoutMs: number) {
  const client = new AionisClient({ base_url: baseUrl, timeout_ms: timeoutMs });
  return client.health();
}

async function waitForHealth(baseUrl: string, timeoutMs: number, deadlineMs: number) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const out = await healthCheck(baseUrl, timeoutMs);
      if (out.data?.ok) return out;
    } catch {
      // ignore until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`timeout waiting for ${baseUrl}/health`);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function runDev(options: CliOptions) {
  ensureStateDir();
  try {
    const existing = await healthCheck(options.baseUrl, options.timeoutMs);
    if (existing.data?.ok) {
      emit(options.json, {
        ok: true,
        mode: "attached",
        base_url: options.baseUrl,
        edition: existing.data?.aionis_edition ?? null,
        backend: existing.data?.memory_store_backend ?? null,
      }, `Aionis already healthy at ${options.baseUrl}`);
      return;
    }
  } catch {
    // start new instance
  }

  const runtimeRoot = resolveRuntimeRoot(options.runtimeRoot);
  if (!runtimeRoot) {
    throw new Error("could not resolve Aionis runtime root; pass --runtime-root /path/to/Aionis");
  }
  if (!hasNodeSqliteSupport()) {
    throw new Error("current Node.js lacks node:sqlite support; use Node 22+");
  }
  if (!canBuildRuntime(runtimeRoot)) {
    throw new Error(`invalid runtime root: ${runtimeRoot}`);
  }
  ensureRuntimeBuilt(runtimeRoot);

  const pidPath = runtimePidFile(options.port);
  const logPath = runtimeLogFile(options.port);
  const writeDb = runtimeWriteDbFile(options.port);
  const replayDb = runtimeReplayDbFile(options.port);
  if (existsSync(pidPath)) {
    const pidRaw = readFileSync(pidPath, "utf8").trim();
    const pid = Number(pidRaw);
    if (Number.isFinite(pid) && processAlive(pid)) {
      await waitForHealth(options.baseUrl, options.timeoutMs, 12_000);
      emit(options.json, {
        ok: true,
        mode: "attached_pid",
        base_url: options.baseUrl,
        pid,
        runtime_root: runtimeRoot,
        log_path: logPath,
      }, `Attached to existing Lite process ${pid} at ${options.baseUrl}`);
      return;
    }
  }

  const env = {
    ...process.env,
    PORT: String(options.port),
    AIONIS_MODE: "local",
    AIONIS_EDITION: "lite",
    MEMORY_AUTH_MODE: "off",
    TENANT_QUOTA_ENABLED: "false",
    RATE_LIMIT_BYPASS_LOOPBACK: "true",
    LITE_WRITE_SQLITE_PATH: writeDb,
    LITE_REPLAY_SQLITE_PATH: replayDb,
  };

  if (options.foreground) {
    const child = spawn("bash", ["scripts/start-lite.sh"], {
      cwd: runtimeRoot,
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  const fd = openSync(logPath, "a");
  const child = spawn("bash", ["scripts/start-lite.sh"], {
    cwd: runtimeRoot,
    env,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  writeFileSync(pidPath, String(child.pid));
  child.unref();
  const health = await waitForHealth(options.baseUrl, options.timeoutMs, 15_000);
  emit(options.json, {
    ok: true,
    mode: "started",
    base_url: options.baseUrl,
    pid: child.pid,
    runtime_root: runtimeRoot,
    log_path: logPath,
    edition: health.data?.aionis_edition ?? null,
    backend: health.data?.memory_store_backend ?? null,
  }, `Started Aionis Lite at ${options.baseUrl}`);
}

async function runHealth(options: CliOptions) {
  const out = await healthCheck(options.baseUrl, options.timeoutMs);
  emit(options.json, {
    ok: Boolean(out.data?.ok),
    base_url: options.baseUrl,
    edition: out.data?.aionis_edition ?? null,
    backend: out.data?.memory_store_backend ?? null,
    request_id: out.request_id,
  }, `Aionis health ok at ${options.baseUrl}`);
}

async function runStop(options: CliOptions) {
  ensureStateDir();
  const pidPath = runtimePidFile(options.port);
  const pid = readPidFile(pidPath);
  if (!pid) {
    emit(options.json, {
      ok: true,
      stopped: false,
      reason: "pid_file_missing",
      pid_path: pidPath,
      base_url: options.baseUrl,
    }, `No tracked Aionis Lite process for port ${options.port}`);
    return;
  }

  const aliveBefore = processAlive(pid);
  if (aliveBefore) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // handled below
    }
    const started = Date.now();
    while (Date.now() - started < 5000) {
      if (!processAlive(pid)) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (processAlive(pid)) {
      process.kill(pid, "SIGKILL");
    }
  }

  const aliveAfter = processAlive(pid);
  if (!aliveAfter && existsSync(pidPath)) rmSync(pidPath, { force: true });
  const ok = !aliveAfter;
  emit(options.json, {
    ok,
    stopped: ok,
    pid,
    pid_path: pidPath,
    base_url: options.baseUrl,
  }, ok ? `Stopped Aionis Lite process ${pid}` : `Failed to stop Aionis Lite process ${pid}`);
  if (!ok) process.exitCode = 1;
}

async function runDoctor(options: CliOptions) {
  const runtimeRoot = resolveRuntimeRoot(options.runtimeRoot);
  ensureStateDir();
  const pidPath = runtimePidFile(options.port);
  const logPath = runtimeLogFile(options.port);
  const writeDbPath = runtimeWriteDbFile(options.port);
  const replayDbPath = runtimeReplayDbFile(options.port);
  const pid = readPidFile(pidPath);
  const checks: DoctorCheck[] = [
    {
      name: "node_sqlite",
      ok: hasNodeSqliteSupport(),
      detail: hasNodeSqliteSupport() ? "node:sqlite available" : "node:sqlite missing; use Node 22+",
    },
    {
      name: "runtime_root",
      ok: Boolean(runtimeRoot),
      detail: runtimeRoot ?? "runtime root not found",
    },
    {
      name: "runtime_dist",
      ok: Boolean(runtimeRoot && existsSync(join(runtimeRoot, "dist", "index.js"))),
      detail: runtimeRoot ? join(runtimeRoot, "dist", "index.js") : "runtime root unavailable",
    },
    {
      name: "start_lite_script",
      ok: Boolean(runtimeRoot && existsSync(join(runtimeRoot, "scripts", "start-lite.sh"))),
      detail: runtimeRoot ? join(runtimeRoot, "scripts", "start-lite.sh") : "runtime root unavailable",
    },
    {
      name: "dev_pid_file",
      ok: pid !== null,
      detail: pid !== null ? `${pid} (${pidPath})` : `missing (${pidPath})`,
    },
    {
      name: "dev_pid_alive",
      ok: pid !== null && processAlive(pid),
      detail: pid !== null ? (processAlive(pid) ? `process ${pid} is alive` : `process ${pid} is not alive`) : "no pid to inspect",
    },
    {
      name: "dev_log_file",
      ok: fileStatSummary(logPath).exists,
      detail: fileStatSummary(logPath).exists
        ? `${logPath} (${fileStatSummary(logPath).bytes ?? "?"} bytes)`
        : `missing (${logPath})`,
    },
    {
      name: "dev_write_sqlite",
      ok: fileStatSummary(writeDbPath).exists,
      detail: fileStatSummary(writeDbPath).exists
        ? `${writeDbPath} (${fileStatSummary(writeDbPath).bytes ?? "?"} bytes)`
        : `missing (${writeDbPath})`,
    },
    {
      name: "dev_replay_sqlite",
      ok: fileStatSummary(replayDbPath).exists,
      detail: fileStatSummary(replayDbPath).exists
        ? `${replayDbPath} (${fileStatSummary(replayDbPath).bytes ?? "?"} bytes)`
        : `missing (${replayDbPath})`,
    },
  ];

  try {
    const out = await healthCheck(options.baseUrl, options.timeoutMs);
    checks.push({
      name: "runtime_health",
      ok: Boolean(out.data?.ok),
      detail: out.data?.ok ? `healthy at ${options.baseUrl}` : `unhealthy at ${options.baseUrl}`,
    });
  } catch (err) {
    checks.push({
      name: "runtime_health",
      ok: false,
      detail: formatErr(err),
    });
  }

  const ok = checks.every((c) => c.ok);
  emit(options.json, { ok, checks }, renderDoctor(checks));
  if (!ok) process.exitCode = 1;
}

async function runSelfcheck(options: CliOptions) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const scope = `sdk:cli:selfcheck:${Date.now()}`;
  const out: Record<string, unknown> = {
    ok: true,
    base_url: options.baseUrl,
    scope,
  };

  const health = await client.health();
  out.health = { ok: Boolean(health.data?.ok), edition: health.data?.aionis_edition ?? null, backend: health.data?.memory_store_backend ?? null };

  const write = await client.write({
    scope,
    input_text: "sdk cli selfcheck write",
    auto_embed: false,
    nodes: [{ client_id: `cli_evt_${Date.now()}`, type: "event", text_summary: "sdk cli selfcheck write" }],
    edges: [],
  });
  out.write = { status: write.status, commit_id: write.data?.commit_id ?? null };

  const recall = await client.recallText({
    scope,
    query_text: "sdk cli selfcheck write",
    limit: 5,
  } as any);
  out.recall_text = { status: recall.status, ranked: Array.isArray(recall.data?.ranked) ? recall.data.ranked.length : 0 };

  const handoffAnchor = `sdk_cli_task_${Date.now()}`;
  try {
    const handoffStore = await client.handoffStore({
      scope,
      memory_lane: "shared",
      handoff_kind: "patch_handoff",
      anchor: handoffAnchor,
      file_path: "packages/sdk/src/cli.ts",
      summary: "sdk cli selfcheck handoff",
      handoff_text: "Continue the SDK CLI selfcheck and verify replay compile remains healthy.",
      acceptance_checks: ["health endpoint returns ok", "replay compile returns 200"],
      target_files: ["packages/sdk/src/cli.ts"],
      next_action: "Run health and replay selfcheck again.",
      must_keep: ["replay compile coverage", "sdk CLI local Lite support"],
    });
    const handoffRecover = await client.handoffRecover({
      scope,
      anchor: handoffAnchor,
      file_path: "packages/sdk/src/cli.ts",
      handoff_kind: "patch_handoff",
      memory_lane: "shared",
      limit: 3,
    });
    out.handoff = {
      ok: true,
      store_status: handoffStore.status,
      recover_status: handoffRecover.status,
      matched_nodes: handoffRecover.data?.matched_nodes ?? 0,
      recovered_anchor: handoffRecover.data?.handoff?.anchor ?? null,
      recovered_next_action:
        handoffRecover.data?.execution_ready_handoff?.next_action ?? handoffRecover.data?.handoff?.next_action ?? null,
    };
  } catch (err) {
    out.ok = false;
    out.handoff = {
      ok: false,
      error: formatErr(err),
      status: err instanceof AionisApiError ? err.status : null,
      code: err instanceof AionisApiError ? err.code : null,
    };
  }

  const tools = await client.toolsSelect({
    scope,
    run_id: `sdk_cli_tools_${Date.now()}`,
    context: { intent: "cli_selfcheck", repo: false },
    candidates: ["rg", "grep", "bash"],
    include_shadow: false,
    rules_limit: 10,
    strict: false,
  });
  out.tools_select = {
    status: tools.status,
    selected_tool: (tools.data as any)?.selection?.selected ?? null,
  };

  const runId = randomUUID();
  await client.replayRunStart({ scope, run_id: runId, goal: "sdk cli selfcheck replay" });
  await client.replayStepBefore({
    scope,
    run_id: runId,
    step_id: randomUUID(),
    step_index: 1,
    tool_name: "echo",
    tool_input: { text: "ok" },
    expected_output_signature: { equals: "ok" },
    safety_level: "auto_ok",
  });
  await client.replayStepAfter({
    scope,
    run_id: runId,
    step_index: 1,
    status: "success",
    output_signature: { text: "ok" },
  });
  await client.replayRunEnd({
    scope,
    run_id: runId,
    status: "success",
    summary: "sdk cli replay selfcheck ok",
    metrics: { total_steps: 1, succeeded_steps: 1 },
  });
  const compile = await client.replayPlaybookCompileFromRun({
    scope,
    run_id: runId,
    name: "sdk_cli_selfcheck",
    metadata: { source: "sdk_cli" },
  });
  out.replay = {
    run_id: runId,
    compile_status: compile.status,
    playbook_id: (compile.data as any)?.playbook_id ?? null,
    compile_tokens:
      Number((compile.data as any)?.usage?.total_tokens ?? (compile.data as any)?.compile_summary?.usage_estimate?.total_tokens ?? 0),
  };

  emit(options.json, out, Boolean(out.ok) ? "Aionis selfcheck passed" : "Aionis selfcheck found issues");
  if (!out.ok) process.exitCode = 1;
}

function renderDoctor(checks: DoctorCheck[]) {
  const lines = ["Aionis doctor"];
  for (const check of checks) {
    lines.push(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  return lines.join("\n");
}

function emit(json: boolean, payload: Record<string, unknown>, text: string) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${text}\n`);
  for (const [k, v] of Object.entries(payload)) {
    if (k === "ok") continue;
    if (typeof v === "object" && v !== null) {
      process.stdout.write(`${k}: ${JSON.stringify(v)}\n`);
    } else {
      process.stdout.write(`${k}: ${String(v)}\n`);
    }
  }
}

function formatErr(err: unknown) {
  if (err instanceof AionisApiError) return `${err.code ?? "api_error"} (${err.status ?? "?"})`;
  if (err instanceof AionisNetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

main().catch((err) => {
  process.stderr.write(`${formatErr(err)}\n`);
  process.exit(1);
});
