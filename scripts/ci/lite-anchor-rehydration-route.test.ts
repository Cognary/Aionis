import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { createRequestGuards } from "../../src/app/request-guards.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { prepareMemoryWrite, applyMemoryWrite } from "../../src/memory/write.ts";
import { registerSdkDemoMemoryAccessRoutes as registerMemoryAccessRoutes } from "../../src/routes/sdk-demo-memory-access.ts";
import { registerSdkDemoMemoryFeedbackToolRoutes as registerMemoryFeedbackToolRoutes } from "../../src/routes/sdk-demo-memory-feedback-tools.ts";
import { registerHostErrorHandler } from "../../src/host/http-host-bootstrap-shared.ts";
import { buildAionisUri } from "../../src/memory/uri.ts";
import { InflightGate } from "../../src/util/inflight_gate.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-anchor-route-"));
  return path.join(dir, `${name}.sqlite`);
}

async function seedAnchorFixture(store: ReturnType<typeof createLiteWriteStore>) {
  const payloadNodeId = randomUUID();
  const anchorNodeId = randomUUID();
  const decisionId = randomUUID();
  const runId = "run-anchor-route-1";

  const prepared = await prepareMemoryWrite({
    tenant_id: "default",
    scope: "default",
    actor: "local-user",
    input_text: "seed anchor route fixture",
    nodes: [
      {
        id: payloadNodeId,
        type: "procedure",
        tier: "warm",
        memory_lane: "private",
        owner_agent_id: "local-user",
        title: "Payload step",
        text_summary: "Inspect failing test and patch export",
        slots: {
          replay_kind: "step",
          status: "succeeded",
          tool_name: "edit",
        },
      },
      {
        id: anchorNodeId,
        type: "procedure",
        tier: "warm",
        memory_lane: "private",
        owner_agent_id: "local-user",
        title: "Anchor route fixture",
        text_summary: "Anchor summary",
        slots: {
          anchor_v1: {
            anchor_kind: "workflow",
            anchor_level: "L2",
            task_signature: "fix-node-test-failure",
            summary: "Inspect failing test and patch export",
            tool_set: ["edit", "test"],
            outcome: { status: "success" },
            source: {
              source_kind: "playbook",
              node_id: payloadNodeId,
              decision_id: decisionId,
              run_id: runId,
              step_id: null,
              playbook_id: "pb_route",
              commit_id: null,
            },
            payload_refs: {
              node_ids: [payloadNodeId],
              decision_ids: [decisionId],
              run_ids: [runId],
              step_ids: [],
              commit_ids: [],
            },
            schema_version: "anchor_v1",
          },
        },
      },
    ],
    edges: [],
  }, "default", "default", {
    maxTextLen: 10000,
    piiRedaction: false,
    allowCrossScopeEdges: false,
  }, null);

  await store.withTx(() => applyMemoryWrite({} as any, prepared, {
    maxTextLen: 10000,
    piiRedaction: false,
    allowCrossScopeEdges: false,
    shadowDualWriteEnabled: false,
    shadowDualWriteStrict: false,
    write_access: store,
  }));

  await store.insertExecutionDecision({
    id: decisionId,
    scope: "default",
    decisionKind: "tools_select",
    runId,
    selectedTool: "edit",
    candidatesJson: ["edit", "test"],
    contextSha256: "c".repeat(64),
    policySha256: "d".repeat(64),
    sourceRuleIds: [],
    metadataJson: { matched_rules: 1 },
    commitId: null,
  });

  return { anchorNodeId, payloadNodeId, decisionId };
}

function buildRequestGuards() {
  return createRequestGuards({
    env: {
      AIONIS_EDITION: "lite",
      MEMORY_AUTH_MODE: "off",
      TENANT_QUOTA_ENABLED: false,
      LITE_LOCAL_ACTOR_ID: "local-user",
      MEMORY_TENANT_ID: "default",
      MEMORY_SCOPE: "default",
      APP_ENV: "test",
      ADMIN_TOKEN: "",
      TRUST_PROXY: false,
      TRUSTED_PROXY_CIDRS: [],
      RATE_LIMIT_ENABLED: false,
      RATE_LIMIT_BYPASS_LOOPBACK: false,
      WRITE_RATE_LIMIT_MAX_WAIT_MS: 0,
    } as any,
    embedder: null,
    recallLimiter: null,
    debugEmbedLimiter: null,
    writeLimiter: null,
    sandboxWriteLimiter: null,
    sandboxReadLimiter: null,
    recallTextEmbedLimiter: null,
    recallInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
    writeInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
  });
}

