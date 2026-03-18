import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const workflowFixture = "packages/aionis-doc/fixtures/valid-workflow.aionis.md";

function runCli(args, env = {}) {
  return spawnSync(process.execPath, ["--import", "tsx", "packages/sdk/src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

function runCliAsync(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "packages/sdk/src/cli.ts", ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
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
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        status: code,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

async function withJsonServer(handler, fn) {
  const requests = [];
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body.trim() ? JSON.parse(body) : null,
    });
    await handler(req, res, requests);
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
    await fn({ baseUrl, requests });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("sdk cli help lists doc command family", () => {
  const result = runCli(["help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /aionis doc compile/);
  assert.match(result.stdout, /aionis doc publish/);
  assert.match(result.stdout, /aionis doc recover/);
});

test("sdk cli doc compile forwards to Aionis Doc compiler and tolerates --json", () => {
  const result = runCli(["doc", "compile", workflowFixture, "--emit", "graph", "--compact", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.command, "compile-aionis-doc");
  assert.equal(parsed.selected_artifact, "graph");
  assert.equal(typeof parsed.artifacts.graph.graph_id, "string");
  assert.equal(typeof parsed.artifacts.graph.doc_id, "string");
});

test("sdk cli doc publish forwards to handoff store through the main CLI", async () => {
  await withJsonServer(async (_req, res) => {
    res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-publish" });
    res.end(
      JSON.stringify({
        tenant_id: "default",
        scope: "default",
        commit_id: "commit-sdk-doc-1",
        commit_uri: "aionis://default/default/commit/commit-sdk-doc-1",
        handoff: {
          anchor: "aionis-doc:workflow-001",
          handoff_kind: "task_handoff",
        },
      }),
    );
  }, async ({ baseUrl, requests }) => {
    const result = await runCliAsync([
      "doc",
      "publish",
      workflowFixture,
      "--base-url",
      baseUrl,
      "--scope",
      "default",
      "--api-key",
      "sdk-doc-api-key",
      "--compact",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.publish_result_version, "aionis_doc_publish_result_v1");
    assert.equal(parsed.response.commit_id, "commit-sdk-doc-1");
    assert.equal(parsed.response.request_id, "req-sdk-doc-publish");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/v1/handoff/store");
    assert.equal(requests[0].headers["x-api-key"], "sdk-doc-api-key");
    assert.equal(requests[0].body.handoff_kind, "task_handoff");
    assert.equal(requests[0].body.execution_state_v1.current_stage, "patch");
  });
});

test("sdk cli doc recover publishes then recovers through the main CLI", async () => {
  await withJsonServer(async (req, res, requests) => {
    if (req.url === "/v1/handoff/store") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-store" });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          commit_id: "commit-sdk-doc-recover",
          handoff: {
            anchor: "aionis-doc:workflow-001",
            handoff_kind: "task_handoff",
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/handoff/recover") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-recover" });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          handoff_kind: "task_handoff",
          anchor: requests[1].body.anchor,
          matched_nodes: 1,
          handoff: {
            anchor: requests[1].body.anchor,
            handoff_kind: "task_handoff",
            handoff_text: "Recovered from sdk cli.",
            next_action: "Resume execution",
          },
        }),
      );
      return;
    }
    res.writeHead(404).end();
  }, async ({ baseUrl, requests }) => {
    const result = await runCliAsync([
      "doc",
      "recover",
      workflowFixture,
      "--base-url",
      baseUrl,
      "--scope",
      "default",
      "--compact",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.recover_result_version, "aionis_doc_recover_result_v1");
    assert.equal(parsed.publish_result.response.commit_id, "commit-sdk-doc-recover");
    assert.equal(parsed.recover_response.request_id, "req-sdk-doc-recover");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "/v1/handoff/store");
    assert.equal(requests[1].url, "/v1/handoff/recover");
    assert.equal(requests[1].body.anchor, "aionis-doc:workflow-001");
  });
});
