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

function runLoadEnvSandboxCommands(raw) {
  const out = execFileSync(
    "npx",
    [
      "tsx",
      "-e",
      'import { loadEnv } from "./src/config.ts"; process.stdout.write(loadEnv().SANDBOX_ALLOWED_COMMANDS_JSON);',
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        APP_ENV: "dev",
        MEMORY_AUTH_MODE: "off",
        DATABASE_URL: "postgres://aionis:aionis@localhost:5432/aionis_memory",
        SANDBOX_ALLOWED_COMMANDS_JSON: raw,
      },
    },
  ).trim();
  return JSON.parse(out);
}

test("loadEnv normalizes shell-quoted SANDBOX_ALLOWED_COMMANDS_JSON", () => {
  const parsed = runLoadEnvSandboxCommands("'[\"echo\",\"python3\"]'");
  assert.deepEqual(parsed, ["echo", "python3"]);
});

test("loadEnv accepts shell-expanded list SANDBOX_ALLOWED_COMMANDS_JSON=[echo,python3]", () => {
  const parsed = runLoadEnvSandboxCommands("[echo,python3]");
  assert.deepEqual(parsed, ["echo", "python3"]);
});
