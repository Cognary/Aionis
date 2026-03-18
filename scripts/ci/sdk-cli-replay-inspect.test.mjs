import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function runCli(args, env = {}) {
  const child = spawn(process.execPath, ["--import", "tsx", "packages/sdk/src/cli.ts", ...args], {
    cwd: ROOT,
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
  return {
    status: code,
    stdout,
    stderr,
  };
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
  if (!address || typeof address === "string") {
    throw new Error("failed to start mock server");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    for (const socket of sockets) socket.destroy();
    const closed = new Promise((resolve) => server.close(resolve));
    await closed;
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? JSON.parse(raw) : {};
}

test("sdk cli playbooks get hits replay playbook get route", async () => {
  await withMockServer(async (req, res) => {
    assert.equal(req.url, "/v1/memory/replay/playbooks/get");
    assert.equal(req.method, "POST");
    const body = await readJson(req);
    assert.equal(body.playbook_id, "pb_123");
    assert.equal(body.scope, "demo");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.setHeader("x-request-id", "req-playbook-get");
    res.end(JSON.stringify({
      scope: "demo",
      playbook: {
        playbook_id: "pb_123",
        version: 3,
        status: "shadow",
      },
    }));
  }, async (baseUrl) => {
    const result = await runCli([
      "playbooks",
      "get",
      "--playbook-id",
      "pb_123",
      "--scope",
      "demo",
      "--base-url",
      baseUrl,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis playbooks get");
    assert.equal(parsed.data.response.playbook.playbook_id, "pb_123");
  });
});

test("sdk cli playbooks candidate forwards version and mode", async () => {
  await withMockServer(async (req, res) => {
    assert.equal(req.url, "/v1/memory/replay/playbooks/candidate");
    const body = await readJson(req);
    assert.equal(body.playbook_id, "pb_candidate");
    assert.equal(body.scope, "demo");
    assert.equal(body.version, 2);
    assert.equal(body.mode, "strict");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      scope: "demo",
      candidate: {
        eligible_for_deterministic_replay: true,
        recommended_mode: "strict",
        next_action: "dispatch",
      },
    }));
  }, async (baseUrl) => {
    const result = await runCli([
      "playbooks",
      "candidate",
      "--playbook-id",
      "pb_candidate",
      "--scope",
      "demo",
      "--version",
      "2",
      "--mode",
      "strict",
      "--base-url",
      baseUrl,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis playbooks candidate");
    assert.equal(parsed.data.response.candidate.recommended_mode, "strict");
  });
});

test("sdk cli playbooks dispatch hits governed dispatch route", async () => {
  await withMockServer(async (req, res) => {
    assert.equal(req.url, "/v1/memory/replay/playbooks/dispatch");
    const body = await readJson(req);
    assert.equal(body.playbook_id, "pb_dispatch");
    assert.equal(body.mode, "simulate");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      scope: "default",
      dispatch: {
        decision: "candidate_only",
        primary_inference_skipped: false,
        fallback_executed: false,
      },
    }));
  }, async (baseUrl) => {
    const result = await runCli([
      "playbooks",
      "dispatch",
      "--playbook-id",
      "pb_dispatch",
      "--mode",
      "simulate",
      "--base-url",
      baseUrl,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis playbooks dispatch");
    assert.equal(parsed.data.response.dispatch.decision, "candidate_only");
  });
});

test("sdk cli replay inspect-run forwards include flags", async () => {
  await withMockServer(async (req, res) => {
    assert.equal(req.url, "/v1/memory/replay/runs/get");
    const body = await readJson(req);
    assert.equal(body.run_id, "run_123");
    assert.equal(body.scope, "demo");
    assert.equal(body.include_steps, true);
    assert.equal(body.include_artifacts, true);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      scope: "demo",
      run: {
        run_id: "run_123",
        status: "success",
      },
    }));
  }, async (baseUrl) => {
    const result = await runCli([
      "replay",
      "inspect-run",
      "--run-id",
      "run_123",
      "--scope",
      "demo",
      "--include-steps",
      "--include-artifacts",
      "--base-url",
      baseUrl,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis replay inspect-run");
    assert.equal(parsed.data.response.run.run_id, "run_123");
  });
});
