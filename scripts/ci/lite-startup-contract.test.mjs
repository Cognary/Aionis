import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("root start:lite delegates to apps/lite", () => {
  const rootPkg = readJson(path.join(ROOT, "package.json"));
  assert.equal(rootPkg.scripts["start:lite"], "npm --prefix apps/lite run start --");
});

test("apps/lite owns the startup script", () => {
  const litePkg = readJson(path.join(ROOT, "apps", "lite", "package.json"));
  assert.equal(litePkg.scripts.start, "bash ./scripts/start-lite-app.sh");
  assert.equal(litePkg.scripts["start:print-env"], "bash ./scripts/start-lite-app.sh --print-env");
  const startScript = fs.readFileSync(path.join(ROOT, "apps", "lite", "scripts", "start-lite-app.sh"), "utf8");
  assert.match(startScript, /LITE_LOCAL_ACTOR_ID/);
  assert.match(startScript, /SANDBOX_ENABLED/);
  assert.match(startScript, /SANDBOX_ADMIN_ONLY/);
});

test(".env.example exposes the Lite local actor and sandbox knobs", () => {
  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(envExample, /^LITE_LOCAL_ACTOR_ID=local-user$/m);
  assert.match(envExample, /^SANDBOX_ENABLED=true$/m);
  assert.match(envExample, /^SANDBOX_ADMIN_ONLY=false$/m);
});

test("runtime manifest points at the Lite app startup command", () => {
  const manifest = readJson(path.join(ROOT, "runtime-manifest.json"));
  assert.equal(manifest.start_command.command, "bash");
  assert.deepEqual(manifest.start_command.args, ["apps/lite/scripts/start-lite-app.sh"]);
  assert.equal(manifest.dist_entry, "apps/lite/src/index.js");
});

test("apps/lite wrapper launches the source runtime through tsx", () => {
  const entry = fs.readFileSync(path.join(ROOT, "apps", "lite", "src", "index.js"), "utf8");
  const startScript = fs.readFileSync(path.join(ROOT, "apps", "lite", "scripts", "start-lite-app.sh"), "utf8");
  assert.match(entry, /tsx/);
  assert.match(entry, /src\/index\.ts/);
  assert.equal(entry.includes("../../../dist/runtime-entry.js"), false);
  assert.equal(startScript.includes("dist/index.js"), false);
});
