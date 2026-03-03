import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;

function buildUri(req, type, id) {
  const tenantId = String(req?.body?.tenant_id ?? "default");
  const scope = String(req?.body?.scope ?? "default");
  return `aionis://${encodeURIComponent(tenantId)}/${encodeURIComponent(scope)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}

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

test("capability probe auto-runs shadow soft-degrade probe on embedded without mirror capability", async () => {
  let shadowProbeCalls = 0;
  const mock = await createMockServer(async (req) => {
    if (req.path === "/health") {
      return {
        status: 200,
        body: {
          ok: true,
          memory_store_backend: "embedded",
          memory_store_feature_capabilities: {
            sessions_graph: true,
            packs_export: true,
            packs_import: true,
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
      return { status: 200, body: { session_id: "s-shadow-auto" } };
    }
    if (req.path === "/v1/memory/packs/export") {
      return { status: 200, body: { manifest: { sha256: "shadow-auto-manifest" } } };
    }
    if (req.path === "/v1/memory/packs/import") {
      return { status: 200, body: { verified: true, imported: false } };
    }
    if (req.path === "/v1/memory/write") {
      shadowProbeCalls += 1;
      return {
        status: 200,
        body: {
          commit_id: "c-shadow-auto",
          shadow_dual_write: {
            enabled: true,
            strict: false,
            mirrored: false,
            capability: "shadow_mirror_v2",
            failure_mode: "soft_degrade",
            degraded_mode: "capability_unsupported",
            fallback_applied: true,
          },
        },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/capability-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
      ADMIN_TOKEN: "test-admin-token",
      CAPABILITY_PROBE_HEALTH_FILE: "/tmp/capability_probe_test_shadow_auto.json",
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.include_shadow_soft_degrade, true);
    assert.equal(shadowProbeCalls, 1);
  } finally {
    await mock.close();
  }
});

test("capability probe skips shadow soft-degrade when include flag is false", async () => {
  let shadowProbeCalls = 0;
  const mock = await createMockServer(async (req) => {
    if (req.path === "/health") {
      return {
        status: 200,
        body: {
          ok: true,
          memory_store_backend: "embedded",
          memory_store_feature_capabilities: {
            sessions_graph: true,
            packs_export: true,
            packs_import: true,
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
      return { status: 200, body: { session_id: "s-shadow-off" } };
    }
    if (req.path === "/v1/memory/packs/export") {
      return { status: 200, body: { manifest: { sha256: "shadow-off-manifest" } } };
    }
    if (req.path === "/v1/memory/packs/import") {
      return { status: 200, body: { verified: true, imported: false } };
    }
    if (req.path === "/v1/memory/write") {
      shadowProbeCalls += 1;
      return {
        status: 500,
        body: {
          error: "unexpected_shadow_probe",
          message: "shadow soft-degrade probe should not run when include flag is false",
        },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/capability-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
      ADMIN_TOKEN: "test-admin-token",
      CAPABILITY_PROBE_INCLUDE_SHADOW_SOFT_DEGRADE: "false",
      CAPABILITY_PROBE_HEALTH_FILE: "/tmp/capability_probe_test_shadow_off.json",
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.include_shadow_soft_degrade, false);
    assert.equal(shadowProbeCalls, 0);
  } finally {
    await mock.close();
  }
});

test("capability probe forces shadow soft-degrade when include flag is true", async () => {
  let shadowProbeCalls = 0;
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
      return { status: 200, body: { session_id: "s-shadow-force" } };
    }
    if (req.path === "/v1/memory/packs/export") {
      return { status: 200, body: { manifest: { sha256: "shadow-force-manifest" } } };
    }
    if (req.path === "/v1/memory/packs/import") {
      return { status: 200, body: { verified: true, imported: false } };
    }
    if (req.path === "/v1/memory/write") {
      shadowProbeCalls += 1;
      return {
        status: 200,
        body: {
          commit_id: "c-shadow-force",
          shadow_dual_write: {
            enabled: true,
            strict: false,
            mirrored: false,
            capability: "shadow_mirror_v2",
            failure_mode: "soft_degrade",
            degraded_mode: "capability_unsupported",
            fallback_applied: true,
          },
        },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/capability-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
      ADMIN_TOKEN: "test-admin-token",
      CAPABILITY_PROBE_INCLUDE_SHADOW_SOFT_DEGRADE: "true",
      CAPABILITY_PROBE_HEALTH_FILE: "/tmp/capability_probe_test_shadow_force.json",
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.include_shadow_soft_degrade, true);
    assert.equal(shadowProbeCalls, 1);
  } finally {
    await mock.close();
  }
});

test("sandbox probe skips when sandbox interface is disabled", async () => {
  const mock = await createMockServer(async (req) => {
    if (req.path === "/v1/memory/sandbox/sessions") {
      return {
        status: 400,
        body: {
          error: "sandbox_disabled",
          message: "sandbox interface is disabled",
        },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/sandbox-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.skipped, true);
    assert.equal(parsed.reason, "sandbox_disabled");
  } finally {
    await mock.close();
  }
});

test("sandbox probe validates sandbox API contract when enabled", async () => {
  const runId = "44444444-4444-4444-8444-444444444444";
  const sessionId = "55555555-5555-4555-8555-555555555555";
  const decisionId = "66666666-6666-4666-8666-666666666666";
  const now = new Date().toISOString();

  const mock = await createMockServer(async (req) => {
    if (req.path === "/v1/memory/sandbox/sessions") {
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          session: {
            session_id: sessionId,
            profile: "restricted",
            metadata: {},
            expires_at: null,
            created_at: now,
            updated_at: now,
          },
        },
      };
    }
    if (req.path === "/v1/memory/sandbox/execute") {
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          accepted: false,
          run: {
            run_id: runId,
            session_id: sessionId,
            project_id: "sandbox_probe_project",
            planner_run_id: "sandbox_probe_run",
            decision_id: decisionId,
            action: {
              kind: "command",
              argv: ["echo", "sandbox probe"],
            },
            mode: "sync",
            status: "succeeded",
            timeout_ms: 15000,
            output: { stdout: "sandbox probe\n", stderr: "", truncated: false },
            exit_code: 0,
            error: null,
            cancel_requested: false,
            cancel_reason: null,
            result: { executor: "mock" },
            started_at: now,
            finished_at: now,
            created_at: now,
            updated_at: now,
          },
        },
      };
    }
    if (req.path === "/v1/memory/sandbox/runs/get") {
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          run: {
            run_id: runId,
            session_id: sessionId,
            planner_run_id: "sandbox_probe_run",
            decision_id: decisionId,
            action: {
              kind: "command",
              argv: ["echo", "sandbox probe"],
            },
            mode: "sync",
            status: "succeeded",
            timeout_ms: 15000,
            output: { stdout: "sandbox probe\n", stderr: "", truncated: false },
            exit_code: 0,
            error: null,
            cancel_requested: false,
            cancel_reason: null,
            result: { executor: "mock" },
            started_at: now,
            finished_at: now,
            created_at: now,
            updated_at: now,
          },
        },
      };
    }
    if (req.path === "/v1/memory/sandbox/runs/logs") {
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          run_id: runId,
          status: "succeeded",
          logs: {
            tail_bytes: 2048,
            stdout: "sandbox probe\n",
            stderr: "",
            truncated: false,
          },
        },
      };
    }
    if (req.path === "/v1/memory/sandbox/runs/artifact") {
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          artifact: {
            artifact_version: "sandbox_run_artifact_v2",
            run_id: runId,
            session_id: sessionId,
            uri: `aionis://${String(req.body?.tenant_id ?? "default")}/${String(req.body?.scope ?? "default")}/sandbox_run/${runId}`,
            project_id: "sandbox_probe_project",
            planner_run_id: "sandbox_probe_run",
            decision_id: decisionId,
            mode: "sync",
            status: "succeeded",
            timeout_ms: 15000,
            output: {
              tail_bytes: 2048,
              stdout: "sandbox probe\n",
              stderr: "",
              truncated: false,
            },
            exit_code: 0,
            error: null,
            result: { executor: "mock" },
            metadata: {},
            bundle: {
              manifest_version: "sandbox_artifact_bundle_manifest_v1",
              object_store_base_uri: null,
              object_prefix: `sandbox/${String(req.body?.tenant_id ?? "default")}/${String(req.body?.scope ?? "default")}/${runId}`,
              generated_at: now,
              objects: [],
            },
            started_at: now,
            finished_at: now,
            created_at: now,
            updated_at: now,
          },
        },
      };
    }
    if (req.path === "/v1/memory/sandbox/runs/cancel") {
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          run_id: runId,
          status: "succeeded",
          cancel_requested: true,
          cancel_reason: "probe_cleanup",
        },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/sandbox-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.skipped, false);
    assert.equal(parsed.run_status, "succeeded");
    assert.equal(parsed.run_terminal, true);
    assert.equal(parsed.cancel_status, "succeeded");
  } finally {
    await mock.close();
  }
});

