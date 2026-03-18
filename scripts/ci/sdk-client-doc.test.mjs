import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";

import { AionisClient } from "../../packages/sdk/src/index.ts";

async function withJsonServer(handler, fn) {
  const requests = [];
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
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
  if (!address || typeof address === "string") throw new Error("failed to start mock server");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn({ baseUrl, requests });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
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
          handoff_text: "Recovered from sdk client.",
          next_action: "Resume execution",
        },
        execution_ready_handoff: {
          next_action: "Resume execution",
          handoff_text: "Recovered from sdk client.",
          acceptance_checks: [],
        },
        execution_result_summary: {
          runtime_id: "sdk-doc-runtime",
          status: "partial",
        },
        execution_artifacts: [
          { ref: "artifact:sdk:1", uri: "memory://artifacts/sdk.json", kind: "sdk_artifact" },
        ],
        execution_evidence: [
          { ref: "evidence:sdk:1", claim: "Recovered continuity preserved", type: "claim" },
        ],
        execution_state_v1: {
          state_id: "state-sdk-1",
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
          state_id: "state-sdk-1",
          task_brief: "Resume execution",
          hard_constraints: [],
          accepted_facts: [],
          rejected_paths: [],
          pending_validations: [],
          rollback_notes: [],
          review_contract: null,
          resume_anchor: null,
          artifact_refs: ["artifact:sdk:1"],
          evidence_refs: ["evidence:sdk:1"],
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
    runId = "run_sdk_doc_001",
    decisionId = "decision-sdk-doc-1",
    selectedTool = "resume_patch",
    firstRunStatus = "decision_recorded",
    secondRunStatus = null,
    feedbackUpdatedRules = 1,
  } = options;
  let runLookupCount = 0;
  return async (req, res, requests) => {
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
          layered_context: {
            merged_text: "# Static Context\n- Resumed from sdk helper",
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/select") {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-select" });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          candidates: requests.at(-1)?.body?.candidates ?? [selectedTool],
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
            run_id: requests.at(-1)?.body?.run_id ?? runId,
            selected_tool: selectedTool,
            policy_sha256: "policy-sdk-doc",
            source_rule_ids: [],
            created_at: "2026-03-18T00:00:00.000Z",
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
            decision_id: decisionId,
            decision_kind: "tools_select",
            run_id: runId,
            selected_tool: selectedTool,
            candidates: [selectedTool, "request_review"],
            context_sha256: "ctx-sdk-doc",
            policy_sha256: "policy-sdk-doc",
            source_rule_ids: [],
            metadata: {},
            created_at: "2026-03-18T00:00:00.000Z",
            commit_id: null,
          },
        }),
      );
      return;
    }
    if (req.url === "/v1/memory/tools/run") {
      runLookupCount += 1;
      const status = runLookupCount === 1 ? firstRunStatus : secondRunStatus ?? firstRunStatus;
      res.writeHead(200, { "content-type": "application/json", "x-request-id": `req-sdk-doc-run-${runLookupCount}` });
      res.end(
        JSON.stringify({
          tenant_id: "default",
          scope: "default",
          run_id: runId,
          lifecycle: {
            status,
            decision_count: 1,
            latest_decision_at: "2026-03-18T00:00:00.000Z",
            latest_feedback_at: runLookupCount > 1 ? "2026-03-18T00:01:00.000Z" : null,
          },
          decisions: [
            {
              decision_id: decisionId,
              decision_kind: "tools_select",
              run_id: runId,
              selected_tool: selectedTool,
              candidates: [selectedTool, "request_review"],
              context_sha256: "ctx-sdk-doc",
              policy_sha256: "policy-sdk-doc",
              source_rule_ids: [],
              metadata: {},
              created_at: "2026-03-18T00:00:00.000Z",
              commit_id: null,
            },
          ],
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
          updated_rules: feedbackUpdatedRules,
          rule_node_ids: ["rule-sdk-doc-1"],
          commit_id: "commit-sdk-doc-feedback",
          commit_uri: "aionis://default/default/commit/commit-sdk-doc-feedback",
          commit_hash: null,
          decision_id: decisionId,
          decision_uri: "aionis://default/default/decision/decision-sdk-doc-1",
          decision_link_mode: "provided",
        }),
      );
      return;
    }
    res.writeHead(404).end();
  };
}

