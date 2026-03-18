from __future__ import annotations

import json
import random
import time
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, Mapping, MutableMapping, Optional
from urllib.parse import quote, urlencode
from urllib import error, request

if TYPE_CHECKING:
    from .types import (
        ControlAlertDeliveriesQuery,
        ControlAlertRouteInput,
        ControlAlertRoutesQuery,
        ControlAlertRouteStatusInput,
        ControlApiKeyInput,
        ControlApiKeysQuery,
        ControlApiKeysStaleQuery,
        ControlApiKeyRotateInput,
        ControlAuditEventsQuery,
        ControlIncidentPublishJobInput,
        ControlIncidentPublishJobsQuery,
        ControlIncidentPublishReplayInput,
        ControlIncidentPublishRollupQuery,
        ControlIncidentPublishSloQuery,
        ControlProjectInput,
        ControlSandboxBudgetGetQuery,
        ControlSandboxBudgetInput,
        ControlSandboxBudgetsQuery,
        ControlSandboxProjectBudgetGetQuery,
        ControlSandboxProjectBudgetInput,
        ControlSandboxProjectBudgetsQuery,
        ControlTenantDiagnosticsQuery,
        ControlTenantInput,
        ControlTenantKeyUsageQuery,
        ControlTenantQuotaInput,
        ControlTenantsQuery,
        ControlTenantTimeseriesQuery,
        AutomationAssignReviewerInput,
        AutomationCompensationPolicyMatrixInput,
        AutomationCreateInput,
        AutomationGetInput,
        AutomationListInput,
        AutomationPromoteInput,
        AutomationRunApproveRepairInput,
        AutomationRunAssignReviewerInput,
        AutomationRunCancelInput,
        AutomationRunCompensationAssignInput,
        AutomationRunCompensationRecordActionInput,
        AutomationRunCompensationRetryInput,
        AutomationRunGetInput,
        AutomationRunInput,
        AutomationRunListInput,
        AutomationRunRejectRepairInput,
        AutomationRunResumeInput,
        AutomationShadowReportInput,
        AutomationShadowReviewInput,
        AutomationShadowValidateDispatchInput,
        AutomationShadowValidateInput,
        AutomationTelemetryInput,
        AionisDocRecoverAndResumeInput,
        AionisDocRecoverInput,
        AionisDocRecoverResult,
        AionisDocResumeInput,
        AionisDocResumeResult,
        BackendCapabilityErrorDetails,
        ContextAssembleInput,
        ContextAssembleResponse,
        PlanningContextInput,
        MemoryArchiveRehydrateInput,
        MemoryEventWriteInput,
        MemoryFindInput,
        HandoffRecoverInput,
        HandoffRecoverResponse,
        HandoffStoreInput,
        MemoryNodesActivateInput,
        MemoryResolveInput,
        MemoryPackExportInput,
        MemoryPackImportInput,
        MemoryRecallInput,
        MemoryRecallTextInput,
        MemorySessionCreateInput,
        MemorySessionEventsListInput,
        MemoryWriteInput,
        AutomationValidateInput,
        ReplayPlaybookCompileInput,
        ReplayPlaybookCandidateInput,
        ReplayPlaybookDispatchInput,
        ReplayPlaybookGetInput,
        ReplayPlaybookPromoteInput,
        ReplayPlaybookRepairInput,
        ReplayPlaybookRepairReviewInput,
        ReplayPlaybookRunInput,
        ReplayRunEndInput,
        ReplayRunGetInput,
        ReplayRunStartInput,
        ReplayStepAfterInput,
        ReplayStepBeforeInput,
        RuleFeedbackInput,
        RuleStateUpdateInput,
        RulesEvaluateInput,
        SandboxExecuteInput,
        SandboxRunCancelInput,
        SandboxRunGetInput,
        SandboxRunArtifactInput,
        SandboxRunLogsInput,
        SandboxSessionCreateInput,
        ToolsDecisionInput,
        ToolsDecisionResponse,
        ToolsFeedbackInput,
        ToolsFeedbackResponse,
        ToolsRunInput,
        ToolsRunResponse,
        ToolsSelectInput,
        ToolsSelectResponse,
        ShadowDualWriteStrictFailureDetails,
    )


@dataclass
class RetryPolicy:
    max_retries: int = 2
    base_delay_s: float = 0.2
    max_delay_s: float = 2.0
    jitter_ratio: float = 0.2


class AionisApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: Any = None,
        request_id: Optional[str] = None,
        issues: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details
        self.request_id = request_id
        self.issues = issues


class AionisNetworkError(Exception):
    def __init__(self, message: str, request_id: Optional[str] = None) -> None:
        super().__init__(message)
        self.request_id = request_id


def parse_backend_capability_error_details(details: Any) -> Optional["BackendCapabilityErrorDetails"]:
    if not isinstance(details, dict):
        return None
    capability = details.get("capability")
    if not isinstance(capability, str) or not capability.strip():
        return None
    out: Dict[str, Any] = {"capability": capability}
    backend = details.get("backend")
    if isinstance(backend, str):
        out["backend"] = backend
    failure_mode = details.get("failure_mode")
    if failure_mode in ("hard_fail", "soft_degrade"):
        out["failure_mode"] = failure_mode
    degraded_mode = details.get("degraded_mode")
    if isinstance(degraded_mode, str):
        out["degraded_mode"] = degraded_mode
    fallback_applied = details.get("fallback_applied")
    if isinstance(fallback_applied, bool):
        out["fallback_applied"] = fallback_applied
    return out  # type: ignore[return-value]


