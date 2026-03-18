#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
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
import {
  buildExecutionEvalComparison,
  buildExecutionEvalGateVerdict,
  resolveExecutionEvalSummary,
} from "./eval-cli.js";

type CommandName =
  | "runtime:dev"
  | "runtime:stop"
  | "runtime:health"
  | "runtime:doctor"
  | "runtime:selfcheck"
  | "runs:get"
  | "runs:decisions"
  | "runs:feedback"
  | "playbooks:get"
  | "playbooks:candidate"
  | "playbooks:dispatch"
  | "replay:inspect-run"
  | "replay:inspect-playbook"
  | "replay:explain"
  | "eval:inspect"
  | "eval:compare"
  | "eval:gate"
  | "artifacts:list"
  | "artifacts:show"
  | "artifacts:export"
  | "artifacts:pack"
  | "help";

type ResolvedCommand = {
  name: CommandName;
  label: string;
  args: string[];
};

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
  noColor: boolean;
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

type ArtifactEntry = {
  name: string;
  size_bytes: number;
  kind: "file" | "directory";
};

class CliUsageError extends Error {}
class CliNotFoundError extends Error {}
class CliGateFailureError extends Error {}

async function main() {
  const argv = process.argv.slice(2);
  const command = resolveCommand(argv);
  const flags = parseFlags(command.args);
  const options = resolveOptions(flags);

  switch (command.name) {
    case "runtime:dev":
      await runDev(command.label, options);
      return;
    case "runtime:stop":
      await runStop(command.label, options);
      return;
    case "runtime:health":
      await runHealth(command.label, options);
      return;
    case "runtime:doctor":
      await runDoctor(command.label, options);
      return;
    case "runtime:selfcheck":
      await runSelfcheck(command.label, options);
      return;
    case "runs:get":
      await runRunGet(command.label, options, flags);
      return;
    case "runs:decisions":
      await runRunDecisions(command.label, options, flags);
      return;
    case "runs:feedback":
      await runRunFeedback(command.label, options, flags);
      return;
    case "playbooks:get":
      await runPlaybookGet(command.label, options, flags);
      return;
    case "playbooks:candidate":
      await runPlaybookCandidate(command.label, options, flags);
      return;
    case "playbooks:dispatch":
      await runPlaybookDispatch(command.label, options, flags);
      return;
    case "replay:inspect-run":
      await runReplayInspectRun(command.label, options, flags);
      return;
    case "replay:inspect-playbook":
      await runReplayInspectPlaybook(command.label, options, flags);
      return;
    case "replay:explain":
      await runReplayExplain(command.label, options, flags);
      return;
    case "eval:inspect":
      await runEvalInspect(command.label, options, flags);
      return;
    case "eval:compare":
      await runEvalCompare(command.label, options, flags);
      return;
    case "eval:gate":
      await runEvalGate(command.label, options, flags);
      return;
    case "artifacts:list":
      await runArtifactsList(command.label, options, flags);
      return;
    case "artifacts:show":
      await runArtifactsShow(command.label, options, flags);
      return;
    case "artifacts:export":
      await runArtifactsExport(command.label, options, flags);
      return;
    case "artifacts:pack":
      await runArtifactsPack(command.label, options, flags);
      return;
    case "help":
    default:
      printHelp();
  }
}

