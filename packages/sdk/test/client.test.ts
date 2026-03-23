import assert from "node:assert/strict";
import test from "node:test";
import { createAionisClient } from "../src/client.js";
import { AionisSdkHttpError } from "../src/error.js";

test("createAionisClient exposes the v1 memory surface and routes requests to the expected paths", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createAionisClient({
    baseUrl: "http://127.0.0.1:3001/",
    headers: {
      authorization: "Bearer test-token",
    },
    fetch: async (input, init) => {
      calls.push({
        url: String(input),
        init,
      });
      return new Response(JSON.stringify({
        ok: true,
        echoed_path: String(input),
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  });

  await client.memory.write({
    tenant_id: "default",
    scope: "sdk-test-write",
    input_text: "write request",
    nodes: [],
    edges: [],
  });
  await client.memory.planningContext({
    tenant_id: "default",
    scope: "sdk-test-planning",
    query_text: "repair export failure",
    context: { goal: "repair export failure" },
  });
  await client.memory.contextAssemble({
    tenant_id: "default",
    scope: "sdk-test-assemble",
    query_text: "repair export failure",
    context: { goal: "repair export failure" },
  });
  await client.memory.executionIntrospect({
    tenant_id: "default",
    scope: "sdk-test-introspect",
  });
  await client.memory.tools.select({
    tenant_id: "default",
    scope: "sdk-test-tools-select",
    context: { goal: "repair export failure" },
    candidates: ["bash", "edit"],
  });
  await client.memory.tools.feedback({
    tenant_id: "default",
    scope: "sdk-test-tools-feedback",
    outcome: "positive",
    context: { goal: "repair export failure" },
    candidates: ["bash", "edit"],
    selected_tool: "edit",
    input_text: "tool feedback",
  });
  await client.memory.replay.repairReview({
    tenant_id: "default",
    scope: "sdk-test-replay",
    playbook_id: "00000000-0000-0000-0000-000000000123",
    action: "approve",
  });
  await client.memory.anchors.rehydratePayload({
    tenant_id: "default",
    scope: "sdk-test-anchor",
    anchor_id: "anchor-123",
  });

  assert.deepEqual(
    calls.map((entry) => entry.url),
    [
      "http://127.0.0.1:3001/v1/memory/write",
      "http://127.0.0.1:3001/v1/memory/planning/context",
      "http://127.0.0.1:3001/v1/memory/context/assemble",
      "http://127.0.0.1:3001/v1/memory/execution/introspect",
      "http://127.0.0.1:3001/v1/memory/tools/select",
      "http://127.0.0.1:3001/v1/memory/tools/feedback",
      "http://127.0.0.1:3001/v1/memory/replay/playbooks/repair/review",
      "http://127.0.0.1:3001/v1/memory/anchors/rehydrate_payload",
    ],
  );

  for (const call of calls) {
    assert.equal(call.init?.method, "POST");
    assert.equal((call.init?.headers as Record<string, string>)["content-type"], "application/json");
    assert.equal((call.init?.headers as Record<string, string>).authorization, "Bearer test-token");
  }
});

test("SDK client throws AionisSdkHttpError with response payload when the request fails", async () => {
  const client = createAionisClient({
    baseUrl: "http://127.0.0.1:3001",
    fetch: async () =>
      new Response(JSON.stringify({
        error: "bad_request",
        message: "payload rejected",
      }), {
        status: 400,
        headers: {
          "content-type": "application/json",
        },
      }),
  });

  await assert.rejects(
    client.memory.write({
      tenant_id: "default",
      scope: "sdk-test-write",
      input_text: "write request",
      nodes: [],
      edges: [],
    }),
    (error: unknown) => {
      assert.ok(error instanceof AionisSdkHttpError);
      assert.equal(error.status, 400);
      assert.deepEqual(error.payload, {
        error: "bad_request",
        message: "payload rejected",
      });
      return true;
    },
  );
});
