import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function runRecoverCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/recover-cli.ts", ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
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

async function withJsonServer(handler) {
  const requests = [];
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body.length > 0 ? JSON.parse(body) : null,
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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    requests,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}

test("recover-aionis-doc-handoff publishes and recovers source documents", async () => {
  const server = await withJsonServer(async (req, res, requests) => {
    if (req.url === "/v1/handoff/store") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-recover-store" });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          commit_id: "commit-doc-recover-1",
          handoff: {
            anchor: "aionis-doc:workflow-001",
            handoff_kind: "task_handoff",
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/handoff/recover") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-recover-2" });
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
            handoff_text: "Recover this workflow.",
            next_action: "Resume execution",
          },
          execution_ready_handoff: {
            anchor: requests[1].body.anchor,
            handoff_text: "Recover this workflow.",
            next_action: "Resume execution",
            acceptance_checks: ["out.hero emitted"],
          },
          execution_state_v1: {
            current_stage: "patch",
          },
          execution_packet_v1: {
            state_id: "handoff-anchor:aionis-doc:workflow-001",
          },
          control_profile_v1: {
            profile: "patch",
          },
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  try {
    const result = await runRecoverCli([
      "packages/aionis-doc/fixtures/valid-workflow.aionis.md",
      "--base-url",
      server.baseUrl,
      "--scope",
      "default",
      "--compact",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.recover_result_version, "aionis_doc_recover_result_v1");
    assert.equal(parsed.publish_result.response.commit_id, "commit-doc-recover-1");
    assert.equal(parsed.recover_response.status, 200);
    assert.equal(parsed.recover_response.request_id, "req-doc-recover-2");
    assert.equal(parsed.recover_response.data.anchor, "aionis-doc:workflow-001");
    assert.equal(server.requests.length, 2);
    assert.equal(server.requests[0].url, "/v1/handoff/store");
    assert.equal(server.requests[1].url, "/v1/handoff/recover");
    assert.equal(server.requests[1].body.anchor, "aionis-doc:workflow-001");
    assert.equal(server.requests[1].body.handoff_kind, "task_handoff");
  } finally {
    await server.close();
  }
});

test("recover-aionis-doc-handoff can recover from a saved publish result", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-recover-cli-"));
  const publishResultPath = path.join(tmpDir, "publish-result.json");
  const server = await withJsonServer(async (req, res, requests) => {
    assert.equal(req.url, "/v1/handoff/recover");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        tenant_id: "default",
        scope: "default",
        handoff_kind: "task_handoff",
        anchor: requests[0].body.anchor,
        matched_nodes: 1,
        handoff: {
          anchor: requests[0].body.anchor,
          handoff_kind: "task_handoff",
          handoff_text: "Recovered from publish result.",
          next_action: "Continue",
        },
      }),
    );
  });

  try {
    writeFileSync(
      publishResultPath,
      JSON.stringify({
        publish_result_version: "aionis_doc_publish_result_v1",
        published_at: "2026-03-18T00:00:00.000Z",
        base_url: server.baseUrl,
        input_kind: "handoff-store-request",
        source_doc_id: "workflow-001",
        source_doc_version: "1.0.0",
        request: {
          anchor: "aionis-doc:workflow-001",
          handoff_kind: "task_handoff",
          scope: "default",
          memory_lane: "shared",
        },
        response: {
          status: 200,
          request_id: "req-existing-publish",
          tenant_id: "default",
          scope: "default",
          commit_id: "commit-existing",
          handoff_anchor: "aionis-doc:workflow-001",
          handoff_kind: "task_handoff",
        },
        handoff_store_request: {
          request_version: "aionis_doc_handoff_store_request_v1",
          anchor: "aionis-doc:workflow-001",
          handoff_kind: "task_handoff",
          scope: "default",
          memory_lane: "shared",
          repo_root: "/repo",
          file_path: "workflow.md",
          summary: "Workflow",
          handoff_text: "Publish result handoff",
          execution_state_v1: {},
          execution_packet_v1: {},
        },
      }),
      "utf8",
    );

    const result = await runRecoverCli([
      publishResultPath,
      "--input-kind",
      "publish-result",
      "--base-url",
      server.baseUrl,
      "--compact",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.input_kind, "publish-result");
    assert.equal(parsed.publish_result.response.commit_id, "commit-existing");
    assert.equal(parsed.recover_request.anchor, "aionis-doc:workflow-001");
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].body.anchor, "aionis-doc:workflow-001");
    assert.equal(server.requests[0].body.file_path, "workflow.md");
  } finally {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
