import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { buildAuthHeaders, envString, getJson, parseTriState, postJson } from "./probe-common.mjs";

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

function createMockServer(handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString("utf8");
        let body = null;
        if (raw.trim().length > 0) {
          body = JSON.parse(raw);
        }
        const out = await handler({
          method: req.method || "GET",
          path: req.url || "/",
          headers: req.headers || {},
          body,
        });
        const status = Number(out?.status ?? 200);
        const payload = out?.body ?? {};
        const contentType = out?.contentType ?? "application/json";
        res.writeHead(status, { "content-type": contentType });
        if (contentType === "application/json") {
          res.end(JSON.stringify(payload));
        } else {
          res.end(String(out?.rawBody ?? ""));
        }
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "mock_server_error", message: String(err?.message || err) }));
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to bind mock server"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
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

test("getJson returns status + parsed JSON body", async () => {
  const mock = await createMockServer(async (req) => {
    if (req.path === "/health") {
      return {
        status: 200,
        body: { ok: true, source: "mock" },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });
  try {
    const out = await getJson(mock.baseUrl, "/health", {}, "probe-common-test");
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { ok: true, source: "mock" });
  } finally {
    await mock.close();
  }
});

test("postJson returns status + parsed JSON body", async () => {
  const mock = await createMockServer(async (req) => {
    if (req.path === "/echo" && req.method === "POST") {
      return {
        status: 201,
        body: { ok: true, seen: req.body ?? null },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });
  try {
    const payload = { x: 1, y: "z" };
    const out = await postJson(mock.baseUrl, "/echo", payload, {}, "probe-common-test");
    assert.equal(out.status, 201);
    assert.deepEqual(out.body, { ok: true, seen: payload });
  } finally {
    await mock.close();
  }
});

test("getJson throws labeled error when response is not JSON", async () => {
  const mock = await createMockServer(async (req) => {
    if (req.path === "/plain") {
      return {
        status: 200,
        contentType: "text/plain",
        rawBody: "plain-text",
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });
  try {
    await assert.rejects(
      () => getJson(mock.baseUrl, "/plain", {}, "probe-common-test"),
      /probe-common-test: \/plain must return JSON/,
    );
  } finally {
    await mock.close();
  }
});

test("postJson throws labeled error when response is not JSON", async () => {
  const mock = await createMockServer(async (req) => {
    if (req.path === "/plain" && req.method === "POST") {
      return {
        status: 200,
        contentType: "text/plain",
        rawBody: "plain-text",
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });
  try {
    await assert.rejects(
      () => postJson(mock.baseUrl, "/plain", { x: 1 }, {}, "probe-common-test"),
      /probe-common-test: \/plain must return JSON/,
    );
  } finally {
    await mock.close();
  }
});
