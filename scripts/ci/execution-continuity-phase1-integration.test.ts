import assert from "node:assert/strict";
import test from "node:test";

import { recoverHandoff, buildHandoffWriteBody } from "../../src/memory/handoff.js";
import { ContextAssembleRequest } from "../../src/memory/schemas.js";
import { mergeExecutionPacketStaticBlocks } from "../../src/routes/memory-context-runtime.js";

test("execution continuity flow: handoff store -> recover -> context assemble", async () => {
  const nodeId = "11111111-1111-4111-8111-111111111111";
  const handoffInput = {
    tenant_id: "default",
    scope: "openclaw/project/demo",
    actor: "openclaw",
    memory_lane: "shared" as const,
    anchor: "auth-drift-001",
    file_path: "ui/src/ui/gateway.ts",
    repo_root: "/repo",
    handoff_kind: "patch_handoff" as const,
    title: "Auth drift handoff",
    summary: "Investigate auth drift after restart and prepare reviewer-ready recovery plan.",
    handoff_text: "Resume from auth drift investigation and complete the reviewer-ready packet.",
    risk: "token rotation may invalidate existing control UI session",
    acceptance_checks: ["identify auth boundary", "define focused validation"],
    target_files: ["ui/src/ui/gateway.ts", "docs/web/dashboard.md"],
    next_action: "Confirm the auth boundary and patch the smallest viable remediation path.",
    must_change: ["preserve reviewer-ready validation trail"],
    must_remove: ["broad unauthenticated retry path"],
    must_keep: ["rollback note for token rotation"],
  };

  const writeBody = buildHandoffWriteBody(handoffInput);
  const node = writeBody.nodes[0] as Record<string, any>;
  assert.equal(node.type, "event");
  assert.ok(node.slots?.execution_state_v1);
  assert.ok(node.slots?.execution_packet_v1);

  const resolvedNode = {
    id: nodeId,
    uri: `aionis://default/openclaw/project/demo/event/${nodeId}`,
    title: node.title ?? null,
    text_summary: node.text_summary ?? null,
    slots: node.slots,
    memory_lane: writeBody.memory_lane ?? "shared",
  };

  const liteWriteStore = {
    async findNodes() {
      return {
        rows: [
          {
            id: nodeId,
            uri: resolvedNode.uri,
            type: "event",
            client_id: null,
            title: resolvedNode.title,
            text_summary: resolvedNode.text_summary,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z",
          },
        ],
        has_more: false,
      };
    },
    async resolveNode() {
      return {
        id: nodeId,
        type: "event",
        client_id: null,
        title: resolvedNode.title,
        text_summary: resolvedNode.text_summary,
        slots: resolvedNode.slots,
        tier: "warm",
        memory_lane: "shared",
        producer_agent_id: null,
        owner_agent_id: null,
        owner_team_id: null,
        embedding_status: "ready",
        embedding_model: null,
        raw_ref: null,
        evidence_ref: null,
        salience: null,
        importance: null,
        confidence: null,
        last_activated: "2026-03-15T00:00:00.000Z",
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
        commit_id: null,
        commit_scope: null,
      };
    },
  };

  const recovered = await recoverHandoff({
    liteWriteStore: liteWriteStore as any,
    input: {
      tenant_id: "default",
      scope: "openclaw/project/demo",
      anchor: "auth-drift-001",
      file_path: "ui/src/ui/gateway.ts",
      repo_root: "/repo",
      handoff_kind: "patch_handoff",
    },
    defaultScope: "openclaw/project/demo",
    defaultTenantId: "default",
  });

  assert.equal(recovered.anchor, "auth-drift-001");
  assert.ok(recovered.execution_state_v1);
  assert.ok(recovered.execution_packet_v1);
  assert.equal(recovered.execution_packet_v1.state_id, "handoff-anchor:auth-drift-001");
  assert.equal(recovered.execution_state_v1.resume_anchor?.anchor, "auth-drift-001");

  const parsedAssemble = ContextAssembleRequest.parse({
    tenant_id: "default",
    scope: "openclaw/project/demo",
    query_text: "Continue auth drift remediation",
    execution_packet_v1: recovered.execution_packet_v1,
    return_layered_context: true,
    context: { objective: "finish the reviewer-ready packet" },
  });

  const staticBlocks = mergeExecutionPacketStaticBlocks(parsedAssemble as any);
  assert.ok(Array.isArray(staticBlocks));
  assert.ok(staticBlocks.length >= 2);
  assert.ok(staticBlocks.some((block) => String(block.title).includes("Execution Brief")));
  assert.ok(staticBlocks.some((block) => String(block.content).includes("task_brief=")));
  assert.ok(staticBlocks.some((block) => String(block.content).includes("current_stage=")));
  assert.ok(staticBlocks.some((block) => String(block.content).includes("target_files=")));
  assert.ok(staticBlocks.some((block) => String(block.content).includes("next_action=")));
  assert.ok(staticBlocks.some((block) => String(block.content).includes("acceptance_checks=")));
});
