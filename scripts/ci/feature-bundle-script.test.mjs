import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function withTempRepo(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-feature-bundle-script-"));
  try {
    await cp(path.join(ROOT, "scripts"), path.join(dir, "scripts"), { recursive: true });
    await cp(path.join(ROOT, ".env.example"), path.join(dir, ".env.example"));
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runScript(cwd, ...args) {
  return execFileSync("bash", ["scripts/env/apply-feature-bundle.sh", ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("feature bundle helper lists available bundles", async () => {
  await withTempRepo(async (dir) => {
    const out = runScript(dir, "list");
    assert.match(out, /^experimental$/m);
    assert.match(out, /^high_risk$/m);
    assert.match(out, /^local_safe$/m);
    assert.match(out, /^team_shared$/m);
  });
});

test("feature bundle helper reports no managed block before apply", async () => {
  await withTempRepo(async (dir) => {
    const out = runScript(dir, "status");
    assert.match(out, /status: no \.env file/);
  });
});

test("feature bundle helper writes experimental managed block", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "experimental");
    const envText = await readFile(path.join(dir, ".env"), "utf8");
    assert.match(envText, /AIONIS FEATURE BUNDLE \(managed\)/);
    assert.match(envText, /MEMORY_RECALL_CLASS_AWARE_ENABLED=true/);
    assert.match(envText, /MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT=balanced/);
  });
});

test("feature bundle helper replaces previous bundle block", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "high_risk");
    runScript(dir, "local_safe");
    const envText = await readFile(path.join(dir, ".env"), "utf8");
    assert.match(envText, /SANDBOX_ENABLED=false/);
    assert.match(envText, /REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT=false/);
    assert.doesNotMatch(envText, /OPS_DANGEROUS_ACTIONS_ENABLED=true/);
  });
});

test("feature bundle helper reports active bundle after apply", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "team_shared");
    const out = runScript(dir, "status");
    assert.match(out, /status: managed bundle block present/);
    assert.match(out, /bundle: team_shared/);
  });
});

test("feature bundle helper supports status --verbose", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "team_shared");
    const out = runScript(dir, "status", "--verbose");
    assert.match(out, /status: managed bundle block present/);
    assert.match(out, /bundle: team_shared/);
    assert.match(out, /managed keys:/);
    assert.match(out, /MEMORY_AUTH_MODE/);
    assert.match(out, /CORS_ALLOW_ORIGINS/);
    assert.match(out, /OPS_BASIC_AUTH_ENABLED/);
  });
});

test("feature bundle helper diff shows added keys when no managed block exists", async () => {
  await withTempRepo(async (dir) => {
    const out = runScript(dir, "diff", "experimental");
    assert.match(out, /bundle: experimental/);
    assert.match(out, /current managed bundle block: absent/);
    assert.match(out, /added:/);
    assert.match(out, /MEMORY_RECALL_CLASS_AWARE_ENABLED=true/);
    assert.match(out, /changed:\n  \(none\)/);
    assert.match(out, /removed:\n  \(none\)/);
  });
});

test("feature bundle helper diff shows changed and removed keys", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "local_safe");
    const out = runScript(dir, "diff", "team_shared");
    assert.match(out, /bundle: team_shared/);
    assert.match(out, /current managed bundle block: present/);
    assert.match(out, /changed:/);
    assert.match(out, /MEMORY_AUTH_MODE/);
    assert.match(out, /current: off/);
    assert.match(out, /target:  api_key/);
    assert.match(out, /removed:/);
    assert.match(out, /MEMORY_SHADOW_DUAL_WRITE_STRICT=false/);
  });
});

test("feature bundle helper supports apply --dry-run without creating .env", async () => {
  await withTempRepo(async (dir) => {
    const out = runScript(dir, "--dry-run", "experimental");
    assert.match(out, /mode: dry-run/);
    assert.match(out, /bundle: experimental/);
    assert.match(out, /would create \.env from \.env\.example: yes/);
    assert.match(out, /managed block preview:/);
    assert.match(out, /# bundle=experimental/);
    assert.match(out, /MEMORY_RECALL_CLASS_AWARE_ENABLED=true/);
    await assert.rejects(access(path.join(dir, ".env")));
  });
});

test("feature bundle helper dry-run leaves existing .env unchanged", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "local_safe");
    const before = await readFile(path.join(dir, ".env"), "utf8");
    const out = runScript(dir, "team_shared", "--dry-run");
    const after = await readFile(path.join(dir, ".env"), "utf8");
    assert.match(out, /mode: dry-run/);
    assert.match(out, /bundle: team_shared/);
    assert.match(out, /would create \.env from \.env\.example: no/);
    assert.match(out, /# bundle=team_shared/);
    assert.equal(after, before);
  });
});

test("feature bundle helper plan combines status diff and preview", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "local_safe");
    const out = runScript(dir, "plan", "team_shared");
    assert.match(out, /== Current status ==/);
    assert.match(out, /status: managed bundle block present/);
    assert.match(out, /bundle: local_safe/);
    assert.match(out, /== Diff to target bundle ==/);
    assert.match(out, /bundle: team_shared/);
    assert.match(out, /changed:/);
    assert.match(out, /MEMORY_AUTH_MODE/);
    assert.match(out, /== Managed block preview ==/);
    assert.match(out, /mode: dry-run/);
    assert.match(out, /# bundle=team_shared/);
  });
});

test("feature bundle helper apply --backup writes a backup of the previous .env", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "local_safe");
    const before = await readFile(path.join(dir, ".env"), "utf8");
    const out = runScript(dir, "--backup", "team_shared");
    const after = await readFile(path.join(dir, ".env"), "utf8");
    const files = await readdir(dir);
    const backupFiles = files.filter((name) => name.startsWith(".env.bundle-backup."));
    assert.match(out, /applied feature bundle: team_shared/);
    assert.match(out, /backup: .*\.env\.bundle-backup\./);
    assert.equal(backupFiles.length, 1);
    const backupText = await readFile(path.join(dir, backupFiles[0]), "utf8");
    assert.equal(backupText, before);
    assert.notEqual(after, before);
    assert.match(after, /# bundle=team_shared/);
  });
});

test("feature bundle helper apply --backup skips backup when .env does not exist yet", async () => {
  await withTempRepo(async (dir) => {
    const out = runScript(dir, "--backup", "experimental");
    const files = await readdir(dir);
    const backupFiles = files.filter((name) => name.startsWith(".env.bundle-backup."));
    const envText = await readFile(path.join(dir, ".env"), "utf8");
    assert.match(out, /backup: skipped \(no existing \.env\)/);
    assert.equal(backupFiles.length, 0);
    assert.match(envText, /# bundle=experimental/);
  });
});
