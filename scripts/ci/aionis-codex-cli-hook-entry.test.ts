import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { spawn } from "node:child_process";

async function withJsonServer(
  handler: (req: { url: string; body: any }) => any | Promise<any>,
  run: (baseUrl: string) => Promise<void>,
) {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : null;
    const payload = await handler({ url: req.url ?? "", body });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("codex hook entrypoint turns user prompt submit into planning-context injection", async () => {
  const calls: string[] = [];
  await withJsonServer(
    ({ url }) => {
      calls.push(url);
      if (url === "/v1/memory/planning/context") {
        return {
          planner_packet: {
            sections: {
              recommended_workflows: ["Repair export failure"],
              candidate_workflows: [],
            },
          },
          planning_summary: {
            trusted_pattern_count: 1,
            contested_pattern_count: 0,
            planner_explanation: "workflow guidance: Repair export failure",
          },
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
    async (baseUrl) => {
      const child = spawn("npx", ["tsx", "src/adapter/aionis-codex-cli-hook.ts"], {
        cwd: "/Volumes/ziel/Aionisgo",
        env: {
          ...process.env,
          AIONIS_BASE_URL: baseUrl,
          AIONIS_SCOPE: "codex-hook-test",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

      child.stdin.write(JSON.stringify({
        session_id: "session-1",
        turn_id: "turn-1",
        transcript_path: null,
        cwd: "/tmp/project",
        hook_event_name: "UserPromptSubmit",
        model: "gpt-5",
        permission_mode: "default",
        prompt: "repair export failure",
      }));
      child.stdin.end();

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? 0));
      });

      assert.equal(exitCode, 0, Buffer.concat(stderrChunks).toString("utf8"));
      const parsed = JSON.parse(Buffer.concat(stdoutChunks).toString("utf8").trim());
      assert.equal(parsed.continue, true);
      assert.match(parsed.hookSpecificOutput.additionalContext, /Aionis execution guidance/);
      assert.match(parsed.hookSpecificOutput.additionalContext, /Repair export failure/);
    },
  );

  assert.deepEqual(calls, ["/v1/memory/planning/context"]);
});
