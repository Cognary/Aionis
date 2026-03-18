import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
  assert.match(result.stdout, /aionis doc execute/);
  assert.match(result.stdout, /aionis doc publish/);
  assert.match(result.stdout, /aionis doc recover/);
  assert.match(result.stdout, /aionis doc resume/);
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

test("sdk cli doc execute forwards to Aionis Doc execution runtime", () => {
  const result = runCli(["doc", "execute", workflowFixture, "--compact", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.execution_result_version, "aionis_doc_execution_result_v1");
  assert.equal(parsed.runtime_id, "local_demo_runtime_v1");
  assert.equal(parsed.status, "success");
  assert.equal(parsed.outputs["out.hero"].hero, "EVA helps founders and operators continue work without rediscovery.");
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

test("sdk cli doc resume captures pre/post feedback run lifecycle", async () => {
  const tmpDir = path.join(repoRoot, ".tmp-sdk-doc-resume");
  const recoverResultPath = path.join(tmpDir, "recover-result.json");
  let runLookupCount = 0;
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      recoverResultPath,
      JSON.stringify({
        recover_result_version: "aionis_doc_recover_result_v1",
        recovered_at: "2026-03-18T00:00:00.000Z",
        base_url: "http://127.0.0.1:3001",
        input_kind: "publish-result",
        source_doc_id: "workflow-001",
        source_doc_version: "1.0.0",
        publish_result: null,
        recover_request: {
          anchor: "aionis-doc:workflow-001",
        },
        recover_response: {
          status: 200,
          request_id: "req-sdk-doc-recover",
          data: {
            tenant_id: "default",
            scope: "default",
            handoff_kind: "task_handoff",
            anchor: "aionis-doc:workflow-001",
            matched_nodes: 1,
            handoff: {
              anchor: "aionis-doc:workflow-001",
              handoff_kind: "task_handoff",
              handoff_text: "Recovered from sdk cli.",
              next_action: "Resume execution",
            },
            execution_ready_handoff: {
              next_action: "Resume execution",
            },
            execution_result_summary: {
              runtime_id: "resume-demo",
              status: "partial",
            },
            execution_artifacts: [
              { ref: "artifact:sdk-resume:1", uri: "memory://artifacts/sdk-resume.json", kind: "resume" },
            ],
            execution_evidence: [
              { ref: "evidence:sdk-resume:1", claim: "Recovered continuity preserved", type: "claim" },
            ],
            execution_state_v1: {
              state_id: "state-sdk-resume-1",
              scope: "default",
              task_brief: "Resume execution",
              current_stage: "patch",
              active_role: "patch",
              owned_files: [],
              modified_files: [],
              pending_validations: [],
              completed_validations: [],
              last_accepted_hypothesis: null,
              rejected_paths: [],
              unresolved_blockers: [],
              rollback_notes: [],
              reviewer_contract: null,
              resume_anchor: null,
              updated_at: "2026-03-18T00:00:00.000Z",
              version: 1,
            },
            execution_packet_v1: {
              version: 1,
              state_id: "state-sdk-resume-1",
              current_stage: "patch",
              active_role: "patch",
              task_brief: "Resume execution",
              target_files: [],
              next_action: "Resume execution",
              hard_constraints: [],
              accepted_facts: [],
              rejected_paths: [],
              pending_validations: [],
              unresolved_blockers: [],
              rollback_notes: [],
              review_contract: null,
              resume_anchor: null,
              artifact_refs: ["artifact:sdk-resume:1"],
              evidence_refs: ["evidence:sdk-resume:1"],
            },
            control_profile_v1: {
              version: 1,
              profile: "patch",
              max_same_tool_streak: 2,
              max_no_progress_streak: 2,
              max_duplicate_observation_streak: 2,
              max_steps: 8,
              allow_broad_scan: false,
              allow_broad_test: false,
              escalate_on_blocker: true,
              reviewer_ready_required: false,
            },
          },
        },
      }),
      "utf8",
    );

    await withJsonServer(async (req, res, requests) => {
      if (req.url === "/v1/memory/context/assemble") {
        res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-context" });
        res.end(
          JSON.stringify({
            tenant_id: "default",
            scope: "default",
            execution_kernel: {
              packet_source_mode: "packet_input",
              execution_state_v1_present: true,
              execution_packet_v1_present: true,
            },
            assembly_summary: {
              selected_tool: null,
              context_est_tokens: 144,
            },
            layered_context: {
              merged_text: "# Static Context\n- Execution Side Outputs: artifact_1: ref=artifact:sdk-resume:1; uri=memory://artifacts/sdk-resume.json; kind=resume",
            },
          }),
        );
        return;
      }
      if (req.url === "/v1/memory/tools/select") {
        res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-tools" });
        res.end(
          JSON.stringify({
            tenant_id: "default",
            scope: "default",
            execution_kernel: {
              control_profile_origin: "continuity_delivered",
              execution_state_v1_present: true,
              execution_result_summary_present: true,
              execution_artifacts_count: 1,
              execution_evidence_count: 1,
              current_stage: "patch",
              active_role: "patch",
            },
            selection: {
              selected: "resume_patch",
              ordered: ["resume_patch", "request_review"],
              candidates: ["resume_patch", "request_review"],
              denied: [],
            },
            rules: { applied: {} },
            decision: {
              decision_id: "decision-sdk-doc-resume-1",
              run_id: requests[1].body.run_id,
            },
          }),
        );
        return;
      }
      if (req.url === "/v1/memory/tools/decision") {
        res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-decision" });
        res.end(
          JSON.stringify({
            tenant_id: "default",
            scope: "default",
            lookup_mode: "decision_id",
            decision: {
              decision_id: "decision-sdk-doc-resume-1",
              run_id: "run_sdk_doc_resume_001",
              selected_tool: "resume_patch",
            },
            lifecycle_summary: {
              decision_id: "decision-sdk-doc-resume-1",
              run_id: "run_sdk_doc_resume_001",
              selected_tool: "resume_patch",
            },
          }),
        );
        return;
      }
      if (req.url === "/v1/memory/tools/run") {
        runLookupCount += 1;
        res.writeHead(200, { "content-type": "application/json", "x-request-id": runLookupCount === 1 ? "req-sdk-doc-run" : "req-sdk-doc-run-after-feedback" });
        res.end(
          JSON.stringify({
            tenant_id: "default",
            scope: "default",
            run_id: "run_sdk_doc_resume_001",
            lifecycle: {
              status: runLookupCount === 1 ? "decision_recorded" : "feedback_linked",
              decision_count: 1,
              latest_feedback_at: runLookupCount === 1 ? null : "2026-03-18T00:00:02.000Z",
            },
            decisions: [
              {
                decision_id: "decision-sdk-doc-resume-1",
                run_id: "run_sdk_doc_resume_001",
                selected_tool: "resume_patch",
              },
            ],
            feedback: runLookupCount === 1
              ? undefined
              : {
                  total: 1,
                  by_outcome: { positive: 1, negative: 0, neutral: 0 },
                  linked_decision_count: 1,
                  tools_feedback_count: 1,
                  recent: [],
                },
            lifecycle_summary: {
              run_id: "run_sdk_doc_resume_001",
              status: runLookupCount === 1 ? "decision_recorded" : "feedback_linked",
              latest_selected_tool: "resume_patch",
            },
          }),
        );
        return;
      }
      if (req.url === "/v1/memory/tools/feedback") {
        res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-feedback" });
        res.end(
          JSON.stringify({
            ok: true,
            tenant_id: "default",
            scope: "default",
            updated_rules: 1,
            rule_node_ids: ["rule:sdk-resume-patch"],
            decision_id: "decision-sdk-doc-resume-1",
            decision_uri: "memory://decision/decision-sdk-doc-resume-1",
            decision_link_mode: "provided",
            commit_id: "commit-sdk-doc-feedback-1",
            commit_uri: "memory://commit/commit-sdk-doc-feedback-1",
          }),
        );
        return;
      }
      res.writeHead(404).end();
    }, async ({ baseUrl, requests }) => {
      const result = await runCliAsync([
        "doc",
        "resume",
        recoverResultPath,
        "--input-kind",
        "recover-result",
        "--base-url",
        baseUrl,
        "--candidate",
        "resume_patch",
        "--candidate",
        "request_review",
        "--run-id",
        "run_sdk_doc_resume_001",
        "--feedback-outcome",
        "positive",
        "--feedback-note",
        "resume_patch worked",
        "--feedback-input-text",
        "sdk resume feedback",
        "--compact",
        "--json",
      ]);
      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.resume_result_version, "aionis_doc_resume_result_v1");
      assert.equal(parsed.run_id, "run_sdk_doc_resume_001");
      assert.equal(parsed.resume_summary.selected_tool, "resume_patch");
      assert.equal(parsed.resume_summary.decision_id, "decision-sdk-doc-resume-1");
      assert.equal(parsed.resume_summary.resume_state, "lifecycle_advanced");
      assert.equal(parsed.resume_summary.feedback_written, true);
      assert.equal(parsed.resume_summary.feedback_outcome, "positive");
      assert.equal(parsed.resume_summary.pre_feedback_run_status, "decision_recorded");
      assert.equal(parsed.resume_summary.post_feedback_run_status, "feedback_linked");
      assert.equal(parsed.resume_summary.lifecycle_transition, "decision_recorded -> feedback_linked");
      assert.equal(parsed.resume_summary.lifecycle_advanced, true);
      assert.equal(parsed.resume_summary.feedback_updated_rules, 1);
      assert.equal(parsed.tools_select_response.data.selection.selected, "resume_patch");
      assert.equal(parsed.tools_decision_response.data.decision.selected_tool, "resume_patch");
      assert.equal(parsed.tools_run_response.data.lifecycle.status, "decision_recorded");
      assert.equal(parsed.tools_run_post_feedback_response.request_id, "req-sdk-doc-run-after-feedback");
      assert.equal(parsed.tools_run_post_feedback_response.data.lifecycle.status, "feedback_linked");
      assert.equal(parsed.tools_run_post_feedback_response.data.feedback.total, 1);
      assert.equal(parsed.tools_feedback_response.request_id, "req-sdk-doc-feedback");
      assert.equal(parsed.tools_feedback_response.data.decision_link_mode, "provided");
      assert.equal(requests.length, 6);
      assert.equal(requests[0].url, "/v1/memory/context/assemble");
      assert.equal(requests[1].url, "/v1/memory/tools/select");
      assert.equal(requests[1].body.execution_artifacts[0].ref, "artifact:sdk-resume:1");
      assert.equal(requests[2].url, "/v1/memory/tools/decision");
      assert.equal(requests[2].body.decision_id, "decision-sdk-doc-resume-1");
      assert.equal(requests[3].url, "/v1/memory/tools/run");
      assert.equal(requests[3].body.run_id, "run_sdk_doc_resume_001");
      assert.equal(requests[4].url, "/v1/memory/tools/feedback");
      assert.equal(requests[4].body.selected_tool, "resume_patch");
      assert.equal(requests[4].body.outcome, "positive");
      assert.equal(requests[5].url, "/v1/memory/tools/run");
      assert.equal(requests[5].body.include_feedback, true);
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
