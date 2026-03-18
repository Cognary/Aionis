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

test("sdk cli replay inspect-playbook hits get and candidate routes", async () => {
  const seen = [];
  await withMockServer(async (req, res) => {
    seen.push(req.url);
    if (req.url === "/v1/memory/replay/playbooks/get") {
      const body = await readJson(req);
      assert.equal(body.playbook_id, "pb_123");
      assert.equal(body.scope, "demo");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("x-request-id", "req-get");
      res.end(JSON.stringify({
        scope: "demo",
        playbook: {
          playbook_id: "pb_123",
          version: 3,
          status: "shadow",
          name: "Auth Recovery",
        },
      }));
      return;
    }
    if (req.url === "/v1/memory/replay/playbooks/candidate") {
      const body = await readJson(req);
      assert.equal(body.playbook_id, "pb_123");
      assert.equal(body.scope, "demo");
      assert.equal(body.version, 3);
      assert.equal(body.mode, "strict");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("x-request-id", "req-candidate");
      res.end(JSON.stringify({
        scope: "demo",
        candidate: {
          eligible_for_deterministic_replay: true,
          recommended_mode: "strict",
          next_action: "dispatch",
        },
        deterministic_gate: {
          matched: true,
          effective_mode: "strict",
        },
        cost_signals: {
          deterministic_replay_eligible: true,
          primary_inference_skipped: true,
        },
      }));
      return;
    }
    throw new Error(`unexpected route: ${req.url}`);
  }, async (baseUrl) => {
    const result = await runCli([
      "replay",
      "inspect-playbook",
      "--playbook-id",
      "pb_123",
      "--scope",
      "demo",
      "--version",
      "3",
      "--mode",
      "strict",
      "--base-url",
      baseUrl,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis replay inspect-playbook");
    assert.equal(parsed.data.playbook.playbook_id, "pb_123");
    assert.equal(parsed.data.candidate.recommended_mode, "strict");
    assert.equal(parsed.data.request_ids.playbook_get, "req-get");
    assert.equal(parsed.data.request_ids.playbook_candidate, "req-candidate");
    assert.deepEqual(seen, ["/v1/memory/replay/playbooks/get", "/v1/memory/replay/playbooks/candidate"]);
  });
});
