#!/usr/bin/env python3
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Literal, Tuple
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


LlmProvider = Literal["openai_compat", "gemini"]


@dataclass
class LlmAdapter:
    provider: LlmProvider
    model: str
    endpoint: str
    headers: Dict[str, str]
    temperature: float
    max_tokens: int
    api_key_source: str | None


def with_query(url: str, extra: Dict[str, str]) -> str:
    parsed = urlparse(url)
    q = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for k, v in extra.items():
        if v and k not in q:
            q[k] = v
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(q), parsed.fragment))


def resolve_api_key(explicit_key: str, env_candidates: Iterable[str]) -> Tuple[str, str | None]:
    key = (explicit_key or "").strip()
    if key:
        return key, "explicit"
    for name in env_candidates:
        if not name:
            continue
        v = os.getenv(name, "").strip()
        if v:
            return v, name
    return "", None


def build_llm_adapter(
    *,
    provider: str,
    model: str,
    endpoint: str,
    base_url: str,
    api_key: str,
    max_tokens: int,
    temperature: float,
    api_key_source: str | None = None,
) -> LlmAdapter:
    p = (provider or "openai_compat").strip().lower()
    if p not in ("openai_compat", "gemini"):
        raise RuntimeError(f"unsupported llm provider: {provider}")
    if not api_key:
        raise RuntimeError("missing llm api key")

    m = (model or "").strip()
    if not m:
        raise RuntimeError("llm model is required")
    if p == "openai_compat":
        e = endpoint.strip() or f"{base_url.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}"}
    else:
        e = endpoint.strip() or f"{base_url.rstrip('/')}/models/{m}:generateContent"
        headers = {"x-goog-api-key": api_key}

    return LlmAdapter(
        provider=p,  # type: ignore[arg-type]
        model=m,
        endpoint=e,
        headers=headers,
        temperature=float(temperature),
        max_tokens=max(1, int(max_tokens)),
        api_key_source=api_key_source,
    )


def build_llm_payload(adapter: LlmAdapter, prompt: str) -> Dict[str, Any]:
    if adapter.provider == "openai_compat":
        return {
            "model": adapter.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": adapter.temperature,
            "max_tokens": adapter.max_tokens,
        }
    return {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": adapter.temperature,
            "maxOutputTokens": adapter.max_tokens,
        },
    }


def extract_llm_text(adapter: LlmAdapter, resp: Dict[str, Any]) -> str:
    if adapter.provider == "openai_compat":
        return _extract_openai_compat_text(resp)
    return _extract_gemini_text(resp)


def _extract_openai_compat_text(resp: Dict[str, Any]) -> str:
    choices = resp.get("choices") or []
    if not isinstance(choices, list):
        return ""
    for c in choices:
        if not isinstance(c, dict):
            continue
        message = c.get("message") or {}
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    txt = item.get("text") or item.get("content") or ""
                    if isinstance(txt, str) and txt:
                        parts.append(txt)
            joined = "\n".join(p for p in parts if p).strip()
            if joined:
                return joined
        reasoning = message.get("reasoning_content")
        if isinstance(reasoning, str) and reasoning.strip():
            return reasoning.strip()
    return ""


def _extract_gemini_text(resp: Dict[str, Any]) -> str:
    candidates = resp.get("candidates") or []
    if not isinstance(candidates, list):
        return ""
    for cand in candidates:
        if not isinstance(cand, dict):
            continue
        content = cand.get("content") or {}
        if not isinstance(content, dict):
            continue
        parts = content.get("parts") or []
        if not isinstance(parts, list):
            continue
        texts = []
        for part in parts:
            if not isinstance(part, dict):
                continue
            txt = part.get("text")
            if isinstance(txt, str) and txt.strip():
                texts.append(txt.strip())
        joined = "\n".join(texts).strip()
        if joined:
            return joined
    return ""
