import { readFileSync } from "node:fs";
import { z } from "zod";

const EnvSchema = z.object({
  AIONIS_BASE_URL: z.string().default("http://localhost:3001"),
  AIONIS_SCOPE: z.string().min(1).default("default"),
  AIONIS_TENANT_ID: z.string().min(1).optional(),
  AIONIS_ADMIN_TOKEN: z.string().optional(),
  AIONIS_API_KEY: z.string().optional(),
  AIONIS_AUTH_BEARER: z.string().optional(),
  AIONIS_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  AIONIS_MAX_TOOL_TEXT_CHARS: z.coerce.number().int().positive().default(12_000),
});

export type AionisDevEnv = z.infer<typeof EnvSchema>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

export function loadEnv(): AionisDevEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }
  return parsed.data;
}

export function resolveServerVersion(): string {
  const explicit = String(process.env.AIONIS_DEV_MCP_VERSION ?? process.env.AIONIS_VERSION ?? "").trim();
  if (explicit) return explicit;

  const npmVersion = String(process.env.npm_package_version ?? "").trim();
  if (npmVersion) return npmVersion;

  try {
    const pkgUrl = new URL("../../../package.json", import.meta.url);
    const raw = readFileSync(pkgUrl, "utf8");
    const pkg = JSON.parse(raw) as { version?: unknown };
    if (typeof pkg.version === "string" && pkg.version.trim().length > 0) {
      return pkg.version.trim();
    }
  } catch {
    // Fall through to the default below.
  }

  return "0.0.0";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function withDefaultTenancy(body: Record<string, unknown>, env: AionisDevEnv): Record<string, unknown> {
  const out = { ...body };
  if (typeof out.scope !== "string" || out.scope.trim().length === 0) {
    out.scope = env.AIONIS_SCOPE;
  }
  if (env.AIONIS_TENANT_ID && (typeof out.tenant_id !== "string" || out.tenant_id.trim().length === 0)) {
    out.tenant_id = env.AIONIS_TENANT_ID;
  }
  return out;
}

export async function postJson(env: AionisDevEnv, path: string, body: Record<string, unknown>): Promise<unknown> {
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
      body: JSON.stringify(withDefaultTenancy(body, env)),
      signal: controller.signal,
    });

    const raw = await response.text();
    const parsed = raw.length > 0 ? (JSON.parse(raw) as unknown) : null;
    if (!response.ok) {
      throw new HttpError(response.status, parsed);
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

export function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}
