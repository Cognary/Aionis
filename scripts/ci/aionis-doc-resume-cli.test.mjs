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

function runResumeCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/resume-cli.ts", ...args], {
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
      resolve({ status: code, signal, stdout, stderr });
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
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function buildRecoverResult(baseUrl) {
  return {
    recover_result_version: "aionis_doc_recover_result_v1",
    recovered_at: "2026-03-18T00:00:00.000Z",
    base_url: baseUrl,
    input_kind: "publish-result",
    source_doc_id: "workflow-001",
    source_doc_version: "1.0.0",
    publish_result: null,
    recover_request: {
      anchor: "aionis-doc:workflow-001",
    },
    recover_response: {
      status: 200,
      request_id: "req-recover-1",
      data: {
        tenant_id: "default",
        scope: "default",
        handoff_kind: "task_handoff",
        anchor: "aionis-doc:workflow-001",
        matched_nodes: 1,
        handoff: {
          anchor: "aionis-doc:workflow-001",
          handoff_kind: "task_handoff",
          handoff_text: "Recovered handoff",
          next_action: "Resume the workflow",
        },
        execution_ready_handoff: {
          next_action: "Resume the workflow",
        },
        execution_result_summary: {
          runtime_id: "resume-demo",
          status: "partial",
        },
        execution_artifacts: [
          { ref: "artifact:resume:1", uri: "memory://artifacts/resume.json", kind: "resume" },
        ],
        execution_evidence: [
          { ref: "evidence:resume:1", claim: "Recovered continuity preserved", type: "claim" },
        ],
        execution_state_v1: {
          state_id: "state-resume-1",
          scope: "default",
          task_brief: "Resume the workflow",
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
          state_id: "state-resume-1",
          current_stage: "patch",
          active_role: "patch",
          task_brief: "Resume the workflow",
          target_files: [],
          next_action: "Resume the workflow",
          hard_constraints: [],
          accepted_facts: [],
          rejected_paths: [],
          pending_validations: [],
          unresolved_blockers: [],
          rollback_notes: [],
          review_contract: null,
          resume_anchor: null,
          artifact_refs: ["artifact:resume:1"],
          evidence_refs: ["evidence:resume:1"],
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
  };
}

function createResumeMockHandler(options = {}) {
  const {
    runId = "run_doc_resume_cli_001",
    decisionId = "decision-resume-1",
    selectedTool = "resume_patch",
    firstRunStatus = "decision_recorded",
    secondRunStatus = null,
    feedbackUpdatedRules = 1,
  } = options;
  let runLookupCount = 0;
  return async (req, res, requests) => {
    if (req.url === "/v1/memory/context/assemble") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-resume-context" });
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
            context_est_tokens: 123,
          },
          layered_context: {
            merged_text: "# Static Context\n- Execution Side Outputs: artifact_1: ref=artifact:resume:1; uri=memory://artifacts/resume.json; kind=resume\nevidence_1: ref=evidence:resume:1; claim=Recovered continuity preserved; type=claim",
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/select") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-resume-tools" });
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
            selected: selectedTool,
            ordered: [selectedTool, "request_review"],
            candidates: [selectedTool, "request_review"],
            denied: [],
          },
          rules: { applied: {} },
          decision: {
            decision_id: decisionId,
            run_id: requests[1].body.run_id,
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/decision") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-resume-decision" });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          lookup_mode: "decision_id",
          decision: {
            decision_id: decisionId,
            run_id: runId,
            selected_tool: selectedTool,
          },
          lifecycle_summary: {
            decision_id: decisionId,
            run_id: runId,
            selected_tool: selectedTool,
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/run") {
      runLookupCount += 1;
      const effectiveStatus = runLookupCount === 1 || !secondRunStatus ? firstRunStatus : secondRunStatus;
      res.writeHead(200, {
        "content-type": "application/json",
        "x-request-id": runLookupCount === 1 ? "req-doc-resume-run" : "req-doc-resume-run-after-feedback",
      });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          run_id: runId,
          lifecycle: {
            status: effectiveStatus,
            decision_count: 1,
            latest_feedback_at: runLookupCount === 1 ? null : "2026-03-18T00:00:02.000Z",
          },
          decisions: [
            {
              decision_id: decisionId,
              run_id: runId,
              selected_tool: selectedTool,
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
            run_id: runId,
            status: effectiveStatus,
            latest_selected_tool: selectedTool,
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/feedback") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-resume-feedback" });
      res.end(
        JSON.stringify({
          ok: true,
          tenant_id: "default",
          scope: "default",
          updated_rules: feedbackUpdatedRules,
          rule_node_ids: [`rule:${selectedTool}`],
          decision_id: decisionId,
          decision_uri: `memory://decision/${decisionId}`,
          decision_link_mode: "provided",
          commit_id: "commit-resume-feedback-1",
          commit_uri: "memory://commit/commit-resume-feedback-1",
        }),
      );
      return;
    }
    res.writeHead(404).end();
  };
}

