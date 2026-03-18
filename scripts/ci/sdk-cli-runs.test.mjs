import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

async function runCli(args, env = {}) {
  const child = spawn(process.execPath, ["--import", "tsx", "packages/sdk/src/cli.ts", ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [code] = await once(child, "close");
  return { status: code, stdout, stderr };
}

async function withMockServer(handler, fn) {
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.setHeader("connection", "close");
      res.end(JSON.stringify({
        code: "test_server_error",
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to start mock server");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? JSON.parse(raw) : {};
}

test("sdk cli runs get hits tools run route with feedback flags", async () => {
  await withMockServer(async (req, res) => {
    assert.equal(req.url, "/v1/memory/tools/run");
    assert.equal(req.method, "POST");
    const body = await readJson(req);
    assert.equal(body.run_id, "run_123");
    assert.equal(body.scope, "demo");
    assert.equal(body.decision_limit, 5);
    assert.equal(body.include_feedback, true);
    assert.equal(body.feedback_limit, 7);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      tenant_id: "default",
      scope: "demo",
      run_id: "run_123",
      lifecycle: {
        status: "feedback_linked",
        decision_count: 2,
        latest_decision_at: "2026-03-18T00:00:00.000Z",
        latest_feedback_at: "2026-03-18T00:01:00.000Z",
      },
      decisions: [],
      feedback: {
        total: 1,
        tools_feedback_count: 1,
        linked_decision_count: 1,
        by_outcome: { positive: 1, negative: 0, neutral: 0 },
        recent: [],
      },
    }));
  }, async (baseUrl) => {
    const result = await runCli([
      "runs",
      "get",
      "--run-id",
      "run_123",
      "--scope",
      "demo",
      "--decision-limit",
      "5",
      "--include-feedback",
      "--feedback-limit",
      "7",
      "--base-url",
      baseUrl,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis runs get");
    assert.equal(parsed.data.response.run_id, "run_123");
    assert.equal(parsed.data.include_feedback, true);
  });
});

test("sdk cli runs decisions hits tools run and tools decision routes", async () => {
  const seen = [];
  await withMockServer(async (req, res) => {
    seen.push(req.url);
    if (req.url === "/v1/memory/tools/run") {
      const body = await readJson(req);
      assert.equal(body.run_id, "run_456");
      assert.equal(body.include_feedback, false);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        tenant_id: "default",
        scope: "default",
        run_id: "run_456",
        lifecycle: {
          status: "decision_recorded",
          decision_count: 2,
          latest_decision_at: "2026-03-18T00:00:00.000Z",
          latest_feedback_at: null,
        },
        decisions: [
          { decision_id: "dec_1", selected_tool: "tool_a" },
          { decision_id: "dec_2", selected_tool: "tool_b" },
        ],
      }));
      return;
    }
    if (req.url === "/v1/memory/tools/decision") {
      const body = await readJson(req);
      assert.equal(body.run_id, "run_456");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        tenant_id: "default",
        scope: "default",
        decision: {
          decision_id: "dec_2",
          selected_tool: "tool_b",
        },
      }));
      return;
    }
    throw new Error(`unexpected route: ${req.url}`);
  }, async (baseUrl) => {
    const result = await runCli([
      "runs",
      "decisions",
      "--run-id",
      "run_456",
      "--base-url",
      baseUrl,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis runs decisions");
    assert.equal(parsed.data.decision_count, 2);
    assert.equal(parsed.data.latest_decision.decision_id, "dec_2");
    assert.deepEqual(seen, ["/v1/memory/tools/run", "/v1/memory/tools/decision"]);
  });
});

test("sdk cli runs feedback returns linked feedback payload", async () => {
  await withMockServer(async (req, res) => {
    assert.equal(req.url, "/v1/memory/tools/run");
    const body = await readJson(req);
    assert.equal(body.run_id, "run_789");
    assert.equal(body.include_feedback, true);
    assert.equal(body.feedback_limit, 3);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      tenant_id: "default",
      scope: "default",
      run_id: "run_789",
      lifecycle: {
        status: "feedback_linked",
        decision_count: 1,
        latest_decision_at: "2026-03-18T00:00:00.000Z",
        latest_feedback_at: "2026-03-18T00:01:00.000Z",
      },
      decisions: [],
      feedback: {
        total: 2,
        tools_feedback_count: 1,
        linked_decision_count: 1,
        by_outcome: { positive: 1, negative: 1, neutral: 0 },
        recent: [
          { id: "fb_1", outcome: "positive", source: "tools_feedback" },
          { id: "fb_2", outcome: "negative", source: "rule_feedback" },
        ],
      },
    }));
  }, async (baseUrl) => {
    const result = await runCli([
      "runs",
      "feedback",
      "--run-id",
      "run_789",
      "--feedback-limit",
      "3",
      "--base-url",
      baseUrl,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis runs feedback");
    assert.equal(parsed.data.feedback.total, 2);
    assert.equal(parsed.data.recent.length, 2);
  });
});
