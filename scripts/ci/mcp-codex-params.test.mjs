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

test("invokeTool ignores Codex-injected _meta arguments", () => {
  const out = runSnippet(`
    import { invokeTool } from "./src/mcp/dev/tools.ts";
    const env = { AIONIS_MAX_TOOL_TEXT_CHARS: 10000 };
    (async () => {
      const result = await invokeTool(
        env,
        "aionis_codex_feedback_gate",
        {
          task_completed: true,
          _meta: {
            progressToken: 1
          }
        }
      );
      process.stdout.write(JSON.stringify(result));
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);
  const parsed = JSON.parse(out);
  assert.equal(parsed.isError, undefined);
  assert.doesNotMatch(parsed.content[0].text, /invalid_args|invalid_params/);
  assert.match(parsed.content[0].text, /"recommended_outcome": "neutral"/);
});
