import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function makeArtifactDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-sdk-cli-artifacts-"));
  mkdirSync(path.join(dir, "nested"), { recursive: true });
  writeFileSync(path.join(dir, "summary.json"), '{"ok":true}\n', "utf8");
  writeFileSync(path.join(dir, "nested", "notes.txt"), "artifact-note\n", "utf8");
  return dir;
}

function runCli(args) {
  return spawnSync(process.execPath, ["--import", "tsx", "packages/sdk/src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("sdk cli artifacts list emits stable json envelope", () => {
  const dir = makeArtifactDir();
  try {
    const result = runCli(["artifacts", "list", "--artifact-dir", dir, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis artifacts list");
    assert.equal(parsed.data.artifact_dir, dir);
    assert.equal(parsed.data.files.some((entry) => entry.name === "summary.json"), true);
    assert.equal(parsed.data.files.some((entry) => entry.name === "nested/notes.txt"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sdk cli artifacts show returns file content", () => {
  const dir = makeArtifactDir();
  try {
    const result = runCli(["artifacts", "show", "--artifact-dir", dir, "--name", "nested/notes.txt", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis artifacts show");
    assert.equal(parsed.data.name, "nested/notes.txt");
    assert.equal(parsed.data.encoding, "utf8");
    assert.equal(parsed.data.content, "artifact-note\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sdk cli artifacts export copies artifact directory", () => {
  const dir = makeArtifactDir();
  const out = path.join(os.tmpdir(), `aionis-sdk-cli-export-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    const result = runCli(["artifacts", "export", "--artifact-dir", dir, "--out", out, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis artifacts export");
    assert.equal(parsed.data.out, out);
    assert.equal(existsSync(path.join(out, "summary.json")), true);
    assert.equal(readFileSync(path.join(out, "nested", "notes.txt"), "utf8"), "artifact-note\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("sdk cli artifacts pack creates tarball", () => {
  const dir = makeArtifactDir();
  const out = path.join(os.tmpdir(), `aionis-sdk-cli-pack-${Date.now()}-${Math.random().toString(16).slice(2)}.tgz`);
  try {
    const result = runCli(["artifacts", "pack", "--artifact-dir", dir, "--out", out, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis artifacts pack");
    assert.equal(parsed.data.out, out);
    assert.equal(existsSync(out), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { force: true });
  }
});
