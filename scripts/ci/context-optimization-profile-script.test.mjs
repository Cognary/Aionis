import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function withTempRepo(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-context-opt-script-"));
  try {
    await cp(path.join(ROOT, "scripts"), path.join(dir, "scripts"), { recursive: true });
    await cp(path.join(ROOT, ".env.example"), path.join(dir, ".env.example"));
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runScript(cwd, profile) {
  return execFileSync("bash", ["scripts/env/apply-context-optimization-profile.sh", profile], {
    cwd,
    encoding: "utf8",
  });
}

test("context optimization env helper writes aggressive endpoint defaults block", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "aggressive_endpoint_defaults");
    const envText = await readFile(path.join(dir, ".env"), "utf8");
    assert.match(envText, /AIONIS CONTEXT OPTIMIZATION PROFILE \(managed\)/);
    assert.match(envText, /MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT=aggressive/);
    assert.match(envText, /MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT=aggressive/);
  });
});

test("context optimization env helper can roll back to off", async () => {
  await withTempRepo(async (dir) => {
    runScript(dir, "aggressive_endpoint_defaults");
    runScript(dir, "off");
    const envText = await readFile(path.join(dir, ".env"), "utf8");
    assert.match(envText, /MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT=off/);
    assert.match(envText, /MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT=off/);
    assert.doesNotMatch(envText, /MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT=aggressive/);
  });
});
