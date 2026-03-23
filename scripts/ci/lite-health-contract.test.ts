import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerHealthRoute } from "../../src/host/http-host-bootstrap-shared.ts";

test("health route exposes stable runtime/storage/lite/sandbox envelopes", async () => {
  const app = Fastify();
  try {
    registerHealthRoute({
      app,
      env: {
        AIONIS_EDITION: "lite",
        AIONIS_MODE: "local",
        LITE_LOCAL_ACTOR_ID: "local-user",
        SANDBOX_TENANT_BUDGET_WINDOW_HOURS: 24,
        SANDBOX_REMOTE_EXECUTOR_EGRESS_DENY_PRIVATE_IPS: true,
        SANDBOX_ARTIFACT_OBJECT_STORE_BASE_URI: "",
      } as any,
      liteReplayStore: { healthSnapshot: () => ({ path: "/tmp/replay.sqlite", mode: "sqlite_mirror_v1" }) },
      liteRecallStore: { healthSnapshot: () => ({ path: "/tmp/recall.sqlite", mode: "sqlite_recall_v1" }) },
      liteWriteStore: { healthSnapshot: () => ({ path: "/tmp/write.sqlite", mode: "sqlite_write_v1" }) },
      liteAutomationStore: { healthSnapshot: () => ({ path: "/tmp/automation.sqlite", mode: "sqlite_automation_v1" }) },
      liteAutomationRunStore: { healthSnapshot: () => ({ path: "/tmp/automation-runs.sqlite", mode: "sqlite_automation_run_v1" }) },
      sandboxExecutor: {
        healthSnapshot: () => ({
          enabled: true,
          mode: "local_process",
          queue_depth: 0,
          active_runs: 0,
          max_concurrency: 2,
          remote_executor_configured: false,
          remote_executor_timeout_ms: null,
          remote_executor_allowlist_count: null,
          remote_executor_egress_cidr_count: null,
          remote_executor_deny_private_ips: null,
          remote_executor_mtls_enabled: null,
          heartbeat_interval_ms: 1000,
          stale_after_ms: 30000,
          recovery_poll_interval_ms: 1000,
        }),
      },
      sandboxTenantBudgetPolicy: new Map([["default", {}]]),
      sandboxRemoteAllowedCidrs: new Set(["127.0.0.0/8"]),
    });

    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.runtime, {
      edition: "lite",
      mode: "local",
    });
    assert.equal(body.storage.backend, "lite_sqlite");
    assert.deepEqual(Object.keys(body.storage).sort(), ["backend"]);
    assert.equal(body.lite.identity.local_actor_id, "local-user");
    assert.equal(body.lite.stores.recall.mode, "sqlite_recall_v1");
    assert.equal(body.lite.stores.write.mode, "sqlite_write_v1");
    assert.equal(body.lite.stores.replay.mode, "sqlite_mirror_v1");
    assert.equal(body.lite.stores.automation_definitions.mode, "sqlite_automation_v1");
    assert.equal(body.lite.stores.automation_runs.mode, "sqlite_automation_run_v1");
    assert.equal(body.lite.route_matrix.server_only_route_groups[0].group, "admin_control");
    assert.equal(body.sandbox.tenant_budget.window_hours, 24);
    assert.equal(body.sandbox.remote_egress.cidr_count, 1);
    assert.equal(body.sandbox.artifact_object_store.base_uri_configured, false);
    assert.equal("aionis_edition" in body, false);
    assert.equal("memory_store_backend" in body, false);
  } finally {
    await app.close();
  }
});
