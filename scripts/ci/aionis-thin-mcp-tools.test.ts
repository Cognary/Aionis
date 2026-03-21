import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createAionisMcpTools } from "../../src/mcp/tools.js";

async function withJsonServer(
  handler: (req: { url: string; body: any }) => any | Promise<any>,
  run: (baseUrl: string, seen: Array<{ url: string; body: any }>) => Promise<void>,
) {
  const seen: Array<{ url: string; body: any }> = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : null;
    seen.push({ url: req.url ?? "", body });
    const payload = await handler({ url: req.url ?? "", body });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl, seen);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("thin MCP exposes the expected five tools", async () => {
  const tools = createAionisMcpTools({
    env: {
      AIONIS_BASE_URL: "http://127.0.0.1:3001",
      AIONIS_SCOPE: "default",
      AIONIS_TIMEOUT_MS: 10_000,
      AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
    },
  });
  assert.deepEqual(
    tools.definitions.map((tool) => tool.name),
    [
      "aionis_get_planning_context",
      "aionis_select_tool",
      "aionis_record_feedback",
      "aionis_finalize_task",
      "aionis_introspect",
    ],
  );
});

test("thin MCP planning-context and introspect tools stay compact", async () => {
  await withJsonServer(
    ({ url }) => {
      if (url === "/v1/memory/planning/context") {
        return {
          tenant_id: "default",
          scope: "default",
          planner_packet: {
            sections: {
              recommended_workflows: [{ title: "Fix export failure" }],
              candidate_workflows: [],
            },
          },
          workflow_signals: [],
          pattern_signals: [],
          planning_summary: {
            planner_explanation: "workflow guidance: Fix export failure",
            trusted_pattern_count: 1,
            contested_pattern_count: 0,
          },
          execution_kernel: { compact: true },
        };
      }
      if (url === "/v1/memory/execution/introspect") {
        return {
          tenant_id: "default",
          scope: "default",
          workflow_signal_summary: {
            stable_workflow_count: 1,
            promotion_ready_workflow_count: 0,
            observing_workflow_count: 0,
          },
          pattern_signal_summary: {
            candidate_pattern_count: 1,
            trusted_pattern_count: 1,
            contested_pattern_count: 0,
          },
          recommended_workflows: [{ title: "Fix export failure" }],
          trusted_patterns: [{ title: "Prefer edit" }],
          contested_patterns: [],
          continuity_projection_report: null,
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
    async (baseUrl, seen) => {
      const tools = createAionisMcpTools({
        env: {
          AIONIS_BASE_URL: baseUrl,
          AIONIS_SCOPE: "default",
          AIONIS_TIMEOUT_MS: 10_000,
          AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
        },
      });
      const planning = await tools.callTool("aionis_get_planning_context", {
        query_text: "repair export failure in node tests",
        context: { task_kind: "repair_export" },
        tool_candidates: ["bash", "edit", "test"],
      });
      assert.equal(planning.isError, undefined);
      assert.match(planning.content[0].text, /planning context ready/i);
      assert.equal((planning.structuredContent as any).recommended_workflow_count, 1);
      assert.equal("layered_context" in ((planning.structuredContent as any) ?? {}), false);

      const introspect = await tools.callTool("aionis_introspect", {});
      assert.equal(introspect.isError, undefined);
      assert.match(introspect.content[0].text, /execution memory introspection ready/i);
      assert.equal((introspect.structuredContent as any).stable_workflow_count, 1);

      assert.deepEqual(
        seen.map((entry) => entry.url),
        ["/v1/memory/planning/context", "/v1/memory/execution/introspect"],
      );
    },
  );
});

test("thin MCP select tool stores a pending decision", async () => {
  await withJsonServer(
    ({ url }) => {
      if (url !== "/v1/memory/tools/select") throw new Error(`unexpected url ${url}`);
      return {
        tenant_id: "default",
        scope: "default",
        candidates: ["bash", "edit", "test"],
        selection: {
          selected: "edit",
          ordered: ["edit", "bash", "test"],
          preferred: ["edit"],
          allowed: ["bash", "edit", "test"],
        },
        execution_kernel: {},
        rules: { considered: 1, matched: 1 },
        pattern_matches: { matched: 1, trusted: 1, preferred_tools: ["edit"], anchors: [] },
        decision: {
          decision_id: "11111111-1111-1111-1111-111111111111",
          decision_uri: "aionis://memory/execution-decision/11111111-1111-1111-1111-111111111111",
          run_id: "run-1",
          selected_tool: "edit",
          source_rule_ids: [],
          pattern_summary: {
            used_trusted_pattern_anchor_ids: [],
            used_trusted_pattern_tools: ["edit"],
            skipped_contested_pattern_anchor_ids: [],
            skipped_contested_pattern_tools: [],
            skipped_suppressed_pattern_anchor_ids: [],
            skipped_suppressed_pattern_tools: [],
          },
        },
        selection_summary: {
          summary_version: "tools_selection_summary_v1",
          selected_tool: "edit",
          trusted_pattern_count: 1,
          contested_pattern_count: 0,
          suppressed_pattern_count: 0,
          used_trusted_pattern_tools: ["edit"],
          skipped_contested_pattern_tools: [],
          skipped_suppressed_pattern_tools: [],
          provenance_explanation: "trusted pattern support: edit [exact_task_signature]",
          pattern_lifecycle_summary: {},
          pattern_maintenance_summary: {},
        },
      };
    },
    async (baseUrl) => {
      const tools = createAionisMcpTools({
        env: {
          AIONIS_BASE_URL: baseUrl,
          AIONIS_SCOPE: "default",
          AIONIS_TIMEOUT_MS: 10_000,
          AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
        },
      });
      const result = await tools.callTool("aionis_select_tool", {
        run_id: "run-1",
        context: { task_kind: "repair_export" },
        candidates: ["bash", "edit", "test"],
      });
      assert.equal(result.isError, undefined);
      const pending = tools.state.getPendingDecisionByDecisionId("11111111-1111-1111-1111-111111111111");
      assert.ok(pending);
      assert.equal(pending?.run_id, "run-1");
      assert.equal(pending?.selected_tool, "edit");
      assert.deepEqual(pending?.candidates, ["bash", "edit", "test"]);
    },
  );
});
