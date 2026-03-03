import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test(".env.example keeps SANDBOX_ALLOWED_COMMANDS_JSON valid when sourced by shell", () => {
  const out = execFileSync(
    "bash",
    ["-lc", 'set -a; source .env.example; set +a; printf "%s" "$SANDBOX_ALLOWED_COMMANDS_JSON"'],
    { encoding: "utf8" },
  ).trim();

  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(out);
  }, "SANDBOX_ALLOWED_COMMANDS_JSON must remain valid JSON after shell source");

  assert.ok(Array.isArray(parsed), "SANDBOX_ALLOWED_COMMANDS_JSON should parse to an array");
  assert.ok(parsed.length > 0, "SANDBOX_ALLOWED_COMMANDS_JSON should include at least one command in example env");
  assert.equal(parsed[0], "echo");
});
