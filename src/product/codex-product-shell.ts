import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, type ChildProcess } from "node:child_process";

export type CodexProductShellConfig = {
  repo_root: string;
  codex_home: string;
  base_url: string;
  scope: string;
};

export type CodexProductShellPaths = {
  codex_home: string;
  aionis_root: string;
  config_path: string;
  hooks_path: string;
  hooks_backup_path: string;
  bin_dir: string;
  hook_launcher_path: string;
  shell_launcher_path: string;
  user_bin_dir: string;
  user_launcher_path: string;
};

type HookConfig = {
  aionis_managed?: {
    product: "aionis_for_codex";
    version: 1;
    updated_at: string;
    hook_launcher_path: string;
  };
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<Record<string, unknown>> }>>;
};

export type SetupCodexProductShellArgs = {
  repo_root: string;
  codex_home?: string;
  base_url?: string;
  scope?: string;
};

export type ProductShellSetupResult = {
  config: CodexProductShellConfig;
  paths: CodexProductShellPaths;
  install_state: "created" | "updated" | "unchanged";
};

export type ProductShellDoctorStatus = {
  codex_home_exists: boolean;
  config_exists: boolean;
  hook_launcher_exists: boolean;
  shell_launcher_exists: boolean;
  user_launcher_exists: boolean;
  user_launcher_on_path: boolean;
  hooks_installed: boolean;
  hooks_enabled: boolean;
  hooks_backup_exists: boolean;
  hooks_managed_marker_present: boolean;
  hooks_backup_restorable: boolean;
  runtime_healthy: boolean;
  runtime_status_code: number | null;
};

export type ProductShellStartResult =
  | { status: "already_running"; port: number }
  | { status: "started"; port: number; pid: number | null; command: string[] };

export type ProductShellRemoveResult = {
  removed: boolean;
  paths: CodexProductShellPaths;
  removed_paths: string[];
};

export type CodexProductShellFs = {
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  rm: typeof rm;
  writeFile: typeof writeFile;
  stat: typeof stat;
};

export type SpawnLike = (
  command: string,
  args: string[],
  options: Record<string, unknown>,
) => ChildProcess;

const DEFAULT_BASE_URL = "http://127.0.0.1:3011";
const DEFAULT_SCOPE = "default";

export function resolveCodexHome(explicit?: string): string {
  return explicit ?? path.join(os.homedir(), ".codex");
}

export function resolveCodexProductShellPaths(codex_home: string): CodexProductShellPaths {
  const aionis_root = path.join(codex_home, "aionis");
  const bin_dir = path.join(aionis_root, "bin");
  const user_bin_dir = path.join(path.dirname(codex_home), ".local", "bin");
  return {
    codex_home,
    aionis_root,
    config_path: path.join(aionis_root, "config.json"),
    hooks_path: path.join(codex_home, "hooks.json"),
    hooks_backup_path: path.join(aionis_root, "hooks.backup.json"),
    bin_dir,
    hook_launcher_path: path.join(bin_dir, "aionis-codex-hook.sh"),
    shell_launcher_path: path.join(bin_dir, "aionis-codex-shell.sh"),
    user_bin_dir,
    user_launcher_path: path.join(user_bin_dir, "aionis"),
  };
}

async function pathExists(fs: CodexProductShellFs, target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(fs: CodexProductShellFs, target: string): Promise<boolean> {
  if (!(await pathExists(fs, target))) return false;
  await fs.rm(target, { force: true, recursive: true });
  return true;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function buildLauncherScript(args: {
  repo_root: string;
  base_url: string;
  scope: string;
  target_script: "adapter:codex-hook" | "adapter:codex-shell";
}) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `export AIONIS_BASE_URL=${shellEscape(args.base_url)}`,
    `export AIONIS_SCOPE=${shellEscape(args.scope)}`,
    `exec npm --prefix ${shellEscape(args.repo_root)} run -s ${args.target_script} \"$@\"`,
    "",
  ].join("\n");
}

function buildUserLauncherScript(repo_root: string) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `exec npm --prefix ${shellEscape(repo_root)} run -s product:aionis -- \"$@\"`,
    "",
  ].join("\n");
}

function createManagedHookCommand(launcher_path: string) {
  return `/usr/bin/env bash ${shellEscape(launcher_path)}`;
}

function isManagedHookCommand(command: unknown, launcher_path: string) {
  return typeof command === "string" && command === createManagedHookCommand(launcher_path);
}

