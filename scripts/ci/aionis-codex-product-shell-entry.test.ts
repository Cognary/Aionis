import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";

test("aionis-for-codex entrypoint supports setup, status, disable, enable, restore, and remove", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));

  const setup = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/product/aionis-for-codex.ts", "setup", "--codex-home", codexHome], {
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
  const setupParsed = JSON.parse(setup);
  assert.equal(setupParsed.ok, true);
  assert.equal(setupParsed.command, "setup");
  assert.equal(setupParsed.result.install_state, "created");

  const doctor = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/product/aionis-for-codex.ts", "doctor", "--codex-home", codexHome], {
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
  const doctorParsed = JSON.parse(doctor);
  assert.equal(doctorParsed.ok, true);
  assert.equal(doctorParsed.command, "doctor");
  assert.equal(doctorParsed.result.status.config_exists, true);

  const status = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/product/aionis-for-codex.ts", "status", "--codex-home", codexHome], {
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
  const statusParsed = JSON.parse(status);
  assert.equal(statusParsed.ok, true);
  assert.equal(statusParsed.command, "status");
  assert.equal(statusParsed.result.status.hooks_enabled, true);

  const disable = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/product/aionis-for-codex.ts", "disable", "--codex-home", codexHome], {
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
  const disableParsed = JSON.parse(disable);
  assert.equal(disableParsed.ok, true);
  assert.equal(disableParsed.command, "disable");

  const enable = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/product/aionis-for-codex.ts", "enable", "--codex-home", codexHome], {
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
  const enableParsed = JSON.parse(enable);
  assert.equal(enableParsed.ok, true);
  assert.equal(enableParsed.command, "enable");

  const restore = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/product/aionis-for-codex.ts", "restore", "--codex-home", codexHome], {
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
  const restoreParsed = JSON.parse(restore);
  assert.equal(restoreParsed.ok, true);
  assert.equal(restoreParsed.command, "restore");

  const remove = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/product/aionis-for-codex.ts", "remove", "--codex-home", codexHome], {
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
  const removeParsed = JSON.parse(remove);
  assert.equal(removeParsed.ok, true);
  assert.equal(removeParsed.command, "remove");
  assert.equal(removeParsed.result.removed, true);
});
