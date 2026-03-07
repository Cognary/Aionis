import "dotenv/config";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function normalizeBearer(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}

async function dispatchOnce(input: {
  baseUrl: string;
  apiKey: string;
  bearer: string;
  tenantId?: string;
  scope?: string;
  automationId?: string;
  actor?: string;
  limit: number;
  dryRun: boolean;
}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (input.apiKey) headers["x-api-key"] = input.apiKey;
  if (input.bearer) headers.authorization = input.bearer;
  const response = await fetch(`${input.baseUrl}/v1/automations/shadow/validate/dispatch`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tenant_id: input.tenantId || undefined,
      scope: input.scope || undefined,
      automation_id: input.automationId || undefined,
      actor: input.actor || undefined,
      limit: input.limit,
      dry_run: input.dryRun,
    }),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`shadow validator dispatch failed: http_${response.status} ${JSON.stringify(data)}`);
  }
  return {
    status: response.status,
    request_id: response.headers.get("x-request-id") || "",
    data,
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const baseUrl = String(argValue("--base-url") || process.env.AIONIS_BASE_URL || "http://127.0.0.1:3001").trim();
  const apiKey = String(process.env.AIONIS_API_KEY || process.env.API_KEY || "").trim();
  const bearer = normalizeBearer(String(process.env.AIONIS_AUTH_BEARER || process.env.AUTH_BEARER || "").trim());
  if (!apiKey && !bearer) {
    throw new Error("AIONIS_API_KEY or AIONIS_AUTH_BEARER is required");
  }

  const tenantId = argValue("--tenant-id") || process.env.MEMORY_TENANT_ID || "";
  const scope = argValue("--scope") || process.env.MEMORY_SCOPE || "";
  const automationId = argValue("--automation-id") || "";
  const actor = argValue("--actor") || "automation_shadow_validator_job";
  const limit = Math.max(1, Math.min(100, Number(argValue("--limit") || "10") || 10));
  const dryRun = hasFlag("--dry-run");
  const watch = hasFlag("--watch");
  const intervalMs = Math.max(250, Number(argValue("--interval-ms") || "5000") || 5000);

  if (!watch) {
    const out = await dispatchOnce({
      baseUrl,
      apiKey,
      bearer,
      tenantId,
      scope,
      automationId,
      actor,
      limit,
      dryRun,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, watch: false, ...out }, null, 2));
    return;
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, watch: true, base_url: baseUrl, interval_ms: intervalMs, limit, dry_run: dryRun }, null, 2));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const out = await dispatchOnce({
      baseUrl,
      apiKey,
      bearer,
      tenantId,
      scope,
      automationId,
      actor,
      limit,
      dryRun,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...out }, null, 2));
    await sleep(intervalMs);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