function upsertManagedHook(
  hooks: HookConfig,
  event_name: "SessionStart" | "UserPromptSubmit" | "Stop",
  command: string,
  status_message: string,
) {
  const groups = hooks.hooks?.[event_name] ?? [];
  const nextGroup = {
    matcher: ".*",
    hooks: [{
      type: "command",
      command,
      statusMessage: status_message,
    }],
  };
  const filtered = groups.filter((group) => {
    const first = group.hooks?.[0];
    return !(first && first.type === "command" && first.command === command);
  });
  hooks.hooks = hooks.hooks ?? {};
  hooks.hooks[event_name] = [nextGroup, ...filtered];
}

function removeManagedHooks(
  hooks: HookConfig,
  event_name: "SessionStart" | "UserPromptSubmit" | "Stop",
  launcher_path: string,
) {
  const groups = hooks.hooks?.[event_name] ?? [];
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      hooks: (group.hooks ?? []).filter((hook) => !isManagedHookCommand(hook.command, launcher_path)),
    }))
    .filter((group) => (group.hooks?.length ?? 0) > 0);
  hooks.hooks = hooks.hooks ?? {};
  hooks.hooks[event_name] = filteredGroups;
}

async function loadHooksConfig(fs: CodexProductShellFs, hooks_path: string): Promise<HookConfig> {
  if (!(await pathExists(fs, hooks_path))) return { hooks: {} };
  const raw = await fs.readFile(hooks_path, "utf8");
  try {
    const parsed = JSON.parse(raw) as HookConfig;
    return typeof parsed === "object" && parsed ? parsed : { hooks: {} };
  } catch {
    return { hooks: {} };
  }
}

async function backupHooksIfNeeded(fs: CodexProductShellFs, hooks_path: string, hooks_backup_path: string): Promise<void> {
  if (!(await pathExists(fs, hooks_path))) return;
  if (await pathExists(fs, hooks_backup_path)) return;
  const raw = await fs.readFile(hooks_path, "utf8");
  await fs.writeFile(hooks_backup_path, raw, "utf8");
}

function sameManagedShellConfig(existing: CodexProductShellConfig | null, next: CodexProductShellConfig) {
  if (!existing) return false;
  return existing.repo_root === next.repo_root
    && existing.codex_home === next.codex_home
    && existing.base_url === next.base_url
    && existing.scope === next.scope;
}

