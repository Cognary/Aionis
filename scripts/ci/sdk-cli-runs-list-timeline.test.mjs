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

    if (req.url === "/v1/memory/tools/runs/list") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req_runs_list" });
      res.end(JSON.stringify({
        scope: body.scope ?? "default",
        items: [
          {
            run_id: "run_b",
            status: "feedback_linked",
            decision_count: 3,
            feedback_total: 1,
            latest_decision_at: "2026-03-18T10:00:00.000Z",
            latest_feedback_at: "2026-03-18T10:01:00.000Z",
            latest_selected_tool: "rg",
          },
          {
            run_id: "run_a",
            status: "decision_recorded",
            decision_count: 1,
            feedback_total: 0,
            latest_decision_at: "2026-03-18T09:00:00.000Z",
            latest_feedback_at: null,
            latest_selected_tool: "pytest",
          },
        ],
      }));
      return;
    }

    if (req.url === "/v1/memory/tools/run") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req_run_timeline" });
      res.end(JSON.stringify({
        run_id: body.run_id,
        scope: body.scope ?? "default",
        lifecycle: {
          status: "feedback_linked",
          decision_count: 2,
          latest_decision_at: "2026-03-18T10:00:00.000Z",
          latest_feedback_at: "2026-03-18T10:01:00.000Z",
        },
        decisions: [
          {
            decision_id: "dec_1",
            selected_tool: "rg",
            created_at: "2026-03-18T10:00:00.000Z",
          },
          {
            decision_id: "dec_0",
            selected_tool: "pytest",
            created_at: "2026-03-18T09:55:00.000Z",
          },
        ],
        feedback: {
          total: 1,
          linked_decision_count: 1,
          tools_feedback_count: 1,
          recent: [
            {
              id: "fb_1",
              outcome: "positive",
              source: "tools_feedback",
              decision_id: "dec_1",
              created_at: "2026-03-18T10:01:00.000Z",
            },
          ],
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

test("sdk cli runs list hits real runs list route", async (t) => {
  const mock = await startMockServer();
  t.after(() => mock.server.close());

  const result = await runCli([
    "runs",
    "list",
    "--scope",
    "coding",
    "--limit",
    "5",
    "--json",
  ], {
    AIONIS_BASE_URL: mock.baseUrl,
  });

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, "aionis runs list");
  assert.equal(payload.data.items.length, 2);
  assert.equal(payload.data.items[0].run_id, "run_b");
  assert.equal(mock.requests[0].url, "/v1/memory/tools/runs/list");
  assert.equal(mock.requests[0].body.scope, "coding");
  assert.equal(mock.requests[0].body.limit, 5);
});

test("sdk cli runs timeline merges decisions and feedback into ordered events", async (t) => {
  const mock = await startMockServer();
  t.after(() => mock.server.close());

  const result = await runCli([
    "runs",
    "timeline",
    "--run-id",
    "run_b",
    "--scope",
    "coding",
    "--decision-limit",
    "10",
    "--feedback-limit",
    "10",
    "--json",
  ], {
    AIONIS_BASE_URL: mock.baseUrl,
  });

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, "aionis runs timeline");
  assert.equal(payload.data.run_id, "run_b");
  assert.equal(payload.data.events.length, 3);
  assert.equal(payload.data.events[0].type, "feedback");
  assert.equal(payload.data.events[1].type, "decision");
  assert.equal(payload.data.events[2].type, "decision");

  assert.equal(mock.requests[0].url, "/v1/memory/tools/run");
  assert.equal(mock.requests[0].body.run_id, "run_b");
  assert.equal(mock.requests[0].body.include_feedback, true);
  assert.equal(mock.requests[0].body.decision_limit, 10);
  assert.equal(mock.requests[0].body.feedback_limit, 10);
});
