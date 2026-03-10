import { NextResponse } from "next/server";
import {
  PLAYGROUND_CHAT_ALLOWED_BASE_URLS_ENV,
  resolvePlaygroundBaseUrl,
} from "@/app/lib/egress-guard.mjs";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const TIMEOUT_MS = 45_000;

function json(status, body) {
  return NextResponse.json(body, { status });
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = String(item.role || "").trim();
      const content = String(item.content || "").trim();
      if (!role || !content) return null;
      if (!["system", "user", "assistant"].includes(role)) return null;
      return { role, content };
    })
    .filter(Boolean)
    .slice(-40);
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const config = body?.config && typeof body.config === "object" ? body.config : {};
  const messages = normalizeMessages(body?.messages);

  const apiKey = String(config.api_key || "").trim();
  const model = String(config.model || "").trim();
  let baseUrl;
  try {
    baseUrl = resolvePlaygroundBaseUrl(config.base_url, {
      defaultBaseUrl: process.env.PLAYGROUND_CHAT_DEFAULT_BASE_URL?.trim() || DEFAULT_BASE_URL,
      allowedBaseUrlsEnv: process.env[PLAYGROUND_CHAT_ALLOWED_BASE_URLS_ENV] || "",
      allowedBaseUrlsEnvName: PLAYGROUND_CHAT_ALLOWED_BASE_URLS_ENV,
      label: "config.base_url",
    });
  } catch (error) {
    return json(400, {
      ok: false,
      error: "blocked_base_url",
      message: error instanceof Error ? error.message : "config.base_url is not allowed"
    });
  }
  const temperatureRaw = Number(config.temperature);
  const maxTokensRaw = Number(config.max_tokens);
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2, temperatureRaw)) : 0.3;
  const maxTokens = Number.isFinite(maxTokensRaw) ? Math.max(1, Math.round(maxTokensRaw)) : 800;

  if (!apiKey) {
    return json(400, { ok: false, error: "missing_api_key" });
  }
  if (!model) {
    return json(400, { ok: false, error: "missing_model" });
  }
  if (messages.length === 0) {
    return json(400, { ok: false, error: "empty_messages" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false
      }),
      cache: "no-store",
      signal: controller.signal
    });

    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = { raw: rawText };
    }
    if (!response.ok) {
      return json(200, {
        ok: false,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        error: data?.error?.message || data?.error || `http_${response.status}`,
        raw: data
      });
    }

    const text = data?.choices?.[0]?.message?.content;
    return json(200, {
      ok: true,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      model: data?.model || model,
      text: typeof text === "string" ? text : "",
      usage: data?.usage || null,
      raw: data
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return json(200, {
      ok: false,
      status: 0,
      duration_ms: Date.now() - startedAt,
      error: aborted ? "chat_timeout" : error instanceof Error ? error.message : "chat_network_error"
    });
  } finally {
    clearTimeout(timeout);
  }
}
