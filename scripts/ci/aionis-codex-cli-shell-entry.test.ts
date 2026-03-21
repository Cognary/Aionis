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

test("codex shell entrypoint runs the command-backed shell path through Aionis", async () => {
  const calls: string[] = [];
  await withJsonServer(
    ({ url }) => {
      calls.push(url);
      if (url === "/v1/memory/tools/select") {
        return {
          selection: {
            selected: "bash",
            ordered: ["bash", "test"],
            preferred: ["bash"],
          },
          selection_summary: {
            provenance_explanation: "trusted pattern prefers bash",
            used_trusted_pattern_tools: ["bash"],
            used_trusted_pattern_affinity_levels: ["exact_task_signature"],
          },
        };
      }
      if (url === "/v1/memory/tools/feedback") {
        return { feedback_recorded: true };
      }
      if (url === "/v1/memory/execution/introspect") {
        return {
          pattern_signal_summary: {
            candidate_pattern_count: 1,
            trusted_pattern_count: 0,
          },
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
    async (baseUrl) => {
      const child = spawn("npx", ["tsx", "src/adapter/aionis-codex-cli-shell.ts"], {
        cwd: "/Volumes/ziel/Aionisgo",
        env: {
          ...process.env,
          AIONIS_BASE_URL: baseUrl,
          AIONIS_SCOPE: "codex-shell-test",
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
        cwd: "/Volumes/ziel/Aionisgo",
        model: "gpt-5",
        permission_mode: "default",
        prompt: "verify package metadata",
        task_kind: "verify_package_metadata",
        goal: "read package name via node",
        candidates: ["bash", "test"],
        command: "node",
        args: ["-p", "require('./package.json').name"],
        finalization: {
          outcome: "completed",
        },
        introspect: {
          limit: 5,
        },
      }));
      child.stdin.end();

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? 0));
      });

      assert.equal(exitCode, 0, Buffer.concat(stderrChunks).toString("utf8"));
      const parsed = JSON.parse(Buffer.concat(stdoutChunks).toString("utf8").trim());
      assert.equal(parsed.ok, true);
      assert.equal(parsed.result.execution.exit_code, 0);
      assert.equal(parsed.result.selection[0].channel, "tool_ordering");
      assert.equal(parsed.result.feedback[0].recorded, true);
      assert.equal(parsed.result.finalization[0].recorded, true);
      assert.equal(parsed.result.introspection.pattern_signal_summary.candidate_pattern_count, 1);
    },
  );

  assert.deepEqual(calls, [
    "/v1/memory/tools/select",
    "/v1/memory/tools/feedback",
    "/v1/memory/tools/feedback",
    "/v1/memory/execution/introspect",
  ]);
});
