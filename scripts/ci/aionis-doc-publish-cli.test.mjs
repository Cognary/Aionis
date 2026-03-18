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

function runPublishCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/publish-cli.ts", ...args], {
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
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body.length > 0 ? JSON.parse(body) : null,
    });
    await handler(req, res, requests);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return { baseUrl, requests, close: async () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())) };
  } catch (error) {
    await new Promise((resolve) => server.close(() => resolve()));
    throw error;
  }
}

test("publish-aionis-doc-handoff publishes source documents to /v1/handoff/store", async () => {
  const server = await withJsonServer(async (_req, res) => {
    res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-publish-1" });
    res.end(
      JSON.stringify({
        tenant_id: "default",
        scope: "default",
        commit_id: "commit-doc-1",
        commit_uri: "aionis://default/default/commit/commit-doc-1",
        handoff: {
          anchor: "aionis-doc:workflow-001",
          handoff_kind: "task_handoff",
        },
      }),
    );
  });

  try {
    const result = await runPublishCli([
      "packages/aionis-doc/fixtures/valid-workflow.aionis.md",
      "--base-url",
      server.baseUrl,
      "--scope",
      "default",
      "--compact",
      "--api-key",
      "api-key-1",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.publish_result_version, "aionis_doc_publish_result_v1");
    assert.equal(parsed.response.commit_id, "commit-doc-1");
    assert.equal(parsed.response.request_id, "req-publish-1");
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].url, "/v1/handoff/store");
    assert.equal(server.requests[0].headers["x-api-key"], "api-key-1");
    assert.equal(server.requests[0].body.handoff_kind, "task_handoff");
    assert.equal(server.requests[0].body.execution_state_v1.current_stage, "patch");
  } finally {
    await server.close();
  }
});

test("publish-aionis-doc-handoff supports handoff-store-request input mode", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-publish-cli-"));
  const requestPath = path.join(tmpDir, "store-request.json");
  const server = await withJsonServer(async (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        tenant_id: "default",
        scope: "default",
        commit_id: "commit-doc-2",
        handoff: {
          anchor: "aionis-doc:demo-001",
          handoff_kind: "task_handoff",
        },
      }),
    );
  });

  try {
    writeFileSync(
      requestPath,
      JSON.stringify({
        request_version: "aionis_doc_handoff_store_request_v1",
        scope: "default",
        memory_lane: "shared",
        anchor: "aionis-doc:demo-001",
        handoff_kind: "task_handoff",
        summary: "Demo summary",
        handoff_text: "Demo handoff",
        execution_state_v1: { state_id: "s1", scope: "default", task_brief: "Demo", current_stage: "patch", active_role: "patch", owned_files: [], modified_files: [], pending_validations: [], completed_validations: [], last_accepted_hypothesis: null, rejected_paths: [], unresolved_blockers: [], rollback_notes: [], reviewer_contract: null, resume_anchor: null, updated_at: "2026-03-18T00:00:00.000Z", version: 1 },
        execution_packet_v1: { version: 1, state_id: "s1", current_stage: "patch", active_role: "patch", task_brief: "Demo", target_files: [], next_action: null, hard_constraints: [], accepted_facts: [], rejected_paths: [], pending_validations: [], unresolved_blockers: [], rollback_notes: [], review_contract: null, resume_anchor: null, artifact_refs: [], evidence_refs: [] },
      }),
      "utf8",
    );

    const result = await runPublishCli([
      requestPath,
      "--input-kind",
      "handoff-store-request",
      "--base-url",
      server.baseUrl,
      "--compact",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.input_kind, "handoff-store-request");
    assert.equal(parsed.response.commit_id, "commit-doc-2");
    assert.equal(server.requests[0].body.anchor, "aionis-doc:demo-001");
  } finally {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