test("resume-aionis-doc-runtime captures pre/post feedback run lifecycle", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-resume-cli-"));
  const recoverResultPath = path.join(tmpDir, "recover-result.json");
  let runLookupCount = 0;
  const server = await withJsonServer(async (req, res, requests) => {
    if (req.url === "/v1/memory/context/assemble") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-resume-context" });
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
            context_est_tokens: 123,
          },
          layered_context: {
            merged_text: "# Static Context\n- Execution Side Outputs: artifact_1: ref=artifact:resume:1; uri=memory://artifacts/resume.json; kind=resume\nevidence_1: ref=evidence:resume:1; claim=Recovered continuity preserved; type=claim",
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/select") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-resume-tools" });
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
            decision_id: "decision-resume-1",
            run_id: requests[1].body.run_id,
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/decision") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-resume-decision" });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          lookup_mode: "decision_id",
          decision: {
            decision_id: "decision-resume-1",
            run_id: "run_doc_resume_cli_001",
            selected_tool: "resume_patch",
          },
          lifecycle_summary: {
            decision_id: "decision-resume-1",
            run_id: "run_doc_resume_cli_001",
            selected_tool: "resume_patch",
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/run") {
      runLookupCount += 1;
      res.writeHead(200, { "content-type": "application/json", "x-request-id": runLookupCount === 1 ? "req-doc-resume-run" : "req-doc-resume-run-after-feedback" });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          run_id: "run_doc_resume_cli_001",
          lifecycle: {
            status: runLookupCount === 1 ? "decision_recorded" : "feedback_linked",
            decision_count: 1,
            latest_feedback_at: runLookupCount === 1 ? null : "2026-03-18T00:00:02.000Z",
          },
          decisions: [
            {
              decision_id: "decision-resume-1",
              run_id: "run_doc_resume_cli_001",
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
            run_id: "run_doc_resume_cli_001",
            status: runLookupCount === 1 ? "decision_recorded" : "feedback_linked",
            latest_selected_tool: "resume_patch",
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/feedback") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-doc-resume-feedback" });
      res.end(
        JSON.stringify({
          ok: true,
          tenant_id: "default",
          scope: "default",
          updated_rules: 1,
          rule_node_ids: ["rule:resume_patch"],
          decision_id: "decision-resume-1",
          decision_uri: "memory://decision/decision-resume-1",
          decision_link_mode: "provided",
          commit_id: "commit-resume-feedback-1",
          commit_uri: "memory://commit/commit-resume-feedback-1",
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  try {
    writeFileSync(
      recoverResultPath,
      JSON.stringify({
        recover_result_version: "aionis_doc_recover_result_v1",
        recovered_at: "2026-03-18T00:00:00.000Z",
        base_url: server.baseUrl,
        input_kind: "publish-result",
        source_doc_id: "workflow-001",
        source_doc_version: "1.0.0",
        publish_result: null,
        recover_request: {
          anchor: "aionis-doc:workflow-001",
        },
        recover_response: {
          status: 200,
          request_id: "req-recover-1",
          data: {
            tenant_id: "default",
            scope: "default",
            handoff_kind: "task_handoff",
            anchor: "aionis-doc:workflow-001",
            matched_nodes: 1,
            handoff: {
              anchor: "aionis-doc:workflow-001",
              handoff_kind: "task_handoff",
              handoff_text: "Recovered handoff",
              next_action: "Resume the workflow",
            },
            execution_ready_handoff: {
              next_action: "Resume the workflow",
            },
            execution_result_summary: {
              runtime_id: "resume-demo",
              status: "partial",
            },
            execution_artifacts: [
              { ref: "artifact:resume:1", uri: "memory://artifacts/resume.json", kind: "resume" },
            ],
            execution_evidence: [
              { ref: "evidence:resume:1", claim: "Recovered continuity preserved", type: "claim" },
            ],
            execution_state_v1: {
              state_id: "state-resume-1",
              scope: "default",
              task_brief: "Resume the workflow",
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
              state_id: "state-resume-1",
              current_stage: "patch",
              active_role: "patch",
              task_brief: "Resume the workflow",
              target_files: [],
              next_action: "Resume the workflow",
              hard_constraints: [],
              accepted_facts: [],
              rejected_paths: [],
              pending_validations: [],
              unresolved_blockers: [],
              rollback_notes: [],
              review_contract: null,
              resume_anchor: null,
              artifact_refs: ["artifact:resume:1"],
              evidence_refs: ["evidence:resume:1"],
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

    const result = await runResumeCli([
      recoverResultPath,
      "--input-kind",
      "recover-result",
      "--base-url",
      server.baseUrl,
      "--candidate",
      "resume_patch",
      "--candidate",
      "request_review",
      "--run-id",
      "run_doc_resume_cli_001",
      "--feedback-outcome",
      "positive",
      "--feedback-note",
      "resume_patch worked",
      "--feedback-input-text",
      "resume feedback for recovered continuity",
      "--compact",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.resume_result_version, "aionis_doc_resume_result_v1");
    assert.equal(parsed.run_id, "run_doc_resume_cli_001");
    assert.equal(parsed.resume_summary.selected_tool, "resume_patch");
    assert.equal(parsed.resume_summary.decision_id, "decision-resume-1");
    assert.equal(parsed.resume_summary.resume_state, "lifecycle_advanced");
    assert.equal(parsed.resume_summary.feedback_written, true);
    assert.equal(parsed.resume_summary.feedback_outcome, "positive");
    assert.equal(parsed.resume_summary.pre_feedback_run_status, "decision_recorded");
    assert.equal(parsed.resume_summary.post_feedback_run_status, "feedback_linked");
    assert.equal(parsed.resume_summary.lifecycle_transition, "decision_recorded -> feedback_linked");
    assert.equal(parsed.resume_summary.lifecycle_advanced, true);
    assert.equal(parsed.resume_summary.feedback_updated_rules, 1);
    assert.equal(parsed.context_assemble_response.request_id, "req-doc-resume-context");
    assert.equal(parsed.tools_select_response.request_id, "req-doc-resume-tools");
    assert.equal(parsed.tools_decision_response.request_id, "req-doc-resume-decision");
    assert.equal(parsed.tools_run_response.request_id, "req-doc-resume-run");
    assert.equal(parsed.tools_select_response.data.selection.selected, "resume_patch");
    assert.equal(parsed.tools_decision_response.data.decision.selected_tool, "resume_patch");
    assert.equal(parsed.tools_run_response.data.lifecycle.status, "decision_recorded");
    assert.equal(parsed.tools_run_post_feedback_response.request_id, "req-doc-resume-run-after-feedback");
    assert.equal(parsed.tools_run_post_feedback_response.data.lifecycle.status, "feedback_linked");
    assert.equal(parsed.tools_run_post_feedback_response.data.feedback.total, 1);
    assert.equal(parsed.tools_feedback_response.request_id, "req-doc-resume-feedback");
    assert.equal(parsed.tools_feedback_response.data.decision_link_mode, "provided");
    assert.equal(parsed.tools_feedback_request.selected_tool, "resume_patch");
    assert.equal(server.requests.length, 6);
    assert.equal(server.requests[0].url, "/v1/memory/context/assemble");
    assert.equal(server.requests[0].body.execution_artifacts[0].ref, "artifact:resume:1");
    assert.equal(server.requests[0].body.execution_evidence[0].ref, "evidence:resume:1");
    assert.equal(server.requests[1].url, "/v1/memory/tools/select");
    assert.equal(server.requests[1].body.context.control_profile_v1.profile, "patch");
    assert.equal(server.requests[1].body.execution_artifacts[0].ref, "artifact:resume:1");
    assert.equal(server.requests[1].body.run_id, "run_doc_resume_cli_001");
    assert.equal(server.requests[2].url, "/v1/memory/tools/decision");
    assert.equal(server.requests[2].body.decision_id, "decision-resume-1");
    assert.equal(server.requests[3].url, "/v1/memory/tools/run");
    assert.equal(server.requests[3].body.run_id, "run_doc_resume_cli_001");
    assert.equal(server.requests[4].url, "/v1/memory/tools/feedback");
    assert.equal(server.requests[4].body.decision_id, "decision-resume-1");
    assert.equal(server.requests[4].body.selected_tool, "resume_patch");
    assert.equal(server.requests[4].body.outcome, "positive");
    assert.equal(server.requests[5].url, "/v1/memory/tools/run");
    assert.equal(server.requests[5].body.run_id, "run_doc_resume_cli_001");
    assert.equal(server.requests[5].body.include_feedback, true);
  } finally {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("resume-aionis-doc-runtime reports inspection_only when no feedback is requested", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-resume-cli-inspection-"));
  const recoverResultPath = path.join(tmpDir, "recover-result.json");
  const server = await withJsonServer(createResumeMockHandler());

  try {
    writeFileSync(recoverResultPath, JSON.stringify(buildRecoverResult(server.baseUrl)), "utf8");
    const result = await runResumeCli([
      recoverResultPath,
      "--input-kind",
      "recover-result",
      "--base-url",
      server.baseUrl,
      "--candidate",
      "resume_patch",
      "--candidate",
      "request_review",
      "--run-id",
      "run_doc_resume_cli_001",
      "--compact",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.resume_summary.resume_state, "inspection_only");
    assert.equal(parsed.resume_summary.feedback_written, false);
    assert.equal(parsed.resume_summary.feedback_outcome, null);
    assert.equal(parsed.resume_summary.pre_feedback_run_status, "decision_recorded");
    assert.equal(parsed.resume_summary.post_feedback_run_status, null);
    assert.equal(parsed.resume_summary.lifecycle_transition, null);
    assert.equal(parsed.resume_summary.lifecycle_advanced, false);
    assert.equal(parsed.resume_summary.feedback_updated_rules, null);
    assert.equal(parsed.tools_feedback_request, null);
    assert.equal(parsed.tools_feedback_response, null);
    assert.equal(parsed.tools_run_post_feedback_response, null);
    assert.equal(server.requests.length, 4);
    assert.equal(server.requests[0].url, "/v1/memory/context/assemble");
    assert.equal(server.requests[1].url, "/v1/memory/tools/select");
    assert.equal(server.requests[2].url, "/v1/memory/tools/decision");
    assert.equal(server.requests[3].url, "/v1/memory/tools/run");
  } finally {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("resume-aionis-doc-runtime reports feedback_applied when feedback is written without lifecycle advancement", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-resume-cli-feedback-applied-"));
  const recoverResultPath = path.join(tmpDir, "recover-result.json");
  const server = await withJsonServer(
    createResumeMockHandler({
      firstRunStatus: "decision_recorded",
      secondRunStatus: "decision_recorded",
      feedbackUpdatedRules: 1,
    }),
  );

  try {
    writeFileSync(recoverResultPath, JSON.stringify(buildRecoverResult(server.baseUrl)), "utf8");
    const result = await runResumeCli([
      recoverResultPath,
      "--input-kind",
      "recover-result",
      "--base-url",
      server.baseUrl,
      "--candidate",
      "resume_patch",
      "--candidate",
      "request_review",
      "--run-id",
      "run_doc_resume_cli_001",
      "--feedback-outcome",
      "positive",
      "--feedback-note",
      "resume_patch worked",
      "--feedback-input-text",
      "resume feedback without lifecycle status change",
      "--compact",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.resume_summary.resume_state, "feedback_applied");
    assert.equal(parsed.resume_summary.feedback_written, true);
    assert.equal(parsed.resume_summary.feedback_outcome, "positive");
    assert.equal(parsed.resume_summary.pre_feedback_run_status, "decision_recorded");
    assert.equal(parsed.resume_summary.post_feedback_run_status, "decision_recorded");
    assert.equal(parsed.resume_summary.lifecycle_transition, null);
    assert.equal(parsed.resume_summary.lifecycle_advanced, false);
    assert.equal(parsed.resume_summary.feedback_updated_rules, 1);
    assert.equal(parsed.tools_feedback_response.data.decision_link_mode, "provided");
    assert.equal(parsed.tools_run_response.data.lifecycle.status, "decision_recorded");
    assert.equal(parsed.tools_run_post_feedback_response.data.lifecycle.status, "decision_recorded");
    assert.equal(parsed.tools_run_post_feedback_response.data.feedback.total, 1);
    assert.equal(server.requests.length, 6);
    assert.equal(server.requests[4].url, "/v1/memory/tools/feedback");
    assert.equal(server.requests[5].url, "/v1/memory/tools/run");
  } finally {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
