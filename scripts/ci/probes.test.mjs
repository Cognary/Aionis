import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;

function runNodeScript(scriptRelPath, env = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptRelPath], {
      cwd: ROOT,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => {
      stdout += String(buf);
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf);
    });
    child.on("close", (code) => {
      resolve({ code: Number(code ?? 1), stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
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
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
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

test("capability probe passes when all feature capabilities enabled", async () => {
  const mock = await createMockServer(async (req) => {
    if (req.path === "/health") {
      return {
        status: 200,
        body: {
          ok: true,
          memory_store_backend: "postgres",
          memory_store_feature_capabilities: {
            sessions_graph: true,
            packs_export: true,
            packs_import: true,
          },
          memory_store_write_capabilities: {
            shadow_mirror_v2: true,
          },
          memory_store_capability_contract: {
            sessions_graph: { failure_mode: "hard_fail", degraded_modes: ["feature_disabled"] },
            packs_export: { failure_mode: "hard_fail", degraded_modes: ["feature_disabled"] },
            packs_import: { failure_mode: "hard_fail", degraded_modes: ["feature_disabled"] },
            shadow_mirror_v2: { failure_mode: "soft_degrade", degraded_modes: ["capability_unsupported", "mirror_failed"] },
          },
        },
      };
    }
    if (req.path === "/v1/memory/sessions") {
      return { status: 200, body: { session_id: "s1" } };
    }
    if (req.path === "/v1/memory/packs/export") {
      return { status: 200, body: { manifest: { sha256: "abc123" } } };
    }
    if (req.path === "/v1/memory/packs/import") {
      return { status: 200, body: { verified: true, imported: false } };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/capability-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
      ADMIN_TOKEN: "test-admin-token",
      CAPABILITY_PROBE_INCLUDE_SHADOW_SOFT_DEGRADE: "false",
      CAPABILITY_PROBE_HEALTH_FILE: "/tmp/capability_probe_test_health_enabled.json",
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.feature_capabilities.sessions_graph, true);
    assert.equal(parsed.include_shadow_soft_degrade, false);
  } finally {
    await mock.close();
  }
});

test("capability probe accepts typed disabled-capability errors", async () => {
  const disabled = (capability) => ({
    error: "backend_capability_unsupported",
    message: `${capability} disabled`,
    details: {
      capability,
      failure_mode: "hard_fail",
      degraded_mode: "feature_disabled",
      fallback_applied: false,
    },
  });

  const mock = await createMockServer(async (req) => {
    if (req.path === "/health") {
      return {
        status: 200,
        body: {
          ok: true,
          memory_store_backend: "embedded",
          memory_store_feature_capabilities: {
            sessions_graph: false,
            packs_export: false,
            packs_import: false,
          },
          memory_store_write_capabilities: {
            shadow_mirror_v2: false,
          },
          memory_store_capability_contract: {
            sessions_graph: { failure_mode: "hard_fail", degraded_modes: ["feature_disabled"] },
            packs_export: { failure_mode: "hard_fail", degraded_modes: ["feature_disabled"] },
            packs_import: { failure_mode: "hard_fail", degraded_modes: ["feature_disabled"] },
            shadow_mirror_v2: { failure_mode: "soft_degrade", degraded_modes: ["capability_unsupported", "mirror_failed"] },
          },
        },
      };
    }
    if (req.path === "/v1/memory/sessions") {
      return { status: 501, body: disabled("sessions_graph") };
    }
    if (req.path === "/v1/memory/packs/export") {
      return { status: 501, body: disabled("packs_export") };
    }
    if (req.path === "/v1/memory/packs/import") {
      return { status: 501, body: disabled("packs_import") };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/capability-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
      ADMIN_TOKEN: "test-admin-token",
      CAPABILITY_PROBE_INCLUDE_SHADOW_SOFT_DEGRADE: "false",
      CAPABILITY_PROBE_HEALTH_FILE: "/tmp/capability_probe_test_health_disabled.json",
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.feature_capabilities.packs_export, false);
  } finally {
    await mock.close();
  }
});

test("policy-planner probe marks planning as skipped on no_embedding_provider", async () => {
  const mock = await createMockServer(async (req) => {
    if (req.path === "/v1/memory/rules/evaluate") {
      return {
        status: 200,
        body: {
          considered: 0,
          matched: 0,
          active: [],
          shadow: [],
          applied: {},
          agent_visibility_summary: {},
        },
      };
    }
    if (req.path === "/v1/memory/tools/select") {
      return {
        status: 200,
        body: {
          selection: {
            selected: "curl",
            ordered: ["curl", "psql", "bash"],
          },
          rules: {},
        },
      };
    }
    if (req.path === "/v1/memory/planning/context") {
      return {
        status: 400,
        body: {
          error: "no_embedding_provider",
          message: "Configure EMBEDDING_PROVIDER",
        },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/policy-planner-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.results.planning.skipped, true);
    assert.equal(parsed.results.planning.reason, "no_embedding_provider");
  } finally {
    await mock.close();
  }
});

test("policy-planner probe fails when planning/tools selected mismatch", async () => {
  const mock = await createMockServer(async (req) => {
    if (req.path === "/v1/memory/rules/evaluate") {
      return {
        status: 200,
        body: {
          considered: 2,
          matched: 1,
          active: [],
          shadow: [],
          applied: {},
          agent_visibility_summary: {},
        },
      };
    }
    if (req.path === "/v1/memory/tools/select") {
      return {
        status: 200,
        body: {
          selection: { selected: "curl", ordered: ["curl", "psql", "bash"] },
          rules: {},
        },
      };
    }
    if (req.path === "/v1/memory/planning/context") {
      return {
        status: 200,
        body: {
          query: { embedding_provider: "fake" },
          recall: { subgraph: { nodes: [] } },
          rules: { considered: 2, matched: 1 },
          tools: { selection: { selected: "psql" } },
        },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/policy-planner-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
    });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /planning\.tools\.selection\.selected must match tools\/select/);
  } finally {
    await mock.close();
  }
});
