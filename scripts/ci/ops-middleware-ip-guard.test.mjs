import assert from "node:assert/strict";
import test from "node:test";

import { ipAllowed, resolveClientIp, validateProxyConfig } from "../../apps/ops/app/lib/ip-guard.mjs";

function withEnv(overrides, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined || v === null) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function mockRequest({ ip = "", headers = {} } = {}) {
  return {
    ip,
    headers: new Headers(headers),
  };
}

test("resolveClientIp ignores XFF/X-Real-IP from untrusted remote peer", () => {
  const ip = resolveClientIp(
    mockRequest({
      ip: "203.0.113.9",
      headers: {
        "x-forwarded-for": "198.51.100.7",
        "x-real-ip": "198.51.100.8",
      },
    }),
    ["10.0.0.0/8"],
  );
  assert.equal(ip, "203.0.113.9");
});

test("resolveClientIp trusts XFF only when remote peer is trusted proxy", () => {
  const ip = resolveClientIp(
    mockRequest({
      ip: "10.12.0.5",
      headers: {
        "x-forwarded-for": "198.51.100.7, 10.12.0.5",
      },
    }),
    ["10.0.0.0/8"],
  );
  assert.equal(ip, "198.51.100.7");
});

test("validateProxyConfig enforces fail-closed in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      OPS_IP_ALLOWLIST: "127.0.0.1",
      OPS_TRUSTED_PROXY_CIDRS: "",
    },
    () => {
      const err = validateProxyConfig();
      assert.match(String(err), /requires OPS_TRUSTED_PROXY_CIDRS/);
    },
  );
});

test("allowlist check cannot be bypassed via spoofed XFF from untrusted peer", () => {
  const clientIp = resolveClientIp(
    mockRequest({
      ip: "203.0.113.9",
      headers: { "x-forwarded-for": "198.51.100.7" },
    }),
    ["10.0.0.0/8"],
  );
  assert.equal(clientIp, "203.0.113.9");
  assert.equal(ipAllowed(clientIp, ["198.51.100.7"]), false);
});
