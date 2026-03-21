import { readFileSync } from "node:fs";
import { z } from "zod";

export const AionisMcpEnvSchema = z.object({
  AIONIS_BASE_URL: z.string().default("http://localhost:3001"),
  AIONIS_SCOPE: z.string().min(1).default("default"),
  AIONIS_ADMIN_TOKEN: z.string().optional(),
  AIONIS_API_KEY: z.string().optional(),
  AIONIS_AUTH_BEARER: z.string().optional(),
  AIONIS_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  AIONIS_MAX_TOOL_TEXT_CHARS: z.coerce.number().int().positive().default(8_000),
});

export type AionisMcpEnv = z.infer<typeof AionisMcpEnvSchema>;

export function loadAionisMcpEnv(envSource: NodeJS.ProcessEnv = process.env): AionisMcpEnv {
  const parsed = AionisMcpEnvSchema.safeParse(envSource);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid MCP environment:\n${msg}`);
  }
  return parsed.data;
}

export function resolveServerVersion(): string {
  const explicit = String(process.env.AIONIS_VERSION ?? "").trim();
  if (explicit) return explicit;
  const npmVersion = String(process.env.npm_package_version ?? "").trim();
  if (npmVersion) return npmVersion;
  try {
    const pkgUrl = new URL("../../package.json", import.meta.url);
    const raw = readFileSync(pkgUrl, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // fall through
  }
  return "0.0.0";
}

export class AionisMcpHttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function postAionisJson<TResponse = unknown>(
  env: AionisMcpEnv,
  path: string,
  body: unknown,
): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AIONIS_TIMEOUT_MS);
  try {
    const url = `${normalizeBaseUrl(env.AIONIS_BASE_URL)}${path}`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (env.AIONIS_ADMIN_TOKEN) headers["X-Admin-Token"] = env.AIONIS_ADMIN_TOKEN;
    if (env.AIONIS_API_KEY) headers["X-Api-Key"] = env.AIONIS_API_KEY;
    if (env.AIONIS_AUTH_BEARER) {
      headers.Authorization = env.AIONIS_AUTH_BEARER.toLowerCase().startsWith("bearer ")
        ? env.AIONIS_AUTH_BEARER
        : `Bearer ${env.AIONIS_AUTH_BEARER}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    const json = raw ? JSON.parse(raw) : null;
    if (!response.ok) throw new AionisMcpHttpError(response.status, json);
    return json as TResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export function clipToolText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated: ${text.length - maxChars} chars]`;
}