test("policy-planner probe marks planning as skipped on no_embedding_provider", async () => {
  let selectedRunId = "";
  let selectedTool = "tool_a";
  const providedDecisionId = "11111111-1111-4111-8111-111111111111";
  const createdDecisionId = "11111111-1111-4111-8111-222222222222";
  const commitId = "11111111-1111-4111-8111-aaaaaaaaaaaa";
  const mock = await createMockServer(async (req) => {
    if (req.path === "/v1/memory/write") {
      return {
        status: 200,
        body: {
          commit_id: "c_seed_rule",
          nodes: [{ id: String(req.body?.nodes?.[0]?.id ?? "rule-1"), type: "rule" }],
        },
      };
    }
    if (req.path === "/v1/memory/rules/state") {
      return { status: 200, body: { commit_id: "c_rule_state" } };
    }
    if (req.path === "/v1/memory/rules/evaluate") {
      return {
        status: 200,
        body: {
          considered: 1,
          matched: 1,
          active: [],
          shadow: [],
          applied: {},
          agent_visibility_summary: {},
        },
      };
    }
    if (req.path === "/v1/memory/tools/select") {
      const cands = Array.isArray(req.body?.candidates) ? req.body.candidates.map((v) => String(v)) : ["tool_a"];
      selectedRunId = String(req.body?.run_id ?? "");
      selectedTool = cands[0] ?? "tool_a";
      return {
        status: 200,
        body: {
          decision: {
            decision_id: providedDecisionId,
            decision_uri: buildUri(req, "decision", providedDecisionId),
          },
          selection: {
            selected: cands[0] ?? null,
            ordered: cands,
          },
          rules: {},
        },
      };
    }
    if (req.path === "/v1/memory/tools/decision") {
      const decisionId = String(req.body?.decision_id ?? "");
      if (!decisionId) return { status: 400, body: { error: "invalid_decision_id" } };
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          decision: {
            decision_id: decisionId,
            decision_kind: "tools_select",
            run_id: selectedRunId,
            selected_tool: selectedTool,
            candidates: [selectedTool],
            context_sha256: "ctx",
            policy_sha256: "policy",
            source_rule_ids: [],
            metadata: {},
            created_at: new Date().toISOString(),
            commit_id: null,
            decision_uri: buildUri(req, "decision", decisionId),
            commit_uri: null,
          },
        },
      };
    }
    if (req.path === "/v1/memory/tools/feedback") {
      const feedbackRunId = String(req.body?.run_id ?? "");
      if (req.body?.decision_id) {
        return {
          status: 200,
          body: {
            updated_rules: 1,
            decision_id: providedDecisionId,
            decision_uri: buildUri(req, "decision", providedDecisionId),
            commit_uri: buildUri(req, "commit", commitId),
            decision_link_mode: "provided",
          },
        };
      }
      if (feedbackRunId.endsWith("_fresh")) {
        return {
          status: 200,
          body: {
            updated_rules: 1,
            decision_id: createdDecisionId,
            decision_uri: buildUri(req, "decision", createdDecisionId),
            commit_uri: buildUri(req, "commit", commitId),
            decision_link_mode: "created_from_feedback",
          },
        };
      }
      return {
        status: 200,
        body: {
          updated_rules: 1,
          decision_id: providedDecisionId,
          decision_uri: buildUri(req, "decision", providedDecisionId),
          commit_uri: buildUri(req, "commit", commitId),
          decision_link_mode: "inferred",
        },
      };
    }
    if (req.path === "/v1/memory/resolve") {
      const uri = String(req.body?.uri ?? "");
      if (uri.includes("/rule/")) {
        return { status: 200, body: { node: { uri } } };
      }
      if (uri.includes("/decision/")) {
        return { status: 200, body: { decision: { decision_uri: uri } } };
      }
      if (uri.includes("/commit/")) {
        return {
          status: 200,
          body: {
            commit: {
              uri,
              linked_object_counts: { nodes: 1, edges: 0, decisions: 1, total: 2 },
            },
          },
        };
      }
      return { status: 404, body: { error: "not_found" } };
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
    if (req.path === "/v1/memory/context/assemble") {
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
    assert.equal(parsed.results.assembled.skipped, true);
    assert.equal(parsed.results.assembled.reason, "no_embedding_provider");
    assert.equal(parsed.results.diagnostics.skipped, true);
    assert.equal(parsed.results.diagnostics.reason, "admin_token_missing");
    assert.equal(parsed.results.decision_readback.decision_kind, "tools_select");
    assert.equal(parsed.results.provenance.provided.decision_link_mode, "provided");
    assert.equal(parsed.results.provenance.inferred.decision_link_mode, "inferred");
    assert.equal(parsed.results.provenance.created_from_feedback.decision_link_mode, "created_from_feedback");
    assert.equal(parsed.results.resolve.skipped, false);
    assert.equal(parsed.results.pack_export_decisions.skipped, true);
    assert.equal(parsed.results.pack_export_decisions.reason, "admin_token_missing");
  } finally {
    await mock.close();
  }
});

test("policy-planner probe validates diagnostics context_assembly dual metrics", async () => {
  let selectedRunId = "";
  let selectedTool = "tool_a";
  const providedDecisionId = "22222222-2222-4222-8222-111111111111";
  const createdDecisionId = "22222222-2222-4222-8222-222222222222";
  const commitId = "22222222-2222-4222-8222-aaaaaaaaaaaa";
  const mock = await createMockServer(async (req) => {
    if (req.path === "/v1/memory/write") {
      return {
        status: 200,
        body: {
          commit_id: "c_seed_rule_diag",
          nodes: [{ id: String(req.body?.nodes?.[0]?.id ?? "rule-diag"), type: "rule" }],
        },
      };
    }
    if (req.path === "/v1/memory/rules/state") {
      return { status: 200, body: { commit_id: "c_rule_state_diag" } };
    }
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
      const cands = Array.isArray(req.body?.candidates) ? req.body.candidates.map((v) => String(v)) : ["tool_a", "tool_b"];
      selectedRunId = String(req.body?.run_id ?? "");
      selectedTool = cands[0] ?? "tool_a";
      return {
        status: 200,
        body: {
          decision: {
            decision_id: providedDecisionId,
            decision_uri: buildUri(req, "decision", providedDecisionId),
          },
          selection: { selected: cands[0] ?? null, ordered: cands },
          rules: {},
        },
      };
    }
    if (req.path === "/v1/memory/tools/decision") {
      const decisionId = String(req.body?.decision_id ?? "");
      if (!decisionId) return { status: 400, body: { error: "invalid_decision_id" } };
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          decision: {
            decision_id: decisionId,
            decision_kind: "tools_select",
            run_id: selectedRunId,
            selected_tool: selectedTool,
            candidates: [selectedTool, "tool_b"],
            context_sha256: "ctx",
            policy_sha256: "policy",
            source_rule_ids: [],
            metadata: {},
            created_at: new Date().toISOString(),
            commit_id: null,
            decision_uri: buildUri(req, "decision", decisionId),
            commit_uri: null,
          },
        },
      };
    }
    if (req.path === "/v1/memory/tools/feedback") {
      const feedbackRunId = String(req.body?.run_id ?? "");
      if (req.body?.decision_id) {
        return {
          status: 200,
          body: {
            updated_rules: 1,
            decision_id: providedDecisionId,
            decision_uri: buildUri(req, "decision", providedDecisionId),
            commit_uri: buildUri(req, "commit", commitId),
            decision_link_mode: "provided",
          },
        };
      }
      if (feedbackRunId.endsWith("_fresh")) {
        return {
          status: 200,
          body: {
            updated_rules: 1,
            decision_id: createdDecisionId,
            decision_uri: buildUri(req, "decision", createdDecisionId),
            commit_uri: buildUri(req, "commit", commitId),
            decision_link_mode: "created_from_feedback",
          },
        };
      }
      return {
        status: 200,
        body: {
          updated_rules: 1,
          decision_id: providedDecisionId,
          decision_uri: buildUri(req, "decision", providedDecisionId),
          commit_uri: buildUri(req, "commit", commitId),
          decision_link_mode: "inferred",
        },
      };
    }
    if (req.path === "/v1/memory/resolve") {
      const uri = String(req.body?.uri ?? "");
      if (uri.includes("/rule/")) {
        return { status: 200, body: { node: { uri } } };
      }
      if (uri.includes("/decision/")) {
        return { status: 200, body: { decision: { decision_uri: uri } } };
      }
      if (uri.includes("/commit/")) {
        return {
          status: 200,
          body: {
            commit: {
              uri,
              linked_object_counts: { nodes: 2, edges: 1, decisions: 1, total: 4 },
            },
          },
        };
      }
      return { status: 404, body: { error: "not_found" } };
    }
    if (req.path === "/v1/memory/packs/export") {
      return {
        status: 200,
        body: {
          manifest: {
            counts: { nodes: 0, edges: 0, commits: 0, decisions: 1 },
            truncated: { nodes: false, edges: false, commits: false, decisions: false },
          },
          pack: {
            decisions: [{ decision_uri: buildUri(req, "decision", providedDecisionId) }],
          },
        },
      };
    }
    if (req.path === "/v1/memory/planning/context") {
      const cands = Array.isArray(req.body?.tool_candidates) ? req.body.tool_candidates.map((v) => String(v)) : ["tool_a", "tool_b"];
      return {
        status: 200,
        body: {
          query: { embedding_provider: "fake" },
          recall: { subgraph: { nodes: [] } },
          rules: { considered: 2, matched: 1 },
          tools: { selection: { selected: cands[0] ?? "tool_a" } },
        },
      };
    }
    if (req.path === "/v1/memory/context/assemble") {
      const cands = Array.isArray(req.body?.tool_candidates) ? req.body.tool_candidates.map((v) => String(v)) : ["tool_a", "tool_b"];
      return {
        status: 200,
        body: {
          query: { embedding_provider: "fake" },
          recall: { subgraph: { nodes: [] } },
          rules: { considered: 2, matched: 1 },
          tools: { selection: { selected: cands[0] ?? "tool_a" } },
          layered_context: {
            order: ["facts", "rules", "tools"],
            sections: {
              facts: "",
              rules: "",
              tools: "",
            },
            merged_text: "",
          },
        },
      };
    }
    if (req.path.startsWith("/v1/admin/control/diagnostics/tenant/")) {
      return {
        status: 200,
        body: {
          ok: true,
          diagnostics: {
            request_telemetry: { endpoints: [] },
            recall_pipeline: {
              total: 0,
              empty_seed: 0,
              empty_nodes: 0,
              empty_edges: 0,
              empty_seed_rate: 0,
              empty_node_rate: 0,
              empty_edge_rate: 0,
              seed_avg: 0,
              node_avg: 0,
              edge_avg: 0,
            },
            context_assembly: {
              total: 2,
              layered_total: 1,
              layered_adoption_rate: 0.5,
              latency_p50_ms: 12,
              latency_p95_ms: 20,
              latency_p99_ms: 24,
              budget_exhausted: 0,
              budget_exhausted_rate: 0,
              dropped_requests: 0,
              dropped_request_rate: 0,
              budget_use_ratio_avg: 0.4,
              endpoints: [],
              layers: [],
              alerts: { critical_layers: [] },
            },
            outbox: {
              totals: { pending: 0, retrying: 0, failed: 0, oldest_pending_age_sec: 0 },
              by_event_type: [],
            },
          },
        },
      };
    }
    return { status: 404, body: { error: "not_found" } };
  });

  try {
    const out = await runNodeScript("scripts/ci/policy-planner-api-probes.mjs", {
      AIONIS_BASE_URL: mock.baseUrl,
      ADMIN_TOKEN: "test-admin-token",
    });
    assert.equal(out.code, 0, out.stderr || out.stdout);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.results.diagnostics.skipped, false);
    assert.equal(parsed.results.diagnostics.context_assembly.total, 2);
    assert.equal(parsed.results.diagnostics.context_assembly.layered_total, 1);
    assert.equal(parsed.results.diagnostics.context_assembly.layered_adoption_rate, 0.5);
    assert.equal(parsed.results.resolve.skipped, false);
    assert.equal(parsed.results.pack_export_decisions.skipped, false);
    assert.equal(parsed.results.pack_export_decisions.decisions_count, 1);
  } finally {
    await mock.close();
  }
});

