import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

test("aionis-dev MCP protocol ignores Codex top-level _meta on tools/call", () => {
  const inputPath = path.join(os.tmpdir(), `aionis-codex-mcp-${process.pid}.jsonl`);
  fs.writeFileSync(
    inputPath,
    [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "aionis_codex_feedback_gate",
          arguments: { task_completed: true, _meta: { progressToken: 1 } },
          _meta: { progressToken: 1 },
        },
      }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "shutdown", params: {} }),
    ].join("\n"),
    "utf8",
  );

  try {
    const out = execFileSync("npx", ["tsx", "src/mcp/aionis-dev-mcp.ts"], {
      cwd: ROOT,
      input: fs.readFileSync(inputPath, "utf8"),
      encoding: "utf8",
      env: {
        ...process.env,
        AIONIS_BASE_URL: "http://127.0.0.1:3101",
        AIONIS_SCOPE: "default",
      },
    })
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    const toolResult = out.find((entry) => entry.id === 2);
    assert.ok(toolResult);
    assert.equal(toolResult.result.isError, undefined);
    assert.match(toolResult.result.content[0].text, /"recommended_outcome": "neutral"/);
  } finally {
    fs.rmSync(inputPath, { force: true });
  }
});
