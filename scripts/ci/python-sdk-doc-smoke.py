#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PY_SDK_SRC = os.path.join(ROOT, "packages", "python-sdk", "src")
if PY_SDK_SRC not in sys.path:
    sys.path.insert(0, PY_SDK_SRC)

from aionis_sdk import AionisClient  # noqa: E402


class MockHandler(BaseHTTPRequestHandler):
    run_lookup_count = 0
    requests: list[dict[str, object]] = []

    def log_message(self, fmt: str, *args: object) -> None:
        return None

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length) if length > 0 else b""
        body = json.loads(raw.decode("utf-8")) if raw else None
        self.__class__.requests.append(
            {
                "path": self.path,
                "headers": dict(self.headers.items()),
                "body": body,
            }
        )

        if self.path == "/v1/handoff/recover":
            self._write_json(
                {
                    "tenant_id": "default",
                    "scope": "default",
                    "handoff_kind": "task_handoff",
                    "anchor": "aionis-doc:workflow-001",
                    "matched_nodes": 1,
                    "handoff": {
                        "anchor": "aionis-doc:workflow-001",
                        "handoff_kind": "task_handoff",
                        "handoff_text": "Recovered from python sdk.",
                        "next_action": "Resume execution",
                    },
                    "execution_ready_handoff": {
                        "next_action": "Resume execution",
                        "handoff_text": "Recovered from python sdk.",
                        "acceptance_checks": [],
                    },
                    "execution_result_summary": {
                        "runtime_id": "python-sdk-doc-runtime",
                        "status": "partial",
                    },
                    "execution_artifacts": [
                        {"ref": "artifact:python:1", "uri": "memory://artifacts/python.json", "kind": "sdk_artifact"}
                    ],
                    "execution_evidence": [
                        {"ref": "evidence:python:1", "claim": "Recovered continuity preserved", "type": "claim"}
                    ],
                    "execution_state_v1": {
                        "state_id": "state-python-1",
                        "scope": "default",
                        "task_brief": "Resume execution",
                        "current_stage": "patch",
                        "active_role": "patch",
                        "owned_files": [],
                        "modified_files": [],
                        "pending_validations": [],
                        "completed_validations": [],
                        "last_accepted_hypothesis": None,
                        "rejected_paths": [],
                        "unresolved_blockers": [],
                        "rollback_notes": [],
                        "reviewer_contract": None,
                        "resume_anchor": None,
                        "updated_at": "2026-03-18T00:00:00.000Z",
                        "version": 1,
                    },
                    "execution_packet_v1": {
                        "version": 1,
                        "state_id": "state-python-1",
                        "task_brief": "Resume execution",
                        "hard_constraints": [],
                        "accepted_facts": [],
                        "rejected_paths": [],
                        "pending_validations": [],
                        "rollback_notes": [],
                        "review_contract": None,
                        "resume_anchor": None,
                        "artifact_refs": ["artifact:python:1"],
                        "evidence_refs": ["evidence:python:1"],
                    },
                    "control_profile_v1": {
                        "version": 1,
                        "profile": "patch",
                        "max_same_tool_streak": 2,
                        "max_no_progress_streak": 2,
                        "max_duplicate_observation_streak": 2,
                        "max_steps": 8,
                        "allow_broad_scan": False,
                        "allow_broad_test": False,
                        "escalate_on_blocker": True,
                        "reviewer_ready_required": False,
                    },
                },
                request_id="req-python-doc-recover",
            )
            return

        if self.path == "/v1/memory/context/assemble":
            self._write_json(
                {
                    "tenant_id": "default",
                    "scope": "default",
                    "execution_kernel": {
                        "packet_source_mode": "packet_input",
                        "execution_state_v1_present": True,
                        "execution_packet_v1_present": True,
                    },
                    "layered_context": {
                        "merged_text": "# Static Context\n- Resumed from python helper",
                    },
                },
                request_id="req-python-doc-context",
            )
            return

        if self.path == "/v1/memory/tools/select":
            self._write_json(
                {
                    "tenant_id": "default",
                    "scope": "default",
                    "candidates": body.get("candidates") if isinstance(body, dict) else ["resume_patch"],
                    "selection": {
                        "selected": "resume_patch",
                        "ordered": ["resume_patch", "request_review"],
                        "candidates": ["resume_patch", "request_review"],
                        "denied": [],
                    },
                    "rules": {"applied": {}},
                    "decision": {
                        "decision_id": "decision-python-doc-1",
                        "run_id": body.get("run_id") if isinstance(body, dict) else "run-python-doc-1",
                        "selected_tool": "resume_patch",
                        "policy_sha256": "policy-python-doc",
                        "source_rule_ids": [],
                        "created_at": "2026-03-18T00:00:00.000Z",
                    },
                },
                request_id="req-python-doc-select",
            )
            return

        if self.path == "/v1/memory/tools/decision":
            self._write_json(
                {
                    "tenant_id": "default",
                    "scope": "default",
                    "lookup_mode": "decision_id",
                    "decision": {
                        "decision_id": "decision-python-doc-1",
                        "decision_kind": "tools_select",
                        "run_id": "run-python-doc-1",
                        "selected_tool": "resume_patch",
                        "candidates": ["resume_patch", "request_review"],
                        "context_sha256": "ctx-python-doc",
                        "policy_sha256": "policy-python-doc",
                        "source_rule_ids": [],
                        "metadata": {},
                        "created_at": "2026-03-18T00:00:00.000Z",
                        "commit_id": None,
                    },
                },
                request_id="req-python-doc-decision",
            )
            return

        if self.path == "/v1/memory/tools/run":
            self.__class__.run_lookup_count += 1
            status = "decision_recorded" if self.__class__.run_lookup_count == 1 else "feedback_linked"
            self._write_json(
                {
                    "tenant_id": "default",
                    "scope": "default",
                    "run_id": "run-python-doc-1",
                    "lifecycle": {
                        "status": status,
                        "decision_count": 1,
                        "latest_decision_at": "2026-03-18T00:00:00.000Z",
                        "latest_feedback_at": "2026-03-18T00:01:00.000Z" if status == "feedback_linked" else None,
                    },
                    "decisions": [
                        {
                            "decision_id": "decision-python-doc-1",
                            "decision_kind": "tools_select",
                            "run_id": "run-python-doc-1",
                            "selected_tool": "resume_patch",
                            "candidates": ["resume_patch", "request_review"],
                            "context_sha256": "ctx-python-doc",
                            "policy_sha256": "policy-python-doc",
                            "source_rule_ids": [],
                            "metadata": {},
                            "created_at": "2026-03-18T00:00:00.000Z",
                            "commit_id": None,
                        }
                    ],
                },
                request_id=f"req-python-doc-run-{self.__class__.run_lookup_count}",
            )
            return

        if self.path == "/v1/memory/tools/feedback":
            self._write_json(
                {
                    "ok": True,
                    "tenant_id": "default",
                    "scope": "default",
                    "updated_rules": 2,
                    "rule_node_ids": ["rule-python-doc-1"],
                    "commit_id": "commit-python-doc-feedback",
                    "commit_uri": "aionis://default/default/commit/commit-python-doc-feedback",
                    "commit_hash": None,
                    "decision_id": "decision-python-doc-1",
                    "decision_uri": "aionis://default/default/decision/decision-python-doc-1",
                    "decision_link_mode": "provided",
                },
                request_id="req-python-doc-feedback",
            )
            return

        self.send_response(404)
        self.end_headers()

    def _write_json(self, payload: dict[str, object], request_id: str) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("x-request-id", request_id)
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"

    try:
        client = AionisClient(base_url=base_url, api_key="python-doc-key")
        recover = client.doc_recover(
            {
                "recover_request": {
                    "anchor": "aionis-doc:workflow-001",
                    "scope": "default",
                },
                "input_kind": "handoff-store-request",
                "source_doc_id": "workflow-001",
                "source_doc_version": "1.0.0",
            }
        )
        assert recover["recover_result_version"] == "aionis_doc_recover_result_v1"
        assert recover["recover_response"]["request_id"] == "req-python-doc-recover"

        resumed = client.doc_recover_and_resume(
            {
                "recover_request": {
                    "anchor": "aionis-doc:workflow-001",
                    "scope": "default",
                },
                "input_kind": "handoff-store-request",
                "source_doc_id": "workflow-001",
                "source_doc_version": "1.0.0",
                "candidates": ["resume_patch", "request_review"],
                "feedback_outcome": "positive",
            }
        )
        assert resumed["resume_result_version"] == "aionis_doc_resume_result_v1"
        assert resumed["resume_summary"]["resume_state"] == "lifecycle_advanced"
        assert resumed["resume_summary"]["lifecycle_transition"] == "decision_recorded -> feedback_linked"
        assert resumed["tools_feedback_response"]["data"]["updated_rules"] == 2
        assert len(MockHandler.requests) == 8
        assert MockHandler.requests[0]["path"] == "/v1/handoff/recover"
        assert MockHandler.requests[1]["path"] == "/v1/handoff/recover"
        assert MockHandler.requests[2]["path"] == "/v1/memory/context/assemble"
        assert MockHandler.requests[-1]["path"] == "/v1/memory/tools/run"
        return 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    raise SystemExit(main())
