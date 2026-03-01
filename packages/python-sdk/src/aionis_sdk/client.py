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
        ControlTenantDiagnosticsQuery,
        ControlTenantInput,
        ControlTenantKeyUsageQuery,
        ControlTenantQuotaInput,
        ControlTenantsQuery,
        ControlTenantTimeseriesQuery,
        BackendCapabilityErrorDetails,
        MemoryEventWriteInput,
        MemoryFindInput,
        MemoryPackExportInput,
        MemoryPackImportInput,
        MemoryRecallInput,
        MemoryRecallTextInput,
        MemorySessionCreateInput,
        MemorySessionEventsListInput,
        MemoryWriteInput,
        RulesEvaluateInput,
        ToolsDecisionInput,
        ToolsFeedbackInput,
        ToolsSelectInput,
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

    def find(self, payload: "MemoryFindInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/find", payload, request_options)

    def create_session(self, payload: "MemorySessionCreateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/sessions", payload, request_options)

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

    def rules_evaluate(self, payload: "RulesEvaluateInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/rules/evaluate", payload, request_options)

    def tools_select(self, payload: "ToolsSelectInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/select", payload, request_options)

    def tools_decision(self, payload: "ToolsDecisionInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/decision", payload, request_options)

    def tools_feedback(self, payload: "ToolsFeedbackInput", **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/feedback", payload, request_options)

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
