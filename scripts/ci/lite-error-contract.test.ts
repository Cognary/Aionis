import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { z } from "zod";
import { registerHostErrorHandler } from "../../src/host/http-host-bootstrap-shared.ts";
import { registerLiteServerOnlyRoutes } from "../../src/host/lite-edition.ts";
import { registerAutomationRoutes } from "../../src/routes/automations.ts";

test("invalid request responses expose the stable error envelope", async () => {
  const app = Fastify();
  try {
    registerHostErrorHandler(app);
    app.post("/invalid", async (req) => {
      z.object({ name: z.string().min(1) }).parse(req.body);
      return { ok: true };
    });

    const response = await app.inject({
      method: "POST",
      url: "/invalid",
      payload: {},
    });
    assert.equal(response.statusCode, 400);
    const body = response.json();
    assert.equal(body.status, 400);
    assert.equal(body.error, "invalid_request");
    assert.equal(body.message, "invalid request");
    assert.equal(body.details.contract, "error_v1");
    assert.ok(Array.isArray(body.issues));
    assert.equal(body.issues[0]?.path, "name");
  } finally {
    await app.close();
  }
});

test("server-only Lite routes expose structured lite error details", async () => {
  const app = Fastify();
  try {
    registerHostErrorHandler(app);
    registerLiteServerOnlyRoutes(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/control/dashboard",
    });
    assert.equal(response.statusCode, 501);
    const body = response.json();
    assert.equal(body.status, 501);
    assert.equal(body.error, "server_only_in_lite");
    assert.equal(body.details.contract, "lite_error_v1");
    assert.equal(body.details.edition, "lite");
    assert.equal(body.details.supported_in_lite, false);
    assert.equal(body.details.surface, "server_only_route_group");
    assert.equal(body.details.route_group, "admin_control");
    assert.equal(body.details.route, "/v1/admin/control/dashboard");
  } finally {
    await app.close();
  }
});

test("unsupported Lite automation governance routes expose structured lite error details", async () => {
  const app = Fastify();
  try {
    registerHostErrorHandler(app);
    registerAutomationRoutes({
      app,
      env: { MEMORY_SCOPE: "default", MEMORY_TENANT_ID: "default", LITE_LOCAL_ACTOR_ID: "local-user" },
      automationStore: {} as any,
      automationRunStore: {} as any,
      liteWriteStore: null,
      requireMemoryPrincipal: async () => null,
      withIdentityFromRequest: (_req, body) => body,
      enforceRateLimit: async () => {},
      enforceTenantQuota: async () => {},
      tenantFromBody: () => "default",
      acquireInflightSlot: async () => ({ release() {} }),
      buildAutomationReplayRunOptions: () => ({}),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/automations/assign_reviewer",
      payload: {},
    });
    assert.equal(response.statusCode, 501);
    const body = response.json();
    assert.equal(body.status, 501);
    assert.equal(body.error, "automation_feature_not_supported_in_lite");
    assert.equal(body.details.contract, "lite_error_v1");
    assert.equal(body.details.edition, "lite");
    assert.equal(body.details.supported_in_lite, false);
    assert.equal(body.details.surface, "automation_governance");
    assert.equal(body.details.route, "/v1/automations/assign_reviewer");
  } finally {
    await app.close();
  }
});