def is_backend_capability_unsupported_error(err: BaseException) -> bool:
    if not isinstance(err, AionisApiError):
        return False
    if err.code != "backend_capability_unsupported":
        return False
    parsed = parse_backend_capability_error_details(err.details)
    if parsed is None:
        return False
    err.details = parsed
    return True


def parse_shadow_dual_write_strict_failure_details(details: Any) -> Optional["ShadowDualWriteStrictFailureDetails"]:
    if not isinstance(details, dict):
        return None
    if details.get("capability") != "shadow_mirror_v2":
        return None
    out: Dict[str, Any] = {"capability": "shadow_mirror_v2"}
    failure_mode = details.get("failure_mode")
    if failure_mode in ("hard_fail", "soft_degrade"):
        out["failure_mode"] = failure_mode
    degraded_mode = details.get("degraded_mode")
    if degraded_mode in ("capability_unsupported", "mirror_failed"):
        out["degraded_mode"] = degraded_mode
    fallback_applied = details.get("fallback_applied")
    if isinstance(fallback_applied, bool):
        out["fallback_applied"] = fallback_applied
    strict = details.get("strict")
    if isinstance(strict, bool):
        out["strict"] = strict
    mirrored = details.get("mirrored")
    if isinstance(mirrored, bool):
        out["mirrored"] = mirrored
    error_msg = details.get("error")
    if isinstance(error_msg, str):
        out["error"] = error_msg
    return out  # type: ignore[return-value]


def is_shadow_dual_write_strict_failure_error(err: BaseException) -> bool:
    if not isinstance(err, AionisApiError):
        return False
    if err.code != "shadow_dual_write_strict_failure":
        return False
    parsed = parse_shadow_dual_write_strict_failure_details(err.details)
    if parsed is None:
        return False
    err.details = parsed
    return True


def _join_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def _should_retry_status(status: int) -> bool:
    return status == 429 or status >= 500


def _parse_retry_after_seconds(headers: Mapping[str, str]) -> Optional[float]:
    raw = headers.get("retry-after")
    if raw is None:
        return None
    try:
        sec = float(raw)
        return sec if sec > 0 else None
    except ValueError:
        return None


def _compute_backoff_seconds(policy: RetryPolicy, attempt: int) -> float:
    exp = policy.base_delay_s * (2 ** max(0, attempt - 1))
    capped = min(exp, policy.max_delay_s)
    spread = capped * policy.jitter_ratio
    if spread <= 0:
        return max(0.001, capped)
    jitter = random.uniform(-spread, spread)
    return max(0.001, capped + jitter)


def _parse_body(raw: bytes, content_type: str) -> Any:
    if not raw:
        return None
    if "application/json" in (content_type or "").lower():
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return raw.decode("utf-8", errors="replace")
    return raw.decode("utf-8", errors="replace")


def _has_header(headers: Mapping[str, str], name: str) -> bool:
    want = name.lower()
    return any(str(k).lower() == want for k in headers.keys())


def _as_retry_policy(value: Optional[Mapping[str, Any]], base: RetryPolicy) -> RetryPolicy:
    if value is None:
        value = {}
    max_retries = int(value.get("max_retries", base.max_retries))
    base_delay_s = float(value.get("base_delay_s", base.base_delay_s))
    max_delay_s = float(value.get("max_delay_s", base.max_delay_s))
    jitter_ratio = float(value.get("jitter_ratio", base.jitter_ratio))

    return RetryPolicy(
        max_retries=max(0, min(10, max_retries)),
        base_delay_s=max(0.001, min(30.0, base_delay_s)),
        max_delay_s=max(0.001, min(60.0, max_delay_s)),
        jitter_ratio=max(0.0, min(1.0, jitter_ratio)),
    )


def _first_non_empty_string(*values: Any) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value
    return None


def _as_dict(value: Any) -> Optional[Dict[str, Any]]:
    return value if isinstance(value, dict) else None


def _read_dict_str(record: Optional[Mapping[str, Any]], key: str) -> Optional[str]:
    if not isinstance(record, Mapping):
        return None
    value = record.get(key)
    return value if isinstance(value, str) and value.strip() else None


def _read_non_negative_int(record: Optional[Mapping[str, Any]], key: str) -> Optional[int]:
    if not isinstance(record, Mapping):
        return None
    value = record.get(key)
    return value if isinstance(value, int) and value >= 0 else None


def _build_doc_resume_context(recover_result: Mapping[str, Any]) -> Dict[str, Any]:
    recovered = _as_dict(recover_result.get("recover_response")) or {}
    recovered_data = _as_dict(recovered.get("data")) or {}
    context: Dict[str, Any] = {
        "intent": "doc_resume",
        "workflow_kind": "aionis_doc",
        "handoff_anchor": recovered_data.get("anchor"),
    }
    if isinstance(recovered_data.get("control_profile_v1"), dict):
        context["control_profile_v1"] = recovered_data["control_profile_v1"]
    return context


def _default_doc_recover_input_kind(payload: Mapping[str, Any]) -> str:
    return "publish-result" if payload.get("publish_result") is not None else "handoff-store-request"


