import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { createServer } from "node:http";

const CLI_PATH = new URL("../../packages/sdk/src/cli.ts", import.meta.url).pathname;

async function startMockServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : {};
    requests.push({ method: req.method, url: req.url, body });

    if (req.url === "/v1/memory/replay/runs/get") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req_replay_explain" });
      res.end(JSON.stringify({
        scope: body.scope ?? "default",
        run: {
          run_id: body.run_id,
          status: "in_progress",
          started_at: "2026-03-18T09:00:00.000Z",
          ended_at: null,
        },
        steps: [
          { step_id: "step_1", status: "success", tool_name: "rg" },
          { step_id: "step_2", status: "pending", tool_name: "pytest" },
        ],
        counters: {
          total_nodes: 4,
          step_nodes: 2,
          step_result_nodes: 1,
          artifact_refs: 0,
        },
      }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "not_found", message: "not found" } }));
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to start mock server");
  return {
    server,
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import=tsx", CLI_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("replay explain returns blocker explanation and stable envelope", async (t) => {
  const mock = await startMockServer();
  t.after(() => mock.server.close());

  const result = await runCli([
    "replay",
    "explain",
    "--run-id",
    "run_123",
    "--scope",
    "coding",
    "--json",
  ], {
    AIONIS_BASE_URL: mock.baseUrl,
  });

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, "aionis replay explain");
  assert.equal(payload.data.run_id, "run_123");
  assert.equal(payload.data.scope, "coding");
  assert.equal(payload.data.explain.compile_ready, false);
  assert.equal(payload.data.explain.blocker_count, 1);
  assert.equal(payload.data.explain.blockers[0].code, "run_not_successful");
  assert.equal(payload.data.explain.step_status_frequency.success, 1);
  assert.equal(payload.data.explain.step_status_frequency.pending, 1);

  assert.equal(mock.requests.length, 1);
  assert.equal(mock.requests[0].url, "/v1/memory/replay/runs/get");
  assert.equal(mock.requests[0].body.run_id, "run_123");
  assert.equal(mock.requests[0].body.scope, "coding");
  assert.equal(mock.requests[0].body.include_steps, true);
  assert.equal(mock.requests[0].body.include_artifacts, false);
});
