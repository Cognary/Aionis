from __future__ import annotations

import json
import random
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Mapping, MutableMapping, Optional
from urllib import error, request


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

    def write(self, payload: Mapping[str, Any], **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/write", payload, request_options)

    def recall(self, payload: Mapping[str, Any], **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/recall", payload, request_options)

    def recall_text(self, payload: Mapping[str, Any], **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/recall_text", payload, request_options)

    def rules_evaluate(self, payload: Mapping[str, Any], **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/rules/evaluate", payload, request_options)

    def tools_select(self, payload: Mapping[str, Any], **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/select", payload, request_options)

    def tools_feedback(self, payload: Mapping[str, Any], **request_options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory/tools/feedback", payload, request_options)

    def _request(self, path: str, payload: Mapping[str, Any], request_options: Mapping[str, Any]) -> Dict[str, Any]:
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

        body = json.dumps(payload).encode("utf-8")
        url = _join_url(self.base_url, path)

        last_exc: Optional[BaseException] = None

        for attempt in range(retry.max_retries + 1):
            req = request.Request(url=url, data=body, headers=dict(headers), method="POST")
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
            f"network request failed for {path}: {str(last_exc) if last_exc else 'unknown error'}",
            request_id=request_id,
        )
