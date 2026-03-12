import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SCRIPT = path.join(ROOT, "scripts", "start-lite.sh");

test("lite startup packaging script exposes stable Lite defaults", () => {
  const raw = execFileSync("bash", [SCRIPT, "--print-env"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const env = JSON.parse(raw);
  assert.equal(env.AIONIS_EDITION, "lite");
  assert.equal(env.AIONIS_MODE, "local");
  assert.equal(env.MEMORY_AUTH_MODE, "off");
  assert.equal(env.TENANT_QUOTA_ENABLED, "false");
  assert.equal(env.RATE_LIMIT_BYPASS_LOOPBACK, "true");
  assert.equal(env.LITE_REPLAY_SQLITE_PATH, ".tmp/aionis-lite-replay.sqlite");
  assert.equal(env.LITE_WRITE_SQLITE_PATH, ".tmp/aionis-lite-write.sqlite");
});