test("policy-planner probe fails when planning/tools selected mismatch", async () => {
  let selectedRunId = "";
  let selectedTool = "tool_a";
  const providedDecisionId = "33333333-3333-4333-8333-111111111111";
  const createdDecisionId = "33333333-3333-4333-8333-222222222222";
  const commitId = "33333333-3333-4333-8333-aaaaaaaaaaaa";
  const mock = await createMockServer(async (req) => {
    if (req.path === "/v1/memory/write") {
      return {
        status: 200,
        body: {
          commit_id: "c_seed_rule_2",
          nodes: [{ id: String(req.body?.nodes?.[0]?.id ?? "rule-2"), type: "rule" }],
        },
      };
    }
    if (req.path === "/v1/memory/rules/state") {
      return { status: 200, body: { commit_id: "c_rule_state_2" } };
    }
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
      const cands = Array.isArray(req.body?.candidates) ? req.body.candidates.map((v) => String(v)) : ["tool_a", "tool_b"];
      selectedRunId = String(req.body?.run_id ?? "");
      selectedTool = cands[0] ?? "tool_a";
      return {
        status: 200,
        body: {
          decision: {
            decision_id: providedDecisionId,
            decision_uri: buildUri(req, "decision", providedDecisionId),
          },
          selection: { selected: cands[0] ?? null, ordered: cands },
          rules: {},
        },
      };
    }
    if (req.path === "/v1/memory/tools/decision") {
      const decisionId = String(req.body?.decision_id ?? "");
      if (!decisionId) return { status: 400, body: { error: "invalid_decision_id" } };
      return {
        status: 200,
        body: {
          tenant_id: String(req.body?.tenant_id ?? "default"),
          scope: String(req.body?.scope ?? "default"),
          decision: {
            decision_id: decisionId,
            decision_kind: "tools_select",
            run_id: selectedRunId,
            selected_tool: selectedTool,
            candidates: [selectedTool, "tool_b"],
            context_sha256: "ctx",
            policy_sha256: "policy",
            source_rule_ids: [],
            metadata: {},
            created_at: new Date().toISOString(),
            commit_id: null,
            decision_uri: buildUri(req, "decision", decisionId),
            commit_uri: null,
          },
        },
      };
    }
    if (req.path === "/v1/memory/tools/feedback") {
      const feedbackRunId = String(req.body?.run_id ?? "");
      if (req.body?.decision_id) {
        return {
          status: 200,
          body: {
            updated_rules: 1,
            decision_id: providedDecisionId,
            decision_uri: buildUri(req, "decision", providedDecisionId),
            commit_uri: buildUri(req, "commit", commitId),
            decision_link_mode: "provided",
          },
        };
      }
      if (feedbackRunId.endsWith("_fresh")) {
        return {
          status: 200,
          body: {
            updated_rules: 1,
            decision_id: createdDecisionId,
            decision_uri: buildUri(req, "decision", createdDecisionId),
            commit_uri: buildUri(req, "commit", commitId),
            decision_link_mode: "created_from_feedback",
          },
        };
      }
      return {
        status: 200,
        body: {
          updated_rules: 1,
          decision_id: providedDecisionId,
          decision_uri: buildUri(req, "decision", providedDecisionId),
          commit_uri: buildUri(req, "commit", commitId),
          decision_link_mode: "inferred",
        },
      };
    }
    if (req.path === "/v1/memory/resolve") {
      const uri = String(req.body?.uri ?? "");
      if (uri.includes("/rule/")) {
        return { status: 200, body: { node: { uri } } };
      }
      if (uri.includes("/decision/")) {
        return { status: 200, body: { decision: { decision_uri: uri } } };
      }
      if (uri.includes("/commit/")) {
        return {
          status: 200,
          body: {
            commit: {
              uri,
              linked_object_counts: { nodes: 1, edges: 0, decisions: 1, total: 2 },
            },
          },
        };
      }
      return { status: 404, body: { error: "not_found" } };
    }
    if (req.path === "/v1/memory/planning/context") {
      const cands = Array.isArray(req.body?.tool_candidates) ? req.body.tool_candidates.map((v) => String(v)) : ["tool_a", "tool_b"];
      return {
        status: 200,
        body: {
          query: { embedding_provider: "fake" },
          recall: { subgraph: { nodes: [] } },
          rules: { considered: 2, matched: 1 },
          tools: { selection: { selected: cands[1] ?? "different_tool" } },
        },
      };
    }
    if (req.path === "/v1/memory/context/assemble") {
      const cands = Array.isArray(req.body?.tool_candidates) ? req.body.tool_candidates.map((v) => String(v)) : ["tool_a", "tool_b"];
      return {
        status: 200,
        body: {
          query: { embedding_provider: "fake" },
          recall: { subgraph: { nodes: [] } },
          rules: { considered: 2, matched: 1 },
          tools: { selection: { selected: cands[0] ?? "tool_a" } },
          layered_context: {
            order: ["facts", "rules", "tools"],
            sections: {
              facts: "",
              rules: "",
              tools: "",
            },
            merged_text: "",
          },
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