def _build_doc_resume_context_assemble_input(payload: Mapping[str, Any]) -> Dict[str, Any]:
    recover_result = _as_dict(payload.get("recover_result")) or {}
    recovered = _as_dict(recover_result.get("recover_response")) or {}
    recovered_data = _as_dict(recovered.get("data")) or {}
    execution_ready = _as_dict(recovered_data.get("execution_ready_handoff")) or {}
    handoff = _as_dict(recovered_data.get("handoff")) or {}
    execution_state = _as_dict(recovered_data.get("execution_state_v1")) or {}
    return {
        "tenant_id": payload.get("tenant_id") or recovered_data.get("tenant_id"),
        "scope": payload.get("scope") or recovered_data.get("scope"),
        "query_text": payload.get("query_text")
        or _first_non_empty_string(
            execution_ready.get("next_action"),
            execution_state.get("task_brief"),
            handoff.get("summary"),
            recovered_data.get("anchor"),
        )
        or "resume recovered handoff",
        "context": _build_doc_resume_context(recover_result),
        "execution_result_summary": recovered_data.get("execution_result_summary"),
        "execution_artifacts": recovered_data.get("execution_artifacts"),
        "execution_evidence": recovered_data.get("execution_evidence"),
        "execution_state_v1": recovered_data.get("execution_state_v1"),
        "execution_packet_v1": recovered_data.get("execution_packet_v1"),
        "include_rules": bool(payload.get("include_rules", False)),
        "return_layered_context": True,
    }


def _build_doc_resume_tools_select_input(payload: Mapping[str, Any]) -> Dict[str, Any]:
    recover_result = _as_dict(payload.get("recover_result")) or {}
    recovered = _as_dict(recover_result.get("recover_response")) or {}
    recovered_data = _as_dict(recovered.get("data")) or {}
    strict_value = payload.get("strict")
    include_shadow_value = payload.get("include_shadow")
    rules_limit_value = payload.get("rules_limit")
    return {
        "tenant_id": payload.get("tenant_id") or recovered_data.get("tenant_id"),
        "scope": payload.get("scope") or recovered_data.get("scope"),
        "run_id": payload.get("run_id") or str(uuid.uuid4()),
        "context": _build_doc_resume_context(recover_result),
        "execution_result_summary": recovered_data.get("execution_result_summary"),
        "execution_artifacts": recovered_data.get("execution_artifacts"),
        "execution_evidence": recovered_data.get("execution_evidence"),
        "execution_state_v1": recovered_data.get("execution_state_v1"),
        "candidates": list(payload.get("candidates") or []),
        "strict": True if strict_value is None else bool(strict_value),
        "include_shadow": False if include_shadow_value is None else bool(include_shadow_value),
        "rules_limit": 50 if rules_limit_value is None else int(rules_limit_value),
    }


def _build_doc_resume_feedback_input(
    payload: Mapping[str, Any],
    tools_select_request: Mapping[str, Any],
    tools_select_response: Mapping[str, Any],
    tools_decision_response: Optional[Mapping[str, Any]],
) -> Dict[str, Any]:
    tools_select_data = _as_dict(tools_select_response.get("data")) or {}
    tools_decision_data = _as_dict(tools_decision_response.get("data") if tools_decision_response else None) or {}
    decision = _as_dict(tools_decision_data.get("decision")) or {}
    selection = _as_dict(tools_select_data.get("selection")) or {}
    selected_tool = _first_non_empty_string(
        payload.get("feedback_selected_tool"),
        decision.get("selected_tool"),
        selection.get("selected"),
    )
    if not selected_tool:
        raise ValueError("Unable to derive selected_tool for doc_resume feedback")
    include_shadow_value = payload.get("include_shadow", tools_select_request.get("include_shadow"))
    rules_limit_value = payload.get("rules_limit", tools_select_request.get("rules_limit"))
    return {
        "tenant_id": tools_select_request.get("tenant_id"),
        "scope": tools_select_request.get("scope"),
        "actor": payload.get("feedback_actor"),
        "run_id": _first_non_empty_string(decision.get("run_id"), tools_select_request.get("run_id")),
        "decision_id": _first_non_empty_string(decision.get("decision_id")),
        "decision_uri": _first_non_empty_string(decision.get("decision_uri")),
        "outcome": payload.get("feedback_outcome"),
        "context": tools_select_request.get("context") or {},
        "candidates": list(tools_select_request.get("candidates") or []),
        "selected_tool": selected_tool,
        "include_shadow": False if include_shadow_value is None else bool(include_shadow_value),
        "rules_limit": 50 if rules_limit_value is None else int(rules_limit_value),
        "target": payload.get("feedback_target", "tool"),
        "note": payload.get("feedback_note"),
        "input_text": payload.get("feedback_input_text")
        or _first_non_empty_string(
            payload.get("feedback_note"),
            selected_tool,
            _read_dict_str(_as_dict(tools_select_request.get("context")), "intent"),
            "resume feedback",
        ),
    }


