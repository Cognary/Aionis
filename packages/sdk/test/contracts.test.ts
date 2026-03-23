import assert from "node:assert/strict";
import test from "node:test";
import type {
  AionisAnchorsRehydratePayloadRequest,
  AionisContextAssembleRequest,
  AionisExecutionIntrospectRequest,
  AionisMemoryWriteRequest,
  AionisPlanningContextRequest,
  AionisReplayRepairReviewRequest,
  AionisToolsFeedbackRequest,
  AionisToolsSelectRequest,
} from "../src/contracts.js";

test("typed SDK contract examples are assignable for the full v1 surface", () => {
  const writeRequest: AionisMemoryWriteRequest = {
    tenant_id: "default",
    scope: "sdk-test",
    input_text: "repair export failure",
    nodes: [
      {
        client_id: "event-1",
        type: "event",
        title: "Repair export failure",
      },
    ],
    edges: [],
  };

  const planningRequest: AionisPlanningContextRequest = {
    tenant_id: "default",
    scope: "sdk-test",
    query_text: "repair export failure",
    context: { goal: "repair export failure" },
  };

  const assembleRequest: AionisContextAssembleRequest = {
    tenant_id: "default",
    scope: "sdk-test",
    query_text: "repair export failure",
    context: { goal: "repair export failure" },
    return_layered_context: true,
  };

  const introspectRequest: AionisExecutionIntrospectRequest = {
    tenant_id: "default",
    scope: "sdk-test",
    limit: 8,
  };

  const toolsSelectRequest: AionisToolsSelectRequest = {
    tenant_id: "default",
    scope: "sdk-test",
    context: { goal: "repair export failure" },
    candidates: ["bash", "edit"],
  };

  const toolsFeedbackRequest: AionisToolsFeedbackRequest = {
    tenant_id: "default",
    scope: "sdk-test",
    outcome: "positive",
    context: { goal: "repair export failure" },
    candidates: ["bash", "edit"],
    selected_tool: "edit",
    input_text: "edit fixed the issue",
  };

  const replayReviewRequest: AionisReplayRepairReviewRequest = {
    tenant_id: "default",
    scope: "sdk-test",
    playbook_id: "00000000-0000-0000-0000-000000000123",
    action: "approve",
  };

  const rehydrateRequest: AionisAnchorsRehydratePayloadRequest = {
    tenant_id: "default",
    scope: "sdk-test",
    anchor_id: "anchor-123",
    mode: "partial",
  };

  assert.equal(writeRequest.nodes?.[0]?.type, "event");
  assert.equal(planningRequest.query_text, "repair export failure");
  assert.equal(assembleRequest.return_layered_context, true);
  assert.equal(introspectRequest.limit, 8);
  assert.deepEqual(toolsSelectRequest.candidates, ["bash", "edit"]);
  assert.equal(toolsFeedbackRequest.selected_tool, "edit");
  assert.equal(replayReviewRequest.action, "approve");
  assert.equal(rehydrateRequest.mode, "partial");
});