test("AionisClient.docResume returns inspection_only without feedback", async () => {
  await withJsonServer(createResumeMockHandler(), async ({ baseUrl, requests }) => {
    const client = new AionisClient({ base_url: baseUrl, api_key: "sdk-doc-key" });
    const result = await client.docResume({
      recover_result: buildRecoverResult(baseUrl),
      candidates: ["resume_patch", "request_review"],
      run_id: "run-sdk-doc-inspection",
    });

    assert.equal(result.resume_result_version, "aionis_doc_resume_result_v1");
    assert.equal(result.resume_summary.resume_state, "inspection_only");
    assert.equal(result.resume_summary.feedback_written, false);
    assert.equal(result.tools_feedback_request, null);
    assert.equal(result.tools_run_post_feedback_response, null);
    assert.equal(requests.length, 4);
    assert.equal(requests[0].url, "/v1/memory/context/assemble");
    assert.equal(requests[1].url, "/v1/memory/tools/select");
    assert.equal(requests[2].url, "/v1/memory/tools/decision");
    assert.equal(requests[3].url, "/v1/memory/tools/run");
    assert.equal(requests[0].headers["x-api-key"], "sdk-doc-key");
    assert.equal(requests[0].body.execution_artifacts.length, 1);
    assert.equal(requests[1].body.execution_evidence.length, 1);
  });
});

test("AionisClient.docRecover returns a typed recover envelope", async () => {
  await withJsonServer(async (req, res) => {
    if (req.url !== "/v1/handoff/recover") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-recover" });
    res.end(
      JSON.stringify(buildRecoverResult("http://unused.example").recover_response.data),
    );
  }, async ({ baseUrl, requests }) => {
    const client = new AionisClient({ base_url: baseUrl });
    const result = await client.docRecover({
      recover_request: {
        anchor: "aionis-doc:workflow-001",
        scope: "default",
      },
      input_kind: "handoff-store-request",
      source_doc_id: "workflow-001",
      source_doc_version: "1.0.0",
    });

    assert.equal(result.recover_result_version, "aionis_doc_recover_result_v1");
    assert.equal(result.input_kind, "handoff-store-request");
    assert.equal(result.source_doc_id, "workflow-001");
    assert.equal(result.recover_response.request_id, "req-sdk-doc-recover");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/v1/handoff/recover");
    assert.equal(requests[0].body.anchor, "aionis-doc:workflow-001");
  });
});

test("AionisClient.docResume returns lifecycle_advanced after feedback", async () => {
  await withJsonServer(
    createResumeMockHandler({ secondRunStatus: "feedback_linked", feedbackUpdatedRules: 2 }),
    async ({ baseUrl, requests }) => {
      const client = new AionisClient({ base_url: baseUrl });
      const result = await client.docResume({
        recover_result: buildRecoverResult(baseUrl),
        candidates: ["resume_patch", "request_review"],
        feedback_outcome: "positive",
        feedback_note: "Resume helper confirmed the selected tool.",
      });

      assert.equal(result.resume_summary.resume_state, "lifecycle_advanced");
      assert.equal(result.resume_summary.lifecycle_transition, "decision_recorded -> feedback_linked");
      assert.equal(result.resume_summary.feedback_updated_rules, 2);
      assert.equal(result.tools_feedback_request?.selected_tool, "resume_patch");
      assert.equal(result.tools_feedback_response?.data.updated_rules, 2);
      assert.equal(result.tools_run_response?.data.lifecycle.status, "decision_recorded");
      assert.equal(result.tools_run_post_feedback_response?.data.lifecycle.status, "feedback_linked");
      assert.equal(requests.length, 6);
      assert.equal(requests[4].url, "/v1/memory/tools/feedback");
      assert.equal(requests[5].url, "/v1/memory/tools/run");
      assert.equal(requests[5].body.include_feedback, true);
    },
  );
});

test("AionisClient.docRecoverAndResume chains recover and resume", async () => {
  const resumeHandler = createResumeMockHandler({ secondRunStatus: "feedback_linked" });
  await withJsonServer(
    async (req, res, requests) => {
      if (req.url === "/v1/handoff/recover") {
        res.writeHead(200, { "content-type": "application/json", "x-request-id": "req-sdk-doc-recover-chain" });
        res.end(JSON.stringify(buildRecoverResult("http://unused.example").recover_response.data));
        return;
      }
      return resumeHandler(req, res, requests);
    },
    async ({ baseUrl, requests }) => {
      const client = new AionisClient({ base_url: baseUrl });
      const result = await client.docRecoverAndResume({
        recover_request: {
          anchor: "aionis-doc:workflow-001",
          scope: "default",
        },
        input_kind: "handoff-store-request",
        source_doc_id: "workflow-001",
        source_doc_version: "1.0.0",
        candidates: ["resume_patch", "request_review"],
        feedback_outcome: "positive",
      });

      assert.equal(result.recover_result?.recover_response.request_id, "req-sdk-doc-recover-chain");
      assert.equal(result.resume_summary.resume_state, "lifecycle_advanced");
      assert.equal(requests[0].url, "/v1/handoff/recover");
      assert.equal(requests[1].url, "/v1/memory/context/assemble");
      assert.equal(requests[2].url, "/v1/memory/tools/select");
    },
  );
});