function resolveCommand(argv: string[]): ResolvedCommand {
  const [first, second, ...rest] = argv;
  if (!first || first === "--help" || first === "-h" || first === "help") {
    return { name: "help", label: "aionis help", args: argv };
  }

  if (first === "runtime") {
    switch (second) {
      case "dev":
      case "stop":
      case "health":
      case "doctor":
      case "selfcheck":
        return {
          name: `runtime:${second}`,
          label: `aionis runtime ${second}`,
          args: rest,
        };
      default:
        return { name: "help", label: "aionis help", args: argv };
    }
  }

  if (first === "eval") {
    switch (second) {
      case "inspect":
      case "compare":
      case "gate":
        return {
          name: `eval:${second}`,
          label: `aionis eval ${second}`,
          args: rest,
        };
      default:
        return { name: "help", label: "aionis help", args: argv };
    }
  }

  if (first === "runs") {
    switch (second) {
      case "get":
      case "decisions":
      case "feedback":
        return {
          name: `runs:${second}`,
          label: `aionis runs ${second}`,
          args: rest,
        };
      default:
        return { name: "help", label: "aionis help", args: argv };
    }
  }

  if (first === "playbooks") {
    switch (second) {
      case "get":
      case "candidate":
      case "dispatch":
        return {
          name: `playbooks:${second}`,
          label: `aionis playbooks ${second}`,
          args: rest,
        };
      default:
        return { name: "help", label: "aionis help", args: argv };
    }
  }

  if (first === "replay") {
    switch (second) {
      case "inspect-run":
      case "inspect-playbook":
      case "explain":
        return {
          name: `replay:${second}`,
          label: `aionis replay ${second}`,
          args: rest,
        };
      default:
        return { name: "help", label: "aionis help", args: argv };
    }
  }

  if (first === "artifacts") {
    switch (second) {
      case "list":
      case "show":
      case "export":
      case "pack":
        return {
          name: `artifacts:${second}`,
          label: `aionis artifacts ${second}`,
          args: rest,
        };
      default:
        return { name: "help", label: "aionis help", args: argv };
    }
  }

  if (first === "dev" || first === "stop" || first === "health" || first === "doctor" || first === "selfcheck") {
    return {
      name: `runtime:${first}`,
      label: `aionis ${first}`,
      args: argv.slice(1),
    };
  }

  return { name: "help", label: "aionis help", args: argv };
}