class AionisClient:
    def __init__(
        self,
        *,
        base_url: str,
        timeout_s: float = 10.0,
        retry: Optional[Mapping[str, Any]] = None,
        default_headers: Optional[Mapping[str, str]] = None,
        admin_token: Optional[str] = None,
        api_key: Optional[str] = None,
        auth_bearer: Optional[str] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_s = max(0.001, timeout_s)
        self.retry = _as_retry_policy(retry, RetryPolicy())
        self.default_headers = dict(default_headers or {})
        self.admin_token = admin_token
        self.api_key = api_key
        self.auth_bearer = auth_bearer

    def write(self, payload: "MemoryWriteInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/write", payload, request_options)

    def recall(self, payload: "MemoryRecallInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/recall", payload, request_options)

    def recall_text(self, payload: "MemoryRecallTextInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/recall_text", payload, request_options)

    def context_assemble(self, payload: "ContextAssembleInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/context/assemble", payload, request_options)

    def planning_context(self, payload: "PlanningContextInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/planning/context", payload, request_options)

    def handoff_store(self, payload: "HandoffStoreInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/handoff/store", payload, request_options)

    def handoff_recover(self, payload: "HandoffRecoverInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/handoff/recover", payload, request_options)

    def doc_recover(self, payload: "AionisDocRecoverInput", **request_options: Any) -> "AionisDocRecoverResult":
        recover_request = dict(payload.get("recover_request") or {})
        recover_response = self.handoff_recover(recover_request, **request_options)
        return {
            "recover_result_version": "aionis_doc_recover_result_v1",
            "recovered_at": payload.get("recovered_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "base_url": self.base_url,
            "input_kind": payload.get("input_kind") or _default_doc_recover_input_kind(payload),
            "source_doc_id": payload.get("source_doc_id"),
            "source_doc_version": payload.get("source_doc_version"),
            "publish_result": payload.get("publish_result"),
            "recover_request": recover_request,
            "recover_response": recover_response,
        }

    def doc_resume(self, payload: "AionisDocResumeInput", **request_options: Any) -> "AionisDocResumeResult":
        context_assemble_request = _build_doc_resume_context_assemble_input(payload)
        context_assemble_response = self.context_assemble(context_assemble_request, **request_options)

        tools_select_request = _build_doc_resume_tools_select_input(payload)
        tools_select_response = self.tools_select(tools_select_request, **request_options)

        tools_select_data = _as_dict(tools_select_response.get("data")) or {}
        decision = _as_dict(tools_select_data.get("decision")) or {}
        decision_id = _first_non_empty_string(decision.get("decision_id"))
        run_id = _first_non_empty_string(decision.get("run_id"), tools_select_request.get("run_id"))

        tools_decision_response: Optional[Dict[str, Any]] = None
        if decision_id or run_id:
            decision_request: Dict[str, Any] = {
                "tenant_id": tools_select_request.get("tenant_id"),
                "scope": tools_select_request.get("scope"),
            }
            if decision_id:
                decision_request["decision_id"] = decision_id
            else:
                decision_request["run_id"] = run_id
            tools_decision_response = self.tools_decision(decision_request, **request_options)

        tools_run_response: Optional[Dict[str, Any]] = None
        if run_id:
            tools_run_response = self.tools_run(
                {
                    "tenant_id": tools_select_request.get("tenant_id"),
                    "scope": tools_select_request.get("scope"),
                    "run_id": run_id,
                },
                **request_options,
            )

        tools_feedback_request: Optional[Dict[str, Any]] = None
        tools_feedback_response: Optional[Dict[str, Any]] = None
        tools_run_post_feedback_response: Optional[Dict[str, Any]] = None
        if payload.get("feedback_outcome"):
            tools_feedback_request = _build_doc_resume_feedback_input(
                payload,
                tools_select_request,
                tools_select_response,
                tools_decision_response,
            )
            tools_feedback_response = self.tools_feedback(tools_feedback_request, **request_options)
            if run_id:
                tools_run_post_feedback_response = self.tools_run(
                    {
                        "tenant_id": tools_select_request.get("tenant_id"),
                        "scope": tools_select_request.get("scope"),
                        "run_id": run_id,
                        "include_feedback": True,
                    },
                    **request_options,
                )

        tools_decision_data = _as_dict(tools_decision_response.get("data") if tools_decision_response else None) or {}
        tools_decision_record = _as_dict(tools_decision_data.get("decision")) or {}
        selection = _as_dict(tools_select_data.get("selection")) or {}
        tools_run_data = _as_dict(tools_run_response.get("data") if tools_run_response else None) or {}
        tools_run_post_feedback_data = _as_dict(
            tools_run_post_feedback_response.get("data") if tools_run_post_feedback_response else None
        ) or {}
        pre_lifecycle = _as_dict(tools_run_data.get("lifecycle")) or {}
        post_lifecycle = _as_dict(tools_run_post_feedback_data.get("lifecycle")) or {}
        pre_status = _read_dict_str(pre_lifecycle, "status")
        post_status = _read_dict_str(post_lifecycle, "status")
        lifecycle_transition = (
            f"{pre_status} -> {post_status}" if pre_status and post_status and pre_status != post_status else None
        )
        feedback_written = tools_feedback_response is not None
        lifecycle_advanced = lifecycle_transition is not None
        resume_state = (
            "inspection_only"
            if not feedback_written
            else "lifecycle_advanced"
            if lifecycle_advanced
            else "feedback_applied"
        )

        return {
            "resume_result_version": "aionis_doc_resume_result_v1",
            "resumed_at": payload.get("resumed_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "base_url": self.base_url,
            "input_kind": "recover-result",
            "source_doc_id": (_as_dict(payload.get("recover_result")) or {}).get("source_doc_id"),
            "source_doc_version": (_as_dict(payload.get("recover_result")) or {}).get("source_doc_version"),
            "run_id": tools_select_request["run_id"],
            "resume_summary": {
                "selected_tool": _first_non_empty_string(
                    tools_decision_record.get("selected_tool"),
                    selection.get("selected"),
                ),
                "decision_id": _first_non_empty_string(tools_decision_record.get("decision_id")),
                "run_id": tools_select_request["run_id"],
                "resume_state": resume_state,
                "feedback_written": feedback_written,
                "feedback_outcome": payload.get("feedback_outcome"),
                "pre_feedback_run_status": pre_status,
                "post_feedback_run_status": post_status,
                "lifecycle_transition": lifecycle_transition,
                "lifecycle_advanced": lifecycle_advanced,
                "feedback_updated_rules": _read_non_negative_int(
                    _as_dict(tools_feedback_response.get("data") if tools_feedback_response else None),
                    "updated_rules",
                ),
            },
            "recover_result": payload.get("recover_result"),
            "context_assemble_request": context_assemble_request,
            "context_assemble_response": context_assemble_response,
            "tools_select_request": tools_select_request,
            "tools_select_response": tools_select_response,
            "tools_decision_response": tools_decision_response,
            "tools_run_response": tools_run_response,
            "tools_run_post_feedback_response": tools_run_post_feedback_response,
            "tools_feedback_request": tools_feedback_request,
            "tools_feedback_response": tools_feedback_response,
        }

    def doc_recover_and_resume(
        self,
        payload: "AionisDocRecoverAndResumeInput",
        **request_options: Any,
    ) -> "AionisDocResumeResult":
        recover_result = self.doc_recover(
            {
                "recover_request": payload.get("recover_request") or {},
                "input_kind": payload.get("input_kind"),
                "source_doc_id": payload.get("source_doc_id"),
                "source_doc_version": payload.get("source_doc_version"),
                "publish_result": payload.get("publish_result"),
                "recovered_at": payload.get("recovered_at"),
            },
            **request_options,
        )
        return self.doc_resume(
            {
                "recover_result": recover_result,
                "query_text": payload.get("query_text"),
                "run_id": payload.get("run_id"),
                "tenant_id": payload.get("tenant_id"),
                "scope": payload.get("scope"),
                "include_rules": payload.get("include_rules"),
                "candidates": list(payload.get("candidates") or []),
                "strict": payload.get("strict"),
                "include_shadow": payload.get("include_shadow"),
                "rules_limit": payload.get("rules_limit"),
                "feedback_outcome": payload.get("feedback_outcome"),
                "feedback_target": payload.get("feedback_target"),
                "feedback_note": payload.get("feedback_note"),
                "feedback_input_text": payload.get("feedback_input_text"),
                "feedback_selected_tool": payload.get("feedback_selected_tool"),
                "feedback_actor": payload.get("feedback_actor"),
                "resumed_at": payload.get("resumed_at"),
            },
            **request_options,
        )

    def find(self, payload: "MemoryFindInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/find", payload, request_options)

    def resolve(self, payload: "MemoryResolveInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/resolve", payload, request_options)

    def create_session(self, payload: "MemorySessionCreateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/sessions", payload, request_options)

    def list_sessions(
        self,
        query: Optional["MemorySessionsListInput"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/memory/sessions", query or {}, request_options, method="GET")

    def write_event(self, payload: "MemoryEventWriteInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/events", payload, request_options)

    def list_session_events(
        self,
        session_id: str,
        query: Optional["MemorySessionEventsListInput"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(session_id or "").strip()
        if not sid:
            raise ValueError("session_id is required")
        path = f"/v1/memory/sessions/{quote(sid, safe='')}/events"
        return self._request(path, query or {}, request_options, method="GET")

    def pack_export(self, payload: "MemoryPackExportInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/packs/export", payload, request_options)

    def pack_import(self, payload: "MemoryPackImportInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/packs/import", payload, request_options)

    def archive_rehydrate(self, payload: "MemoryArchiveRehydrateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/archive/rehydrate", payload, request_options)

    def nodes_activate(self, payload: "MemoryNodesActivateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/nodes/activate", payload, request_options)

    def sandbox_create_session(self, payload: "SandboxSessionCreateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/sandbox/sessions", payload, request_options)

    def sandbox_execute(self, payload: "SandboxExecuteInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/sandbox/execute", payload, request_options)

    def sandbox_run_get(self, payload: "SandboxRunGetInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/sandbox/runs/get", payload, request_options)

    def sandbox_run_logs(self, payload: "SandboxRunLogsInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/sandbox/runs/logs", payload, request_options)

    def sandbox_run_artifact(self, payload: "SandboxRunArtifactInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/sandbox/runs/artifact", payload, request_options)

    def sandbox_run_cancel(self, payload: "SandboxRunCancelInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/sandbox/runs/cancel", payload, request_options)

    def rules_evaluate(self, payload: "RulesEvaluateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/rules/evaluate", payload, request_options)

    def tools_select(self, payload: "ToolsSelectInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/select", payload, request_options)

    def tools_decision(self, payload: "ToolsDecisionInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/decision", payload, request_options)

    def tools_run(self, payload: "ToolsRunInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/run", payload, request_options)

    def tools_feedback(self, payload: "ToolsFeedbackInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/feedback", payload, request_options)

    def feedback(self, payload: "RuleFeedbackInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/feedback", payload, request_options)

    def rules_state(self, payload: "RuleStateUpdateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/rules/state", payload, request_options)

    def replay_run_start(self, payload: "ReplayRunStartInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/run/start", payload, request_options)

    def replay_step_before(self, payload: "ReplayStepBeforeInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/step/before", payload, request_options)

    def replay_step_after(self, payload: "ReplayStepAfterInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/step/after", payload, request_options)

    def replay_run_end(self, payload: "ReplayRunEndInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/run/end", payload, request_options)

    def replay_run_get(self, payload: "ReplayRunGetInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/runs/get", payload, request_options)

    def replay_playbook_compile_from_run(
        self,
        payload: "ReplayPlaybookCompileInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/playbooks/compile_from_run", payload, request_options)

    def replay_playbook_get(self, payload: "ReplayPlaybookGetInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/playbooks/get", payload, request_options)

    def replay_playbook_candidate(self, payload: "ReplayPlaybookCandidateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/playbooks/candidate", payload, request_options)

    def replay_playbook_promote(self, payload: "ReplayPlaybookPromoteInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/playbooks/promote", payload, request_options)

    def replay_playbook_repair(self, payload: "ReplayPlaybookRepairInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/playbooks/repair", payload, request_options)

    def replay_playbook_repair_review(
        self,
        payload: "ReplayPlaybookRepairReviewInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/playbooks/repair/review", payload, request_options)

    def replay_playbook_run(self, payload: "ReplayPlaybookRunInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/playbooks/run", payload, request_options)

    def replay_playbook_dispatch(self, payload: "ReplayPlaybookDispatchInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/replay/playbooks/dispatch", payload, request_options)

    def automation_graph_validate(self, payload: "AutomationValidateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/graph/validate", payload, request_options)

    def automation_create(self, payload: "AutomationCreateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/create", payload, request_options)

    def automation_get(self, payload: "AutomationGetInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/get", payload, request_options)

    def automation_list(self, payload: "AutomationListInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/list", payload, request_options)

    def automation_telemetry(self, payload: "AutomationTelemetryInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/telemetry", payload, request_options)

    def automation_assign_reviewer(self, payload: "AutomationAssignReviewerInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/assign_reviewer", payload, request_options)

    def automation_promote(self, payload: "AutomationPromoteInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/promote", payload, request_options)

    def automation_validate(self, payload: "AutomationValidateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/validate", payload, request_options)

    def automation_shadow_report(self, payload: "AutomationShadowReportInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/shadow/report", payload, request_options)

    def automation_shadow_review(self, payload: "AutomationShadowReviewInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/shadow/review", payload, request_options)

    def automation_shadow_validate(self, payload: "AutomationShadowValidateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/shadow/validate", payload, request_options)

    def automation_shadow_validate_dispatch(
        self,
        payload: "AutomationShadowValidateDispatchInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/automations/shadow/validate/dispatch", payload, request_options)

    def automation_compensation_policy_matrix(
        self,
        payload: "AutomationCompensationPolicyMatrixInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/automations/compensation/policy_matrix", payload, request_options)

    def automation_run(self, payload: "AutomationRunInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/run", payload, request_options)

    def automation_run_get(self, payload: "AutomationRunGetInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/get", payload, request_options)

    def automation_run_list(self, payload: "AutomationRunListInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/list", payload, request_options)

    def automation_run_assign_reviewer(
        self,
        payload: "AutomationRunAssignReviewerInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/assign_reviewer", payload, request_options)

    def automation_run_cancel(self, payload: "AutomationRunCancelInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/cancel", payload, request_options)

    def automation_run_approve_repair(
        self,
        payload: "AutomationRunApproveRepairInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/approve_repair", payload, request_options)

    def automation_run_compensation_retry(
        self,
        payload: "AutomationRunCompensationRetryInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/compensation/retry", payload, request_options)

    def automation_run_compensation_assign(
        self,
        payload: "AutomationRunCompensationAssignInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/compensation/assign", payload, request_options)

    def automation_run_compensation_record_action(
        self,
        payload: "AutomationRunCompensationRecordActionInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/compensation/record_action", payload, request_options)

    def automation_run_resume(self, payload: "AutomationRunResumeInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/resume", payload, request_options)

    def automation_run_reject_repair(
        self,
        payload: "AutomationRunRejectRepairInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/automations/runs/reject_repair", payload, request_options)

    def health(self, **request_options: Any) -> Dict[str, Any]:
        return self._request("/health", {}, request_options, method="GET")

    def get_capability_contract(self, **request_options: Any) -> Dict[str, Any]:
        out = self.health(**request_options)
        data = out.get("data") if isinstance(out, dict) else None
        contract: Dict[str, Any] = {}
        if isinstance(data, dict):
            maybe = data.get("memory_store_capability_contract")
            if isinstance(maybe, dict):
                contract = maybe
        return {
            "data": contract,
            "status": out.get("status"),
            "request_id": out.get("request_id"),
        }

    def control_upsert_tenant(self, payload: "ControlTenantInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/admin/control/tenants", payload, request_options)

    def control_list_tenants(
        self,
        query: Optional["ControlTenantsQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/tenants", query or {}, request_options, method="GET")

    def control_upsert_project(self, payload: "ControlProjectInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/admin/control/projects", payload, request_options)

    def control_create_api_key(self, payload: "ControlApiKeyInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/admin/control/api-keys", payload, request_options)

    def control_list_api_keys(
        self,
        query: Optional["ControlApiKeysQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/api-keys", query or {}, request_options, method="GET")

    def control_list_stale_api_keys(
        self,
        query: Optional["ControlApiKeysStaleQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/api-keys/stale", query or {}, request_options, method="GET")

    def control_revoke_api_key(self, key_id: str, **request_options: Any) -> Dict[str, Any]:
        sid = str(key_id or "").strip()
        if not sid:
            raise ValueError("key_id is required")
        path = f"/v1/admin/control/api-keys/{quote(sid, safe='')}/revoke"
        return self._request(path, {}, request_options)

    def control_rotate_api_key(
        self,
        key_id: str,
        payload: Optional["ControlApiKeyRotateInput"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(key_id or "").strip()
        if not sid:
            raise ValueError("key_id is required")
        path = f"/v1/admin/control/api-keys/{quote(sid, safe='')}/rotate"
        return self._request(path, payload or {}, request_options)

    def control_create_alert_route(self, payload: "ControlAlertRouteInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/admin/control/alerts/routes", payload, request_options)

    def control_list_alert_routes(
        self,
        query: Optional["ControlAlertRoutesQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/alerts/routes", query or {}, request_options, method="GET")

    def control_update_alert_route_status(
        self,
        route_id: str,
        payload: "ControlAlertRouteStatusInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(route_id or "").strip()
        if not sid:
            raise ValueError("route_id is required")
        path = f"/v1/admin/control/alerts/routes/{quote(sid, safe='')}/status"
        return self._request(path, payload, request_options)

    def control_list_alert_deliveries(
        self,
        query: Optional["ControlAlertDeliveriesQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/alerts/deliveries", query or {}, request_options, method="GET")

    def control_enqueue_incident_publish_job(
        self,
        payload: "ControlIncidentPublishJobInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/incident-publish/jobs", payload, request_options)

    def control_list_incident_publish_jobs(
        self,
        query: Optional["ControlIncidentPublishJobsQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/incident-publish/jobs", query or {}, request_options, method="GET")

    def control_replay_incident_publish_jobs(
        self,
        payload: "ControlIncidentPublishReplayInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/incident-publish/jobs/replay", payload, request_options)

    def control_upsert_tenant_quota(
        self,
        tenant_id: str,
        payload: "ControlTenantQuotaInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/tenant-quotas/{quote(sid, safe='')}"
        return self._request(path, payload, request_options, method="PUT")

    def control_get_tenant_quota(self, tenant_id: str, **request_options: Any) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/tenant-quotas/{quote(sid, safe='')}"
        return self._request(path, {}, request_options, method="GET")

    def control_delete_tenant_quota(self, tenant_id: str, **request_options: Any) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/tenant-quotas/{quote(sid, safe='')}"
        return self._request(path, {}, request_options, method="DELETE")

    def control_upsert_sandbox_budget(
        self,
        tenant_id: str,
        payload: "ControlSandboxBudgetInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/sandbox-budgets/{quote(sid, safe='')}"
        return self._request(path, payload, request_options, method="PUT")

    def control_get_sandbox_budget(
        self,
        tenant_id: str,
        query: Optional["ControlSandboxBudgetGetQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/sandbox-budgets/{quote(sid, safe='')}"
        return self._request(path, query or {}, request_options, method="GET")

    def control_delete_sandbox_budget(
        self,
        tenant_id: str,
        query: Optional["ControlSandboxBudgetGetQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        q = query or {}
        qp = urlencode({k: str(v) for k, v in q.items() if v is not None})
        path = f"/v1/admin/control/sandbox-budgets/{quote(sid, safe='')}"
        if qp:
            path = f"{path}?{qp}"
        return self._request(path, {}, request_options, method="DELETE")

    def control_list_sandbox_budgets(
        self,
        query: Optional["ControlSandboxBudgetsQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/sandbox-budgets", query or {}, request_options, method="GET")

    def control_upsert_sandbox_project_budget(
        self,
        tenant_id: str,
        project_id: str,
        payload: "ControlSandboxProjectBudgetInput",
        **request_options: Any,
    ) -> Dict[str, Any]:
        tid = str(tenant_id or "").strip()
        pid = str(project_id or "").strip()
        if not tid:
            raise ValueError("tenant_id is required")
        if not pid:
            raise ValueError("project_id is required")
        path = f"/v1/admin/control/sandbox-project-budgets/{quote(tid, safe='')}/{quote(pid, safe='')}"
        return self._request(path, payload, request_options, method="PUT")

    def control_get_sandbox_project_budget(
        self,
        tenant_id: str,
        project_id: str,
        query: Optional["ControlSandboxProjectBudgetGetQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        tid = str(tenant_id or "").strip()
        pid = str(project_id or "").strip()
        if not tid:
            raise ValueError("tenant_id is required")
        if not pid:
            raise ValueError("project_id is required")
        path = f"/v1/admin/control/sandbox-project-budgets/{quote(tid, safe='')}/{quote(pid, safe='')}"
        return self._request(path, query or {}, request_options, method="GET")

    def control_delete_sandbox_project_budget(
        self,
        tenant_id: str,
        project_id: str,
        query: Optional["ControlSandboxProjectBudgetGetQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        tid = str(tenant_id or "").strip()
        pid = str(project_id or "").strip()
        if not tid:
            raise ValueError("tenant_id is required")
        if not pid:
            raise ValueError("project_id is required")
        q = query or {}
        qp = urlencode({k: str(v) for k, v in q.items() if v is not None})
        path = f"/v1/admin/control/sandbox-project-budgets/{quote(tid, safe='')}/{quote(pid, safe='')}"
        if qp:
            path = f"{path}?{qp}"
        return self._request(path, {}, request_options, method="DELETE")

    def control_list_sandbox_project_budgets(
        self,
        query: Optional["ControlSandboxProjectBudgetsQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/sandbox-project-budgets", query or {}, request_options, method="GET")

    def control_list_audit_events(
        self,
        query: Optional["ControlAuditEventsQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        return self._request("/v1/admin/control/audit-events", query or {}, request_options, method="GET")

    def control_get_tenant_dashboard(self, tenant_id: str, **request_options: Any) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/dashboard/tenant/{quote(sid, safe='')}"
        return self._request(path, {}, request_options, method="GET")

    def control_get_tenant_diagnostics(
        self,
        tenant_id: str,
        query: Optional["ControlTenantDiagnosticsQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/diagnostics/tenant/{quote(sid, safe='')}"
        return self._request(path, query or {}, request_options, method="GET")

    def control_get_tenant_incident_publish_rollup(
        self,
        tenant_id: str,
        query: Optional["ControlIncidentPublishRollupQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/dashboard/tenant/{quote(sid, safe='')}/incident-publish-rollup"
        return self._request(path, query or {}, request_options, method="GET")

    def control_get_tenant_incident_publish_slo(
        self,
        tenant_id: str,
        query: Optional["ControlIncidentPublishSloQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/dashboard/tenant/{quote(sid, safe='')}/incident-publish-slo"
        return self._request(path, query or {}, request_options, method="GET")

    def control_get_tenant_timeseries(
        self,
        tenant_id: str,
        query: Optional["ControlTenantTimeseriesQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/dashboard/tenant/{quote(sid, safe='')}/timeseries"
        return self._request(path, query or {}, request_options, method="GET")

    def control_get_tenant_key_usage(
        self,
        tenant_id: str,
        query: Optional["ControlTenantKeyUsageQuery"] = None,
        **request_options: Any,
    ) -> Dict[str, Any]:
        sid = str(tenant_id or "").strip()
        if not sid:
            raise ValueError("tenant_id is required")
        path = f"/v1/admin/control/dashboard/tenant/{quote(sid, safe='')}/key-usage"
        return self._request(path, query or {}, request_options, method="GET")

    def _request(
        self,
        path: str,
        payload: Mapping[str, Any],
        request_options: Mapping[str, Any],
        *,
        method: str = "POST",
    ) -> Dict[str, Any]:
        request_id = str(request_options.get("request_id") or uuid.uuid4())
        timeout_s = float(request_options.get("timeout_s", self.timeout_s))
        timeout_s = max(0.001, timeout_s)
        retry = _as_retry_policy(request_options.get("retry"), self.retry)

        headers: MutableMapping[str, str] = {
            "content-type": "application/json",
            "x-request-id": request_id,
        }
        headers.update(self.default_headers)
        headers.update(dict(request_options.get("headers") or {}))

        api_key = request_options.get("api_key", self.api_key)
        if api_key and not _has_header(headers, "x-api-key"):
            headers["x-api-key"] = str(api_key)

        auth_bearer = request_options.get("auth_bearer", self.auth_bearer)
        if auth_bearer and not _has_header(headers, "authorization"):
            token = str(auth_bearer)
            headers["authorization"] = token if token.lower().startswith("bearer ") else f"Bearer {token}"

        admin_token = request_options.get("admin_token", self.admin_token)
        if admin_token and not _has_header(headers, "x-admin-token"):
            headers["x-admin-token"] = str(admin_token)

        req_method = method.upper()
        url = _join_url(self.base_url, path)
        body: Optional[bytes] = None
        if req_method == "GET":
            qp: Dict[str, Any] = {}
            for k, v in payload.items():
                if v is None:
                    continue
                if isinstance(v, bool):
                    qp[k] = "true" if v else "false"
                else:
                    qp[k] = str(v)
            if qp:
                url = f"{url}?{urlencode(qp)}"
        else:
            body = json.dumps(payload).encode("utf-8")

        last_exc: Optional[BaseException] = None

        for attempt in range(retry.max_retries + 1):
            req = request.Request(url=url, data=body, headers=dict(headers), method=req_method)
            try:
                with request.urlopen(req, timeout=timeout_s) as resp:
                    raw = resp.read()
                    status = int(resp.getcode())
                    content_type = resp.headers.get("content-type", "")
                    parsed = _parse_body(raw, content_type)
                    response_request_id = resp.headers.get("x-request-id") or request_id

                    if 200 <= status < 300:
                        return {
                            "data": parsed,
                            "status": status,
                            "request_id": response_request_id,
                        }

                    code = f"http_{status}"
                    message = f"request failed with status {status}"
                    details = None
                    issues = None
                    if isinstance(parsed, dict):
                        code = str(parsed.get("error") or code)
                        message = str(parsed.get("message") or message)
                        details = parsed.get("details")
                        maybe_issues = parsed.get("issues")
                        if isinstance(maybe_issues, list):
                            issues = maybe_issues

                    api_err = AionisApiError(status, code, message, details, response_request_id, issues)
                    can_retry = attempt < retry.max_retries and _should_retry_status(status)
                    if can_retry:
                        retry_after = _parse_retry_after_seconds(resp.headers)
                        time.sleep(retry_after if retry_after is not None else _compute_backoff_seconds(retry, attempt + 1))
                        continue
                    raise api_err

            except error.HTTPError as e:
                raw = e.read() if hasattr(e, "read") else b""
                status = int(e.code)
                content_type = e.headers.get("content-type", "") if e.headers else ""
                parsed = _parse_body(raw, content_type)
                response_request_id = (e.headers.get("x-request-id") if e.headers else None) or request_id

                code = f"http_{status}"
                message = f"request failed with status {status}"
                details = None
                issues = None
                if isinstance(parsed, dict):
                    code = str(parsed.get("error") or code)
                    message = str(parsed.get("message") or message)
                    details = parsed.get("details")
                    maybe_issues = parsed.get("issues")
                    if isinstance(maybe_issues, list):
                        issues = maybe_issues

                api_err = AionisApiError(status, code, message, details, response_request_id, issues)
                can_retry = attempt < retry.max_retries and _should_retry_status(status)
                if can_retry:
                    retry_after = _parse_retry_after_seconds(e.headers or {})
                    time.sleep(retry_after if retry_after is not None else _compute_backoff_seconds(retry, attempt + 1))
                    continue
                raise api_err
            except (error.URLError, TimeoutError, OSError) as e:
                last_exc = e
                if attempt < retry.max_retries:
                    time.sleep(_compute_backoff_seconds(retry, attempt + 1))
                    continue
                break

        raise AionisNetworkError(
            f"network request failed for {req_method} {path}: {str(last_exc) if last_exc else 'unknown error'}",
            request_id=request_id,
        )
