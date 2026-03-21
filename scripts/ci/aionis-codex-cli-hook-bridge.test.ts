import test from "node:test";
import assert from "node:assert/strict";
import { AionisCodexCliHookBridge } from "../../src/adapter/codex-cli-hook-bridge.js";

const env = {
  AIONIS_BASE_URL: "http://127.0.0.1:9999",
  AIONIS_SCOPE: "codex-hook-test",
  AIONIS_TIMEOUT_MS: 10_000,
  AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
} as const;

test("codex hook bridge injects planning guidance on user prompt submit", async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const bridge = new AionisCodexCliHookBridge({
    env,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        planner_packet: {
          sections: {
            recommended_workflows: ["Fix widget export mismatch"],
            candidate_workflows: [],
          },
        },
        planning_summary: {
          trusted_pattern_count: 1,
          contested_pattern_count: 0,
          planner_explanation: "workflow guidance: Fix widget export mismatch",
        },
      };
    },
  });

  const output = await bridge.onUserPromptSubmit({
    session_id: "session-1",
    turn_id: "turn-1",
    transcript_path: null,
    cwd: "/tmp/project",
    hook_event_name: "UserPromptSubmit",
    model: "gpt-5",
    permission_mode: "default",
    prompt: "repair the widget export failure",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/v1/memory/planning/context");
  assert.equal(output.continue, true);
  assert.match(output.hookSpecificOutput?.additionalContext ?? "", /Aionis execution guidance/);
  assert.match(output.hookSpecificOutput?.additionalContext ?? "", /Fix widget export mismatch/);
  assert.match(output.hookSpecificOutput?.additionalContext ?? "", /Trusted tool patterns available: 1/);
});

test("codex hook bridge stays quiet when planning guidance is empty", async () => {
  const bridge = new AionisCodexCliHookBridge({
    env,
    postJson: async () => ({
      planner_packet: { sections: { recommended_workflows: [], candidate_workflows: [] } },
      planning_summary: { trusted_pattern_count: 0, contested_pattern_count: 0, planner_explanation: null },
    }),
  });

  const output = await bridge.onUserPromptSubmit({
    session_id: "session-2",
    turn_id: "turn-2",
    transcript_path: null,
    cwd: "/tmp/project",
    hook_event_name: "UserPromptSubmit",
    model: "gpt-5",
    permission_mode: "default",
    prompt: "check the project",
  });

  assert.equal(output.continue, true);
  assert.equal(output.hookSpecificOutput, undefined);
});
