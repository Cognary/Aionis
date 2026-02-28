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

test("policy-planner probe marks planning as skipped on no_embedding_provider", async () => {
  let selectedRunId = "";
  let selectedTool = "tool_a";
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
          decision: { decision_id: "decision_provided_1" },
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
            decision_id: "decision_provided_1",
            decision_link_mode: "provided",
          },
        };
      }
      if (feedbackRunId.endsWith("_fresh")) {
        return {
          status: 200,
          body: {
            updated_rules: 1,
            decision_id: "decision_created_1",
            decision_link_mode: "created_from_feedback",
          },
        };
      }
      return {
        status: 200,
        body: {
          updated_rules: 1,
          decision_id: "decision_provided_1",
          decision_link_mode: "inferred",
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
    assert.equal(parsed.results.decision_readback.decision_kind, "tools_select");
    assert.equal(parsed.results.provenance.provided.decision_link_mode, "provided");
    assert.equal(parsed.results.provenance.inferred.decision_link_mode, "inferred");
    assert.equal(parsed.results.provenance.created_from_feedback.decision_link_mode, "created_from_feedback");
  } finally {
    await mock.close();
  }
});

test("policy-planner probe fails when planning/tools selected mismatch", async () => {
  let selectedRunId = "";
  let selectedTool = "tool_a";
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
          decision: { decision_id: "decision_provided_2" },
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
            decision_id: "decision_provided_2",
            decision_link_mode: "provided",
          },
        };
      }
      if (feedbackRunId.endsWith("_fresh")) {
        return {
          status: 200,
          body: {
            updated_rules: 1,
            decision_id: "decision_created_2",
            decision_link_mode: "created_from_feedback",
          },
        };
      }
      return {
        status: 200,
        body: {
          updated_rules: 1,
          decision_id: "decision_provided_2",
          decision_link_mode: "inferred",
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
          tools: { selection: { selected: cands[1] ?? "different_tool" } },
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
