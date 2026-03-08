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

function splitCsv(raw: string | null | undefined): string[] {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function asInt(raw: string | null | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function dispatchOnce(input: {
  baseUrl: string;
  adminToken: string;
  tenantId?: string;
  scope?: string;
  automationId?: string;
  windowHours: number;
  incidentLimit: number;
  candidateCodes: string[];
  dedupeTtlSeconds: number;
  dryRun: boolean;
}) {
  const response = await fetch(`${input.baseUrl}/v1/admin/control/automations/alerts/dispatch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": input.adminToken,
    },
    body: JSON.stringify({
      tenant_id: input.tenantId || undefined,
      scope: input.scope || undefined,
      automation_id: input.automationId || undefined,
      window_hours: input.windowHours,
      incident_limit: input.incidentLimit,
      candidate_codes: input.candidateCodes.length > 0 ? input.candidateCodes : undefined,
      dedupe_ttl_seconds: input.dedupeTtlSeconds,
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
    throw new Error(`hosted alert dispatch failed: http_${response.status} ${JSON.stringify(data)}`);
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
  const adminToken = String(argValue("--admin-token") || process.env.AIONIS_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "").trim();
  if (!adminToken) {
    throw new Error("AIONIS_ADMIN_TOKEN, ADMIN_TOKEN, or --admin-token is required");
  }

  const tenantId = argValue("--tenant-id") || process.env.MEMORY_TENANT_ID || "";
  const scope = argValue("--scope") || process.env.MEMORY_SCOPE || "";
  const automationId = argValue("--automation-id") || "";
  const windowHours = asInt(argValue("--window-hours") || process.env.HOSTED_ALERT_DISPATCH_WINDOW_HOURS, 24, 1, 24 * 30);
  const incidentLimit = asInt(argValue("--incident-limit") || process.env.HOSTED_ALERT_DISPATCH_INCIDENT_LIMIT, 8, 1, 100);
  const dedupeTtlSeconds = asInt(
    argValue("--dedupe-ttl-seconds") || process.env.HOSTED_ALERT_DISPATCH_DEDUPE_TTL_SECONDS,
    1800,
    60,
    7 * 24 * 3600,
  );
  const candidateCodes = splitCsv(argValue("--candidate-codes") || process.env.AUTOMATION_ALERT_CANDIDATE_CODES);
  const dryRun = hasFlag("--dry-run");
  const once = hasFlag("--once");
  const intervalMs = asInt(argValue("--interval-ms") || process.env.HOSTED_ALERT_DISPATCH_INTERVAL_MS, 5000, 250, 24 * 3600 * 1000);
  const maxRuns = asInt(argValue("--max-runs") || process.env.HOSTED_ALERT_DISPATCH_MAX_RUNS, 0, 0, 100000);

  if (once) {
    const out = await dispatchOnce({
      baseUrl,
      adminToken,
      tenantId,
      scope,
      automationId,
      windowHours,
      incidentLimit,
      candidateCodes,
      dedupeTtlSeconds,
      dryRun,
    });
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          hosted: true,
          watch: false,
          dry_run: dryRun,
          base_url: baseUrl,
          tenant_id: tenantId || null,
          scope: scope || null,
          automation_id: automationId || null,
          ...out,
        },
        null,
        2,
      ),
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        hosted: true,
        watch: true,
        dry_run: dryRun,
        base_url: baseUrl,
        tenant_id: tenantId || null,
        scope: scope || null,
        automation_id: automationId || null,
        interval_ms: intervalMs,
        max_runs: maxRuns || null,
      },
      null,
      2,
    ),
  );

  let iteration = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    iteration += 1;
    const out = await dispatchOnce({
      baseUrl,
      adminToken,
      tenantId,
      scope,
      automationId,
      windowHours,
      incidentLimit,
      candidateCodes,
      dedupeTtlSeconds,
      dryRun,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: new Date().toISOString(), iteration, ...out }, null, 2));
    if (maxRuns > 0 && iteration >= maxRuns) return;
    await sleep(intervalMs);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
