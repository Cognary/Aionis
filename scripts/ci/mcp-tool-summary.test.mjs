import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function runSnippet(source) {
  return execFileSync("npx", ["tsx", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}

test("planning context MCP summary prefers planning_summary while keeping merged text", () => {
  const out = runSnippet(`
    import { TOOL_DEFINITIONS } from "./src/mcp/dev/tools.ts";
    const tool = TOOL_DEFINITIONS.find((entry) => entry.name === "aionis_codex_planning_context");
    const env = {
      AIONIS_MAX_TOOL_TEXT_CHARS: 10000,
      AIONIS_BASE_URL: "http://unused"
    };
    const payload = {
      planning_summary: {
        summary_version: "planning_summary_v1",
        selected_tool: "kubectl",
        decision_id: "plan_dec_1",
        rules_matched: 2,
        context_est_tokens: 220,
        forgotten_items: 3,
        static_blocks_selected: 1
      },
      layered_context: {
        merged_text: "Deploy checklist\\n- get approval\\n- capture rollback refs"
      }
    };
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      headers: new Headers()
    });
    (async () => {
      const result = await tool.handler(env, { query_text: "deploy" });
      process.stdout.write(result.content[0].text);
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);
  assert.match(out, /selected_tool: kubectl/);
  assert.match(out, /rules_matched: 2/);
  assert.match(out, /Deploy checklist/);
});

test("tools decision MCP summary prefers lifecycle fields over raw JSON", () => {
  const out = runSnippet(`
    import { TOOL_DEFINITIONS } from "./src/mcp/dev/tools.ts";
    const tool = TOOL_DEFINITIONS.find((entry) => entry.name === "aionis_tools_decision");
    const env = { AIONIS_MAX_TOOL_TEXT_CHARS: 10000 };
    const result = {
      lookup_mode: "decision_id",
      lifecycle_summary: {
        summary_version: "tools_lifecycle_summary_v1",
        kind: "decision",
        decision_id: "dec_1",
        run_id: "run_1",
        selected_tool: "kubectl",
        candidate_count: 3,
        source_rule_count: 2,
        lookup_mode: "decision_id",
        metadata_source: "feedback_derived",
        created_at: "2026-03-11T08:00:00.000Z",
        tool_conflicts: ["[conflict] deny shell"]
      }
    };
    process.stdout.write(tool.summarize(result, env));
  `);
  assert.match(out, /selected_tool: kubectl/);
  assert.match(out, /decision_id: dec_1/);
  assert.match(out, /candidate_count: 3/);
  assert.doesNotMatch(out, /"decision_id":/);
});

test("tools select MCP summary prefers selection_summary over raw JSON", () => {
  const out = runSnippet(`
    import { TOOL_DEFINITIONS } from "./src/mcp/dev/tools.ts";
    const tool = TOOL_DEFINITIONS.find((entry) => entry.name === "aionis_tools_select");
    const env = { AIONIS_MAX_TOOL_TEXT_CHARS: 10000 };
    const result = {
      selection_summary: {
        summary_version: "tools_selection_summary_v1",
        selected_tool: "kubectl",
        candidate_count: 4,
        allowed_count: 2,
        denied_count: 2,
        preferred_count: 1,
        matched_rules: 3,
        source_rule_count: 2,
        fallback_applied: false,
        fallback_reason: null,
        shadow_selected_tool: "bash",
        tool_conflicts: ["[conflict] deny shell"]
      }
    };
    process.stdout.write(tool.summarize(result, env));
  `);
  assert.match(out, /selected_tool: kubectl/);
  assert.match(out, /allowed_count: 2/);
  assert.match(out, /matched_rules: 3/);
  assert.doesNotMatch(out, /"selection_summary":/);
});

test("tools run MCP summary prefers lifecycle summary over raw JSON", () => {
  const out = runSnippet(`
    import { TOOL_DEFINITIONS } from "./src/mcp/dev/tools.ts";
    const tool = TOOL_DEFINITIONS.find((entry) => entry.name === "aionis_tools_run");
    const env = { AIONIS_MAX_TOOL_TEXT_CHARS: 10000 };
    const result = {
      lifecycle_summary: {
        summary_version: "tools_lifecycle_summary_v1",
        kind: "run_lifecycle",
        run_id: "run_1",
        status: "feedback_linked",
        decision_count: 2,
        feedback_total: 3,
        tools_feedback_count: 2,
        latest_decision_at: "2026-03-11T08:00:00.000Z",
        latest_feedback_at: "2026-03-11T08:01:00.000Z",
        recent_decisions: ["kubectl @ 2026-03-11T08:00:00.000Z", "bash @ 2026-03-11T07:59:00.000Z"]
      }
    };
    process.stdout.write(tool.summarize(result, env));
  `);
  assert.match(out, /status: feedback_linked/);
  assert.match(out, /decision_count: 2/);
  assert.match(out, /feedback_total: 3/);
  assert.doesNotMatch(out, /"lifecycle":/);
});
