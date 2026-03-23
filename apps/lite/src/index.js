import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(appDir, "..", "..", "..");
const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const entrypoint = "src/index-sdk-demo.ts";

const child = spawn(process.execPath, [tsxCli, entrypoint, ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

const exit = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolve({ code, signal }));
});

if (exit.signal) {
  process.kill(process.pid, exit.signal);
}

process.exit(exit.code ?? 0);