function parseFlags(argv: string[]): Map<string, string | boolean> {
  const out = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "foreground" || key === "json" || key === "no-color") {
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
  const noColor = Boolean(flags.get("no-color"));
  const timeoutMs = Number(flags.get("timeout-ms") || process.env.AIONIS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return { baseUrl, host, port, runtimeRoot, runtimeVersion, runtimeCacheDir, forceDownload, offline, foreground, json, noColor, timeoutMs };
}

function printHelp() {
  process.stdout.write(
    [
      "Aionis Runtime CLI",
      "",
      "Usage:",
      "  aionis runtime dev [--port 3321] [--host 127.0.0.1] [--runtime-root /path/to/Aionis] [--runtime-version 0.2.20] [--force-download] [--offline] [--foreground] [--json]",
      "  aionis runtime stop [--port 3321] [--json]",
      "  aionis runtime health [--base-url http://127.0.0.1:3321] [--json]",
      "  aionis runtime doctor [--runtime-root /path/to/Aionis] [--runtime-version 0.2.20] [--runtime-cache-dir ~/.aionis/runtime] [--base-url http://127.0.0.1:3321] [--json]",
      "  aionis runtime selfcheck [--base-url http://127.0.0.1:3321] [--json]",
      "  aionis runs get --run-id <id> [--scope <scope>] [--decision-limit <n>] [--include-feedback] [--feedback-limit <n>] [--json]",
      "  aionis runs decisions --run-id <id> [--scope <scope>] [--decision-limit <n>] [--json]",
      "  aionis runs feedback --run-id <id> [--scope <scope>] [--feedback-limit <n>] [--json]",
      "  aionis playbooks get --playbook-id <id> [--scope <scope>] [--json]",
      "  aionis playbooks candidate --playbook-id <id> [--scope <scope>] [--version <n>] [--mode simulate|strict|guided] [--json]",
      "  aionis playbooks dispatch --playbook-id <id> [--scope <scope>] [--version <n>] [--mode simulate|strict|guided] [--json]",
      "  aionis replay inspect-run --run-id <id> [--scope <scope>] [--include-steps] [--include-artifacts] [--json]",
      "  aionis replay inspect-playbook --playbook-id <id> [--scope <scope>] [--version <n>] [--mode simulate|strict|guided] [--json]",
      "  aionis replay explain --run-id <id> [--scope <scope>] [--allow-partial] [--json]",
      "  aionis eval inspect --artifact-dir <dir> [--suite-id <id>] [--json]",
      "  aionis eval compare --baseline <path> --treatment <path> [--suite-id <id>] [--json]",
      "  aionis eval gate --artifact-dir <dir> [--suite-id <id>] [--json]",
      "  aionis artifacts list --artifact-dir <dir> [--json]",
      "  aionis artifacts show --artifact-dir <dir> --name <file> [--json]",
      "  aionis artifacts export --artifact-dir <dir> --out <path> [--json]",
      "  aionis artifacts pack --artifact-dir <dir> --out <path> [--json]",
      "",
      "Compatibility aliases:",
      "  aionis dev|stop|health|doctor|selfcheck",
      "",
      "Global flags:",
      "  --json --base-url <url> --timeout-ms <int> --no-color",
      "",
      "Notes:",
      "  - Runtime commands operate local Lite.",
      "  - Eval commands inspect precomputed or raw execution artifacts.",
      "  - If runtime root is not given, the CLI searches local paths first, then runtime cache, then bootstrap download.",
      "",
    ].join("\n"),
  );
}

function getStringFlag(flags: Map<string, string | boolean>, name: string): string | null {
  const value = flags.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRequiredFlag(flags: Map<string, string | boolean>, name: string): string {
  const value = getStringFlag(flags, name);
  if (!value) throw new CliUsageError(`--${name} is required`);
  return value;
}

function getOptionalIntFlag(flags: Map<string, string | boolean>, name: string): number | undefined {
  const raw = getStringFlag(flags, name);
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliUsageError(`--${name} must be a non-negative integer`);
  }
  return parsed;
}

function getOptionalModeFlag(flags: Map<string, string | boolean>, name: string): "simulate" | "strict" | "guided" | undefined {
  const raw = getStringFlag(flags, name);
  if (!raw) return undefined;
  if (raw === "simulate" || raw === "strict" || raw === "guided") return raw;
  throw new CliUsageError(`--${name} must be one of: simulate, strict, guided`);
}

function resolveArtifactDirFlag(flags: Map<string, string | boolean>): string {
  const artifactDir = resolve(getRequiredFlag(flags, "artifact-dir"));
  if (!existsSync(artifactDir)) {
    throw new CliNotFoundError(`artifact directory not found: ${artifactDir}`);
  }
  if (!statSync(artifactDir).isDirectory()) {
    throw new CliUsageError(`--artifact-dir must be a directory: ${artifactDir}`);
  }
  return artifactDir;
}

function listArtifactEntries(rootDir: string): ArtifactEntry[] {
  const out: ArtifactEntry[] = [];
  const stack = [{ abs: rootDir, rel: "" }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const names = readdirSync(current.abs).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const abs = join(current.abs, name);
      const rel = current.rel ? `${current.rel}/${name}` : name;
      const stats = statSync(abs);
      if (stats.isDirectory()) {
        out.push({ name: rel, size_bytes: 0, kind: "directory" });
        stack.push({ abs, rel });
      } else {
        out.push({ name: rel, size_bytes: stats.size, kind: "file" });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveArtifactFile(rootDir: string, rawName: string): string {
  const normalized = rawName.replace(/\\/g, "/");
  const target = resolve(rootDir, normalized);
  if (target !== rootDir && !target.startsWith(`${rootDir}/`)) {
    throw new CliUsageError(`artifact file must stay under artifact directory: ${rawName}`);
  }
  if (!existsSync(target)) {
    throw new CliNotFoundError(`artifact file not found: ${normalized}`);
  }
  if (!statSync(target).isFile()) {
    throw new CliUsageError(`artifact target is not a file: ${normalized}`);
  }
  return target;
}

function detectTextContent(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
}

function ensureMissingOutputPath(outputPath: string, flagName: string) {
  if (existsSync(outputPath)) {
    throw new CliUsageError(`--${flagName} already exists: ${outputPath}`);
  }
}

function outputEnvelope(command: string, body: Record<string, unknown>) {
  return {
    command,
    version: packageVersion(),
    generated_at: new Date().toISOString(),
    ...body,
  };
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

async function runDev(command: string, options: CliOptions) {
  ensureStateDir();
  try {
    const existing = await healthCheck(options.baseUrl, options.timeoutMs);
    if (existing.data?.ok) {
      emitSuccess(command, options.json, {
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
      emitSuccess(command, options.json, {
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
  emitSuccess(command, options.json, {
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

async function runHealth(command: string, options: CliOptions) {
  const out = await healthCheck(options.baseUrl, options.timeoutMs);
  emitSuccess(command, options.json, {
    ok: Boolean(out.data?.ok),
    base_url: options.baseUrl,
    edition: out.data?.aionis_edition ?? null,
    backend: out.data?.memory_store_backend ?? null,
    request_id: out.request_id,
  }, `Aionis health ok at ${options.baseUrl}`);
}

async function runStop(command: string, options: CliOptions) {
  ensureStateDir();
  const pidPath = runtimePidFile(options.port);
  const pid = readPidFile(pidPath);
  if (!pid) {
    emitSuccess(command, options.json, {
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
  emitSuccess(command, options.json, {
    ok,
    stopped: ok,
    pid,
    pid_path: pidPath,
    base_url: options.baseUrl,
  }, ok ? `Stopped Aionis Lite process ${pid}` : `Failed to stop Aionis Lite process ${pid}`);
  if (!ok) process.exitCode = 1;
}

async function runDoctor(command: string, options: CliOptions) {
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
  emitSuccess(command, options.json, { ok, checks, runtime_version: options.runtimeVersion, runtime_platform: runtimePlatformKey() }, renderDoctor(checks));
  if (!ok) process.exitCode = 1;
}

async function runSelfcheck(command: string, options: CliOptions) {
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

  emitSuccess(command, options.json, out, out.ok ? "Aionis selfcheck passed" : "Aionis selfcheck found issues");
  if (!out.ok) process.exitCode = 1;
}

async function runPlaybookGet(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const playbookId = getRequiredFlag(flags, "playbook-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const response = await client.replayPlaybookGet({
    playbook_id: playbookId,
    scope,
  });
  emitSuccess(
    command,
    options.json,
    {
      playbook_id: playbookId,
      scope: scope ?? null,
      response: response.data,
      request_id: response.request_id,
    },
    [
      "Replay Playbook",
      `playbook_id: ${playbookId}`,
      `scope: ${scope ?? "default"}`,
      `request_id: ${response.request_id ?? "n/a"}`,
    ].join("\n"),
  );
}

async function runPlaybookCandidate(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const playbookId = getRequiredFlag(flags, "playbook-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const version = getOptionalIntFlag(flags, "version");
  const mode = getOptionalModeFlag(flags, "mode");
  const response = await client.replayPlaybookCandidate({
    playbook_id: playbookId,
    scope,
    version,
    mode,
  });
  const candidate = (response.data as Record<string, unknown>)?.candidate as Record<string, unknown> | undefined;
  emitSuccess(
    command,
    options.json,
    {
      playbook_id: playbookId,
      scope: scope ?? null,
      version: version ?? null,
      mode: mode ?? null,
      response: response.data,
      request_id: response.request_id,
    },
    [
      "Replay Playbook Candidate",
      `playbook_id: ${playbookId}`,
      `scope: ${scope ?? "default"}`,
      `eligible: ${String(candidate?.eligible_for_deterministic_replay ?? "unknown")}`,
      `recommended_mode: ${String(candidate?.recommended_mode ?? "unknown")}`,
      `next_action: ${String(candidate?.next_action ?? "unknown")}`,
    ].join("\n"),
  );
}

async function runPlaybookDispatch(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const playbookId = getRequiredFlag(flags, "playbook-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const version = getOptionalIntFlag(flags, "version");
  const mode = getOptionalModeFlag(flags, "mode");
  const response = await client.replayPlaybookDispatch({
    playbook_id: playbookId,
    scope,
    version,
    mode,
  });
  const dispatch = (response.data as Record<string, unknown>)?.dispatch as Record<string, unknown> | undefined;
  emitSuccess(
    command,
    options.json,
    {
      playbook_id: playbookId,
      scope: scope ?? null,
      version: version ?? null,
      mode: mode ?? null,
      response: response.data,
      request_id: response.request_id,
    },
    [
      "Replay Playbook Dispatch",
      `playbook_id: ${playbookId}`,
      `scope: ${scope ?? "default"}`,
      `decision: ${String(dispatch?.decision ?? "unknown")}`,
      `primary_inference_skipped: ${String(dispatch?.primary_inference_skipped ?? "unknown")}`,
      `fallback_executed: ${String(dispatch?.fallback_executed ?? "unknown")}`,
    ].join("\n"),
  );
}

async function runReplayInspectRun(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const runId = getRequiredFlag(flags, "run-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const includeSteps = Boolean(flags.get("include-steps"));
  const includeArtifacts = Boolean(flags.get("include-artifacts"));
  const response = await client.replayRunGet({
    run_id: runId,
    scope,
    include_steps: includeSteps,
    include_artifacts: includeArtifacts,
  });
  emitSuccess(
    command,
    options.json,
    {
      run_id: runId,
      scope: scope ?? null,
      include_steps: includeSteps,
      include_artifacts: includeArtifacts,
      response: response.data,
      request_id: response.request_id,
    },
    [
      "Replay Run",
      `run_id: ${runId}`,
      `scope: ${scope ?? "default"}`,
      `include_steps: ${String(includeSteps)}`,
      `include_artifacts: ${String(includeArtifacts)}`,
      `request_id: ${response.request_id ?? "n/a"}`,
    ].join("\n"),
  );
}

async function runReplayInspectPlaybook(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const playbookId = getRequiredFlag(flags, "playbook-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const version = getOptionalIntFlag(flags, "version");
  const mode = getOptionalModeFlag(flags, "mode");
  const getResponse = await client.replayPlaybookGet({
    playbook_id: playbookId,
    scope,
  });
  const candidateResponse = await client.replayPlaybookCandidate({
    playbook_id: playbookId,
    scope,
    version,
    mode,
  });
  const playbook = (getResponse.data as Record<string, unknown>)?.playbook as Record<string, unknown> | undefined;
  const candidate = (candidateResponse.data as Record<string, unknown>)?.candidate as Record<string, unknown> | undefined;
  const deterministicGate = (candidateResponse.data as Record<string, unknown>)?.deterministic_gate ?? null;
  const costSignals = (candidateResponse.data as Record<string, unknown>)?.cost_signals ?? null;
  emitSuccess(
    command,
    options.json,
    {
      playbook_id: playbookId,
      scope: scope ?? null,
      version: version ?? null,
      mode: mode ?? null,
      playbook,
      candidate,
      deterministic_gate: deterministicGate,
      cost_signals: costSignals,
      request_ids: {
        playbook_get: getResponse.request_id ?? null,
        playbook_candidate: candidateResponse.request_id ?? null,
      },
    },
    [
      "Replay Playbook Inspection",
      `playbook_id: ${playbookId}`,
      `scope: ${scope ?? "default"}`,
      `status: ${String(playbook?.status ?? "unknown")}`,
      `version: ${String(playbook?.version ?? version ?? "unknown")}`,
      `eligible: ${String(candidate?.eligible_for_deterministic_replay ?? "unknown")}`,
      `recommended_mode: ${String(candidate?.recommended_mode ?? "unknown")}`,
      `next_action: ${String(candidate?.next_action ?? "unknown")}`,
    ].join("\n"),
  );
}

async function runReplayExplain(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const runId = getRequiredFlag(flags, "run-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const allowPartial = Boolean(flags.get("allow-partial"));
  const response = await client.replayRunGet({
    run_id: runId,
    scope,
    include_steps: true,
    include_artifacts: false,
  });
  const payload = response.data as Record<string, unknown>;
  const run = payload.run && typeof payload.run === "object" ? (payload.run as Record<string, unknown>) : {};
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const counters = payload.counters && typeof payload.counters === "object" ? (payload.counters as Record<string, unknown>) : {};
  const runStatus = String(run.status ?? "unknown");
  const blockerCodes: string[] = [];
  if (!allowPartial && runStatus !== "success") blockerCodes.push("run_not_successful");
  if (steps.length === 0) blockerCodes.push("no_step_nodes");
  const blockers = blockerCodes.map((code) => {
    switch (code) {
      case "run_not_successful":
        return {
          code,
          message: `compile_from_run requires run status=success unless --allow-partial is set; current status=${runStatus}`,
        };
      case "no_step_nodes":
        return {
          code,
          message: "run does not contain replay step nodes, so replay playbook compilation would have no source steps",
        };
      default:
        return { code, message: code };
    }
  });
  const stepStatusFrequency = new Map<string, number>();
  for (const step of steps) {
    const item = step && typeof step === "object" ? (step as Record<string, unknown>) : {};
    const status = String(item.status ?? "unknown");
    stepStatusFrequency.set(status, (stepStatusFrequency.get(status) ?? 0) + 1);
  }
  const nextAction = blockerCodes.includes("no_step_nodes")
    ? "instrument replay step nodes before expecting compile-from-run"
    : blockerCodes.includes("run_not_successful")
      ? "rerun to success or retry with --allow-partial for inspection-only use"
      : "run is compile-ready for replay playbook generation";
  emitSuccess(
    command,
    options.json,
    {
      run_id: runId,
      scope: scope ?? null,
      allow_partial: allowPartial,
      run,
      counters,
      explain: {
        compile_ready: blockerCodes.length === 0,
        blocker_count: blockers.length,
        blockers,
        next_action: nextAction,
        step_status_frequency: Object.fromEntries(stepStatusFrequency.entries()),
      },
      request_id: response.request_id ?? null,
    },
    [
      "Replay Explain",
      `run_id: ${runId}`,
      `scope: ${scope ?? "default"}`,
      `status: ${runStatus}`,
      `allow_partial: ${String(allowPartial)}`,
      `compile_ready: ${String(blockerCodes.length === 0)}`,
      `blockers: ${blockerCodes.length === 0 ? "none" : blockerCodes.join(",")}`,
      `next_action: ${nextAction}`,
    ].join("\n"),
  );
}

async function runRunGet(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const runId = getRequiredFlag(flags, "run-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const decisionLimit = getOptionalIntFlag(flags, "decision-limit");
  const includeFeedback = Boolean(flags.get("include-feedback"));
  const feedbackLimit = getOptionalIntFlag(flags, "feedback-limit");
  const response = await client.toolsRun({
    run_id: runId,
    scope,
    decision_limit: decisionLimit,
    include_feedback: includeFeedback,
    feedback_limit: feedbackLimit,
  });
  const lifecycle = (response.data as Record<string, unknown>)?.lifecycle as Record<string, unknown> | undefined;
  emitSuccess(
    command,
    options.json,
    {
      run_id: runId,
      scope: scope ?? null,
      include_feedback: includeFeedback,
      response: response.data,
      request_id: response.request_id,
    },
    [
      "Run",
      `run_id: ${runId}`,
      `scope: ${scope ?? "default"}`,
      `status: ${String(lifecycle?.status ?? "unknown")}`,
      `decision_count: ${String(lifecycle?.decision_count ?? "unknown")}`,
      `latest_decision_at: ${String(lifecycle?.latest_decision_at ?? "unknown")}`,
      `latest_feedback_at: ${String(lifecycle?.latest_feedback_at ?? "unknown")}`,
      `include_feedback: ${String(includeFeedback)}`,
    ].join("\n"),
  );
}

async function runRunDecisions(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const runId = getRequiredFlag(flags, "run-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const decisionLimit = getOptionalIntFlag(flags, "decision-limit");
  const runResponse = await client.toolsRun({
    run_id: runId,
    scope,
    decision_limit: decisionLimit,
    include_feedback: false,
  });
  const runData = runResponse.data as Record<string, unknown>;
  const decisions = Array.isArray(runData.decisions) ? runData.decisions : [];
  let latestDecision: Record<string, unknown> | null = null;
  try {
    const latestResponse = await client.toolsDecision({
      run_id: runId,
      scope,
    });
    latestDecision = (latestResponse.data as Record<string, unknown>)?.decision as Record<string, unknown> | null;
  } catch {
    latestDecision = null;
  }
  emitSuccess(
    command,
    options.json,
    {
      run_id: runId,
      scope: scope ?? null,
      decision_count: decisions.length,
      latest_decision: latestDecision,
      decisions,
      request_id: runResponse.request_id,
    },
    [
      "Run Decisions",
      `run_id: ${runId}`,
      `scope: ${scope ?? "default"}`,
      `decision_count: ${decisions.length}`,
      `latest_decision_id: ${String(latestDecision?.decision_id ?? "unknown")}`,
      ...decisions.map((decision) => {
        const item = decision && typeof decision === "object" ? (decision as Record<string, unknown>) : {};
        return `decision ${String(item.decision_id ?? "unknown")}: ${String(item.selected_tool ?? "unknown")}`;
      }),
    ].join("\n"),
  );
}

async function runRunFeedback(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const client = new AionisClient({ base_url: options.baseUrl, timeout_ms: options.timeoutMs });
  const runId = getRequiredFlag(flags, "run-id");
  const scope = getStringFlag(flags, "scope") ?? undefined;
  const feedbackLimit = getOptionalIntFlag(flags, "feedback-limit");
  const response = await client.toolsRun({
    run_id: runId,
    scope,
    include_feedback: true,
    feedback_limit: feedbackLimit,
  });
  const runData = response.data as Record<string, unknown>;
  const feedback = runData.feedback && typeof runData.feedback === "object" ? (runData.feedback as Record<string, unknown>) : null;
  const recent = Array.isArray(feedback?.recent) ? feedback.recent : [];
  emitSuccess(
    command,
    options.json,
    {
      run_id: runId,
      scope: scope ?? null,
      feedback,
      recent,
      request_id: response.request_id,
    },
    [
      "Run Feedback",
      `run_id: ${runId}`,
      `scope: ${scope ?? "default"}`,
      `total: ${String(feedback?.total ?? 0)}`,
      `tools_feedback_count: ${String(feedback?.tools_feedback_count ?? 0)}`,
      `linked_decision_count: ${String(feedback?.linked_decision_count ?? 0)}`,
      ...recent.map((entry) => {
        const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        return `feedback ${String(item.id ?? "unknown")}: ${String(item.outcome ?? "unknown")} (${String(item.source ?? "unknown")})`;
      }),
    ].join("\n"),
  );
}

async function runEvalInspect(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const artifactDir = getRequiredFlag(flags, "artifact-dir");
  const suiteId = getStringFlag(flags, "suite-id") ?? undefined;
  const summary = resolveExecutionEvalSummary({
    inputPath: artifactDir,
    suiteId,
  });
  const treatment = summary.variants.treatment ?? null;
  const baseline = summary.variants.baseline ?? null;
  emitSuccess(
    command,
    options.json,
    {
      artifact_dir: resolve(artifactDir),
      summary,
    },
    [
      "Execution Eval Summary",
      `suite: ${summary.suite_id}`,
      `case_group: ${summary.case_group_id}`,
      `baseline: ${baseline?.result ?? "unknown"}`,
      `treatment: ${treatment?.result ?? "unknown"}`,
      `completion_gain: ${summary.delta.completion_gain}`,
      `reviewer_readiness_gain: ${summary.delta.reviewer_readiness_gain}`,
      `continuity_gain: ${summary.delta.continuity_gain}`,
      `recovery_gain: ${summary.delta.recovery_gain}`,
      `control_quality_gain: ${summary.delta.control_quality_gain}`,
    ].join("\n"),
  );
}

async function runEvalCompare(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const baselinePath = getRequiredFlag(flags, "baseline");
  const treatmentPath = getRequiredFlag(flags, "treatment");
  const suiteId = getStringFlag(flags, "suite-id") ?? undefined;
  const comparison = buildExecutionEvalComparison({
    baselinePath,
    treatmentPath,
    suiteId,
  });
  emitSuccess(
    command,
    options.json,
    comparison,
    [
      "Execution Eval Compare",
      `baseline_ref: ${comparison.baseline_ref}`,
      `treatment_ref: ${comparison.treatment_ref}`,
      `baseline_treatment_result: ${comparison.baseline.treatment_result}`,
      `treatment_treatment_result: ${comparison.treatment.treatment_result}`,
      `completion_change: ${comparison.changes.completion}`,
      `reviewer_readiness_change: ${comparison.changes.reviewer_readiness}`,
      `continuity_change: ${comparison.changes.continuity}`,
      `recovery_change: ${comparison.changes.recovery}`,
      `control_quality_change: ${comparison.changes.control_quality}`,
    ].join("\n"),
  );
}

async function runEvalGate(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const artifactDir = getRequiredFlag(flags, "artifact-dir");
  const suiteId = getStringFlag(flags, "suite-id") ?? undefined;
  const summary = resolveExecutionEvalSummary({
    inputPath: artifactDir,
    suiteId,
  });
  const gate = buildExecutionEvalGateVerdict(summary);
  if (gate.verdict !== "pass") {
    throw Object.assign(
      new CliGateFailureError(gate.reasons.join("; ") || "execution eval gate failed"),
      {
        details: {
          artifact_dir: resolve(artifactDir),
          verdict: gate.verdict,
          reasons: gate.reasons,
        },
      },
    );
  }
  emitSuccess(
    command,
    options.json,
    {
      artifact_dir: resolve(artifactDir),
      verdict: gate.verdict,
      reasons: gate.reasons,
      summary,
    },
    [
      "Execution Eval Gate",
      `artifact_dir: ${resolve(artifactDir)}`,
      `verdict: ${gate.verdict}`,
      ...(gate.reasons.length > 0 ? gate.reasons.map((reason) => `reason: ${reason}`) : ["reason: none"]),
    ].join("\n"),
  );
}

async function runArtifactsList(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const artifactDir = resolveArtifactDirFlag(flags);
  const files = listArtifactEntries(artifactDir);
  emitSuccess(
    command,
    options.json,
    {
      artifact_dir: artifactDir,
      count: files.length,
      files,
    },
    [
      "Artifact Listing",
      `artifact_dir: ${artifactDir}`,
      `count: ${files.length}`,
      ...files.map((entry) => `${entry.kind === "directory" ? "dir " : "file"} ${entry.name}${entry.kind === "file" ? ` (${entry.size_bytes} B)` : ""}`),
    ].join("\n"),
  );
}

async function runArtifactsShow(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const artifactDir = resolveArtifactDirFlag(flags);
  const name = getRequiredFlag(flags, "name");
  const targetFile = resolveArtifactFile(artifactDir, name);
  const content = readFileSync(targetFile);
  const relativeName = targetFile.slice(artifactDir.length + 1);
  const encoding = detectTextContent(content) ? "utf8" : "base64";
  const rendered = encoding === "utf8" ? content.toString("utf8") : content.toString("base64");
  emitSuccess(
    command,
    options.json,
    {
      artifact_dir: artifactDir,
      name: relativeName,
      size_bytes: content.length,
      encoding,
      content: rendered,
    },
    [
      "Artifact File",
      `artifact_dir: ${artifactDir}`,
      `name: ${relativeName}`,
      `size_bytes: ${content.length}`,
      `encoding: ${encoding}`,
      "",
      rendered,
    ].join("\n"),
  );
}

async function runArtifactsExport(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const artifactDir = resolveArtifactDirFlag(flags);
  const out = resolve(getRequiredFlag(flags, "out"));
  ensureMissingOutputPath(out, "out");
  cpSync(artifactDir, out, { recursive: true });
  emitSuccess(
    command,
    options.json,
    {
      artifact_dir: artifactDir,
      out,
      exported: true,
    },
    [
      "Artifact Export",
      `artifact_dir: ${artifactDir}`,
      `out: ${out}`,
      "exported: true",
    ].join("\n"),
  );
}

async function runArtifactsPack(command: string, options: CliOptions, flags: Map<string, string | boolean>) {
  const artifactDir = resolveArtifactDirFlag(flags);
  const out = resolve(getRequiredFlag(flags, "out"));
  ensureMissingOutputPath(out, "out");
  const parentDir = dirname(artifactDir);
  const artifactName = basename(artifactDir);
  const pack = spawnSync("tar", ["-czf", out, "-C", parentDir, artifactName], {
    encoding: "utf8",
  });
  if (pack.error) {
    throw pack.error;
  }
  if (pack.status !== 0) {
    throw new Error(pack.stderr || `failed to pack artifacts: ${artifactDir}`);
  }
  const sizeBytes = statSync(out).size;
  emitSuccess(
    command,
    options.json,
    {
      artifact_dir: artifactDir,
      out,
      size_bytes: sizeBytes,
      packed: true,
    },
    [
      "Artifact Pack",
      `artifact_dir: ${artifactDir}`,
      `out: ${out}`,
      `size_bytes: ${sizeBytes}`,
      "packed: true",
    ].join("\n"),
  );
}

function renderDoctor(checks: DoctorCheck[]) {
  const lines = ["Aionis doctor"];
  for (const check of checks) {
    lines.push(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  return lines.join("\n");
}

function emitSuccess(command: string, json: boolean, payload: Record<string, unknown>, text: string) {
  if (json) {
    process.stdout.write(`${JSON.stringify(outputEnvelope(command, { data: payload }), null, 2)}\n`);
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

function emitFailure(command: string, json: boolean, code: string, message: string, details?: Record<string, unknown>) {
  if (json) {
    process.stdout.write(`${JSON.stringify(outputEnvelope(command, {
      error: {
        code,
        message,
        details: details ?? {},
      },
    }), null, 2)}\n`);
    return;
  }
  process.stderr.write(`${message}\n`);
}

function formatErr(err: unknown) {
  if (err instanceof AionisApiError) return `${err.code ?? "api_error"} (${err.status ?? "?"})`;
  if (err instanceof AionisNetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

main().catch((err) => {
  const argv = process.argv.slice(2);
  const command = resolveCommand(argv);
  const flags = parseFlags(command.args);
  const json = Boolean(flags.get("json"));
  const message = formatErr(err);
  let code = "cli_error";
  let exitCode = 1;
  const details = err && typeof err === "object" && "details" in err ? ((err as { details?: Record<string, unknown> }).details ?? {}) : {};
  if (err instanceof CliUsageError) {
    code = "usage_error";
    exitCode = 2;
  } else if (err instanceof CliNotFoundError || (err instanceof Error && "code" in err && (err as Error & { code?: string }).code === "ENOENT")) {
    code = "not_found";
    exitCode = 4;
  } else if (err instanceof CliGateFailureError) {
    code = "gate_failed";
    exitCode = 5;
  } else if (err instanceof AionisNetworkError) {
    code = "runtime_unavailable";
    exitCode = 3;
  }
  emitFailure(command.label, json, code, message, details);
  process.exit(exitCode);
});
