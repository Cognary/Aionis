import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthHeaders, envString, parseTriState } from "./probe-common.mjs";

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

test("parseTriState normalizes true/false/auto", () => {
  assert.equal(parseTriState("true"), "true");
  assert.equal(parseTriState(" TRUE "), "true");
  assert.equal(parseTriState("false"), "false");
  assert.equal(parseTriState(" FALSE "), "false");
  assert.equal(parseTriState("auto"), "auto");
  assert.equal(parseTriState(""), "auto");
  assert.equal(parseTriState("unknown"), "auto");
});

test("envString trims and supports fallback", () => {
  withEnv({ PROBE_COMMON_ENV_TEST: "  hello  " }, () => {
    assert.equal(envString("PROBE_COMMON_ENV_TEST"), "hello");
  });
  withEnv({ PROBE_COMMON_ENV_TEST: undefined }, () => {
    assert.equal(envString("PROBE_COMMON_ENV_TEST", "fallback"), "fallback");
  });
});

test("buildAuthHeaders includes api key + bearer from primary vars", () => {
  withEnv(
    {
      API_KEY: "api-primary",
      PERF_API_KEY: "api-fallback",
      AUTH_BEARER: "bearer-primary",
      PERF_AUTH_BEARER: "bearer-fallback",
      ADMIN_TOKEN: "admin-token",
    },
    () => {
      const headers = buildAuthHeaders({ includeAdmin: true });
      assert.equal(headers["content-type"], "application/json");
      assert.equal(headers["x-api-key"], "api-primary");
      assert.equal(headers.authorization, "Bearer bearer-primary");
      assert.equal(headers["x-admin-token"], "admin-token");
    },
  );
});

test("buildAuthHeaders falls back to PERF_* vars", () => {
  withEnv(
    {
      API_KEY: undefined,
      PERF_API_KEY: "api-fallback",
      AUTH_BEARER: undefined,
      PERF_AUTH_BEARER: "bearer-fallback",
      ADMIN_TOKEN: undefined,
    },
    () => {
      const headers = buildAuthHeaders({ includeAdmin: true });
      assert.equal(headers["content-type"], "application/json");
      assert.equal(headers["x-api-key"], "api-fallback");
      assert.equal(headers.authorization, "Bearer bearer-fallback");
      assert.equal(headers["x-admin-token"], undefined);
    },
  );
});

test("buildAuthHeaders requireAdmin=true throws when ADMIN_TOKEN missing", () => {
  withEnv(
    {
      ADMIN_TOKEN: undefined,
      API_KEY: undefined,
      PERF_API_KEY: undefined,
      AUTH_BEARER: undefined,
      PERF_AUTH_BEARER: undefined,
    },
    () => {
      assert.throws(
        () => buildAuthHeaders({ includeAdmin: true, requireAdmin: true }),
        /ADMIN_TOKEN is required/,
      );
    },
  );
});