test("lite memory-access route exposes anchor payload rehydration", async () => {
  const app = Fastify();
  const store = createLiteWriteStore(tmpDbPath("route"));
  try {
    const fixture = await seedAnchorFixture(store);
    const guards = buildRequestGuards();
    registerHostErrorHandler(app);
    registerMemoryAccessRoutes({
      app,
      env: {
        AIONIS_EDITION: "lite",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        LITE_LOCAL_ACTOR_ID: "local-user",
        MAX_TEXT_LEN: 10000,
        PII_REDACTION: false,
        ALLOW_CROSS_SCOPE_EDGES: false,
        MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
        MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
      } as any,
      liteWriteStore: store,
      requireMemoryPrincipal: guards.requireMemoryPrincipal,
      withIdentityFromRequest: guards.withIdentityFromRequest,
      enforceRateLimit: guards.enforceRateLimit,
      enforceTenantQuota: guards.enforceTenantQuota,
      tenantFromBody: guards.tenantFromBody,
      acquireInflightSlot: guards.acquireInflightSlot,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/anchors/rehydrate_payload",
      payload: {
        anchor_uri: buildAionisUri({
          tenant_id: "default",
        scope: "default",
        type: "procedure",
        id: fixture.anchorNodeId,
      }),
        mode: "partial",
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.anchor.id, fixture.anchorNodeId);
    assert.equal(body.rehydrated.summary.resolved_nodes, 1);
    assert.equal(body.rehydrated.summary.resolved_decisions, 1);
    assert.equal(body.rehydrated.nodes[0]?.id, fixture.payloadNodeId);
    assert.equal(body.rehydrated.decisions[0]?.decision_id, fixture.decisionId);
  } finally {
    await app.close();
    await store.close();
  }
});

test("lite memory-feedback-tools routes expose rehydrate_payload as a runtime tool alias", async () => {
  const app = Fastify();
  const store = createLiteWriteStore(tmpDbPath("tool-route"));
  try {
    const fixture = await seedAnchorFixture(store);
    const guards = buildRequestGuards();
    registerHostErrorHandler(app);
    registerMemoryAccessRoutes({
      app,
      env: {
        AIONIS_EDITION: "lite",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        LITE_LOCAL_ACTOR_ID: "local-user",
        MAX_TEXT_LEN: 10000,
        PII_REDACTION: false,
        ALLOW_CROSS_SCOPE_EDGES: false,
        MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
        MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
      } as any,
      liteWriteStore: store,
      requireMemoryPrincipal: guards.requireMemoryPrincipal,
      withIdentityFromRequest: guards.withIdentityFromRequest,
      enforceRateLimit: guards.enforceRateLimit,
      enforceTenantQuota: guards.enforceTenantQuota,
      tenantFromBody: guards.tenantFromBody,
      acquireInflightSlot: guards.acquireInflightSlot,
    });
    registerMemoryFeedbackToolRoutes({
      app,
      env: {
        AIONIS_EDITION: "lite",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        LITE_LOCAL_ACTOR_ID: "local-user",
        MAX_TEXT_LEN: 10000,
        PII_REDACTION: false,
      } as any,
      embeddedRuntime: null,
      liteWriteStore: store,
      requireMemoryPrincipal: guards.requireMemoryPrincipal,
      withIdentityFromRequest: guards.withIdentityFromRequest,
      enforceRateLimit: guards.enforceRateLimit,
      enforceTenantQuota: guards.enforceTenantQuota,
      tenantFromBody: guards.tenantFromBody,
      acquireInflightSlot: guards.acquireInflightSlot,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/rehydrate_payload",
      payload: {
        anchor_id: fixture.anchorNodeId,
        mode: "partial",
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.anchor.id, fixture.anchorNodeId);
    assert.equal(body.rehydrated.summary.resolved_nodes, 1);
    assert.equal(body.rehydrated.summary.resolved_decisions, 1);
    assert.equal(body.rehydrated.nodes[0]?.id, fixture.payloadNodeId);
    assert.equal(body.rehydrated.decisions[0]?.decision_id, fixture.decisionId);
  } finally {
    await app.close();
    await store.close();
  }
});
