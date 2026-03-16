import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function runSnippet(source) {
  return execFileSync("npx", ["tsx", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}

test("prod trust proxy fails closed without trusted proxy cidrs", () => {
  const out = runSnippet(`
    import { loadEnv } from "./src/config.ts";

    process.env.AIONIS_EDITION = "lite";
    process.env.APP_ENV = "prod";
    process.env.MEMORY_AUTH_MODE = "jwt";
    process.env.MEMORY_JWT_HS256_SECRET = "test-secret";
    process.env.TRUST_PROXY = "true";
    process.env.TRUSTED_PROXY_CIDRS = "";

    try {
      loadEnv();
      process.stdout.write("ok");
    } catch (err) {
      process.stdout.write(String(err instanceof Error ? err.message : err));
    }
  `);

  assert.match(out, /TRUST_PROXY=true requires TRUSTED_PROXY_CIDRS in APP_ENV=prod/);
});

test("forwarded client ip is ignored when direct peer is outside trusted proxy cidrs", () => {
  const out = runSnippet(`
    import { resolveTrustedClientIp } from "./src/util/ip-guard.ts";

    process.stdout.write(resolveTrustedClientIp({
      remoteAddress: "203.0.113.10",
      headers: {
        "x-forwarded-for": "198.51.100.7, 10.0.0.5",
        "x-real-ip": "198.51.100.7",
      },
      trustedProxyCidrs: ["10.0.0.0/8"],
    }));
  `);

  assert.equal(out, "203.0.113.10");
});
