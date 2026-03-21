import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";

function runCli(args: string[], codexHome: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/product/aionis.ts", ...args, "--codex-home", codexHome], {
      cwd: "/Volumes/ziel/Aionisgo",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if ((code ?? 0) !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8")));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

test("aionis product cli manages Codex product shell through the codex namespace", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-product-cli-"));

  const setup = JSON.parse(await runCli(["codex", "setup"], codexHome));
  assert.equal(setup.ok, true);
  assert.equal(setup.command, "codex setup");
  assert.equal(setup.result.install_state, "created");

  const status = JSON.parse(await runCli(["codex", "status"], codexHome));
  assert.equal(status.ok, true);
  assert.equal(status.command, "codex status");
  assert.equal(status.result.status.user_launcher_exists, true);

  const remove = JSON.parse(await runCli(["codex", "remove"], codexHome));
  assert.equal(remove.ok, true);
  assert.equal(remove.command, "codex remove");
  assert.equal(remove.result.removed, true);
});
