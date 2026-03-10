import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePlaygroundBaseUrl,
  parseAllowedBaseUrlsEnv,
  resolvePlaygroundBaseUrl,
} from "../../apps/playground/app/lib/egress-guard.mjs";

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

test("normalizePlaygroundBaseUrl trims trailing slash and rejects non-http schemes", () => {
  assert.equal(normalizePlaygroundBaseUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1");
  assert.throws(() => normalizePlaygroundBaseUrl("file:///tmp/foo"), /must use http or https/);
});

test("normalizePlaygroundBaseUrl rejects query, fragment, and embedded credentials", () => {
  assert.throws(() => normalizePlaygroundBaseUrl("https://api.openai.com/v1?x=1"), /must not include query or fragment/);
  assert.throws(() => normalizePlaygroundBaseUrl("https://user:pass@example.com/v1"), /must not include username\/password/);
  assert.throws(() => normalizePlaygroundBaseUrl("https://api.openai.com/v1#frag"), /must not include query or fragment/);
});

test("parseAllowedBaseUrlsEnv supports comma-separated and JSON-array formats", () => {
  assert.deepEqual(
    parseAllowedBaseUrlsEnv("https://api.example.com/v1, https://api.openai.com/v1/"),
    ["https://api.example.com/v1", "https://api.openai.com/v1"],
  );
  assert.deepEqual(
    parseAllowedBaseUrlsEnv('["https://one.example/v1", "https://two.example/v1/"]'),
    ["https://one.example/v1", "https://two.example/v1"],
  );
});

test("resolvePlaygroundBaseUrl allows exact production default and explicit allowlist entries", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(
      resolvePlaygroundBaseUrl("https://api.openai.com/v1/", {
        defaultBaseUrl: "https://api.openai.com/v1",
        allowedBaseUrlsEnv: "",
        allowedBaseUrlsEnvName: "PLAYGROUND_CHAT_ALLOWED_BASE_URLS",
        label: "config.base_url",
      }),
      "https://api.openai.com/v1",
    );

    assert.equal(
      resolvePlaygroundBaseUrl("https://gateway.example.internal/v1", {
        defaultBaseUrl: "https://api.openai.com/v1",
        allowedBaseUrlsEnv: "https://gateway.example.internal/v1",
        allowedBaseUrlsEnvName: "PLAYGROUND_CHAT_ALLOWED_BASE_URLS",
        label: "config.base_url",
      }),
      "https://gateway.example.internal/v1",
    );
  });
});

test("resolvePlaygroundBaseUrl rejects non-allowlisted production targets", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    assert.throws(
      () =>
        resolvePlaygroundBaseUrl("https://evil.example/v1", {
          defaultBaseUrl: "https://api.openai.com/v1",
          allowedBaseUrlsEnv: "https://gateway.example.internal/v1",
          allowedBaseUrlsEnvName: "PLAYGROUND_CHAT_ALLOWED_BASE_URLS",
          label: "config.base_url",
        }),
      /PLAYGROUND_CHAT_ALLOWED_BASE_URLS/,
    );
  });
});

test("resolvePlaygroundBaseUrl allows loopback overrides only outside production", () => {
  withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(
      resolvePlaygroundBaseUrl("http://localhost:11434/v1", {
        defaultBaseUrl: "http://127.0.0.1:3001",
        allowedBaseUrlsEnv: "",
        allowedBaseUrlsEnvName: "PLAYGROUND_EXECUTE_ALLOWED_BASE_URLS",
        label: "connection.base_url",
      }),
      "http://localhost:11434/v1",
    );
  });

  withEnv({ NODE_ENV: "production" }, () => {
    assert.throws(
      () =>
        resolvePlaygroundBaseUrl("http://localhost:11434/v1", {
          defaultBaseUrl: "http://127.0.0.1:3001",
          allowedBaseUrlsEnv: "",
          allowedBaseUrlsEnvName: "PLAYGROUND_EXECUTE_ALLOWED_BASE_URLS",
          label: "connection.base_url",
        }),
      /PLAYGROUND_EXECUTE_ALLOWED_BASE_URLS/,
    );
  });
});
