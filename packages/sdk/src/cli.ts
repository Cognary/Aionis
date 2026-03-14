#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { AionisApiError, AionisClient, AionisNetworkError } from "./index.js";

type Command = "dev" | "stop" | "health" | "doctor" | "selfcheck" | "help";

type CliOptions = {
  baseUrl: string;
  host: string;
  port: number;
  runtimeRoot?: string;
  runtimeVersion: string;
  runtimeCacheDir: string;
  forceDownload: boolean;
  offline: boolean;
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
const DEFAULT_RUNTIME_CACHE_DIR = join(homedir(), ".aionis", "runtime");

type RuntimeResolution = {
  runtimeRoot: string;
  source: "local_repo" | "cached_runtime" | "downloaded_bundle" | "downloaded_source";
  version: string;
  cacheRoot?: string;
};

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
  const runtimeVersion = String(flags.get("runtime-version") || process.env.AIONIS_RUNTIME_VERSION || packageVersion());
  const runtimeCacheDir = String(flags.get("runtime-cache-dir") || process.env.AIONIS_RUNTIME_CACHE_DIR || DEFAULT_RUNTIME_CACHE_DIR);
  const forceDownload = Boolean(flags.get("force-download"));
  const offline = Boolean(flags.get("offline"));
  const foreground = Boolean(flags.get("foreground"));
  const json = Boolean(flags.get("json"));
  const timeoutMs = Number(flags.get("timeout-ms") || process.env.AIONIS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return { baseUrl, host, port, runtimeRoot, runtimeVersion, runtimeCacheDir, forceDownload, offline, foreground, json, timeoutMs };
}

function printHelp() {
  process.stdout.write(
    [
      "Aionis CLI (Phase 1)",
      "",
      "Usage:",
      "  aionis dev [--port 3321] [--host 127.0.0.1] [--runtime-root /path/to/Aionis] [--runtime-version 0.2.18] [--force-download] [--offline] [--foreground]",
      "  aionis stop [--port 3321] [--json]",
      "  aionis health [--base-url http://127.0.0.1:3321] [--json]",
      "  aionis doctor [--runtime-root /path/to/Aionis] [--runtime-version 0.2.18] [--runtime-cache-dir ~/.aionis/runtime] [--base-url http://127.0.0.1:3321] [--json]",
      "  aionis selfcheck [--base-url http://127.0.0.1:3321] [--json]",
      "",
      "Notes:",
      "  - Phase 1 is a local Lite developer CLI.",
      "  - `aionis dev` starts or attaches to a local Lite runtime.",
      "  - If runtime root is not given, the CLI searches local paths first, then runtime cache, then bootstrap download.",
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

function packageVersion(): string {
  const pkg = readJson(filePathFromHere("..", "package.json"));
  return typeof pkg?.version === "string" ? pkg.version : "0.0.0";
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

function runtimePlatformKey() {
  return `${process.platform}-${process.arch}`;
}

function runtimeCacheRoot(options: CliOptions) {
  return join(resolve(options.runtimeCacheDir), options.runtimeVersion, runtimePlatformKey());
}

function runtimeBundleRoot(options: CliOptions) {
  return join(runtimeCacheRoot(options), "bundle");
}

function runtimeSourceRoot(options: CliOptions) {
  return join(runtimeCacheRoot(options), "source");
}

function runtimeDownloadsRoot(options: CliOptions) {
  return join(runtimeCacheRoot(options), "downloads");
}

function runtimeManifestFile(options: CliOptions) {
  return join(runtimeCacheRoot(options), "runtime-manifest.json");
}

function defaultBundleUrl(version: string) {
  const platform = runtimePlatformKey();
  return `https://github.com/Cognary/Aionis/releases/download/v${version}/aionis-lite-v${version}-${platform}.tar.gz`;
}

function defaultSourceUrl(version: string) {
  return `https://github.com/Cognary/Aionis/archive/refs/tags/v${version}.tar.gz`;
}

function fallbackSourceUrl() {
  return "https://github.com/Cognary/Aionis/archive/refs/heads/main.tar.gz";
}

function checksumSidecarUrl(url: string) {
  return `${url}.sha256`;
}

function emitInfo(options: CliOptions, line: string) {
  if (!options.json) process.stderr.write(`${line}\n`);
}

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function extractExpectedSha(text: string, artifactName: string) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) continue;
    if (basename(match[2]) === artifactName) return match[1].toLowerCase();
  }
  const single = text.trim().match(/^([a-fA-F0-9]{64})$/);
  return single ? single[1].toLowerCase() : null;
}

async function downloadToFile(url: string, outPath: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed ${res.status} ${res.statusText} for ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  writeFileSync(outPath, Buffer.from(arrayBuffer));
}

async function maybeVerifyChecksum(url: string, archivePath: string) {
  try {
    const res = await fetch(checksumSidecarUrl(url), { redirect: "follow" });
    if (!res.ok) return { verified: false, detail: "checksum_sidecar_missing" };
    const text = await res.text();
    const expected = extractExpectedSha(text, basename(archivePath));
    if (!expected) return { verified: false, detail: "checksum_sidecar_unparseable" };
    const actual = sha256File(archivePath);
    if (actual !== expected) {
      throw new Error(`checksum mismatch for ${basename(archivePath)} expected ${expected} got ${actual}`);
    }
    return { verified: true, detail: expected };
  } catch (err) {
    if (err instanceof Error && err.message.includes("checksum mismatch")) throw err;
    return { verified: false, detail: "checksum_unavailable" };
  }
}

function extractTarball(archivePath: string, destinationDir: string) {
  mkdirSync(destinationDir, { recursive: true });
  const extracted = spawnSync("tar", ["-xzf", archivePath, "-C", destinationDir], {
    stdio: "inherit",
  });
  if (extracted.status !== 0) {
    throw new Error(`failed to extract ${archivePath} into ${destinationDir}`);
  }
}

function findRuntimeRootCandidate(baseDir: string, depth = 3): string | null {
  if (!existsSync(baseDir)) return null;
  if (isRuntimeRoot(baseDir)) return baseDir;
  if (depth <= 0) return null;
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = findRuntimeRootCandidate(join(baseDir, entry.name), depth - 1);
    if (candidate) return candidate;
  }
  return null;
}

function writeRuntimeManifest(options: CliOptions, payload: Record<string, unknown>) {
  mkdirSync(runtimeCacheRoot(options), { recursive: true });
  writeFileSync(runtimeManifestFile(options), `${JSON.stringify(payload, null, 2)}\n`);
}

async function bootstrapRuntime(options: CliOptions): Promise<RuntimeResolution> {
  const explicitRoot = resolveRuntimeRoot(options.runtimeRoot);
  if (explicitRoot) {
    return { runtimeRoot: explicitRoot, source: "local_repo", version: options.runtimeVersion };
  }

  const cached = findRuntimeRootCandidate(runtimeBundleRoot(options)) ?? findRuntimeRootCandidate(runtimeSourceRoot(options));
  if (cached && !options.forceDownload) {
    return { runtimeRoot: cached, source: "cached_runtime", version: options.runtimeVersion, cacheRoot: runtimeCacheRoot(options) };
  }
  if (options.offline) {
    throw new Error(`offline mode enabled and no cached runtime found in ${runtimeCacheRoot(options)}`);
  }

  mkdirSync(runtimeDownloadsRoot(options), { recursive: true });

  const bundleUrl = process.env.AIONIS_RUNTIME_BUNDLE_URL || defaultBundleUrl(options.runtimeVersion);
  const sourceUrl = process.env.AIONIS_RUNTIME_SOURCE_URL || defaultSourceUrl(options.runtimeVersion);
  const sourceFallback = process.env.AIONIS_RUNTIME_SOURCE_FALLBACK_URL || fallbackSourceUrl();

  const bundleArchive = join(runtimeDownloadsRoot(options), basename(new URL(bundleUrl).pathname) || `bundle-${options.runtimeVersion}.tar.gz`);
  const sourceArchive = join(runtimeDownloadsRoot(options), basename(new URL(sourceUrl).pathname) || `source-${options.runtimeVersion}.tar.gz`);
  const fallbackArchive = join(runtimeDownloadsRoot(options), basename(new URL(sourceFallback).pathname) || "source-main.tar.gz");

  try {
    emitInfo(options, `Aionis runtime not found locally. Downloading runtime bundle ${options.runtimeVersion} for ${runtimePlatformKey()}...`);
    await downloadToFile(bundleUrl, bundleArchive);
    const checksum = await maybeVerifyChecksum(bundleUrl, bundleArchive);
    rmSync(runtimeBundleRoot(options), { recursive: true, force: true });
    extractTarball(bundleArchive, runtimeBundleRoot(options));
    const runtimeRoot = findRuntimeRootCandidate(runtimeBundleRoot(options));
    if (!runtimeRoot) throw new Error(`downloaded runtime bundle did not contain a valid Lite runtime: ${bundleUrl}`);
    writeRuntimeManifest(options, {
      mode: "bundle",
      version: options.runtimeVersion,
      platform: runtimePlatformKey(),
      source_url: bundleUrl,
      verified_checksum: checksum.verified ? checksum.detail : null,
      verification_state: checksum.detail,
      runtime_root: runtimeRoot,
    });
    return { runtimeRoot, source: "downloaded_bundle", version: options.runtimeVersion, cacheRoot: runtimeCacheRoot(options) };
  } catch (bundleErr) {
    emitInfo(options, `Runtime bundle unavailable. Falling back to source bootstrap.`);
    const sourceTargets = [
      { url: sourceUrl, archive: sourceArchive, ref: `v${options.runtimeVersion}` },
      { url: sourceFallback, archive: fallbackArchive, ref: "main" },
    ];
    let lastErr: unknown = bundleErr;
    for (const target of sourceTargets) {
      try {
        emitInfo(options, `Downloading Aionis source ${target.ref}...`);
        await downloadToFile(target.url, target.archive);
        rmSync(runtimeSourceRoot(options), { recursive: true, force: true });
        extractTarball(target.archive, runtimeSourceRoot(options));
        const runtimeRoot = findRuntimeRootCandidate(runtimeSourceRoot(options), 4);
        if (!runtimeRoot) throw new Error(`downloaded source did not contain a valid Lite runtime: ${target.url}`);
        writeRuntimeManifest(options, {
          mode: "source",
          version: options.runtimeVersion,
          source_ref: target.ref,
          source_url: target.url,
          runtime_root: runtimeRoot,
        });
        return { runtimeRoot, source: "downloaded_source", version: options.runtimeVersion, cacheRoot: runtimeCacheRoot(options) };
      } catch (sourceErr) {
        lastErr = sourceErr;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
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

function ensureRuntimeDependencies(runtimeRoot: string) {
  if (existsSync(join(runtimeRoot, "node_modules"))) return;
  const hasPackageLock = existsSync(join(runtimeRoot, "package-lock.json"));
  const installArgs = hasPackageLock ? ["ci"] : ["install"];
  const installed = spawnSync("npm", installArgs, {
    cwd: runtimeRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (installed.status !== 0) {
    throw new Error(`failed to install runtime dependencies in ${runtimeRoot}`);
  }
}

function ensureRuntimeBuilt(runtimeRoot: string) {
  ensureRuntimeDependencies(runtimeRoot);
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

  if (!hasNodeSqliteSupport()) {
    throw new Error("current Node.js lacks node:sqlite support; use Node 22+");
  }
  const runtime = await bootstrapRuntime(options);
  const runtimeRoot = runtime.runtimeRoot;
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
        runtime_source: runtime.source,
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
    runtime_source: runtime.source,
    runtime_version: runtime.version,
    runtime_cache_root: runtime.cacheRoot ?? null,
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
  const runtimeRoot = resolveRuntimeRoot(options.runtimeRoot) ?? findRuntimeRootCandidate(runtimeBundleRoot(options)) ?? findRuntimeRootCandidate(runtimeSourceRoot(options), 4);
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
      name: "runtime_cache_root",
      ok: existsSync(runtimeCacheRoot(options)),
      detail: existsSync(runtimeCacheRoot(options)) ? runtimeCacheRoot(options) : `missing (${runtimeCacheRoot(options)})`,
    },
    {
      name: "runtime_manifest",
      ok: existsSync(runtimeManifestFile(options)),
      detail: existsSync(runtimeManifestFile(options)) ? runtimeManifestFile(options) : `missing (${runtimeManifestFile(options)})`,
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
  emit(options.json, { ok, checks, runtime_version: options.runtimeVersion, runtime_platform: runtimePlatformKey() }, renderDoctor(checks));
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

  emit(options.json, out, out.ok ? "Aionis selfcheck passed" : "Aionis selfcheck found issues");
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
