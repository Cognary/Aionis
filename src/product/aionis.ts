import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  doctorCodexProductShell,
  disableCodexProductShell,
  enableCodexProductShell,
  removeCodexProductShell,
  restoreCodexProductShellHooks,
  startCodexProductShellRuntime,
  writeCodexProductShellInstall,
} from "./codex-product-shell.js";

function parseFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const direct = args.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function launchCodex(codexHome?: string): Promise<void> {
  await startCodexProductShellRuntime(codexHome);
  const child = spawn("codex", [], {
    stdio: "inherit",
    env: process.env,
  });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      process.exitCode = code ?? 0;
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const codex_home = parseFlag(args, "codex-home");
  const base_url = parseFlag(args, "base-url");
  const scope = parseFlag(args, "scope");
  const [command = "launch", subcommand] = args.filter((arg, index, list) => {
    if (arg.startsWith("--")) return false;
    if (index > 0 && list[index - 1]?.startsWith("--")) return false;
    return true;
  });

  if (command === "launch") {
    await launchCodex(codex_home);
    return;
  }

  if (command !== "codex") {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: "unsupported_command",
      supported: ["launch", "codex"],
    }, null, 2) + "\n");
    process.exitCode = 1;
    return;
  }

  switch (subcommand ?? "status") {
    case "setup": {
      const result = await writeCodexProductShellInstall({
        repo_root: repoRootFromHere(),
        codex_home,
        base_url,
        scope,
      });
      process.stdout.write(JSON.stringify({ ok: true, command: "codex setup", result }, null, 2) + "\n");
      return;
    }
    case "doctor": {
      const result = await doctorCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "codex doctor", result }, null, 2) + "\n");
      return;
    }
    case "status": {
      const result = await doctorCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "codex status", result }, null, 2) + "\n");
      return;
    }
    case "enable": {
      const result = await enableCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "codex enable", result }, null, 2) + "\n");
      return;
    }
    case "disable": {
      const result = await disableCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "codex disable", result }, null, 2) + "\n");
      return;
    }
    case "restore": {
      const result = await restoreCodexProductShellHooks(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "codex restore", result }, null, 2) + "\n");
      return;
    }
    case "remove": {
      const result = await removeCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "codex remove", result }, null, 2) + "\n");
      return;
    }
    case "start": {
      const result = await startCodexProductShellRuntime(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "codex start", result }, null, 2) + "\n");
      return;
    }
    case "launch": {
      await launchCodex(codex_home);
      return;
    }
    default:
      process.stdout.write(JSON.stringify({
        ok: false,
        error: "unsupported_codex_subcommand",
        supported: ["setup", "doctor", "status", "enable", "disable", "restore", "remove", "start", "launch"],
      }, null, 2) + "\n");
      process.exitCode = 1;
  }
}

await main();