export async function writeCodexProductShellInstall(
  args: SetupCodexProductShellArgs,
  deps: {
    fs?: CodexProductShellFs;
  } = {},
): Promise<ProductShellSetupResult> {
  const fs = deps.fs ?? { mkdir, readFile, rm, writeFile, stat };
  const codex_home = resolveCodexHome(args.codex_home);
  const paths = resolveCodexProductShellPaths(codex_home);
  const config: CodexProductShellConfig = {
    repo_root: args.repo_root,
    codex_home,
    base_url: args.base_url ?? DEFAULT_BASE_URL,
    scope: args.scope ?? DEFAULT_SCOPE,
  };
  const existingConfig = await readCodexProductShellConfig(codex_home, { fs });
  const hookCommand = createManagedHookCommand(paths.hook_launcher_path);
  const existingHooks = await loadHooksConfig(fs, paths.hooks_path);
  const managedEvents: Array<"SessionStart" | "UserPromptSubmit" | "Stop"> = ["SessionStart", "UserPromptSubmit", "Stop"];
  const alreadyEnabled = managedEvents.every((eventName) =>
    (existingHooks.hooks?.[eventName] ?? []).some((group) =>
      group.hooks?.some((hook) => hook.type === "command" && hook.command === hookCommand),
    ),
  );

  if (
    sameManagedShellConfig(existingConfig, config)
    && existingHooks.aionis_managed?.product === "aionis_for_codex"
    && alreadyEnabled
    && await pathExists(fs, paths.hook_launcher_path)
    && await pathExists(fs, paths.shell_launcher_path)
  ) {
    return {
      config,
      paths,
      install_state: "unchanged",
    };
  }

  const install_state = existingConfig ? "updated" : "created";

  await fs.mkdir(paths.bin_dir, { recursive: true });
  await fs.writeFile(paths.config_path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await fs.writeFile(
    paths.hook_launcher_path,
    buildLauncherScript({
      repo_root: config.repo_root,
      base_url: config.base_url,
      scope: config.scope,
      target_script: "adapter:codex-hook",
    }),
    { encoding: "utf8", mode: 0o755 },
  );
  await fs.writeFile(
    paths.shell_launcher_path,
    buildLauncherScript({
      repo_root: config.repo_root,
      base_url: config.base_url,
      scope: config.scope,
      target_script: "adapter:codex-shell",
    }),
    { encoding: "utf8", mode: 0o755 },
  );
  await fs.mkdir(paths.user_bin_dir, { recursive: true });
  await fs.writeFile(
    paths.user_launcher_path,
    buildUserLauncherScript(config.repo_root),
    { encoding: "utf8", mode: 0o755 },
  );

  await backupHooksIfNeeded(fs, paths.hooks_path, paths.hooks_backup_path);
  const hooks = await loadHooksConfig(fs, paths.hooks_path);
  upsertManagedHook(hooks, "SessionStart", hookCommand, "Aionis warming execution memory");
  upsertManagedHook(hooks, "UserPromptSubmit", hookCommand, "Aionis preparing execution guidance");
  upsertManagedHook(hooks, "Stop", hookCommand, "Aionis finalizing task state");
  hooks.aionis_managed = {
    product: "aionis_for_codex",
    version: 1,
    updated_at: new Date().toISOString(),
    hook_launcher_path: paths.hook_launcher_path,
  };
  await fs.writeFile(paths.hooks_path, `${JSON.stringify(hooks, null, 2)}\n`, "utf8");

  return { config, paths, install_state };
}

export async function readCodexProductShellConfig(
  codex_home?: string,
  deps: { fs?: CodexProductShellFs } = {},
): Promise<CodexProductShellConfig | null> {
  const fs = deps.fs ?? { mkdir, readFile, rm, writeFile, stat };
  const paths = resolveCodexProductShellPaths(resolveCodexHome(codex_home));
  if (!(await pathExists(fs, paths.config_path))) return null;
  const raw = await fs.readFile(paths.config_path, "utf8");
  return JSON.parse(raw) as CodexProductShellConfig;
}

function portFromBaseUrl(base_url: string): number {
  const url = new URL(base_url);
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

function isPathOnEnvironment(target: string): boolean {
  const pathValue = process.env.PATH ?? "";
  return pathValue.split(path.delimiter).includes(target);
}

export async function fetchRuntimeHealth(base_url: string): Promise<{ healthy: boolean; status_code: number | null }> {
  try {
    const response = await fetch(new URL("/health", base_url));
    return {
      healthy: response.ok,
      status_code: response.status,
    };
  } catch {
    return {
      healthy: false,
      status_code: null,
    };
  }
}

export async function doctorCodexProductShell(
  codex_home?: string,
  deps: { fs?: CodexProductShellFs } = {},
): Promise<{ config: CodexProductShellConfig | null; status: ProductShellDoctorStatus }> {
  const fs = deps.fs ?? { mkdir, readFile, rm, writeFile, stat };
  const resolved_home = resolveCodexHome(codex_home);
  const paths = resolveCodexProductShellPaths(resolved_home);
  const config = await readCodexProductShellConfig(resolved_home, { fs });
  const hooks = await loadHooksConfig(fs, paths.hooks_path);
  const hookCommand = createManagedHookCommand(paths.hook_launcher_path);
  const managedEvents: Array<"SessionStart" | "UserPromptSubmit" | "Stop"> = ["SessionStart", "UserPromptSubmit", "Stop"];
  const hooks_enabled = managedEvents.every((eventName) =>
    (hooks.hooks?.[eventName] ?? []).some((group) =>
      group.hooks?.some((hook) => hook.type === "command" && hook.command === hookCommand),
    ),
  );
  const runtime = config ? await fetchRuntimeHealth(config.base_url) : { healthy: false, status_code: null };
  return {
    config,
    status: {
      codex_home_exists: await pathExists(fs, resolved_home),
      config_exists: await pathExists(fs, paths.config_path),
      hook_launcher_exists: await pathExists(fs, paths.hook_launcher_path),
      shell_launcher_exists: await pathExists(fs, paths.shell_launcher_path),
      user_launcher_exists: await pathExists(fs, paths.user_launcher_path),
      user_launcher_on_path: isPathOnEnvironment(paths.user_bin_dir),
      hooks_installed: await pathExists(fs, paths.hooks_path),
      hooks_enabled,
      hooks_backup_exists: await pathExists(fs, paths.hooks_backup_path),
      hooks_managed_marker_present: hooks.aionis_managed?.product === "aionis_for_codex",
      hooks_backup_restorable: await pathExists(fs, paths.hooks_backup_path),
      runtime_healthy: runtime.healthy,
      runtime_status_code: runtime.status_code,
    },
  };
}

export async function enableCodexProductShell(
  codex_home?: string,
  deps: { fs?: CodexProductShellFs } = {},
): Promise<{ config: CodexProductShellConfig; paths: CodexProductShellPaths }> {
  const fs = deps.fs ?? { mkdir, readFile, rm, writeFile, stat };
  const config = await readCodexProductShellConfig(codex_home, { fs });
  if (!config) {
    throw new Error("codex product shell is not installed");
  }
  return await writeCodexProductShellInstall({
    repo_root: config.repo_root,
    codex_home: config.codex_home,
    base_url: config.base_url,
    scope: config.scope,
  }, { fs });
}

export async function disableCodexProductShell(
  codex_home?: string,
  deps: { fs?: CodexProductShellFs } = {},
): Promise<{ config: CodexProductShellConfig | null; paths: CodexProductShellPaths }> {
  const fs = deps.fs ?? { mkdir, readFile, rm, writeFile, stat };
  const resolved_home = resolveCodexHome(codex_home);
  const paths = resolveCodexProductShellPaths(resolved_home);
  const config = await readCodexProductShellConfig(resolved_home, { fs });
  const hooks = await loadHooksConfig(fs, paths.hooks_path);
  removeManagedHooks(hooks, "SessionStart", paths.hook_launcher_path);
  removeManagedHooks(hooks, "UserPromptSubmit", paths.hook_launcher_path);
  removeManagedHooks(hooks, "Stop", paths.hook_launcher_path);
  delete hooks.aionis_managed;
  await fs.mkdir(path.dirname(paths.hooks_path), { recursive: true });
  await fs.writeFile(paths.hooks_path, `${JSON.stringify(hooks, null, 2)}\n`, "utf8");
  return { config, paths };
}

export async function restoreCodexProductShellHooks(
  codex_home?: string,
  deps: { fs?: CodexProductShellFs } = {},
): Promise<{ restored: boolean; paths: CodexProductShellPaths }> {
  const fs = deps.fs ?? { mkdir, readFile, rm, writeFile, stat };
  const resolved_home = resolveCodexHome(codex_home);
  const paths = resolveCodexProductShellPaths(resolved_home);
  if (!(await pathExists(fs, paths.hooks_backup_path))) {
    return {
      restored: false,
      paths,
    };
  }
  const backupRaw = await fs.readFile(paths.hooks_backup_path, "utf8");
  await fs.mkdir(path.dirname(paths.hooks_path), { recursive: true });
  await fs.writeFile(paths.hooks_path, backupRaw, "utf8");
  return {
    restored: true,
    paths,
  };
}

export async function removeCodexProductShell(
  codex_home?: string,
  deps: { fs?: CodexProductShellFs } = {},
): Promise<ProductShellRemoveResult> {
  const fs = deps.fs ?? { mkdir, readFile, rm, writeFile, stat };
  const resolved_home = resolveCodexHome(codex_home);
  const paths = resolveCodexProductShellPaths(resolved_home);
  await disableCodexProductShell(resolved_home, { fs });
  const removed_paths: string[] = [];
  if (await removeIfExists(fs, paths.hook_launcher_path)) removed_paths.push(paths.hook_launcher_path);
  if (await removeIfExists(fs, paths.shell_launcher_path)) removed_paths.push(paths.shell_launcher_path);
  if (await removeIfExists(fs, paths.user_launcher_path)) removed_paths.push(paths.user_launcher_path);
  if (await removeIfExists(fs, paths.config_path)) removed_paths.push(paths.config_path);
  return {
    removed: removed_paths.length > 0,
    paths,
    removed_paths,
  };
}

export async function startCodexProductShellRuntime(
  codex_home?: string,
  deps: { spawnLike?: SpawnLike; fs?: CodexProductShellFs } = {},
): Promise<ProductShellStartResult> {
  const config = await readCodexProductShellConfig(codex_home, { fs: deps.fs });
  if (!config) {
    throw new Error("codex product shell is not installed");
  }
  const runtime = await fetchRuntimeHealth(config.base_url);
  const port = portFromBaseUrl(config.base_url);
  if (runtime.healthy) {
    return {
      status: "already_running",
      port,
    };
  }
  const spawnLike = deps.spawnLike ?? spawn;
  const child = spawnLike(
    "npm",
    ["run", "start:lite"],
    {
      cwd: config.repo_root,
      env: {
        ...process.env,
        PORT: String(port),
      },
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref?.();
  return {
    status: "started",
    port,
    pid: child.pid ?? null,
    command: ["npm", "run", "start:lite"],
  };
}
