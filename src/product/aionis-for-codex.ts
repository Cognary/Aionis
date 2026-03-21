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

async function main(): Promise<void> {
  const [subcommand = "doctor", ...rest] = process.argv.slice(2);
  const codex_home = parseFlag(rest, "codex-home");
  const base_url = parseFlag(rest, "base-url");
  const scope = parseFlag(rest, "scope");

  switch (subcommand) {
    case "setup": {
      const result = await writeCodexProductShellInstall({
        repo_root: repoRootFromHere(),
        codex_home,
        base_url,
        scope,
      });
      process.stdout.write(JSON.stringify({ ok: true, command: "setup", result }, null, 2) + "\n");
      return;
    }
    case "doctor": {
      const result = await doctorCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "doctor", result }, null, 2) + "\n");
      return;
    }
    case "status": {
      const result = await doctorCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "status", result }, null, 2) + "\n");
      return;
    }
    case "enable": {
      const result = await enableCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "enable", result }, null, 2) + "\n");
      return;
    }
    case "disable": {
      const result = await disableCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "disable", result }, null, 2) + "\n");
      return;
    }
    case "restore": {
      const result = await restoreCodexProductShellHooks(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "restore", result }, null, 2) + "\n");
      return;
    }
    case "remove": {
      const result = await removeCodexProductShell(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "remove", result }, null, 2) + "\n");
      return;
    }
    case "start": {
      const result = await startCodexProductShellRuntime(codex_home);
      process.stdout.write(JSON.stringify({ ok: true, command: "start", result }, null, 2) + "\n");
      return;
    }
    default:
      process.stdout.write(JSON.stringify({
        ok: false,
        error: "unsupported_subcommand",
        supported: ["setup", "doctor", "status", "enable", "disable", "restore", "remove", "start"],
      }, null, 2) + "\n");
      process.exitCode = 1;
  }
}

await main();
